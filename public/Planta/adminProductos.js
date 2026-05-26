import { plantaDB } from '../Api/firebaseConfig.js';
import {collection, getDocs, addDoc, doc, updateDoc, query, orderBy, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getProductos, invalidarProductos } from '../Shared/productosService.js'
import { CargarHeader, CargarSidebar, capitalizarSede } from '../Shared/components.js';
import { UNIDADES_MEDIDA } from './planta.config.js';
import { registrarMovimiento } from './inventoryService.js';
import { verificarAccesoPlanta } from '../Auth/plantaAuth.js';


const db = plantaDB.db;

import { HETZNER_URL, WS_URL } from '../Api/config.js';
function notificarCacheProducto(productId) {
    fetch(`${HETZNER_URL}/planta/cache/producto/${productId}`, { method: 'POST' }).catch(() => {});
}

let usuarioActual = 'Admin';

// ── Caché sessionStorage ──────────────────────────────────────────────────────
const CACHE_CATEGORIAS = 'ap_categorias';
const TTL_CATEGORIAS   = 60 * 60 * 1000;   // 60 min (cambian muy poco)

function cacheGuardar(key, data) {
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), data })); } catch {}
}
function cacheLeer(key, ttl) {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const { t, data } = JSON.parse(raw);
        if (Date.now() - t > ttl) { sessionStorage.removeItem(key); return null; }
        return data;
    } catch { return null; }
}

// ── Estado ───────────────────────────────────────────────────────────────────
let allProducts = [];
let categoriasMap = {};   // idCategory → name
let categoriasArr = [];   // [{ idCategory, name }]
let editingDocId = null;
let _proveedoresList = [];
let _proveedorSeleccionado = null; // { id, name }

// ── Auth guard ────────────────────────────────────────────────────────────────
verificarAccesoPlanta(async ({ username, sede }) => {
  usuarioActual = username;
  CargarHeader(capitalizarSede(sede));
  CargarSidebar();
  await Promise.all([loadCategorias(), loadProducts(), loadProveedores()]);
  buildCatFilter();
  renderTable();
  document.body.classList.add('loaded');
});

// ── Carga de datos ────────────────────────────────────────────────────────────
async function loadCategorias() {
  const cached = cacheLeer(CACHE_CATEGORIAS, TTL_CATEGORIAS);
  if (cached) {
    categoriasArr = cached.arr;
    categoriasMap = cached.map;
  } else {
    const snap = await getDocs(
      query(collection(db, 'Planta', 'principal', 'Categorias'), orderBy('name'))
    );
    snap.forEach(d => {
      const data = d.data();
      categoriasArr.push({ idCategory: data.idCategory, name: data.name });
      categoriasMap[data.idCategory] = data.name;
    });
    cacheGuardar(CACHE_CATEGORIAS, { arr: categoriasArr, map: categoriasMap });
  }

  // Poblar select del formulario
  const sel = document.getElementById('f-categoria');
  categoriasArr.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.idCategory;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
}
// ── Cargar Productos ─────────────────────────────────────────────────
async function loadProducts() {
    allProducts = await getProductos()
    allProducts = allProducts.map(p => ({ ...p, _docId: p.id }))
}

// ── Cargar Proveedores ────────────────────────────────────────────────
async function loadProveedores() {
    const cached = cacheLeer('ap_proveedores', TTL_CATEGORIAS);
    if (cached) {
        _proveedoresList = cached;
    } else {
        const snap = await getDocs(query(collection(db, 'Planta', 'principal', 'Proveedores'), orderBy('name', 'asc')));
        _proveedoresList = snap.docs.map(d => ({ id: d.id, name: d.data().name }));
        cacheGuardar('ap_proveedores', _proveedoresList);
    }
    const sel = document.getElementById('ap-filter-proveedor');
    sel.innerHTML = '<option value="">Todos los proveedores</option>';
    _proveedoresList.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        sel.appendChild(opt);
    });
}

// ── Poblar select de unidades ─────────────────────────────────────────────────
(function buildUnidades() {
  const sel = document.getElementById('f-unidad');
  UNIDADES_MEDIDA.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = u;
    sel.appendChild(opt);
  });
})();

// ── Filtro de categorías en toolbar ──────────────────────────────────────────
function buildCatFilter() {
  const sel = document.getElementById('ap-filter-cat');
  categoriasArr.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.idCategory;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
}

// ── Render tabla ──────────────────────────────────────────────────────────────
const ROT_LABEL = { alta: 'Alta rotación', media: 'Media rotación', baja: 'Baja rotación' };

function getFilteredProducts() {
  const search    = document.getElementById('ap-search').value.trim().toLowerCase();
  const cat       = document.getElementById('ap-filter-cat').value;
  const status    = document.getElementById('ap-filter-status').value;
  const rotacion  = document.getElementById('ap-filter-rotacion').value;
  const proveedor = document.getElementById('ap-filter-proveedor').value;

  return allProducts.filter(p => {
    if (search    && !p.name?.toLowerCase().includes(search))  return false;
    if (cat       && String(p.idCategory) !== String(cat))     return false;
    if (status === 'active'   && !p.active)  return false;
    if (status === 'inactive' &&  p.active)  return false;
    if (rotacion === 'sin'    && p.rotacion) return false;
    if (rotacion  && rotacion !== 'sin' && p.rotacion !== rotacion) return false;
    if (proveedor && p.proveedorId !== proveedor)              return false;
    return true;
  });
}

function renderTable() {
  const tbody   = document.getElementById('ap-tbody');
  const counter = document.getElementById('ap-count');
  const filtered = getFilteredProducts();

  counter.textContent = `${filtered.length} producto${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="ap-loading">Sin resultados.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  filtered.forEach(p => {
    const catNombre  = categoriasMap[p.idCategory] || '—';
    const precio     = p.price != null ? '$' + Number(p.price).toLocaleString('es-CO') : '—';
    const rotClass   = p.rotacion ? `ap-rot--${p.rotacion}` : 'ap-rot--none';
    const rotTitle   = ROT_LABEL[p.rotacion] || 'Sin clasificar';
    const tr = document.createElement('tr');
    tr.className = p.active ? '' : 'ap-row--inactive';
    tr.innerHTML = `
      <td class="ap-cell ap-col-center">
        <span class="ap-rot ${rotClass}" title="${rotTitle}"></span>
      </td>
      <td class="ap-cell ap-cell--name">${p.name || '—'}</td>
      <td class="ap-cell ap-cell--cat">${catNombre}</td>
      <td class="ap-cell">${p.proveedorNombre || '—'}</td>
      <td class="ap-cell ap-col-num">${precio}</td>
      <td class="ap-cell ap-col-num">${p.stock ?? '—'}${p.sinLimiteStock ? ' <span title="Sin límite de stock">∞</span>' : ''}</td>
      <td class="ap-cell">${p.measurementUnit || '—'}</td>
      <td class="ap-cell ap-cell--pres">${p.quantities || '—'}</td>
      <td class="ap-cell ap-col-center">
        <label class="ap-toggle" title="${p.active ? 'Desactivar' : 'Activar'}">
          <input type="checkbox" class="ap-toggle__input" data-id="${p._docId}" ${p.active ? 'checked' : ''}>
          <span class="ap-toggle__slider"></span>
        </label>
      </td>
      <td class="ap-cell ap-col-center">
        <button class="ap-btn ap-btn--edit" data-id="${p._docId}">Editar</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

// ── Eventos de filtro ─────────────────────────────────────────────────────────
['ap-search', 'ap-filter-cat', 'ap-filter-status', 'ap-filter-rotacion', 'ap-filter-proveedor'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderTable);
});

// ── Delegación en tbody ───────────────────────────────────────────────────────
document.getElementById('ap-tbody').addEventListener('change', async (e) => {
  if (!e.target.classList.contains('ap-toggle__input')) return;
  const checkbox = e.target;
  const docId = checkbox.dataset.id;
  const newActive = checkbox.checked;
  const p = allProducts.find(x => x._docId === docId);
  try {
    await updateDoc(doc(db, 'Planta', 'principal', 'Productos', docId), { active: newActive, updatedAt: serverTimestamp() });
    if (p) p.active = newActive;
    notificarCacheProducto(docId);
    invalidarProductos();
    renderTable();
    registrarMovimiento({
      tipo: 'MODIFICACION',
      productoId: docId,
      productoNombre: p?.name || '',
      campo: 'active',
      valorAnterior: !newActive,
      valorNuevo: newActive,
      motivo: newActive ? 'Producto activado' : 'Producto desactivado',
      usuario: usuarioActual
    }).catch(console.error);
  } catch (err) {
    console.error('Error al actualizar estado:', err);
    checkbox.checked = !newActive;
  }
});

document.getElementById('ap-tbody').addEventListener('click', (e) => {
  if (!e.target.classList.contains('ap-btn--edit')) return;
  const docId = e.target.dataset.id;
  const p = allProducts.find(x => x._docId === docId);
  if (p) openModal(p);
});

// ── Modal ─────────────────────────────────────────────────────────────────────
const modal  = document.getElementById('ap-modal');
const form   = document.getElementById('ap-form');
const errMsg = document.getElementById('ap-modal-error');

async function openModal(product = null) {
  // Recargar proveedores si el caché fue invalidado (ej: se creó uno nuevo en otra pestaña)
  if (!cacheLeer('ap_proveedores', TTL_CATEGORIAS)) await loadProveedores();

  editingDocId = product ? product._docId : null;
  const isEdit = !!product;
  document.getElementById('ap-modal-title').textContent = isEdit ? 'Editar producto' : 'Nuevo producto';
  errMsg.textContent = '';

  document.getElementById('f-nombre').value         = product?.name           ?? '';
  document.getElementById('f-categoria').value      = product?.idCategory     ?? '';
  document.getElementById('f-unidad').value         = product?.measurementUnit ?? UNIDADES_MEDIDA[0];
  document.getElementById('f-precio').value         = product?.price          ?? '';
  document.getElementById('f-presentaciones').value = product?.quantities     ?? '';
  document.getElementById('f-activo').checked       = product?.active         ?? true;
  document.getElementById('f-sin-limite').checked   = product?.sinLimiteStock  ?? false;
  document.getElementById('f-rotacion').value       = product?.rotacion        ?? '';

  // Proveedor
  _proveedorSeleccionado = product?.proveedorId ? { id: product.proveedorId, name: product.proveedorNombre } : null;
  document.getElementById('f-proveedor-buscar').value = product?.proveedorNombre ?? '';
  document.getElementById('f-proveedor-resultados').innerHTML = '';
  if (_proveedorSeleccionado) {
    document.getElementById('f-proveedor-nombre').textContent = product.proveedorNombre;
    document.getElementById('f-proveedor-seleccionado').style.display = 'block';
  } else {
    document.getElementById('f-proveedor-seleccionado').style.display = 'none';
  }

  // Stock: visible solo al crear
  const stockWrap  = document.getElementById('f-stock-wrap');
  const stockInput = document.getElementById('f-stock');
  if (isEdit) {
    stockWrap.style.display = 'none';
    stockInput.required     = false;
    stockInput.value        = '';
  } else {
    stockWrap.style.display = '';
    stockInput.required     = true;
    stockInput.value        = '';
  }

  modal.showModal();
}

document.getElementById('ap-btn-nuevo').addEventListener('click', () => openModal());
document.getElementById('ap-btn-cancelar').addEventListener('click', () => modal.close());
modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });
modal.addEventListener('close', () => {
    document.getElementById('f-proveedor-buscar').value = '';
    document.getElementById('f-proveedor-resultados').innerHTML = '';
    document.getElementById('f-proveedor-seleccionado').style.display = 'none';
    _proveedorSeleccionado = null;
});

document.getElementById('f-proveedor-buscar').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const res = document.getElementById('f-proveedor-resultados');
    if (!q) { res.innerHTML = ''; return; }
    res.innerHTML = _proveedoresList
        .filter(p => p.name.toLowerCase().includes(q))
        .slice(0, 8)
        .map(p => `<div class="prod-result-item" data-id="${p.id}" data-name="${p.name}">
            <span class="prod-result-item__name">${p.name}</span></div>`)
        .join('');
});

document.getElementById('f-proveedor-resultados').addEventListener('click', (e) => {
    const item = e.target.closest('.prod-result-item');
    if (!item) return;
    _proveedorSeleccionado = { id: item.dataset.id, name: item.dataset.name };
    document.getElementById('f-proveedor-buscar').value = item.dataset.name;
    document.getElementById('f-proveedor-resultados').innerHTML = '';
    document.getElementById('f-proveedor-nombre').textContent = item.dataset.name;
    document.getElementById('f-proveedor-seleccionado').style.display = 'block';
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errMsg.textContent = '';

  const nombre         = document.getElementById('f-nombre').value.trim();
  const idCategory     = parseInt(document.getElementById('f-categoria').value);
  const unidad         = document.getElementById('f-unidad').value;
  const precio         = parseFloat(document.getElementById('f-precio').value);
  const presentaciones  = document.getElementById('f-presentaciones').value.trim();
  const activo          = document.getElementById('f-activo').checked;
  const sinLimiteStock  = document.getElementById('f-sin-limite').checked;
  const rotacion        = document.getElementById('f-rotacion').value;
  const isEdit         = !!editingDocId;

  const stockInput = document.getElementById('f-stock');
  const stock      = isEdit ? null : parseInt(stockInput.value);

  if (!nombre || !idCategory || !unidad || isNaN(precio) || (!isEdit && isNaN(stock))) {
    errMsg.textContent = 'Completa todos los campos obligatorios.';
    return;
  }

  const btnGuardar = document.getElementById('ap-btn-guardar');
  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Guardando...';

  const data = {
    name: nombre,
    idCategory,
    measurementUnit: unidad,
    price: precio,
    active: activo,
    quantities: presentaciones,
    sinLimiteStock,
    rotacion,
    ...(_proveedorSeleccionado ? { proveedorId: _proveedorSeleccionado.id, proveedorNombre: _proveedorSeleccionado.name } : {})
  };

  try {
    if (isEdit) {
      const antes = allProducts.find(p => p._docId === editingDocId);
      await updateDoc(doc(db, 'Planta', 'principal', 'Productos', editingDocId), { ...data, updatedAt: serverTimestamp() });
      const idx = allProducts.findIndex(p => p._docId === editingDocId);
      if (idx !== -1) allProducts[idx] = { ...allProducts[idx], ...data };
      notificarCacheProducto(editingDocId);
      invalidarProductos();

      // Registrar un único documento con todos los campos que cambiaron
      const camposAuditables = ['name', 'price', 'measurementUnit', 'idCategory', 'quantities', 'active', 'sinLimiteStock', 'rotacion', 'proveedorNombre'];
      const cambios = camposAuditables
        .filter(campo => String(antes?.[campo] ?? '') !== String(data[campo] ?? ''))
        .map(campo => ({
          campo,
          valorAnterior: String(antes?.[campo] ?? ''),
          valorNuevo:    String(data[campo]  ?? '')
        }));
      if (cambios.length > 0) {
        registrarMovimiento({
          tipo: 'MODIFICACION',
          productoId:     editingDocId,
          productoNombre: antes?.name || nombre,
          cambios,
          motivo:  'Edición de producto',
          usuario: usuarioActual
        }).catch(console.error);
      }
    } else {
      data.stock = stock;
      data.updatedAt = serverTimestamp();
      const maxId = allProducts.reduce((m, p) => Math.max(m, p.id_product || 0), 0);
      data.id_product = maxId + 1;
      const ref = await addDoc(collection(db, 'Planta', 'principal', 'Productos'), data);
      allProducts.push({ _docId: ref.id, ...data });
      allProducts.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
      notificarCacheProducto(ref.id);
      invalidarProductos();

      registrarMovimiento({
        tipo: 'CREACION',
        productoId: ref.id,
        productoNombre: nombre,
        cantidad: stock,
        motivo: 'Creación de producto',
        notas: `Stock inicial: ${stock} | Precio: $${precio.toLocaleString('es-CO')}`,
        usuario: usuarioActual
      }).catch(console.error);
    }
    modal.close();
    renderTable();
  } catch (err) {
    console.error('Error al guardar:', err);
    errMsg.textContent = 'Error al guardar. Intenta de nuevo.';
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = 'Guardar';
  }
});

// ── WebSocket: actualización en tiempo real ────────────────────────────────
let wsAdmin;
function conectarWebSocketAdmin() {
    wsAdmin = new WebSocket(WS_URL);

    wsAdmin.onopen = () => {
        console.log('AdminProductos WebSocket conectado');
    };

    wsAdmin.onmessage = async (event) => {
        try {
            const mensaje = JSON.parse(event.data);
            if (mensaje.tipo === 'planta:productos:actualizado') {
                invalidarProductos();
                await loadProducts();
                renderTable();
            }
        } catch (e) {
            console.error('Error procesando mensaje WebSocket adminProductos:', e);
        }
    };

    wsAdmin.onclose = () => {
        console.log('AdminProductos WebSocket desconectado, reconectando en 5s...');
        setTimeout(conectarWebSocketAdmin, 5000);
    };

    wsAdmin.onerror = (err) => {
        console.error('AdminProductos WebSocket error:', err);
    };
}
conectarWebSocketAdmin();
