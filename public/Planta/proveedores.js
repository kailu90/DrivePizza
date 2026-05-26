import { plantaDB } from '../Api/firebaseConfig.js';
import {
  collection, getDocs, addDoc, doc, updateDoc,
  query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { CargarHeader, CargarSidebar, capitalizarSede } from '../Shared/components.js';
import { registrarMovimiento } from './inventoryService.js';
import { verificarAccesoPlanta } from '../Auth/plantaAuth.js';

const db = plantaDB.db;

let usuarioActual = 'Admin';

// ── Caché sessionStorage ──────────────────────────────────────────────────────
const CACHE_KEY = 'prov_proveedores';
const CACHE_TTL = 10 * 60 * 1000;

function cacheGuardar(data) {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data }));
        // Invalidar cachés de proveedores usados en otras pantallas
        sessionStorage.removeItem('ap_proveedores');
        sessionStorage.removeItem('inv_proveedores');
    } catch {}
}
function cacheLeer() {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { t, data } = JSON.parse(raw);
        if (Date.now() - t > CACHE_TTL) { sessionStorage.removeItem(CACHE_KEY); return null; }
        return data;
    } catch { return null; }
}

// ── Estado ───────────────────────────────────────────────────────────────────
let allProveedores = [];
let editingDocId = null;

// ── Auth guard ────────────────────────────────────────────────────────────────
verificarAccesoPlanta(async ({ username, sede }) => {
    usuarioActual = username;
    CargarHeader(capitalizarSede(sede));
    CargarSidebar();
    await loadProveedores();
    renderTable();
    document.body.classList.add('loaded');
});

// ── Carga de datos ────────────────────────────────────────────────────────────
async function loadProveedores() {
    const cached = cacheLeer();
    if (cached) {
        allProveedores = cached;
        return;
    }
    const snap = await getDocs(
        query(collection(db, 'Planta', 'principal', 'Proveedores'), orderBy('name'))
    );
    allProveedores = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
    cacheGuardar(allProveedores);
}

// ── Render tabla ──────────────────────────────────────────────────────────────
function getFiltered() {
    const search = document.getElementById('prov-search').value.trim().toLowerCase();
    const status = document.getElementById('prov-filter-status').value;
    return allProveedores.filter(p => {
        if (search && !p.name?.toLowerCase().includes(search)) return false;
        if (status === 'active'   && !p.active)  return false;
        if (status === 'inactive' &&  p.active)  return false;
        return true;
    });
}

function renderTable() {
    const tbody   = document.getElementById('prov-tbody');
    const counter = document.getElementById('prov-count');
    const filtered = getFiltered();

    counter.textContent = `${filtered.length} proveedor${filtered.length !== 1 ? 'es' : ''}`;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="ap-loading">Sin resultados.</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    filtered.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = p.active === false ? 'ap-row--inactive' : '';
        tr.innerHTML = `
            <td class="ap-cell ap-col-num">${p.idSupplier ?? '—'}</td>
            <td class="ap-cell ap-cell--name">${p.name || '—'}</td>
            <td class="ap-cell">${p.telefono || '—'}</td>
            <td class="ap-cell">${p.asesor || '—'}</td>
            <td class="ap-cell ap-col-center">
                <label class="ap-toggle" title="${p.active === false ? 'Activar' : 'Desactivar'}">
                    <input type="checkbox" class="ap-toggle__input" data-id="${p._docId}" ${p.active !== false ? 'checked' : ''}>
                    <span class="ap-toggle__slider"></span>
                </label>
            </td>
            <td class="ap-cell ap-col-center">
                <button class="ap-btn ap-btn--edit" data-id="${p._docId}">Editar</button>
            </td>`;
        tbody.appendChild(tr);
    });
}

// ── Filtros ───────────────────────────────────────────────────────────────────
document.getElementById('prov-search').addEventListener('input', renderTable);
document.getElementById('prov-filter-status').addEventListener('change', renderTable);

// ── Toggle activo/inactivo ────────────────────────────────────────────────────
document.getElementById('prov-tbody').addEventListener('change', async (e) => {
    if (!e.target.classList.contains('ap-toggle__input')) return;
    const checkbox = e.target;
    const docId = checkbox.dataset.id;
    const newActive = checkbox.checked;
    const p = allProveedores.find(x => x._docId === docId);
    try {
        await updateDoc(doc(db, 'Planta', 'principal', 'Proveedores', docId), { active: newActive });
        if (p) p.active = newActive;
        cacheGuardar(allProveedores);
        renderTable();
        registrarMovimiento({
            tipo: 'MODIFICACION',
            entidad: 'Proveedor',
            productoNombre: p?.name || '',
            cambios: [{ campo: 'active', valorAnterior: String(!newActive), valorNuevo: String(newActive) }],
            motivo: newActive ? 'Proveedor activado' : 'Proveedor desactivado',
            usuario: usuarioActual
        }).catch(console.error);
    } catch (err) {
        console.error('Error al actualizar estado:', err);
        checkbox.checked = !newActive;
    }
});

// ── Delegación en tbody ───────────────────────────────────────────────────────
document.getElementById('prov-tbody').addEventListener('click', (e) => {
    if (!e.target.classList.contains('ap-btn--edit')) return;
    const docId = e.target.dataset.id;
    const p = allProveedores.find(x => x._docId === docId);
    if (p) openModal(p);
});

// ── Modal ─────────────────────────────────────────────────────────────────────
const modal  = document.getElementById('prov-modal');
const form   = document.getElementById('prov-form');
const errMsg = document.getElementById('prov-modal-error');

function openModal(proveedor = null) {
    editingDocId = proveedor ? proveedor._docId : null;
    const isEdit = !!proveedor;
    document.getElementById('prov-modal-title').textContent = isEdit ? 'Editar proveedor' : 'Nuevo proveedor';
    errMsg.textContent = '';
    document.getElementById('f-prov-nombre').value       = proveedor?.name        ?? '';
    document.getElementById('f-prov-telefono').value     = proveedor?.telefono    ?? '';
    document.getElementById('f-prov-asesor').value       = proveedor?.asesor      ?? '';
    document.getElementById('f-prov-descripcion').value  = proveedor?.descripcion ?? '';
    modal.showModal();
}

document.getElementById('prov-btn-nuevo').addEventListener('click', () => openModal());
document.getElementById('prov-btn-cancelar').addEventListener('click', () => modal.close());
modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errMsg.textContent = '';

    const nombre      = document.getElementById('f-prov-nombre').value.trim();
    const telefono    = document.getElementById('f-prov-telefono').value.trim();
    const asesor      = document.getElementById('f-prov-asesor').value.trim();
    const descripcion = document.getElementById('f-prov-descripcion').value.trim();

    if (!nombre) {
        errMsg.textContent = 'El nombre es obligatorio.';
        return;
    }

    const btnGuardar = document.getElementById('prov-btn-guardar');
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando...';

    const isEdit = !!editingDocId;

    try {
        if (isEdit) {
            const antes = allProveedores.find(p => p._docId === editingDocId);
            const data = { name: nombre, telefono, asesor, descripcion };
            await updateDoc(doc(db, 'Planta', 'principal', 'Proveedores', editingDocId), data);
            const idx = allProveedores.findIndex(p => p._docId === editingDocId);
            if (idx !== -1) allProveedores[idx] = { ...allProveedores[idx], ...data };
            allProveedores.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
            cacheGuardar(allProveedores);

            const camposAuditables = ['name', 'telefono', 'asesor', 'descripcion'];
            const cambios = camposAuditables
                .filter(campo => String(antes?.[campo] ?? '') !== String(data[campo] ?? ''))
                .map(campo => ({ campo, valorAnterior: String(antes?.[campo] ?? ''), valorNuevo: String(data[campo] ?? '') }));
            if (cambios.length > 0) {
                registrarMovimiento({
                    tipo: 'MODIFICACION',
                    entidad: 'Proveedor',
                    productoNombre: antes?.name || nombre,
                    cambios,
                    motivo: 'Edición de proveedor',
                    usuario: usuarioActual
                }).catch(console.error);
            }
        } else {
            const maxId = allProveedores.reduce((m, p) => Math.max(m, p.idSupplier || 0), 0);
            const nuevoId = maxId + 1;
            const data = { idSupplier: nuevoId, name: nombre, telefono, asesor, descripcion };
            const ref = await addDoc(collection(db, 'Planta', 'principal', 'Proveedores'), data);
            allProveedores.push({ _docId: ref.id, ...data });
            allProveedores.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
            cacheGuardar(allProveedores);

            registrarMovimiento({
                tipo: 'CREACION',
                entidad: 'Proveedor',
                productoNombre: nombre,
                motivo: 'Creación de proveedor',
                usuario: usuarioActual
            }).catch(console.error);
        }

        modal.close();
        renderTable();
    } catch (err) {
        console.error('Error al guardar proveedor:', err);
        errMsg.textContent = 'Error al guardar. Intenta de nuevo.';
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.textContent = 'Guardar';
    }
});
