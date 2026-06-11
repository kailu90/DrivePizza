import { supabase } from '../Api/supabaseConfig.js';
import { ejecutarSalidaPedido, registrarMovimiento, ejecutarTransaccionStock } from './inventoryService.js'
import { CargarHeader, CargarSidebar } from '../Shared/components.js'
import { RECARGO_SERVICIO } from './planta.config.js'
import { verificarAccesoPlanta } from '../Auth/plantaAuth.js'
import { mostrarOverlay, actualizarOverlay, ocultarOverlay } from '../Shared/overlay.js'
import { getProductos, invalidarProductos } from '../Shared/productosService.js'

const ordersContainer = document.getElementById('ordersContainer');

// Estado del modal de edición
let pedidoEnEdicion = null;   // { docId, data, productos: [{idProduct, name, quantity, unitPrice, totalPrice}] }
let unsubscribeModalDoc = null;
let todosPedidosSup = [] // caché local de todos los pedidos de Planta

function cerrarListenerModal() {
    if (unsubscribeModalDoc) { unsubscribeModalDoc(); unsubscribeModalDoc = null; }
}
let productosDisponibles = null;  // caché de la colección Productos
const fmtCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

// Mapea columnas snake_case de Supabase al formato camelCase usado en todo el módulo
function normalizarPedido(p) {
    return {
        idPedido:     p.id_pedido,
        user:         p.user_sede,
        deliveryDate: p.delivery_date,
        orderNotes:   p.order_notes,
        netCost:      p.net_cost,
        total:        p.total,
        recargo:      p.recargo,
        products:     p.products || [],
        status:       p.status,
        eliminado:    p.eliminado,
    };
}

// ── STEPPER DE ESTADO ─────────────────────────────────────────────────────
const ICON_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/></svg>`;

const STEPS_PLANTA = [
    {
        key: 'pendiente', label: 'Pendiente',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
    },
    {
        key: 'entregado', label: 'Entregado',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/></svg>`
    },
    {
        key: 'pagado', label: 'Pagado',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2"/>
                <line x1="2" y1="10" x2="22" y2="10"/></svg>`
    }
];

function renderStepperModal(status) {
    const currentIdx = STEPS_PLANTA.findIndex(s => s.key === status);
    let html = '<div class="stepper">';
    STEPS_PLANTA.forEach((step, i) => {
        let cls = '', onclick = '', icon = step.icon;
        if (i < currentIdx)          { cls = 'step-done';   icon = ICON_CHECK; }
        else if (i === currentIdx)   { cls = 'step-active'; }
        else if (i === currentIdx + 1) {
            cls     = 'step-next';
            onclick = `onclick="cambiarEstadoModal('${step.key}')"`;
        } else { cls = 'step-locked'; }

        html += `<div class="step ${cls}" ${onclick}>
            <div class="step-circle">${icon}</div>
            <span class="step-label">${step.label}</span>
        </div>`;
        if (i < STEPS_PLANTA.length - 1)
            html += `<div class="step-connector ${i < currentIdx ? 'active' : ''}"></div>`;
    });
    html += '</div>';
    document.getElementById('modal-stepper').innerHTML = html;
}

let _cambioEstadoEnProceso = false;
window.cambiarEstadoModal = async (nuevoEstado) => {
    if (!pedidoEnEdicion || _cambioEstadoEnProceso) return;
    _cambioEstadoEnProceso = true;

    // Deshabilitar visualmente el botón del stepper mientras procesa
    const btnNext = document.querySelector('#modal-stepper .step-next');
    if (btnNext) {
        btnNext.style.opacity = '0.5';
        btnNext.style.pointerEvents = 'none';
    }

    const { docId } = pedidoEnEdicion;
    mostrarOverlay('Procesando...');
    try {
        await actualizarEstadoYDescontar(docId, nuevoEstado);
        // Solo actualiza la UI del stepper si Supabase confirmó el cambio
        pedidoEnEdicion.data.status = nuevoEstado;
        actualizarBadgeFila(docId, nuevoEstado);
        ocultarOverlay(nuevoEstado === 'entregado');
        if (nuevoEstado === 'entregado') {
            setTimeout(() => {
                cerrarListenerModal();
                modalDetalle.style.display = 'none';
                document.body.classList.remove('no-scroll');
                pedidoEnEdicion = null;
            }, 420);
        } else {
            renderStepperModal(nuevoEstado);
        }
    } catch (e) {
        ocultarOverlay(false);
        // El stepper no avanza — restaurar el botón para que el usuario pueda reintentar
        if (btnNext) {
            btnNext.style.opacity = '';
            btnNext.style.pointerEvents = '';
        }
        console.warn('Estado del modal no actualizado por error en el proceso.');
    } finally {
        _cambioEstadoEnProceso = false;
    }
};




CargarSidebar(() => {
    setQuickActive('btn-recientes');
    listenForOrders();
});




/****************TRAE TODOS LOS PEDIDOS DE LA BASE DE DATOS************/

// ── Paginación ──────────────────────────────────────────────────────────────
const PAGE_SIZE = 20;
let paginaActual = 1;
let cursorActual = null;          // (mantenido por compatibilidad con UI)
let paginaCursorHistory = [];
let ultimoDocPagina = null;

function resetPaginacion() {
  paginaActual = 1;
  cursorActual = null;
  paginaCursorHistory = [];
  ultimoDocPagina = null;
  todosPedidosSup = [];
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
  const desde = document.getElementById('filter-date-desde')?.value || '';
  const hasta  = document.getElementById('filter-date-hasta')?.value || '';
  return { desde, hasta };
}

function renderRows(querySnapshot, ordersContainer, sortOrder) {
  ordersContainer.innerHTML = '';

  const { desde, hasta } = getFechas();
  const modoFecha  = !!(desde || hasta);
  const mismaFecha = desde === hasta;

  // Mostrar/ocultar paginación
  const paginationEl = document.getElementById('pagination-controls');
  if (paginationEl) paginationEl.style.display = modoFecha ? 'none' : 'flex';

  if (querySnapshot.empty) {
    let msg;
    if (!modoFecha)          msg = 'Sin pedidos registrados';
    else if (mismaFecha)     msg = `Sin pedidos para el ${desde} · Usa el filtro de fecha para consultar otro día`;
    else                     msg = `Sin pedidos entre el ${desde} y el ${hasta}`;
    ordersContainer.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:40px; color:#666; font-size:16px; font-weight:bold;">
          ${msg}
        </td>
      </tr>`;

    if (!modoFecha) actualizarBotonesPaginacion(0);
    return;
  }

  const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
  let totalPedidos = 0, pedidosPendientes = 0, pedidosEnviados = 0, pedidosPagados = 0;

  const docs = [...querySnapshot.docs];

  // Guardar cursor para paginación (solo en modo sin fecha)
  if (!modoFecha) {
    ultimoDocPagina = docs[docs.length - 1];
    actualizarBotonesPaginacion(docs.length);
  }

  // Ordenar en memoria solo para rango de fechas
  if (modoFecha && !mismaFecha) {
    docs.sort((a, b) => {
      const diff = b.data().idPedido - a.data().idPedido;
      return sortOrder === 'asc' ? -diff : diff;
    });
  }

  docs.forEach((docSnap) => {
    const pedido = docSnap.data();
    const docId = docSnap.id;

    if (pedido.eliminado) return;

    if (pedido.status === 'pendiente') pedidosPendientes++;
    else if (pedido.status === 'entregado') pedidosEnviados++;
    else if (pedido.status === 'pagado') pedidosPagados++;

    const badgeClass = { pendiente: 'badge-pendiente', entregado: 'badge-entregado', pagado: 'badge-pagado' }[pedido.status] || '';

    const row = document.createElement('tr');
    row.className = 'inventory-management__row';
    row.dataset.docId = docId;
    row.innerHTML = `
      <td class="inventory-management__cell">${pedido.idPedido}</td>
      <td class="inventory-management__cell">${pedido.deliveryDate}</td>
      <td class="inventory-management__cell">
        <span class="sede-nombre">${(pedido.user || '').toLowerCase()}</span>
        ${pedido.orderNotes ? `<span class="obs-badge obs-badge--active" title="${pedido.orderNotes.replace(/"/g, '&quot;')}">obs</span>` : ''}
      </td>
      <td class="inventory-management__cell">
        <span class="status-badge ${badgeClass}">${pedido.status}</span>
      </td>
      <td class="inventory-management__cell">${formatter.format(pedido.netCost || 0)}</td>
      <td class="inventory-management__cell">${formatter.format(pedido.total || 0)}</td>
      <td class="inventory-management__cell">
        <a class="inventory-management__link btn-print" title="Imprimir Comanda">🖨️</a>
      </td>`;
    ordersContainer.appendChild(row);
    totalPedidos++;
  });

}

let pedidosMap = new Map();   // docId → data — caché en memoria para merge incremental
let sortOrderActual = 'desc'; // sort activo al momento del último render

// Fake snapshot compatible con renderRows
function crearFakeSnapshot(entries) {
    return {
        empty: entries.length === 0,
        docs: entries.map(({ id, data }) => ({ id, data: () => data }))
    };
}

// Realtime: se inicia una sola vez y persiste durante toda la sesión
let _realtimeStarted = false;

function iniciarPoll() {
    // Supabase Realtime: recarga la vista al detectar cambios en pedidos_planta
    supabase
        .channel('planta-pedidos')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_planta' }, () => {
            todosPedidosSup = [];
            listenForOrders(sortOrderActual);
        })
        .subscribe();

    // Refresco periódico como respaldo cada 5 min
    setInterval(() => {
        if (document.visibilityState === 'visible') {
            todosPedidosSup = [];
            listenForOrders(sortOrderActual);
        }
    }, 5 * 60 * 1000);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            todosPedidosSup = [];
            listenForOrders(sortOrderActual);
        }
    });
}

function listenForOrders(sortOrder = 'desc') {
    if (!ordersContainer) return;
    sortOrderActual = sortOrder;
    pedidosMap.clear();

    // Inicia Realtime una sola vez
    if (!_realtimeStarted) {
        _realtimeStarted = true;
        iniciarPoll();
    }

    const { desde, hasta } = getFechas();

    if (!desde && !hasta) {
        // Modo recientes: carga todo y pagina en memoria
        const cargarYPaginar = (pedidos) => {
            pedidosMap.clear();
            pedidos.forEach(p => pedidosMap.set(String(p.id), normalizarPedido(p)));
            const entries = [...pedidosMap.entries()].map(([id, data]) => ({ id, data }));
            const inicio = (paginaActual - 1) * PAGE_SIZE;
            const slice = entries.slice(inicio, inicio + PAGE_SIZE);
            ultimoDocPagina = slice[slice.length - 1];
            actualizarBotonesPaginacion(slice.length);
            renderRows(crearFakeSnapshot(slice), ordersContainer, sortOrder);
        };

        if (todosPedidosSup.length > 0) {
            cargarYPaginar(todosPedidosSup);
        } else {
            supabase
                .from('pedidos_planta')
                .select('*')
                .eq('eliminado', false)
                .order('id_pedido', { ascending: false })
                .then(({ data: pedidos, error }) => {
                    if (error) { console.error('Error cargando pedidos:', error); return; }
                    todosPedidosSup = pedidos || [];
                    cargarYPaginar(todosPedidosSup);
                });
        }
    } else {
        // Modo fecha: consulta filtrada, sin paginación
        let query = supabase.from('pedidos_planta').select('*').eq('eliminado', false);
        if (desde === hasta && desde) {
            query = query.eq('delivery_date', desde);
        } else {
            if (desde) query = query.gte('delivery_date', desde);
            if (hasta) query = query.lte('delivery_date', hasta);
        }
        query
            .order('id_pedido', { ascending: sortOrder === 'asc' })
            .then(({ data: pedidos, error }) => {
                if (error) { console.error('Error cargando pedidos por fecha:', error); return; }
                pedidosMap.clear();
                const all = pedidos || [];
                const entries = all.map(p => {
                    const data = normalizarPedido(p);
                    pedidosMap.set(String(p.id), data);
                    return { id: String(p.id), data };
                });
                renderRows(crearFakeSnapshot(entries), ordersContainer, sortOrder);
            });
    }
}


/****************FILTROS DE FECHA Y ORDEN***********/
function getOrder() {
  return document.getElementById('sort')?.value.split('-')[1] || 'desc';
}

function setQuickActive(id) {
  ['btn-hoy', 'btn-ayer', 'btn-semana'].forEach(btnId => {
    document.getElementById(btnId)?.classList.remove('active');
  });
  document.getElementById(id)?.classList.add('active');
}

const desdeInput = document.getElementById('filter-date-desde');
const hastaInput = document.getElementById('filter-date-hasta');

if (desdeInput) desdeInput.addEventListener('change', () => { resetPaginacion(); setQuickActive(null); listenForOrders(getOrder()); });
if (hastaInput) hastaInput.addEventListener('change', () => { resetPaginacion(); setQuickActive(null); listenForOrders(getOrder()); });

const sortSelect = document.getElementById('sort');
if (sortSelect) sortSelect.addEventListener('change', () => listenForOrders(getOrder()));

// ── Botones rápidos ───────────────────────────────────────────────────
function toISO(date) { return date.toISOString().slice(0, 10); }

document.getElementById('btn-hoy')?.addEventListener('click', () => {
  const hoy = toISO(new Date());
  if (desdeInput) desdeInput.value = hoy;
  if (hastaInput) hastaInput.value = hoy;
  resetPaginacion();
  setQuickActive('btn-hoy');
  listenForOrders(getOrder());
});

document.getElementById('btn-ayer')?.addEventListener('click', () => {
  const ayer = new Date(); ayer.setDate(ayer.getDate() - 1);
  const ayerISO = toISO(ayer);
  if (desdeInput) desdeInput.value = ayerISO;
  if (hastaInput) hastaInput.value = ayerISO;
  resetPaginacion();
  setQuickActive('btn-ayer');
  listenForOrders(getOrder());
});

document.getElementById('btn-semana')?.addEventListener('click', () => {
  const hoy = new Date();
  const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - hoy.getDay() + 1);
  if (desdeInput) desdeInput.value = toISO(lunes);
  if (hastaInput) hastaInput.value = toISO(hoy);
  setQuickActive('btn-semana');
  listenForOrders(getOrder());
});

// Botón "Recientes" → limpia fechas y vuelve al modo paginación
document.getElementById('btn-recientes')?.addEventListener('click', () => {
  if (desdeInput) desdeInput.value = '';
  if (hastaInput) hastaInput.value = '';
  resetPaginacion();
  setQuickActive('btn-recientes');
  listenForOrders(getOrder());
});

// ── Paginación ─────────────────────────────────────────────────────────────
document.getElementById('btn-next-page')?.addEventListener('click', () => {
  if (!ultimoDocPagina) return;
  paginaCursorHistory.push(cursorActual);
  cursorActual = ultimoDocPagina;
  paginaActual++;
  listenForOrders(getOrder());
});

document.getElementById('btn-prev-page')?.addEventListener('click', () => {
  if (paginaActual <= 1) return;
  cursorActual = paginaCursorHistory.pop();
  paginaActual--;
  listenForOrders(getOrder());
});




/*************************FUNCIÓN PARA VER DETALLES DEL PEDIDO******************/
const modalDetalle = document.getElementById('modal-detalle');
const closeModalDetalle = document.getElementById('close-modal-detalle');


if (ordersContainer) {
ordersContainer.addEventListener('click', async (e) => {
    const row = e.target.closest('.inventory-management__row');
    if (!row) return;

    const printBtn = e.target.closest('.btn-print');

    const docId = row.dataset.docId;
    const idPedidoVisual = row.cells[0].innerText;

    if (printBtn) {
        e.stopPropagation();
        imprimirDirecto(docId);
        return;
    }

    abrirModalPedido(docId, false);

})};


/********************CONFIRMACIÓN DE ELIMINACIÓN DE PEDIDO***************/
async function confirmarEliminacion(docId, idPedidoVisual, rowElement) {
    const confirmacion = confirm(`¿Estás seguro de que deseas eliminar el pedido N° ${idPedidoVisual}?`);

    if (confirmacion) {
        try {
            const { data: pedidoSup, error: fetchErr } = await supabase
                .from('pedidos_planta')
                .select('*')
                .eq('id', docId)
                .single();

            if (fetchErr || !pedidoSup) throw new Error('Pedido no encontrado');
            const pedidoData = normalizarPedido(pedidoSup);

            const productosList = (pedidoData.products || []).map(p => ({
                productoNombre: p.name,
                cantidad: p.quantity
            }));

            const { error: updateErr } = await supabase
                .from('pedidos_planta')
                .update({ eliminado: true, updated_at: new Date().toISOString() })
                .eq('id', docId);

            if (updateErr) throw updateErr;

            pedidosMap.delete(docId);
            todosPedidosSup = todosPedidosSup.filter(p => String(p.id) !== docId);

            registrarMovimiento({
                tipo: 'ELIMINACION',
                entidad: 'Pedido',
                productoId: docId,
                productoNombre: `Pedido N° ${idPedidoVisual}`,
                pedidoNumero: idPedidoVisual,
                productos: productosList,
                motivo: 'Pedido eliminado manualmente',
                notas: pedidoData.orderNotes || '',
                usuario: usuarioActual
            }).catch(console.error);

            alert(`Pedido ${idPedidoVisual} eliminado con éxito.`);

            const fila = rowElement || document.querySelector(`tr[data-doc-id="${docId}"]`);
            if (fila) {
                fila.style.transition = "all 0.5s ease";
                fila.style.opacity = "0";
                fila.style.transform = "translateX(20px)";
                setTimeout(() => fila.remove(), 500);
            }

        } catch (error) {
            console.error("Error al eliminar pedido:", error);
            alert("Hubo un error al intentar eliminar el pedido. Por favor, intenta de nuevo.");
        }
    }
}




/**********************ABRIR MODAL CON DETALLES DEL PEDIDO***************/
async function abrirModalPedido(docId, esEdicion = false) {
    cerrarListenerModal();

    const { data: pedidoSup, error } = await supabase
        .from('pedidos_planta')
        .select('*')
        .eq('id', docId)
        .single();

    if (error || !pedidoSup) {
        alert("No se pudieron cargar los detalles del pedido.");
        return;
    }

    const pedido = normalizarPedido(pedidoSup);

    document.getElementById('modal-id-pedido').textContent = pedido.idPedido;
    document.getElementById('modal-sede').textContent = (pedido.user || '').toLowerCase();
    document.getElementById('modal-fecha').textContent = pedido.deliveryDate;
    document.getElementById('modal-fecha').style.display = '';
    document.getElementById('modal-fecha-input').style.display = 'none';
    document.getElementById('modal-obs').textContent = pedido.orderNotes || 'Sin observaciones';

    const productos = (pedido.products || [])
        .map(p => ({ ...p, unitPrice: p.quantity > 0 ? p.totalPrice / p.quantity : 0 }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));

    pedidoEnEdicion = { docId, data: pedido, productos };
    renderTablaModal(productos, esEdicion);
    actualizarTotalesModal(productos);

    const editable = pedido.status === 'pendiente' || (pedido.status === 'entregado' && ['planta-admin', 'admin'].includes(rolUsuario));
    if (esEdicion) {
        setModoEdicionDashboard();
    } else {
        setModoVistaDashboard(editable);
    }
    document.getElementById('modal-stepper').style.display = esEdicion ? 'none' : 'block';
    if (!esEdicion) renderStepperModal(pedido.status);

    cerrarModalAgregarProducto(true);
    if (esEdicion) cargarProductosDisponibles();

    if (modalDetalle) {
        modalDetalle.style.display = 'flex';
        document.body.classList.add('no-scroll');
    }

    // Suscripción Realtime para actualizaciones en vivo del pedido abierto
    const modalChannel = supabase
        .channel(`modal-pedido-${docId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'pedidos_planta',
            filter: `id=eq.${docId}`
        }, (payload) => {
            if (!pedidoEnEdicion) return;
            const enEdicion = document.getElementById('btn-save-modal').style.display !== 'none';
            if (enEdicion) return;
            const updated = normalizarPedido(payload.new);
            pedidoEnEdicion.data = updated;
            renderStepperModal(updated.status);
            document.getElementById('modal-fecha').textContent = updated.deliveryDate;
            setModoVistaDashboard(updated.status === 'pendiente' || (updated.status === 'entregado' && ['planta-admin', 'admin'].includes(rolUsuario)));
        })
        .subscribe();

    unsubscribeModalDoc = () => supabase.removeChannel(modalChannel);
}

function renderTablaModal(productos, esEdicion) {
    const colAccion = document.querySelector('.col-accion');
    if (colAccion) colAccion.style.display = esEdicion ? '' : 'none';

    const tbody = document.getElementById('modal-table-body');
    let html = '';
    productos.forEach((prod, idx) => {
        const cantCell = esEdicion
            ? `<td style="text-align:center;"><input type="number" class="input-cant-modal" min="1" value="${prod.quantity}" data-idx="${idx}" style="width:55px;text-align:center;padding:2px 4px;border:1px solid #ccc;border-radius:4px;"></td>`
            : `<td style="text-align:center;">${prod.quantity}</td>`;
        const accionCell = esEdicion
            ? `<td style="text-align:center;"><button class="btn-del-prod" data-idx="${idx}" title="Quitar producto" style="background:none;border:none;cursor:pointer;font-size:16px;padding:0;">🗑️</button></td>`
            : '';
        html += `<tr><td>${prod.name}</td>${cantCell}<td>${fmtCOP.format(prod.totalPrice)}</td>${accionCell}</tr>`;
    });
    tbody.innerHTML = html;
}

function actualizarTotalesModal(productos) {
    const netCost = productos.reduce((s, p) => s + p.totalPrice, 0);
    document.getElementById('modal-neto').textContent = fmtCOP.format(netCost);
    document.getElementById('modal-total').textContent = fmtCOP.format(netCost * 1.15);
}

/*****************************IMPRIMIR COMANDA DE PEDIDO PLANTA*****************************/
async function imprimirDirecto(docId) {
    try {
        const { data: pedidoSup, error } = await supabase
            .from('pedidos_planta')
            .select('*')
            .eq('id', docId)
            .single();
        if (error || !pedidoSup) { alert("Pedido no encontrado."); return; }

        const pedido = normalizarPedido(pedidoSup);
        const fmtNum = (n) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0 }).format(n || 0);

        // Embeber logo como base64 igual que printer.mjs para evitar problemas de carga y color
        const logoResp = await fetch(`${window.location.origin}/Imagenes/logo-comanda.png`);
        const logoBlob = await logoResp.blob();
        const logoBase64 = await new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(logoBlob);
        });

        const productosHTML = (pedido.products || []).map(p => `
          <div class="product-row">
            <span class="p-qty">${p.quantity}×</span>
            <span class="p-name">${p.name}</span>
            <span class="p-price">$${fmtNum(p.totalPrice)}</span>
          </div>`
        ).join('');

        const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; color: #000 !important; font-weight: 700; }
body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media print { body { margin: 0; } }

.receipt {
  width: 280px;
  background: #fff;
  color: #000;
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  padding: 10px 8px;
  margin: 0 auto;
}

/* Encabezado */
.brand {
  text-align: center;
  padding-bottom: 7px;
  border-bottom: 2px solid #000;
  margin-bottom: 6px;
}
.brand img { max-width: 100px; height: auto; filter: grayscale(1) contrast(10) invert(1); }

.doc-type {
  font-size: 10px;
  letter-spacing: 3px;
  text-align: center;
  color: #000;
  margin-bottom: 2px;
}
.sede {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 2px;
  text-align: center;
  margin-bottom: 8px;
}

/* Caja número de pedido */
.pedido-box {
  background: #fff;
  text-align: center;
  padding: 4px 0 6px;
  margin-bottom: 8px;
  border: 2px solid #000;
}
.pedido-box .lbl { font-size: 10px; letter-spacing: 2px; }
.pedido-box .num { font-size: 44px; font-weight: 700; line-height: 1; letter-spacing: -2px; }

/* Meta */
.meta { font-size: 11px; margin-bottom: 8px; }
.meta-row {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
  border-bottom: 0.5px dotted #000;
}
.meta-row .k { color: #000; }
.meta-row .v { font-weight: 700; }
.meta-row--center { justify-content: center; gap: 8px; }

hr.dashed { border: none; border-top: 1.5px dashed #000; margin: 6px 0; }

/* Título de sección */
.sec-title {
  text-align: center;
  font-size: 10px;
  letter-spacing: 3px;
  color: #000;
  margin-bottom: 4px;
}

/* Tabla de productos */
.prod-header,
.product-row {
  display: grid;
  grid-template-columns: 28px 1fr 64px;
  gap: 3px;
  align-items: center;
}
.prod-header {
  font-size: 10px;
  letter-spacing: 1px;
  color: #000;
  border-bottom: 1px solid #000;
  padding-bottom: 3px;
  margin-bottom: 2px;
}
.prod-header .ph-desc  { text-align: center; }
.prod-header .ph-price { text-align: right; }

.product-row {
  padding: 3px 0;
  border-bottom: 0.5px dotted #000;
  font-size: 12px;
}
.product-row:last-child { border-bottom: none; }
.p-qty   { font-weight: 900; white-space: nowrap; }
.p-name  { line-height: 1.3; word-break: break-word; padding-right: 8px; }
.p-price { text-align: right; white-space: nowrap; }

/* Totales */
.totals { border-top: 1.5px solid #000; padding-top: 5px; margin-top: 4px; }
.total-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #000;
  padding: 1px 0;
}
.total-final {
  display: flex;
  justify-content: space-between;
  font-size: 17px;
  font-weight: 700;
  border-top: 2px solid #000;
  margin-top: 5px;
  padding-top: 5px;
}

/* Observación */
.obs-box {
  border: 2px solid #000;
  border-radius: 3px;
  padding: 8px;
  margin: 8px 0;
  text-align: center;
}
.obs-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #000;
  margin-bottom: 5px;
}
.obs-text { font-size: 14px; font-weight: 700; color: #000; line-height: 1.4; }

/* Footer */
.footer {
  text-align: center;
  font-size: 10px;
  letter-spacing: 2px;
  color: #000;
  margin-top: 10px;
}
</style>
</head><body>
<div class="receipt">

  <div class="brand">
    <img src="${logoBase64}" />
  </div>

  <p class="doc-type">ORDEN DE PRODUCCIÓN</p>
  <p class="sede">${(pedido.user || '').toUpperCase()}</p>

  <div class="pedido-box">
    <div class="lbl">PEDIDO N°</div>
    <div class="num">#${pedido.idPedido}</div>
  </div>

  <div class="meta">
    <div class="meta-row meta-row--center">
      <span class="k">FECHA ENTREGA</span>
      <span class="v">${pedido.deliveryDate}</span>
    </div>
  </div>

  <hr class="dashed">
  <p class="sec-title">PRODUCTOS</p>

  <div class="prod-header">
    <span>CANT</span>
    <span class="ph-desc">DESCRIPCIÓN</span>
    <span class="ph-price">TOTAL</span>
  </div>

  ${productosHTML}

  ${pedido.orderNotes ? `
  <div class="obs-box">
    <div class="obs-label">— OBSERVACIÓN —</div>
    <div class="obs-text">${pedido.orderNotes}</div>
  </div>` : ''}

  <div class="totals">
    <div class="total-row">
      <span>Valor Neto</span><span>$${fmtNum(pedido.netCost)}</span>
    </div>
    <div class="total-row">
      <span>Recargo (${RECARGO_SERVICIO * 100}%)</span><span>$${fmtNum(pedido.recargo)}</span>
    </div>
    <div class="total-final">
      <span>TOTAL</span><span>$${fmtNum(pedido.total)}</span>
    </div>
  </div>

  <p class="footer">&#42;&#42;&#42; COPIA PLANTA &#42;&#42;&#42;</p>

</div>
</body></html>`;

        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:absolute;width:1px;height:1px;top:-9999px;left:-9999px;border:0;';
        document.body.appendChild(iframe);
        iframe.contentDocument.open();
        iframe.contentDocument.write(html);
        iframe.contentDocument.close();
        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            iframe.contentWindow.onafterprint = () => document.body.removeChild(iframe);
        }, 400);
    } catch (error) {
        console.error("Error al imprimir:", error);
        alert("No se pudo generar la comanda.");
    }
}

async function cargarProductosDisponibles() {
    if (productosDisponibles) return
    const todos = await getProductos()
    productosDisponibles = todos.filter(p => {
        const activo = p.active == null ? true : Boolean(p.active)
        const tieneStock = p.sinLimiteStock === true || (p.stock ?? 0) > 0
        return activo && tieneStock
    })
}

async function guardarCambiosPedido() {
    if (!pedidoEnEdicion) return;
    const { docId, data: pedidoOriginal, productos } = pedidoEnEdicion;

    const puedeEditar = pedidoOriginal.status === 'pendiente' ||
        (pedidoOriginal.status === 'entregado' && ['planta-admin', 'admin'].includes(rolUsuario));
    if (!puedeEditar) {
        alert('Solo se pueden modificar pedidos en estado pendiente.');
        return;
    }

    if (productos.length === 0) {
        alert('El pedido debe tener al menos un producto.');
        return;
    }

    const netCost = productos.reduce((s, p) => s + p.totalPrice, 0);
    const total = netCost * (1 + RECARGO_SERVICIO);
    const recargo = netCost * RECARGO_SERVICIO;

    // Solo guardar campos del esquema original (sin unitPrice)
    const productosFS = productos.map(({ idProduct, name, quantity, totalPrice }) =>
        ({ idProduct, name, quantity, totalPrice }));

    // Calcular diff antes de guardar para detectar si hubo cambios
    const originales = pedidoOriginal.products || [];
    const cambios = [];
    productosFS.forEach(pNuevo => {
        const pAnterior = originales.find(p => String(p.idProduct) === String(pNuevo.idProduct));
        if (!pAnterior) {
            cambios.push({ tipoCambio: 'AGREGADO', productoNombre: pNuevo.name, cantidad: pNuevo.quantity });
        } else if (pAnterior.quantity !== pNuevo.quantity) {
            cambios.push({ tipoCambio: 'CANTIDAD', productoNombre: pNuevo.name, anterior: pAnterior.quantity, nuevo: pNuevo.quantity });
        }
    });
    originales.forEach(pOrig => {
        if (!productosFS.find(p => String(p.idProduct) === String(pOrig.idProduct))) {
            cambios.push({ tipoCambio: 'ELIMINADO', productoNombre: pOrig.name });
        }
    });

    // Detectar cambio de fecha (solo planta)
    const fechaInput = document.getElementById('modal-fecha-input');
    const nuevaFecha = fechaInput.style.display !== 'none' ? fechaInput.value : null;
    if (nuevaFecha && nuevaFecha !== pedidoOriginal.deliveryDate) {
        cambios.push({ tipoCambio: 'FECHA', anterior: pedidoOriginal.deliveryDate, nuevo: nuevaFecha });
    }

    if (cambios.length === 0) {
        mostrarToast('Sin cambios para guardar.');
        return;
    }

    const btnGuardar = document.getElementById('btn-save-modal');
    try {
        btnGuardar.disabled = true;
        btnGuardar.textContent = 'Guardando...';

        const updateData = {
            products: productosFS,
            net_cost: netCost,
            total,
            recargo,
            updated_at: new Date().toISOString()
        };
        if (nuevaFecha && nuevaFecha !== pedidoOriginal.deliveryDate) {
            updateData.delivery_date = nuevaFecha;
        }

        const { error } = await supabase
            .from('pedidos_planta')
            .update(updateData)
            .eq('id', docId);

        if (error) throw error;

        if (cambios.length > 0) {
            await registrarMovimiento({
                tipo: 'MODIFICACION',
                entidad: 'Pedido',
                productoId: docId,
                productoNombre: `Pedido #${pedidoOriginal.idPedido}`,
                cambios,
                motivo: 'Edición manual desde dashboard',
                usuario: usuarioActual
            });
        }

        setModoVistaDashboard(false);
        cerrarListenerModal();
        modalDetalle.style.display = 'none';
        document.body.classList.remove('no-scroll');
        pedidoEnEdicion = null;
        mostrarToast('✅ Pedido actualizado correctamente.');
    } catch (error) {
        console.error('Error al guardar cambios:', error);
        mostrarToast('❌ Error al guardar. Intenta de nuevo.');
    } finally {
        btnGuardar.disabled    = false;
        btnGuardar.textContent = '✅';
    }
}




// Cerrar si hacen clic fuera del contenido blanco
window.addEventListener('click', (e) => {
    if (e.target === modalDetalle) {
        const enEdicion = pedidoEnEdicion?.productos !== null && pedidoEnEdicion?.productos !== undefined;
        const hayCambios = document.getElementById('btn-save-modal').classList.contains('btn-save-pulsing');
        if (enEdicion && hayCambios) {
            if (!confirm('Tienes cambios sin guardar. ¿Deseas salir y perderlos?')) return;
        }
        document.getElementById('btn-save-modal').classList.remove('btn-save-pulsing');
        cerrarListenerModal();
        modalDetalle.style.display = 'none';
        document.body.classList.remove('no-scroll');
        pedidoEnEdicion = null;
    }
});

// ── Botón "Imprimir" del modal ─────────────────────────────────────────
document.getElementById('btn-print-modal')?.addEventListener('click', () => {
    if (!pedidoEnEdicion) return;
    imprimirDirecto(pedidoEnEdicion.docId);
});

// ── Botón "Eliminar" del modal ─────────────────────────────────────────
document.getElementById('btn-delete-modal')?.addEventListener('click', async () => {
    if (!pedidoEnEdicion) return;
    const { docId, data: pedido } = pedidoEnEdicion;
    cerrarListenerModal();
    modalDetalle.style.display = 'none';
    document.body.classList.remove('no-scroll');
    pedidoEnEdicion = null;
    await confirmarEliminacion(docId, pedido.idPedido, null);
});

// ── Modos vista / edición ──────────────────────────────────────────────
function setModoVistaDashboard(editable = false) {
    document.getElementById('btn-print-modal').style.display  = 'inline-block';
    document.getElementById('btn-edit-modal').style.display   = editable ? 'inline-block' : 'none';
    document.getElementById('btn-agregar-modal').style.display = 'none';
    document.getElementById('btn-delete-modal').style.display  = editable ? 'inline-block' : 'none';
    document.getElementById('btn-save-modal').style.display    = 'none';
    document.getElementById('btn-save-modal').classList.remove('btn-save-pulsing');
    document.getElementById('btn-cancel-edit').style.display   = 'none';
    document.getElementById('modal-stepper').style.display     = 'block';
    document.getElementById('modal-fecha').style.display = '';
    document.getElementById('modal-fecha-input').style.display = 'none';
}

function setModoEdicionDashboard() {
    document.getElementById('btn-print-modal').style.display  = 'none';
    document.getElementById('btn-edit-modal').style.display   = 'none';
    document.getElementById('btn-agregar-modal').style.display = 'inline-block';
    document.getElementById('btn-delete-modal').style.display  = 'none';
    document.getElementById('btn-save-modal').style.display    = 'inline-block';
    document.getElementById('btn-cancel-edit').style.display   = 'inline-block';
    document.getElementById('modal-stepper').style.display     = 'none';

    const esDePlanta = ['planta', 'admin', 'planta-admin'].includes(rolUsuario);
    if (esDePlanta && pedidoEnEdicion) {
        document.getElementById('modal-fecha').style.display = 'none';
        const fechaInput = document.getElementById('modal-fecha-input');
        fechaInput.value = pedidoEnEdicion.data.deliveryDate || '';
        fechaInput.style.display = 'inline-block';
    }
}

// ── Botón "Editar" del modal ───────────────────────────────────────────
document.getElementById('btn-edit-modal')?.addEventListener('click', () => {
    if (!pedidoEnEdicion) return;
    renderTablaModal(pedidoEnEdicion.productos, true);
    setModoEdicionDashboard();
    cargarProductosDisponibles();
});

// ── Botón "Cancelar edición" ───────────────────────────────────────────
document.getElementById('btn-cancel-edit')?.addEventListener('click', () => {
    if (!pedidoEnEdicion) return;
    pedidoEnEdicion.productos = JSON.parse(JSON.stringify(
        (pedidoEnEdicion.data.products || []).map(p => ({
            ...p,
            unitPrice: p.quantity > 0 ? p.totalPrice / p.quantity : 0
        }))
    ));
    renderTablaModal(pedidoEnEdicion.productos, false);
    actualizarTotalesModal(pedidoEnEdicion.productos);
    setModoVistaDashboard(true);
    renderStepperModal(pedidoEnEdicion.data.status);
});

function marcarCambio() {
    document.getElementById('btn-save-modal').classList.add('btn-save-pulsing');
}

// ── Cambio en fecha de entrega ─────────────────────────────────────────
document.getElementById('modal-fecha-input')?.addEventListener('change', marcarCambio);

// ── Guardar cambios ────────────────────────────────────────────────────
document.getElementById('btn-save-modal')?.addEventListener('click', guardarCambiosPedido);

// ── Cambiar cantidad (change para no re-renderizar en cada tecla) ──────
document.getElementById('modal-table-body')?.addEventListener('change', (e) => {
    if (!e.target.matches('.input-cant-modal')) return;
    const idx = parseInt(e.target.dataset.idx);
    const newQty = Math.max(1, parseInt(e.target.value) || 1);
    e.target.value = newQty;
    pedidoEnEdicion.productos[idx].quantity = newQty;
    pedidoEnEdicion.productos[idx].totalPrice = pedidoEnEdicion.productos[idx].unitPrice * newQty;
    const row = e.target.closest('tr');
    row.cells[2].textContent = fmtCOP.format(pedidoEnEdicion.productos[idx].totalPrice);
    actualizarTotalesModal(pedidoEnEdicion.productos);
    marcarCambio();
});

// ── Eliminar producto de la lista ──────────────────────────────────────
document.getElementById('modal-table-body')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-del-prod');
    if (!btn) return;
    const idx = parseInt(btn.dataset.idx);
    pedidoEnEdicion.productos.splice(idx, 1);
    renderTablaModal(pedidoEnEdicion.productos, true);
    actualizarTotalesModal(pedidoEnEdicion.productos);
    marcarCambio();
});

// ── Modal Agregar Producto ──────────────────────────────────────────────
let productoAgregarSeleccionado = null; // { id, name, unitPrice }

function abrirModalAgregarProducto() {
    productoAgregarSeleccionado = null;
    document.getElementById('agregar-buscar-input').value = '';
    document.getElementById('agregar-resultados').innerHTML = '';
    document.getElementById('agregar-seleccionado').style.display = 'none';
    document.getElementById('agregar-cantidad').value = 1;
    document.getElementById('agregar-confirmar').disabled = true;
    document.getElementById('modal-agregar-producto').style.display = 'flex';
    setTimeout(() => document.getElementById('agregar-buscar-input').focus(), 100);
}

function cerrarModalAgregarProducto(forzar = false) {
    if (!forzar && productoAgregarSeleccionado) {
        if (!confirm('Tienes un producto seleccionado sin confirmar. ¿Deseas descartarlo?')) return;
    }
    document.getElementById('modal-agregar-producto').style.display = 'none';
    productoAgregarSeleccionado = null;
}

document.getElementById('btn-agregar-modal')?.addEventListener('click', async () => {
    await cargarProductosDisponibles();
    abrirModalAgregarProducto();
});

document.getElementById('agregar-cancelar')?.addEventListener('click', () => cerrarModalAgregarProducto());

document.getElementById('modal-agregar-producto')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-agregar-producto')) cerrarModalAgregarProducto();
});

document.getElementById('agregar-buscar-input')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const lista = document.getElementById('agregar-resultados');
    if (!q || !productosDisponibles) { lista.innerHTML = ''; return; }
    const yaEnPedido = new Set((pedidoEnEdicion?.productos || []).map(p => p.idProduct));
    const todos = productosDisponibles.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
    lista.innerHTML = todos.map(p => {
        const existe = yaEnPedido.has(p.id);
        return existe
            ? `<div class="prod-result-item--disabled">
                <span class="prod-result-item__name">${p.name}</span>
                <span class="prod-result-item__tag">Ya en el pedido · edita la cantidad en la tabla</span>
               </div>`
            : `<div class="prod-result-item" data-id="${p.id}" data-name="${p.name}" data-price="${p.price}">
                <span class="prod-result-item__name">${p.name}</span>
                <span class="prod-result-item__price">${fmtCOP.format(p.price)}</span>
               </div>`;
    }).join('');
});

document.getElementById('agregar-resultados')?.addEventListener('click', (e) => {
    const item = e.target.closest('.prod-result-item');
    if (!item) return;
    const prod = productosDisponibles.find(p => p.id === item.dataset.id);
    productoAgregarSeleccionado = {
        id: item.dataset.id,
        name: item.dataset.name,
        unitPrice: parseFloat(item.dataset.price) || 0,
        stock: prod?.stock ?? 0,
        sinLimiteStock: prod?.sinLimiteStock === true
    };
    document.getElementById('agregar-buscar-input').value = item.dataset.name;
    document.getElementById('agregar-resultados').innerHTML = '';
    document.getElementById('agregar-nombre-prod').textContent = item.dataset.name;
    document.getElementById('agregar-seleccionado').style.display = 'block';
    document.getElementById('agregar-confirmar').disabled = false;
    document.getElementById('agregar-cantidad').focus();
});

document.getElementById('agregar-confirmar')?.addEventListener('click', () => {
    if (!productoAgregarSeleccionado || !pedidoEnEdicion) return;
    const { id, name, unitPrice, stock, sinLimiteStock } = productoAgregarSeleccionado;
    const qty = Math.max(1, parseInt(document.getElementById('agregar-cantidad').value) || 1);

    if (!sinLimiteStock && qty > stock) {
        mostrarToast(`⚠️ Stock insuficiente. Disponible: ${stock}`);
        return;
    }

    const existing = pedidoEnEdicion.productos.findIndex(p => p.idProduct === id);
    if (existing >= 0) {
        pedidoEnEdicion.productos[existing].quantity += qty;
        pedidoEnEdicion.productos[existing].totalPrice =
            pedidoEnEdicion.productos[existing].unitPrice * pedidoEnEdicion.productos[existing].quantity;
    } else {
        pedidoEnEdicion.productos.push({ idProduct: id, name, quantity: qty, unitPrice, totalPrice: unitPrice * qty });
    }

    renderTablaModal(pedidoEnEdicion.productos, true);
    actualizarTotalesModal(pedidoEnEdicion.productos);
    cerrarModalAgregarProducto(true);
    marcarCambio();

    mostrarToast(`✓ ${name} agregado al pedido`);
});

function mostrarToast(mensaje) {
    const toast = document.createElement('div');
    toast.textContent = mensaje;
    toast.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#27ae60;color:white;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 14px rgba(0,0,0,0.2);pointer-events:none;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}




/*****************CAMBIO DE ESTADO DE LOS PEDIDOS DEL DASHBOARD*******************/
    if (ordersContainer) {
        ordersContainer.addEventListener('change', async (event) => {

            if (event.target.matches('.status-select')) {

                const select = event.target;
                const docId = select.getAttribute('data-doc-id');
                const nuevoEstado = select.value;
                const estadoAnterior = select.getAttribute('data-estado-actual');

                console.log(`El pedido con ID: ${docId} ha cambiado al estado: ${nuevoEstado}`);

                // Revertir visualmente hasta confirmar éxito
                select.value = estadoAnterior;
                select.disabled = true;
                mostrarOverlay('Procesando...');

                try {
                    await actualizarEstadoYDescontar(docId, nuevoEstado);
                    select.setAttribute('data-estado-actual', nuevoEstado);
                    select.value = nuevoEstado;
                    actualizarBadgeFila(docId, nuevoEstado);
                    ocultarOverlay(nuevoEstado === 'entregado');
                } catch (e) {
                    ocultarOverlay(false);
                    console.warn('Cambio de estado revertido por error.');
                } finally {
                    select.disabled = false;
                }
            }
        });
    } else {
        console.error("Error: No se encontró el contenedor padre con ID 'ordersContainer'.");
    }

function esTransicionValida(actual, nuevo) {
    if (actual === nuevo) {
        return true;
    }

    switch (actual) {
        case 'pendiente':
            return nuevo === 'entregado' || nuevo === 'pagado';

        case 'entregado':
            return nuevo === 'pagado';

        case 'pagado':
            return false;

        default:
            return true;
    }
}

function actualizarBadgeFila(docId, nuevoEstado) {
    const row = ordersContainer?.querySelector(`tr[data-doc-id="${docId}"]`);
    if (!row) return;
    const badge = row.querySelector('.status-badge');
    if (!badge) return;
    const badgeClass = { pendiente: 'badge-pendiente', entregado: 'badge-entregado', pagado: 'badge-pagado' }[nuevoEstado] || '';
    badge.className = `status-badge ${badgeClass}`;
    badge.textContent = nuevoEstado;
    // Sincronizar cachés para que el próximo re-render no revierta el badge
    const cached = todosPedidosSup.find(p => String(p.id) === docId);
    if (cached) cached.status = nuevoEstado;
    if (pedidosMap.has(docId)) pedidosMap.get(docId).status = nuevoEstado;
}

/******** FUNCIÓN PARA ACTUALIZAR Y DESCONTAR LOS PRODUCTOS DEL STOCK *******/
async function actualizarEstadoYDescontar(docId, nuevoEstado) {
    try {
        // Obtener pedido actual de Supabase para validar
        const { data: pedidoSup, error: fetchErr } = await supabase
            .from('pedidos_planta')
            .select('*')
            .eq('id', docId)
            .single();

        if (fetchErr || !pedidoSup) {
            console.error(`Error: Pedido con ID ${docId} no encontrado.`);
            return;
        }

        const pedidoData = normalizarPedido(pedidoSup);
        const estadoActual = pedidoData.status;

        // Validación de reglas de transición
        if (!esTransicionValida(estadoActual, nuevoEstado)) {
            console.warn(`❌ Transición inválida: No se puede cambiar de '${estadoActual}' a '${nuevoEstado}'.`);
            return;
        }

        // Si el nuevo estado es ENTREGADO, descontar inventario primero
        if (nuevoEstado === 'entregado') {
            actualizarOverlay('Descontando inventario...');
            await descontarInventario(docId, usuarioActual);
            invalidarCacheInventario();
            actualizarOverlay('Actualizando estado...');
        }

        // Actualizar estado en Supabase (el Realtime notificará a todos los clientes)
        const { error: updateErr } = await supabase
            .from('pedidos_planta')
            .update({ status: nuevoEstado, updated_at: new Date().toISOString() })
            .eq('id', docId);

        if (updateErr) throw new Error(updateErr.message || `Error al actualizar estado`);

        console.log(`✅ Estado del pedido ${docId} actualizado a '${nuevoEstado}' con éxito.`);

    } catch (error) {
        console.error(`Error en el proceso del pedido ${docId}:`, error);
        alert("Hubo un error al procesar el cambio: " + error.message);
        throw error; // re-lanza para que el caller revierta la UI
    }
}




/********FUNCIÓN PARA DESCONTAR DEL INVENTARIO Y GENERAR UN REGISTRO DE TRANSACCIÓN*******/
async function descontarInventario(pedidoId, usuario = 'Admin') {
    console.log("🚀 Iniciando descuento de inventario para Pedido:", pedidoId);

    const { data: pedidoSup, error } = await supabase
        .from('pedidos_planta')
        .select('*')
        .eq('id', pedidoId)
        .single();

    if (error || !pedidoSup) {
        throw new Error(`El Pedido con ID ${pedidoId} no existe.`);
    }

    const pedidoData = normalizarPedido(pedidoSup);
    const productosDelPedido = pedidoData.products;
    const numeroPedidoVisible = pedidoData.idPedido || pedidoId;

    if (!productosDelPedido || productosDelPedido.length === 0) {
        console.warn("⚠️ El pedido no tiene productos.");
        return;
    }

    // Usar todos los productos activos para resolver nombres
    const todosProductos = await getProductos();
    const mapaNombre = {};
    todosProductos.forEach(p => {
        if (p.name && p.active !== false) mapaNombre[p.name.trim().toLowerCase()] = p.id;
    });

    // Mapear cada ítem del pedido al docId real del producto
    const productosMapeados = productosDelPedido
        .filter(item => item.name)
        .map(item => {
            const nombreNorm = (item.name || '').trim().toLowerCase();
            const docIdMapa = mapaNombre[nombreNorm];
            const resuelto = docIdMapa !== undefined;
            const docId = resuelto ? docIdMapa : String(item.idProduct);
            console.log(`  → "${item.name}" | docId resuelto: ${docId} (${resuelto ? 'por nombre' : 'fallback idProduct'}) | cantidad: ${item.quantity}`);
            return { productId: docId, name: item.name, cantidad: item.quantity, resuelto };
        });

    const noResueltos = productosMapeados.filter(p => !p.resuelto);
    if (noResueltos.length > 0) {
        console.warn(`⚠️ Productos sin resolución por nombre (usando fallback idProduct): ${noResueltos.map(p => `"${p.name}" → ${p.productId}`).join(', ')}`);
    }

    // Agrupar por docId para evitar actualizar el mismo documento dos veces
    const agrupados = {};
    productosMapeados.forEach(p => {
        if (agrupados[p.productId]) {
            agrupados[p.productId].cantidad += p.cantidad;
        } else {
            agrupados[p.productId] = { ...p };
        }
    });
    const productos = Object.values(agrupados);
    console.log(`  📦 Productos únicos a descontar:`, productos);

    await ejecutarSalidaPedido({
        productos,
        pedidoId,
        pedidoNumero: numeroPedidoVisible,
        notas: pedidoData.orderNotes || '',
        usuario
    });

    console.log(`✨ Inventario descontado correctamente para pedido #${numeroPedidoVisible}.`);
}




/*************************************FUNCIÓN PARA CERRAR SESIÓN****************************************/
let usuarioActual = 'Admin';
let rolUsuario = '';

verificarAccesoPlanta(({ username, sede, rol }) => {
    usuarioActual = username;
    rolUsuario = rol;
    CargarHeader(sede ? sede.charAt(0).toUpperCase() + sede.slice(1) : 'Planta');
    if (['admin', 'planta-admin'].includes(rol)) {
    }
});


const linkLogout = document.getElementById("link_logout");

if (linkLogout) {
    linkLogout.addEventListener("click", async (e) => {
        e.preventDefault();

        const confirmar = confirm("¿Estás seguro de que quieres cerrar sesión?");

        if (confirmar) {
            try {
                await supabase.auth.signOut();
            } catch (error) {
                console.error("Error al cerrar sesión:", error);
                alert("Hubo un error al salir. Intenta de nuevo.");
            }
        }
    });
}

window.addEventListener('load', () => {
    document.body.classList.add('loaded');
});

function invalidarCacheInventario() {
    invalidarProductos();
    productosDisponibles = null;
}

// ── Modal Devoluciones ──────────────────────────────────────────────
let devolucionProductoSeleccionado = null;

function abrirModalDevolucion() {
    devolucionProductoSeleccionado = null;
    document.getElementById('dev-sede').value = '';
    document.getElementById('dev-buscar-input').value = '';
    document.getElementById('dev-resultados').innerHTML = '';
    document.getElementById('dev-seleccionado').style.display = 'none';
    document.getElementById('dev-cantidad').value = 1;
    document.getElementById('dev-observacion').value = '';
    document.getElementById('dev-confirmar').disabled = true;
    document.getElementById('modal-devolucion').showModal();
    setTimeout(() => document.getElementById('dev-buscar-input').focus(), 100);
}

function cerrarModalDevolucion() {
    document.getElementById('modal-devolucion').close();
    devolucionProductoSeleccionado = null;
}

document.getElementById('btn-nuevo-pedido')?.addEventListener('click', () => {
    window.location.href = './products.html';
});

document.getElementById('btn-devoluciones')?.addEventListener('click', async () => {
    await cargarProductosDisponibles();
    abrirModalDevolucion();
});

document.getElementById('dev-cancelar')?.addEventListener('click', () => cerrarModalDevolucion());

document.getElementById('modal-devolucion')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-devolucion')) cerrarModalDevolucion();
});

document.getElementById('dev-buscar-input')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const lista = document.getElementById('dev-resultados');
    if (!q || !productosDisponibles) { lista.innerHTML = ''; return; }
    const resultados = productosDisponibles.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
    lista.innerHTML = resultados.map(p =>
        `<div class="prod-result-item" data-id="${p.id}" data-name="${p.name}">
            <span class="prod-result-item__name">${p.name}</span>
         </div>`
    ).join('');
});

document.getElementById('dev-resultados')?.addEventListener('click', (e) => {
    const item = e.target.closest('.prod-result-item');
    if (!item) return;
    devolucionProductoSeleccionado = { id: item.dataset.id, name: item.dataset.name };
    document.getElementById('dev-buscar-input').value = item.dataset.name;
    document.getElementById('dev-resultados').innerHTML = '';
    document.getElementById('dev-nombre-prod').textContent = item.dataset.name;
    document.getElementById('dev-seleccionado').style.display = 'block';
    document.getElementById('dev-confirmar').disabled = false;
    document.getElementById('dev-cantidad').focus();
});

document.getElementById('dev-confirmar')?.addEventListener('click', async () => {
    const sede     = document.getElementById('dev-sede').value;
    const cantidad = parseInt(document.getElementById('dev-cantidad').value);
    const notas    = document.getElementById('dev-observacion').value.trim();
    const subtipo  = document.getElementById('dev-subtipo').value;
    const btn      = document.getElementById('dev-confirmar');
    const nombreProducto = devolucionProductoSeleccionado?.name;

    if (!sede || !devolucionProductoSeleccionado || !cantidad || cantidad < 1) return;

    btn.disabled = true;
    btn.textContent = 'Registrando...';

    try {
        const producto = productosDisponibles.find(p => p.id === devolucionProductoSeleccionado.id);
        await ejecutarTransaccionStock({
            productId:       devolucionProductoSeleccionado.id,
            name:            nombreProducto,
            cantidad,
            tipo:            'ENTRADA',
            tipoMovimiento:  'Devolución',
            subtipo,
            referenciaId:    `devolucion-${Date.now()}`,
            notas:           notas,
            sede,
            precio:          producto?.price || null,
            usuario:         usuarioActual
        });

        invalidarProductos();
        cerrarModalDevolucion();
        alert(`✅ Devolución registrada\n\n${nombreProducto} · ${cantidad} unidad${cantidad !== 1 ? 'es' : ''}\nSede: ${sede}`);
    } catch (e) {
        console.error('Error registrando devolución:', e);
        alert('Error al registrar la devolución. Intenta de nuevo.');
        btn.disabled = false;
        btn.textContent = '↩ Registrar';
    }
});


