import { supabase } from '../Api/supabaseConfig.js';
import { CargarHeader } from '../Shared/components.js';
import { RECARGO_SERVICIO } from '../Planta/planta.config.js';
import { registrarMovimiento } from '../Planta/inventoryService.js';
import { getProductos } from '../Shared/productosService.js';

function normalizarPedido(row) {
    return {
        id:           String(row.id),
        idPedido:     row.id_pedido,
        user:         row.user_sede,
        deliveryDate: row.delivery_date,
        orderNotes:   row.order_notes,
        netCost:      row.net_cost,
        total:        row.total,
        recargo:      row.recargo,
        products:     row.products || [],
        status:       row.status,
        eliminado:    row.eliminado,
    };
}

const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

// ── Estado ────────────────────────────────────────────────────────────────────
let sedeUsuario            = null;
let usuarioActual          = null;
let pedidoEnEdicion        = null;
let productoAgregarSeleccionado = null;
let productosDisponibles   = null;

const PAGE_SIZE = 20;
let paginaActual = 1;

// ── DOM ───────────────────────────────────────────────────────────────────────
const ordersContainer  = document.getElementById('ordersContainer');
const undeliveredCount = document.getElementById('undelivered-orders');
const sentCount        = document.getElementById('sent-orders');
const paidCount        = document.getElementById('paid-orders');
const totalCount       = document.getElementById('total-orders');

// ── Auth: obtener sede del usuario ────────────────────────────────────────────
(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.top.location.href = '../index.html'; return; }

    const { data } = await supabase.from('usuarios').select('*').eq('id', user.id).single();
    if (!data || !['pizzeria', 'planta', 'admin'].includes(data.rol)) {
        window.top.location.href = '../index.html'; return;
    }

    sedeUsuario   = data.sede;
    usuarioActual = data.username || data.sede;
    CargarHeader(data.sede, '../Pizzerias/pizzerias.html');
    setQuickActive('btn-recientes');
    listenForOrders();
    document.body.classList.add('loaded');
})();

// ── Paginación ────────────────────────────────────────────────────────────────
function resetPaginacion() {
    paginaActual = 1;
}

function actualizarBotonesPaginacion(cantDocs) {
    const btnPrev = document.getElementById('btn-prev-page');
    const btnNext = document.getElementById('btn-next-page');
    const info    = document.getElementById('pagination-info');
    if (btnPrev) btnPrev.disabled = paginaActual === 1;
    if (btnNext) btnNext.disabled = cantDocs < PAGE_SIZE;
    if (info)    info.textContent = `Página ${paginaActual}`;
}

function getFechas() {
    return {
        desde: document.getElementById('filter-date-desde')?.value || '',
        hasta: document.getElementById('filter-date-hasta')?.value || ''
    };
}

// ── Render tabla ──────────────────────────────────────────────────────────────
function renderRows(pedidos) {
    ordersContainer.innerHTML = '';
    const { desde, hasta } = getFechas();
    const modoFecha  = !!(desde || hasta);
    const mismaFecha = desde === hasta;

    const paginationEl = document.getElementById('pagination-controls');
    if (paginationEl) paginationEl.style.display = modoFecha ? 'none' : 'flex';

    if (!pedidos.length) {
        const msg = !modoFecha
            ? 'Sin pedidos registrados'
            : mismaFecha
                ? `Sin pedidos para el ${desde}`
                : `Sin pedidos entre el ${desde} y el ${hasta}`;
        ordersContainer.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#666;font-size:16px;font-weight:bold;">${msg}</td></tr>`;
        [undeliveredCount, sentCount, paidCount, totalCount].forEach(el => { if (el) el.textContent = 0; });
        if (!modoFecha) actualizarBotonesPaginacion(0);
        return;
    }

    let totalPedidos = 0, pedidosPendientes = 0, pedidosEnviados = 0, pedidosPagados = 0;

    if (!modoFecha) actualizarBotonesPaginacion(pedidos.length);

    const sortOrder = document.getElementById('sort')?.value || 'desc';
    if (modoFecha && desde !== hasta) {
        pedidos.sort((a, b) => sortOrder === 'asc' ? a.idPedido - b.idPedido : b.idPedido - a.idPedido);
    }

    pedidos.forEach(pedido => {
        if (pedido.status === 'pendiente')      pedidosPendientes++;
        else if (pedido.status === 'entregado') pedidosEnviados++;
        else if (pedido.status === 'pagado')    pedidosPagados++;

        const badgeClass = { pendiente: 'badge-pendiente', entregado: 'badge-entregado', pagado: 'badge-pagado' }[pedido.status] || '';

        const tr = document.createElement('tr');
        tr.className = 'inventory-management__row';
        tr.dataset.id = pedido.id;
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
            <td class="inventory-management__cell">${pedido.idPedido}</td>
            <td class="inventory-management__cell">${pedido.deliveryDate}</td>
            <td class="inventory-management__cell">${pedido.user}</td>
            <td class="inventory-management__cell"><span class="status-badge ${badgeClass}">${pedido.status}</span></td>
            <td class="inventory-management__cell">${fmtCOP.format(pedido.netCost || 0)}</td>
            <td class="inventory-management__cell">${fmtCOP.format(pedido.total || 0)}</td>`;
        ordersContainer.appendChild(tr);
        totalPedidos++;
    });

    if (undeliveredCount) undeliveredCount.textContent = pedidosPendientes;
    if (sentCount)        sentCount.textContent        = pedidosEnviados;
    if (paidCount)        paidCount.textContent        = pedidosPagados;
    if (totalCount)       totalCount.textContent       = totalPedidos;
}

// ── Cargar pedidos ────────────────────────────────────────────────────────────
async function listenForOrders() {
    if (!sedeUsuario) return;

    const { desde, hasta } = getFechas();
    const sortOrder = document.getElementById('sort')?.value || 'desc';
    const ascending = sortOrder === 'asc';

    try {
        let q = supabase
            .from('pedidos_planta')
            .select('*')
            .eq('user_sede', sedeUsuario)
            .eq('eliminado', false);

        if (!desde && !hasta) {
            // Modo paginación por offset
            const from = (paginaActual - 1) * PAGE_SIZE;
            q = q.order('id_pedido', { ascending: false }).range(from, from + PAGE_SIZE - 1);
        } else if (desde === hasta) {
            q = q.eq('delivery_date', desde).order('id_pedido', { ascending });
        } else {
            q = q.gte('delivery_date', desde).lte('delivery_date', hasta).order('delivery_date', { ascending: true });
        }

        const { data, error } = await q;
        if (error) throw error;
        renderRows((data || []).map(normalizarPedido));
    } catch (err) {
        console.error('Error cargando pedidos:', err);
    }
}

// ── Filtros rápidos ───────────────────────────────────────────────────────────
function setQuickActive(id) {
    ['btn-hoy', 'btn-ayer', 'btn-semana', 'btn-recientes'].forEach(btnId => {
        document.getElementById(btnId)?.classList.remove('active');
    });
    if (id) document.getElementById(id)?.classList.add('active');
}

function setFechas(desde, hasta) {
    document.getElementById('filter-date-desde').value = desde;
    document.getElementById('filter-date-hasta').value = hasta;
}

function getHoy()  { return new Date().toISOString().split('T')[0]; }
function getAyer() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; }
function getInicioSemana() {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1);
    return d.toISOString().split('T')[0];
}

document.getElementById('btn-hoy').addEventListener('click', () => {
    resetPaginacion();
    const hoy = getHoy();
    setFechas(hoy, hoy);
    setQuickActive('btn-hoy');
    listenForOrders();
});

document.getElementById('btn-ayer').addEventListener('click', () => {
    resetPaginacion();
    const ayer = getAyer();
    setFechas(ayer, ayer);
    setQuickActive('btn-ayer');
    listenForOrders();
});

document.getElementById('btn-semana').addEventListener('click', () => {
    resetPaginacion();
    setFechas(getInicioSemana(), getHoy());
    setQuickActive('btn-semana');
    listenForOrders();
});

document.getElementById('btn-recientes').addEventListener('click', () => {
    resetPaginacion();
    setFechas('', '');
    setQuickActive('btn-recientes');
    listenForOrders();
});

document.getElementById('btn-volver').addEventListener('click', () => {
    window.location.href = '../Pizzerias/pizzerias.html';
});

document.getElementById('filter-date-desde').addEventListener('change', () => { resetPaginacion(); listenForOrders(); });
document.getElementById('filter-date-hasta').addEventListener('change', () => { resetPaginacion(); listenForOrders(); });
document.getElementById('sort').addEventListener('change', () => { resetPaginacion(); listenForOrders(); });

// ── Paginación botones ────────────────────────────────────────────────────────
document.getElementById('btn-next-page').addEventListener('click', () => {
    paginaActual++;
    listenForOrders();
});

document.getElementById('btn-prev-page').addEventListener('click', () => {
    if (paginaActual <= 1) return;
    paginaActual--;
    listenForOrders();
});

// ── Modal detalle ─────────────────────────────────────────────────────────────
const STEPS_PLANTA = [
    { key: 'pendiente',  label: 'Pendiente' },
    { key: 'entregado',  label: 'Entregado' },
    { key: 'pagado',     label: 'Pagado'    }
];

const ICON_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/></svg>`;

function renderStepper(status) {
    const currentIdx = STEPS_PLANTA.findIndex(s => s.key === status);
    let html = '<div class="stepper">';
    STEPS_PLANTA.forEach((step, i) => {
        let cls  = 'step-locked';
        let icon = `<span style="font-size:18px;">⬤</span>`;
        if (i < currentIdx)        { cls = 'step-done';   icon = ICON_CHECK; }
        else if (i === currentIdx) { cls = 'step-active'; }
        html += `<div class="step ${cls}">
            <div class="step-circle">${icon}</div>
            <span class="step-label">${step.label}</span>
        </div>`;
        if (i < STEPS_PLANTA.length - 1)
            html += `<div class="step-connector ${i < currentIdx ? 'active' : ''}"></div>`;
    });
    html += '</div>';
    document.getElementById('modal-stepper').innerHTML = html;
}

// ── Edición ───────────────────────────────────────────────────────────────────
function esEditable(pedido) {
    if (pedido.status !== 'pendiente') return false;
    // Permitir edición hasta las 5am del día de entrega
    const [y, m, d] = pedido.deliveryDate.split('-').map(Number);
    const corte = new Date(y, m - 1, d, 5, 0, 0); // 5am del día de entrega
    return new Date() < corte;
}

async function cargarProductosDisponibles() {
    return getProductos();
}

function actualizarTotalesModal(productos) {
    const neto  = productos.reduce((s, p) => s + (p.totalPrice || 0), 0);
    const total = Math.round(neto * (1 + RECARGO_SERVICIO));
    document.getElementById('modal-neto').textContent  = fmtCOP.format(neto);
    document.getElementById('modal-total').textContent = fmtCOP.format(total);
    return { neto, total };
}

function renderTablaModal(productos, esEdicion) {
    const tbody   = document.getElementById('modal-table-body');
    const colAcc  = document.querySelector('.col-accion');
    if (colAcc) colAcc.style.display = esEdicion ? '' : 'none';
    tbody.innerHTML = '';
    productos.forEach((p, idx) => {
        const tr = document.createElement('tr');
        if (esEdicion) {
            const precioUnit = p.quantity > 0 ? (p.totalPrice || 0) / p.quantity : (p.price || 0);
            tr.innerHTML = `
                <td>${p.name}</td>
                <td class="text-center">
                    <input type="number" min="1" value="${p.quantity}"
                        style="width:60px;text-align:center;padding:4px;border:1px solid #ccc;border-radius:4px;"
                        data-idx="${idx}" data-precio="${precioUnit}" class="inp-cantidad">
                </td>
                <td>${fmtCOP.format(p.totalPrice || 0)}</td>
                <td class="col-accion text-center">
                    <button class="btn-modal" title="Eliminar" data-idx="${idx}" style="font-size:15px;color:#e74c3c;">🗑️</button>
                </td>`;
        } else {
            tr.innerHTML = `
                <td>${p.name}</td>
                <td class="text-center">${p.quantity}</td>
                <td>${fmtCOP.format(p.totalPrice || 0)}</td>`;
        }
        tbody.appendChild(tr);
    });

    if (esEdicion) {
        tbody.querySelectorAll('.inp-cantidad').forEach(inp => {
            inp.addEventListener('input', () => {
                const i     = Number(inp.dataset.idx);
                const cant  = Math.max(1, parseInt(inp.value) || 1);
                const pu    = parseFloat(inp.dataset.precio) || 0;
                pedidoEnEdicion.productos[i].quantity   = cant;
                pedidoEnEdicion.productos[i].totalPrice = Math.round(cant * pu);
                inp.closest('td').nextElementSibling.textContent = fmtCOP.format(pedidoEnEdicion.productos[i].totalPrice);
                actualizarTotalesModal(pedidoEnEdicion.productos);
                marcarCambio();
            });
        });
        tbody.querySelectorAll('button[data-idx]').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = Number(btn.dataset.idx);
                pedidoEnEdicion.productos.splice(i, 1);
                renderTablaModal(pedidoEnEdicion.productos, true);
                actualizarTotalesModal(pedidoEnEdicion.productos);
                marcarCambio();
            });
        });
    }
}

function setModoVista() {
    document.getElementById('modal-fecha').style.display       = '';
    document.getElementById('modal-fecha-input').style.display = 'none';
    document.getElementById('btn-edit-modal').style.display    = '';
    document.getElementById('btn-agregar-modal').style.display = 'none';
    document.getElementById('btn-save-modal').style.display    = 'none';
    document.getElementById('btn-save-modal').classList.remove('btn-save-pulsing');
    document.getElementById('btn-cancel-edit').style.display   = 'none';
}

function setModoEdicion() {
    document.getElementById('modal-fecha').style.display       = 'none';
    const fechaInput = document.getElementById('modal-fecha-input');
    fechaInput.value = pedidoEnEdicion?.data.deliveryDate || '';
    fechaInput.style.display = 'inline-block';
    document.getElementById('btn-edit-modal').style.display    = 'none';
    document.getElementById('btn-agregar-modal').style.display = '';
    document.getElementById('btn-save-modal').style.display    = '';
    document.getElementById('btn-cancel-edit').style.display   = '';
}

function marcarCambio() {
    document.getElementById('btn-save-modal').classList.add('btn-save-pulsing');
}

async function guardarCambiosPedido() {
    if (!pedidoEnEdicion) return;
    const { docId, data: original, productos } = pedidoEnEdicion;

    if (productos.length === 0) { alert('El pedido debe tener al menos un producto.'); return; }

    const neto  = productos.reduce((s, p) => s + (p.totalPrice || 0), 0);
    const total = Math.round(neto * (1 + RECARGO_SERVICIO));

    const cambios = [];
    const nombresNuevos = new Set(productos.map(p => p.name));

    // Productos eliminados
    (original.products || []).forEach(p => {
        if (!nombresNuevos.has(p.name))
            cambios.push({ tipoCambio: 'ELIMINADO', productoNombre: p.name, anterior: p.quantity, nuevo: 0 });
    });
    // Productos agregados o modificados
    productos.forEach(p => {
        const orig = (original.products || []).find(o => o.name === p.name);
        if (!orig) {
            cambios.push({ tipoCambio: 'AGREGADO', productoNombre: p.name, cantidad: p.quantity });
        } else if (orig.quantity !== p.quantity) {
            cambios.push({ tipoCambio: 'MODIFICADO', productoNombre: p.name, anterior: orig.quantity, nuevo: p.quantity });
        }
    });

    // Detectar cambio de fecha
    const fechaInput = document.getElementById('modal-fecha-input');
    const nuevaFecha = fechaInput.style.display !== 'none' ? fechaInput.value : null;
    if (nuevaFecha && nuevaFecha !== original.deliveryDate) {
        cambios.push({ tipoCambio: 'FECHA', anterior: original.deliveryDate, nuevo: nuevaFecha });
    }

    if (cambios.length === 0) {
        mostrarToast('Sin cambios para guardar.');
        return;
    }

    const btnGuardar = document.getElementById('btn-save-modal');
    try {
        btnGuardar.disabled    = true;
        btnGuardar.textContent = 'Guardando...';

        const updateData = {
            products:   productos,
            net_cost:   neto,
            total:      total,
            recargo:    Math.round(neto * RECARGO_SERVICIO),
            updated_at: new Date().toISOString()
        };
        if (nuevaFecha && nuevaFecha !== original.deliveryDate) {
            updateData.delivery_date = nuevaFecha;
        }

        const { error } = await supabase
            .from('pedidos_planta')
            .update(updateData)
            .eq('id', docId);
        if (error) throw error;

        await registrarMovimiento({
            tipo:         'MODIFICACION',
            entidad:      'Pedido',
            pedidoNumero: original.idPedido,
            referenciaId: docId,
            cambios,
            usuario:      usuarioActual
        });
        if (nuevaFecha && nuevaFecha !== original.deliveryDate) {
            document.getElementById('modal-fecha').textContent = nuevaFecha;
            const row = ordersContainer.querySelector(`tr[data-id="${docId}"]`);
            if (row) row.cells[1].textContent = nuevaFecha;
        }
        renderTablaModal(productos, false);
        actualizarTotalesModal(productos);
        setModoVista();
        const colAcc = document.querySelector('.col-accion');
        if (colAcc) colAcc.style.display = 'none';
        pedidoEnEdicion = null;
        mostrarToast('✅ Pedido actualizado correctamente.');
    } catch (err) {
        console.error('Error al guardar cambios:', err);
        mostrarToast('❌ Error al guardar. Intenta de nuevo.');
    } finally {
        btnGuardar.disabled    = false;
        btnGuardar.textContent = '✅';
    }
}

async function abrirModal(docId) {
    const { data: row, error } = await supabase
        .from('pedidos_planta')
        .select('*')
        .eq('id', docId)
        .single();
    if (error || !row) return;

    const pedido = normalizarPedido(row);
    document.getElementById('modal-id-pedido').textContent = pedido.idPedido;
    document.getElementById('modal-sede').textContent      = pedido.user;
    document.getElementById('modal-fecha').textContent     = pedido.deliveryDate;
    document.getElementById('modal-obs').textContent       = pedido.orderNotes || 'Sin observaciones';

    pedidoEnEdicion = null;
    const editable = esEditable(pedido);

    renderTablaModal(pedido.products || [], false);
    actualizarTotalesModal(pedido.products || []);
    renderStepper(pedido.status);

    // Mostrar/ocultar botón editar
    const btnEdit = document.getElementById('btn-edit-modal');
    btnEdit.style.display = editable ? '' : 'none';
    document.getElementById('btn-agregar-modal').style.display = 'none';
    document.getElementById('btn-save-modal').style.display    = 'none';
    document.getElementById('btn-cancel-edit').style.display   = 'none';

    // Guardar referencia para edición
    if (editable) {
        pedidoEnEdicion = { docId, data: pedido, productos: null };
    }

    document.getElementById('modal-detalle').style.display = 'flex';
}

// ── Eventos modal ─────────────────────────────────────────────────────────────
ordersContainer.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    abrirModal(tr.dataset.id);
});

document.getElementById('btn-edit-modal').addEventListener('click', async () => {
    if (!pedidoEnEdicion) return;
    pedidoEnEdicion.productos = JSON.parse(JSON.stringify(pedidoEnEdicion.data.products || []));
    productosDisponibles = await cargarProductosDisponibles();
    renderTablaModal(pedidoEnEdicion.productos, true);
    actualizarTotalesModal(pedidoEnEdicion.productos);
    setModoEdicion();
});

document.getElementById('btn-cancel-edit').addEventListener('click', () => {
    if (!pedidoEnEdicion) return;
    renderTablaModal(pedidoEnEdicion.data.products || [], false);
    actualizarTotalesModal(pedidoEnEdicion.data.products || []);
    setModoVista();
    const colAcc = document.querySelector('.col-accion');
    if (colAcc) colAcc.style.display = 'none';
    pedidoEnEdicion.productos = null;
});

document.getElementById('btn-save-modal').addEventListener('click', guardarCambiosPedido);

// ── Modal agregar producto ────────────────────────────────────────────────────
document.getElementById('btn-agregar-modal').addEventListener('click', async () => {
    productosDisponibles = await cargarProductosDisponibles();
    productoAgregarSeleccionado = null;
    document.getElementById('agregar-buscar-input').value = '';
    document.getElementById('agregar-resultados').innerHTML = '';
    document.getElementById('agregar-seleccionado').style.display = 'none';
    document.getElementById('agregar-confirmar').disabled = true;
    document.getElementById('agregar-cantidad').value = 1;
    document.getElementById('modal-agregar-producto').style.display = 'flex';
});

document.getElementById('agregar-buscar-input').addEventListener('input', () => {
    const q    = document.getElementById('agregar-buscar-input').value.trim().toLowerCase();
    const lista = document.getElementById('agregar-resultados');
    if (!q || !productosDisponibles) { lista.innerHTML = ''; return; }
    const enPedido = new Set((pedidoEnEdicion?.productos || []).map(p => p.name));
    const matches  = productosDisponibles.filter(p => p.name.toLowerCase().includes(q)).slice(0, 10);
    lista.innerHTML = matches.map(p => {
        const yaEsta = enPedido.has(p.name);
        return yaEsta
            ? `<div class="prod-result-item--disabled">
                <span class="prod-result-item__name">${p.name}</span>
                <span class="prod-result-item__tag">Ya en el pedido · edita la cantidad en la tabla</span>
               </div>`
            : `<div class="prod-result-item" data-name="${p.name}" data-id="${p.id}" data-price="${p.price || 0}">
                <span class="prod-result-item__name">${p.name}</span>
                <span class="prod-result-item__price">${fmtCOP.format(p.price || 0)}</span>
               </div>`;
    }).join('');
});

document.getElementById('agregar-resultados').addEventListener('click', (e) => {
    const item = e.target.closest('.prod-result-item');
    if (!item) return;
    productoAgregarSeleccionado = {
        name:  item.dataset.name,
        id:    item.dataset.id,
        price: parseFloat(item.dataset.price) || 0
    };
    document.getElementById('agregar-buscar-input').value         = item.dataset.name;
    document.getElementById('agregar-resultados').innerHTML       = '';
    document.getElementById('agregar-nombre-prod').textContent    = item.dataset.name;
    document.getElementById('agregar-seleccionado').style.display = '';
    document.getElementById('agregar-confirmar').disabled         = false;
    document.getElementById('agregar-cantidad').value             = 1;
    document.getElementById('agregar-cantidad').focus();
});

document.getElementById('agregar-confirmar').addEventListener('click', () => {
    if (!productoAgregarSeleccionado || !pedidoEnEdicion) return;
    const cant   = Math.max(1, parseInt(document.getElementById('agregar-cantidad').value) || 1);
    const precio = productoAgregarSeleccionado.price || 0;
    const nombre = productoAgregarSeleccionado.name;
    pedidoEnEdicion.productos.push({
        name:       nombre,
        quantity:   cant,
        price:      precio,
        totalPrice: Math.round(cant * precio),
        idProduct:  productoAgregarSeleccionado.id
    });
    renderTablaModal(pedidoEnEdicion.productos, true);
    actualizarTotalesModal(pedidoEnEdicion.productos);
    document.getElementById('modal-agregar-producto').style.display = 'none';
    productoAgregarSeleccionado = null;
    marcarCambio();
    mostrarToast(`✓ ${nombre} agregado al pedido`);
});

function mostrarToast(mensaje) {
    const toast = document.createElement('div');
    toast.textContent = mensaje;
    toast.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#27ae60;color:white;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 14px rgba(0,0,0,0.2);pointer-events:none;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function cerrarModalAgregar() {
    if (productoAgregarSeleccionado) {
        if (!confirm('Tienes un producto seleccionado sin confirmar. ¿Deseas descartarlo?')) return;
    }
    document.getElementById('modal-agregar-producto').style.display = 'none';
    productoAgregarSeleccionado = null;
}

document.getElementById('agregar-cancelar').addEventListener('click', cerrarModalAgregar);

document.getElementById('modal-agregar-producto').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-agregar-producto')) cerrarModalAgregar();
});

// Cerrar modal principal
function cerrarModalDetalle() {
    const enEdicion = pedidoEnEdicion?.productos !== null && pedidoEnEdicion?.productos !== undefined;
    const hayCambios = document.getElementById('btn-save-modal').classList.contains('btn-save-pulsing');
    if (enEdicion && hayCambios) {
        if (!confirm('Tienes cambios sin guardar. ¿Deseas salir y perderlos?')) return;
    }
    document.getElementById('modal-detalle').style.display = 'none';
    pedidoEnEdicion = null;
}

document.getElementById('btn-cerrar-modal').addEventListener('click', cerrarModalDetalle);
document.getElementById('modal-detalle').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-detalle')) cerrarModalDetalle();
});
