import { supabase } from '../Api/supabaseConfig.js';
import { getProductos } from '../Shared/productosService.js';
import { CargarHeader, CargarSidebar, capitalizarSede } from '../Shared/components.js';
import { verificarAccesoPlanta } from '../Auth/plantaAuth.js';
import { ejecutarOrdenProduccion } from './inventoryService.js';

let usuarioActual = 'Admin';
let allProductos  = [];
let allOrdenes    = [];

// ── Auth guard ────────────────────────────────────────────────────────────────
verificarAccesoPlanta(async ({ username, sede }) => {
    usuarioActual = username;
    CargarHeader(capitalizarSede(sede));
    CargarSidebar();
    document.getElementById('ord-f-responsable').value = username;
    document.getElementById('ord-f-fecha').value = toInputDate(new Date());
    [allProductos, allOrdenes] = await Promise.all([getProductos(), loadOrdenes()]);
    renderTable();
    setupEventListeners();
    document.body.classList.add('loaded');
});

// ── Supabase ──────────────────────────────────────────────────────────────────
function normalizarOrden(row) {
    return {
        docId:             String(row.id),
        numero:            row.numero,
        nombre:            row.nombre,
        estado:            row.estado,
        responsable:       row.responsable,
        fecha:             row.fecha ? new Date(row.fecha) : null,
        materiales:        row.materiales || [],
        productoSalida:    row.producto_salida || null,
        costoTotal:        row.costo_total,
        costoUnitario:     row.costo_unitario,
        notas:             row.notas || '',
        creadoPor:         row.creado_por,
        fechaFinalizacion: row.fecha_finalizacion ? new Date(row.fecha_finalizacion) : null,
    };
}

async function loadOrdenes() {
    const { data, error } = await supabase
        .from('ordenes_produccion')
        .select('*')
        .order('fecha', { ascending: false });
    if (error) throw error;
    allOrdenes = (data || []).map(normalizarOrden);
    return allOrdenes;
}

async function getSiguienteNumero() {
    const { data, error } = await supabase.rpc('siguiente_numero_orden');
    if (error) throw error;
    return data;
}

// ── Render tabla ──────────────────────────────────────────────────────────────
function renderTable() {
    const search = document.getElementById('ord-search').value.toLowerCase().trim();
    const estado = document.getElementById('ord-filter-estado').value;
    const fecha  = document.getElementById('ord-filter-fecha').value;

    const filtered = allOrdenes.filter(o => {
        if (estado && o.estado !== estado) return false;
        if (search && !o.nombre?.toLowerCase().includes(search)) return false;
        if (fecha && o.fecha && toInputDate(o.fecha) !== fecha) return false;
        return true;
    });

    document.getElementById('ord-count').textContent = `${filtered.length} orden(es)`;
    const tbody = document.getElementById('ord-tbody');
    tbody.innerHTML = '';

    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="ap-loading">No hay órdenes</td></tr>';
        return;
    }

    filtered.forEach(o => {
        const tr = document.createElement('tr');
        const f  = o.fecha;
        tr.innerHTML = `
            <td class="ap-col-num">${o.numero}</td>
            <td>${escHtml(o.nombre)}</td>
            <td>${escHtml(o.productoSalida?.productoNombre || '—')}</td>
            <td class="ap-col-num">${o.productoSalida?.cantidad ?? '—'}</td>
            <td class="ap-col-num">${o.costoUnitario != null ? '$' + Number(o.costoUnitario).toFixed(0) : '—'}</td>
            <td>${escHtml(o.responsable)}</td>
            <td>${formatFecha(f)}</td>
            <td class="ap-col-center">${badgeEstado(o.estado)}</td>
            <td class="ap-col-center" style="display:flex;gap:.4rem;justify-content:center;padding:.6rem">
                <button class="ap-btn ap-btn--ghost ord-btn-ver" title="Ver detalle">Ver</button>
                ${o.estado === 'en_proceso' ? `
                    <button class="ap-btn ap-btn--primary ord-btn-finalizar" title="Finalizar orden">Finalizar</button>
                    <button class="ap-btn ap-btn--danger ord-btn-cancelar" title="Cancelar orden">Cancelar</button>
                ` : ''}
            </td>
        `;
        tr.querySelector('.ord-btn-ver').addEventListener('click', () => openDetalle(o));
        tr.querySelector('.ord-btn-finalizar')?.addEventListener('click', () => confirmarFinalizar(o));
        tr.querySelector('.ord-btn-cancelar')?.addEventListener('click',  () => confirmarCancelar(o));
        tbody.appendChild(tr);
    });
}

function badgeEstado(estado) {
    const map = {
        en_proceso: ['ord-badge--proceso',    'En proceso'],
        finalizado: ['ord-badge--finalizado', 'Finalizado'],
        cancelado:  ['ord-badge--cancelado',  'Cancelado'],
    };
    const [cls, label] = map[estado] || ['', estado];
    return `<span class="ord-badge ${cls}">${label}</span>`;
}

// ── Modal nueva orden ─────────────────────────────────────────────────────────
function openNuevaOrden() {
    document.getElementById('ord-form').reset();
    document.getElementById('ord-f-responsable').value = usuarioActual;
    document.getElementById('ord-f-fecha').value = toInputDate(new Date());
    document.getElementById('ord-mat-tbody').innerHTML = '';
    document.getElementById('ord-modal-error').textContent = '';
    addMaterialRow();
    calcularCostos();
    document.getElementById('ord-modal').showModal();
}

// ── Filas dinámicas de materiales ─────────────────────────────────────────────
function addMaterialRow() {
    const tbody = document.getElementById('ord-mat-tbody');
    const tr = document.createElement('tr');
    tr.className = 'ord-mat-row';
    tr.innerHTML = `
        <td style="position:relative">
            <input class="ap-input ord-mat-buscar" type="text" placeholder="Buscar producto..." autocomplete="off">
            <input type="hidden" class="ord-mat-id">
            <div class="ord-autocomplete ord-mat-drop"></div>
        </td>
        <td><input class="ap-input ord-mat-cant"  type="number" min="0.001" step="0.001" placeholder="0"></td>
        <td><input class="ap-input ord-mat-costo" type="number" min="0"     step="1"     placeholder="0"></td>
        <td class="ord-mat-subtotal ap-col-num">$0</td>
        <td><button type="button" class="ap-btn ap-btn--danger ord-mat-remove">✕</button></td>
    `;

    const buscar    = tr.querySelector('.ord-mat-buscar');
    const idInput   = tr.querySelector('.ord-mat-id');
    const drop      = tr.querySelector('.ord-mat-drop');
    const cantInput = tr.querySelector('.ord-mat-cant');
    const costoInput= tr.querySelector('.ord-mat-costo');
    const subtotal  = tr.querySelector('.ord-mat-subtotal');

    setupAutocompleteProd(buscar, drop, idInput, (prod) => {
        if (prod.price != null) {
            costoInput.value = prod.price;
            const cant = parseFloat(cantInput.value) || 0;
            subtotal.textContent = '$' + (cant * prod.price).toLocaleString('es-CO');
            calcularCostos();
        }
    });

    [cantInput, costoInput].forEach(el => el.addEventListener('input', () => {
        const cant  = parseFloat(cantInput.value)  || 0;
        const costo = parseFloat(costoInput.value) || 0;
        subtotal.textContent = '$' + (cant * costo).toLocaleString('es-CO');
        calcularCostos();
    }));

    tr.querySelector('.ord-mat-remove').addEventListener('click', () => {
        tr.remove();
        calcularCostos();
    });

    tbody.appendChild(tr);
}

// ── Autocomplete genérico ─────────────────────────────────────────────────────
function setupAutocompleteProd(input, drop, idHidden, onSelect = null) {
    input.addEventListener('input', () => {
        const q = input.value.toLowerCase().trim();
        drop.innerHTML = '';
        if (!q) { drop.style.display = 'none'; return; }
        const matches = allProductos
            .filter(p => p.name.toLowerCase().includes(q))
            .slice(0, 8);
        if (!matches.length) { drop.style.display = 'none'; return; }
        drop.style.display = 'block';
        matches.forEach(p => {
            const item = document.createElement('div');
            item.className = 'ord-autocomplete-item';
            item.textContent = `${p.name}  (stock: ${p.stock ?? 0} ${p.unidad || ''})`;
            item.addEventListener('mousedown', () => {
                input.value    = p.name;
                idHidden.value = p.id;
                drop.style.display = 'none';
                if (onSelect) onSelect(p);
            });
            drop.appendChild(item);
        });
    });
    input.addEventListener('blur', () => setTimeout(() => { drop.style.display = 'none'; }, 150));
}

// ── Cálculo en tiempo real ────────────────────────────────────────────────────
function calcularCostos() {
    let costoTotal = 0;
    document.querySelectorAll('.ord-mat-row').forEach(row => {
        costoTotal += (parseFloat(row.querySelector('.ord-mat-cant').value)  || 0)
                    * (parseFloat(row.querySelector('.ord-mat-costo').value) || 0);
    });
    const cantSalida = parseFloat(document.getElementById('ord-f-salida-cant').value) || 0;
    const costoU     = cantSalida > 0 ? costoTotal / cantSalida : 0;
    document.getElementById('ord-costo-total').textContent  = '$' + costoTotal.toLocaleString('es-CO');
    document.getElementById('ord-costo-unidad').textContent = '$' + costoU.toFixed(2);
}

// ── Lectura y validación del formulario ───────────────────────────────────────
function leerFormulario() {
    const nombre      = document.getElementById('ord-f-nombre').value.trim();
    const responsable = document.getElementById('ord-f-responsable').value.trim();
    const fechaStr    = document.getElementById('ord-f-fecha').value;
    const notas       = document.getElementById('ord-f-notas').value.trim();
    const salidaId    = document.getElementById('ord-f-salida-id').value;
    const salidaNombre= document.getElementById('ord-f-salida-buscar').value.trim();
    const salidaCant  = parseFloat(document.getElementById('ord-f-salida-cant').value) || 0;

    const materiales = [];
    document.querySelectorAll('.ord-mat-row').forEach(row => {
        const id     = row.querySelector('.ord-mat-id').value;
        const nombre = row.querySelector('.ord-mat-buscar').value.trim();
        const cant   = parseFloat(row.querySelector('.ord-mat-cant').value)  || 0;
        const costo  = parseFloat(row.querySelector('.ord-mat-costo').value) || 0;
        if (id && nombre && cant > 0) materiales.push({ productoId: id, productoNombre: nombre, cantidad: cant, costoUnitario: costo });
    });

    return { nombre, responsable, fechaStr, notas, salidaId, salidaNombre, salidaCant, materiales };
}

function validar(data) {
    if (!data.nombre)             return 'El nombre de la orden es obligatorio.';
    if (!data.responsable)        return 'El responsable es obligatorio.';
    if (!data.fechaStr)           return 'La fecha es obligatoria.';
    if (!data.materiales.length)  return 'Agrega al menos una materia prima con cantidad mayor a 0.';
    if (!data.salidaId)           return 'Selecciona el producto generado.';
    if (data.salidaCant <= 0)     return 'La cantidad del producto generado debe ser mayor a 0.';
    return null;
}

// ── Guardar orden ─────────────────────────────────────────────────────────────
async function guardarOrden(finalizar) {
    const errEl = document.getElementById('ord-modal-error');
    errEl.textContent = '';
    const data = leerFormulario();
    const err  = validar(data);
    if (err) { errEl.textContent = err; return; }

    const costoTotal    = data.materiales.reduce((s, m) => s + m.cantidad * m.costoUnitario, 0);
    const costoUnitario = data.salidaCant > 0 ? costoTotal / data.salidaCant : 0;

    setBtnsDisabled(true);
    try {
        const numero = await getSiguienteNumero();
        const productoSalida = {
            productoId:     data.salidaId,
            productoNombre: data.salidaNombre,
            cantidad:       data.salidaCant
        };
        const insertData = {
            numero,
            nombre:          data.nombre,
            estado:          finalizar ? 'finalizado' : 'en_proceso',
            responsable:     data.responsable,
            fecha:           new Date(data.fechaStr + 'T12:00:00').toISOString(),
            materiales:      data.materiales,
            producto_salida: productoSalida,
            costo_total:     costoTotal,
            costo_unitario:  costoUnitario,
            notas:           data.notas || null,
            creado_por:      usuarioActual,
            creado_en:       new Date().toISOString(),
        };
        if (finalizar) insertData.fecha_finalizacion = new Date().toISOString();

        const { data: newRow, error: insertError } = await supabase
            .from('ordenes_produccion')
            .insert(insertData)
            .select('id')
            .single();
        if (insertError) throw insertError;

        if (finalizar) {
            await ejecutarOrdenProduccion({
                ordenId:        String(newRow.id),
                ordenNumero:    numero,
                materiales:     data.materiales,
                productoSalida: productoSalida,
                usuario:        usuarioActual
            });
        }

        document.getElementById('ord-modal').close();
        allOrdenes = await loadOrdenes();
        renderTable();
    } catch (e) {
        console.error(e);
        errEl.textContent = 'Error: ' + (e.message || e);
    } finally {
        setBtnsDisabled(false);
    }
}

function setBtnsDisabled(val) {
    document.getElementById('ord-btn-guardar-proceso').disabled   = val;
    document.getElementById('ord-btn-guardar-finalizar').disabled = val;
}

// ── Finalizar orden existente (en_proceso → finalizado) ───────────────────────
async function confirmarFinalizar(orden) {
    if (!confirm(`¿Finalizar la orden "${orden.nombre}"?\n\nEsto descontará los materiales del inventario y sumará el producto generado.`)) return;
    try {
        await ejecutarOrdenProduccion({
            ordenId:        orden.docId,
            ordenNumero:    orden.numero,
            materiales:     orden.materiales,
            productoSalida: orden.productoSalida,
            usuario:        usuarioActual
        });
        const { error: updError } = await supabase
            .from('ordenes_produccion')
            .update({ estado: 'finalizado', fecha_finalizacion: new Date().toISOString() })
            .eq('id', orden.docId);
        if (updError) throw updError;
        allOrdenes = await loadOrdenes();
        renderTable();
    } catch (e) {
        console.error(e);
        alert('Error al finalizar: ' + (e.message || e));
    }
}

// ── Cancelar orden ────────────────────────────────────────────────────────────
async function confirmarCancelar(orden) {
    if (!confirm(`¿Cancelar la orden "${orden.nombre}"?\n\nNo se modificará el inventario.`)) return;
    try {
        const { error: updError } = await supabase
            .from('ordenes_produccion')
            .update({ estado: 'cancelado', cancelado_por: usuarioActual, cancelado_en: new Date().toISOString() })
            .eq('id', orden.docId);
        if (updError) throw updError;
        allOrdenes = await loadOrdenes();
        renderTable();
    } catch (e) {
        console.error(e);
        alert('Error al cancelar: ' + (e.message || e));
    }
}

// ── Modal detalle ─────────────────────────────────────────────────────────────
function openDetalle(orden) {
    document.getElementById('ord-det-title').textContent = `Orden #${orden.numero} — ${orden.nombre}`;
    const fecha    = orden.fecha;
    const fechaFin = orden.fechaFinalizacion;

    const filasMateria = (orden.materiales || []).map(m => `
        <tr>
            <td>${escHtml(m.productoNombre)}</td>
            <td class="ap-col-num">${m.cantidad}</td>
            <td class="ap-col-num">$${(m.costoUnitario || 0).toLocaleString('es-CO')}</td>
            <td class="ap-col-num">$${(m.cantidad * (m.costoUnitario || 0)).toLocaleString('es-CO')}</td>
        </tr>
    `).join('');

    document.getElementById('ord-det-body').innerHTML = `
        <div class="ord-det-grid">
            <div class="ord-det-item"><span class="ord-det-label">Estado</span>${badgeEstado(orden.estado)}</div>
            <div class="ord-det-item"><span class="ord-det-label">Responsable</span>${escHtml(orden.responsable)}</div>
            <div class="ord-det-item"><span class="ord-det-label">Fecha</span>${formatFecha(fecha)}</div>
            ${fechaFin ? `<div class="ord-det-item"><span class="ord-det-label">Finalizado</span>${formatFecha(fechaFin)}</div>` : ''}
        </div>

        <div class="ord-section" style="margin-top:1.6rem">
            <span class="ord-section__title">Materias primas</span>
            <table class="ord-mat-table" style="margin-top:.8rem">
                <thead><tr>
                    <th style="width:44%">Producto</th>
                    <th style="width:16%">Cantidad</th>
                    <th style="width:20%">Costo unit.</th>
                    <th style="width:20%">Subtotal</th>
                </tr></thead>
                <tbody>${filasMateria}</tbody>
            </table>
        </div>

        <div class="ord-section" style="margin-top:1.2rem">
            <span class="ord-section__title">Producto generado</span>
            <div class="ord-det-grid" style="margin-top:.8rem">
                <div class="ord-det-item"><span class="ord-det-label">Producto</span>${escHtml(orden.productoSalida?.productoNombre || '—')}</div>
                <div class="ord-det-item"><span class="ord-det-label">Cantidad</span>${orden.productoSalida?.cantidad ?? '—'}</div>
            </div>
        </div>

        <div class="ord-costos" style="margin-top:1.4rem">
            <span>Costo total: <strong>$${(orden.costoTotal || 0).toLocaleString('es-CO')}</strong></span>
            <span>Costo por unidad: <strong>$${(orden.costoUnitario || 0).toFixed(2)}</strong></span>
        </div>

        ${orden.notas ? `<p style="margin-top:1.2rem;font-size:1.3rem"><strong>Notas:</strong> ${escHtml(orden.notas)}</p>` : ''}
    `;
    document.getElementById('ord-modal-detalle').showModal();
}

// ── Event listeners ───────────────────────────────────────────────────────────
function setupEventListeners() {
    document.getElementById('ord-btn-nuevo').addEventListener('click', openNuevaOrden);
    document.getElementById('ord-btn-cancelar-modal').addEventListener('click', () => document.getElementById('ord-modal').close());
    document.getElementById('ord-det-cerrar').addEventListener('click', () => document.getElementById('ord-modal-detalle').close());
    document.getElementById('ord-btn-agregar-mat').addEventListener('click', addMaterialRow);

    document.getElementById('ord-form').addEventListener('submit', e => { e.preventDefault(); guardarOrden(false); });
    document.getElementById('ord-btn-guardar-finalizar').addEventListener('click', () => guardarOrden(true));

    document.getElementById('ord-f-salida-cant').addEventListener('input', calcularCostos);

    // Autocomplete producto de salida
    setupAutocompleteProd(
        document.getElementById('ord-f-salida-buscar'),
        document.getElementById('ord-f-salida-drop'),
        document.getElementById('ord-f-salida-id')
    );

    // Filtros
    ['ord-search', 'ord-filter-estado', 'ord-filter-fecha'].forEach(id => {
        document.getElementById(id).addEventListener('input',  renderTable);
        document.getElementById(id).addEventListener('change', renderTable);
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toInputDate(d) { return d.toISOString().slice(0, 10); }
function formatFecha(d) {
    if (!d || isNaN(d)) return '—';
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}
function escHtml(str = '') {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
