import { supabase } from '../Api/supabaseConfig.js';
import { mostrarSkeleton, ocultarSkeleton } from '../Shared/skeleton.js';
import { colFechaToUTC } from '../Shared/semanas.js';
import { initVersionBanner } from '../Shared/components.js';
import { badgeEstado, badgeCanal } from '../Shared/badges.js';
import { normalizarPedido, poblarModal, cerrarModal } from '../Shared/modalDetalle.js';
import { calcularPageSize, crearPaginacion } from '../Shared/paginacion.js';
import { renderStepper, cambiarEstado as _cambiarEstado } from '../Shared/stepper.js';
initVersionBanner();
const ESTADOS_ACTIVOS = new Set(['recibido', 'en preparacion', 'despachado']);

let sedeActual = '';
let pedidosActuales = {};       // id → objeto pedido
let pedidoEnModal   = null;     // id del pedido abierto en el modal
let pedidoPendienteCancelar = null;
let filtrosActivos  = {};       // { desde, hasta, estado }

const _pag = crearPaginacion('paginacion', () => filtrarColumnas());
const _calcPS = () => calcularPageSize('.ped-table-card', '.inventory-management__thead', 46, 64);

const MINUTOS_AUTO_PREPARACION = 5;
const timersPreparacion = new Map(); // pedidoId → timeoutId

function toDate(ts) {
    return ts ? new Date(ts) : null;
}


// Igual que historialPedidos.js
function formatFecha(timestamp) {
    if (!timestamp) return '—';
    return new Intl.DateTimeFormat('es-CO', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date(timestamp));
}

function formatPrecio(v) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v);
}

// ── TIMER DE DEMORA — igual que historialPedidos.js ───────────────
function calcularMinutos(tsRecibido) {
    if (!tsRecibido) return 0;
    return Math.floor((Date.now() - new Date(tsRecibido).getTime()) / 60000);
}

function formatTimer(minutos) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function _formatFechaReservaLocal(fechaStr) {
    const [y, m, d] = fechaStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-CO', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
}

// ── STEPPER global (desde Shared/stepper.js) ──────────────────────
window.cambiarEstado = (id, estado) => _cambiarEstado(supabase, id, estado);

// ── ICONOS SVG ────────────────────────────────────────────────────
const ICON_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="3"
    stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
    </svg>`;

const STEPS = [
    {
        key: 'en preparacion',
        label: 'Preparando',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                <line x1="6" y1="1" x2="6" y2="4"/>
                <line x1="10" y1="1" x2="10" y2="4"/>
                <line x1="14" y1="1" x2="14" y2="4"/>
               </svg>`
    },
    {
        key: 'despachado',
        label: 'Despachar',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <circle cx="5.5" cy="17.5" r="2.5"/>
                <circle cx="17.5" cy="17.5" r="2.5"/>
                <path d="M15 6h-4l-2 6H3l2-4h8"/>
                <path d="M15 6l2 6h2l1-3h-5"/>
               </svg>`
    },
    {
        key: 'entregado',
        label: 'Entregado',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
               </svg>`
    },
];

const STEPS_RESERVA = [
    {
        key: 'en preparacion',
        label: 'Confirmar',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
                <polyline points="9 16 11 18 15 14"/>
               </svg>`
    },
    {
        key: 'entregado',
        label: 'Completado',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
               </svg>`
    },
];

const EN_SHELL = window.self !== window.top;

// Ocultar header propio cuando se carga dentro del shell de pizzerías
if (EN_SHELL) {
    document.addEventListener('DOMContentLoaded', () => {
        const h = document.querySelector('.main-header');
        if (h) h.style.display = 'none';
    });
}

mostrarSkeleton('callcenter');

// ── AUTH ───────────────────────────────────────────────────────────
(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.top.location.href = '../index.html'; return; }

    const { data, error } = await supabase.from('usuarios').select('username, sede, rol, active').eq('id', user.id).single();
    if (error || !data?.active || !['pizzeria', 'planta', 'admin'].includes(data.rol)) {
        window.top.location.href = '../index.html';
        return;
    }

    const { username = '', sede = '' } = data;

    const { data: sedeData } = await supabase.from('sedes').select('nombre_display').eq('name', sede).single();
    const sedeLabel = sedeData?.nombre_display || sede.toUpperCase();

    document.getElementById('username').textContent = `Hola ${username}`;

    const hoy = hoyLocal();
    document.getElementById('filtro-desde').value = hoy;
    document.getElementById('filtro-hasta').value = hoy;

    document.body.classList.add('loaded');
    ocultarSkeleton('contenido-principal');
    iniciarListener(sede);
    iniciarTimerDemora();
})();

// ── LOGOUT ────────────────────────────────────────────────────────
if (!EN_SHELL) {
    document.getElementById('btn-logout').addEventListener('click', async () => {
        if (confirm('¿Cerrar sesión?')) {
            await supabase.auth.signOut();
            window.top.location.href = '../index.html';
        }
    });

    document.getElementById('btn-home').addEventListener('click', () => {
        window.location.href = '../Pizzerias/pizzerias.html';
    });
}

// ── CARGA DESDE SUPABASE ──────────────────────────────────────────
function hoyLocal() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

async function cargarPedidosActivos() {
    const desde  = filtrosActivos.desde  || hoyLocal();
    const hasta  = filtrosActivos.hasta  || hoyLocal();
    const estado = filtrosActivos.estado || null;

    try {
        let q = supabase
            .from('pedidos_callcenter')
            .select('*')
            .eq('sede', sedeActual)
            .in('estado', estado ? [estado] : [...ESTADOS_ACTIVOS, 'entregado'])
            .gte('fecha', colFechaToUTC(desde, 'inicio'))
            .lte('fecha', colFechaToUTC(hasta, 'fin'))
            .or('tipo.is.null,tipo.eq.pedido')
            .order('fecha', { ascending: false });

        const { data: rawPedidos, error } = await q;

        if (error) throw error;

        pedidosActuales = {};
        (rawPedidos || []).forEach(r => {
            const p = normalizarPedido(r);
            pedidosActuales[p.id] = p;
        });

        gestionarAutoPreparacion(Object.values(pedidosActuales));
        poblarSelectAsesores();
        filtrarColumnas();

        if (pedidoEnModal) {
            const actualizado = pedidosActuales[pedidoEnModal];
            if (actualizado) abrirDetalle(actualizado);
            else cerrarModalPedido();
        }
    } catch (err) {
        console.error('Error cargando pedidos:', err);
    }
}

function iniciarListener(sede) {
    sedeActual = sede;
    cargarPedidosActivos();

    supabase.channel('pizzeria-pedidos')
        .on('postgres_changes', {
            event: '*', schema: 'public', table: 'pedidos_callcenter',
            filter: `sede=eq.${sedeActual}`,
        }, () => {
            cargarPedidosActivos();
        })
        .subscribe();
}

// ── AUTO-AVANCE RECIBIDO → EN PREPARACIÓN ─────────────────────────
function gestionarAutoPreparacion(pedidos) {
    const recibidos = pedidos.filter(p => p.estado === 'recibido' && p.tipo !== 'reserva');

    // Limpiar timers de pedidos que ya no están en 'recibido'
    timersPreparacion.forEach((_, id) => {
        if (!recibidos.find(p => p.id === id)) {
            clearTimeout(timersPreparacion.get(id));
            timersPreparacion.delete(id);
        }
    });

    recibidos.forEach(p => {
        if (timersPreparacion.has(p.id)) return; // ya tiene timer activo

        const tsRecibido = toDate(p.tsRecibido);
        const transcurrido = tsRecibido ? Date.now() - tsRecibido.getTime() : 0;
        const restante = Math.max(0, MINUTOS_AUTO_PREPARACION * 60 * 1000 - transcurrido);

        const timerId = setTimeout(async () => {
            timersPreparacion.delete(p.id);
            try {
                await supabase
                    .from('pedidos_callcenter')
                    .update({ estado: 'en preparacion', ts_preparacion: new Date().toISOString() })
                    .eq('id', p.id);
            } catch (e) {
                console.error('Error auto-preparación:', e);
            }
        }, restante);

        timersPreparacion.set(p.id, timerId);
    });
}

// ── LISTA PRINCIPAL ───────────────────────────────────────────────
function renderLista(pedidos) {
    const todos = pedidos.slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    document.getElementById('stat-total').textContent    = todos.length;
    document.getElementById('stat-whatsapp').textContent = todos.filter(p => p.canal === 'whatsapp').length;
    document.getElementById('stat-ivr').textContent      = todos.filter(p => p.canal === 'ivr').length;

    const tbody = document.getElementById('orders-tbody');
    const empty = document.getElementById('empty-state');

    if (todos.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        renderPaginacion(0);
        return;
    }

    empty.style.display = 'none';

    const pageSize     = _calcPS();
    const totalPaginas = Math.ceil(todos.length / pageSize);
    if (_pag.pagina > totalPaginas) _pag.pagina = Math.max(1, totalPaginas);
    const inicio = (_pag.pagina - 1) * pageSize;
    const slice  = todos.slice(inicio, inicio + pageSize);

    tbody.innerHTML = slice.map(renderFila).join('');
    tbody.querySelectorAll('tr[data-id]').forEach(fila => {
        fila.addEventListener('click', () => {
            const pedido = pedidosActuales[fila.dataset.id];
            if (pedido) { pedidoEnModal = pedido.id; abrirDetalle(pedido); }
        });
    });

    _pag.render(todos.length, pageSize);
}


// ── POBLAR SELECT ASESORES — igual que historialPedidos.js ────────
function poblarSelectAsesores() {
    const select = document.getElementById('cf-asesor');
    if (!select) return;
    const valorActual = select.value;
    const asesores = [...new Set(Object.values(pedidosActuales).map(p => p.asesor).filter(Boolean))].sort();
    select.innerHTML = '<option value="">Todos</option>' +
        asesores.map(a => `<option value="${a}">${a}</option>`).join('');
    if (asesores.includes(valorActual)) select.value = valorActual;
}

// ── FILTRAR COLUMNAS — igual que historialPedidos.js ─────────────
function filtrarColumnas(reiniciarPagina = false) {
    if (reiniciarPagina) _pag.reiniciar();
    const npedido   = document.getElementById('cf-npedido').value.toLowerCase();
    const fecha     = document.getElementById('cf-fecha').value.toLowerCase();
    const telefono  = document.getElementById('cf-telefono').value.toLowerCase();
    const cliente   = document.getElementById('cf-cliente').value.toLowerCase();
    const direccion = document.getElementById('cf-direccion').value.toLowerCase();
    const canal     = document.getElementById('cf-canal').value.toLowerCase();
    const pago      = document.getElementById('cf-pago').value.toLowerCase();
    const asesor    = document.getElementById('cf-asesor').value.toLowerCase();
    const estado    = document.getElementById('cf-estado').value.toLowerCase();
    const obs       = document.getElementById('cf-obs').value.toLowerCase();

    const filtrados = Object.values(pedidosActuales).filter(p =>
        (!npedido   || String(p.nPedido ?? '').includes(npedido)) &&
        (!fecha     || formatFecha(p.fecha).toLowerCase().includes(fecha)) &&
        (!telefono  || (p.telefono ?? '').toLowerCase().includes(telefono)) &&
        (!cliente   || (p.nombre   ?? '').toLowerCase().includes(cliente)) &&
        (!direccion || (p.direccion ?? '').toLowerCase().includes(direccion)) &&
        (!canal     || (p.canal    ?? '').toLowerCase() === canal) &&
        (!pago      || (p.pago     ?? '').toLowerCase().includes(pago)) &&
        (!asesor    || (p.asesor   ?? '').toLowerCase() === asesor) &&
        (!estado    || (p.estado   ?? '').toLowerCase() === estado) &&
        (!obs       || (p.obs      ?? '').toLowerCase().includes(obs))
    );

    renderLista(filtrados);
}

function renderFila(p) {
    const esRecoger  = p.domicilio?.tipo === 'recoger';
    const dirDisplay = esRecoger
        ? `<span style="font-weight:700;">RECOGER</span>`
        : p.direccion
            ? p.direccion.substring(0, 25) + (p.direccion.length > 25 ? '…' : '')
            : '—';

    const canalLabel = badgeCanal(p.canal);

    const obsDisplay = p.obs
        ? p.obs.substring(0, 30) + (p.obs.length > 30 ? '…' : '')
        : '—';

    const enPreparacion = p.estado === 'en preparacion';
    const minutos       = enPreparacion ? calcularMinutos(p.tsRecibido || p.fecha) : 0;
    const esHoy         = new Date(p.fecha).toDateString() === new Date().toDateString();
    const puntoCelda    = enPreparacion && !esHoy
        ? `<span class="punto-rojo-fijo" title="Pendiente de días anteriores"></span>`
        : enPreparacion && esHoy && minutos >= 30
            ? `<span class="punto-demora ${minutos >= 40 ? 'punto-rojo' : 'punto-naranja'}" title="⏱ ${formatTimer(minutos)} esperando"></span>`
            : p.estado === 'despachado'
                ? `<span class="punto-despachado" title="Despachado ✓"></span>`
                : '';

    return `
        <tr class="inventory-management__row fila-activa" data-id="${p.id}">
            <td class="inventory-management__cell">#${p.nPedido ?? '—'}${puntoCelda}</td>
            <td class="inventory-management__cell">${formatFecha(p.fecha)}</td>
            <td class="inventory-management__cell">${p.telefono ?? '—'}</td>
            <td class="inventory-management__cell">${p.nombre ?? '—'}</td>
            <td class="inventory-management__cell" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esRecoger ? 'Recoger en tienda' : (p.direccion ?? '')}">${dirDisplay}</td>
            <td class="inventory-management__cell">${canalLabel}</td>
            <td class="inventory-management__cell" style="text-transform:capitalize;">${p.pago ?? '—'}</td>
            <td class="inventory-management__cell" style="text-transform:capitalize;">${p.sede ?? '—'}</td>
            <td class="inventory-management__cell">${p.asesor ?? '—'}</td>
            <td class="inventory-management__cell">${badgeEstado(p.estado)}</td>
            <td class="inventory-management__cell" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${p.obs ?? ''}">${obsDisplay}</td>
            <td class="inventory-management__cell" style="font-weight:bold;">${p.total ? '$' + p.total.toLocaleString('es-CO') : '—'}</td>
        </tr>`;
}

// ── MODAL DETALLE ─────────────────────────────────────────────────

function abrirDetalle(p) {
    const printHtml = `<button class="btn-imprimir-header with-tooltip" data-tooltip="Reimprimir comanda" onclick="imprimirComanda('${p.id}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
            </svg>
        </button>`;
    const cancelHtml = p.estado === 'en preparacion'
        ? `<button class="btn-cancelar-pedido" onclick="abrirModalCancelar('${p.id}', '${p.nPedido}')">✕ Cancelar pedido</button>`
        : '';
    poblarModal(p, { stepperHtml: renderStepper(p), cancelHtml, printHtml });
}

function cerrarModalPedido() {
    pedidoEnModal = null;
    cerrarModal();
}

// ── TIMER DE DEMORA EN VIVO — igual que historialPedidos.js ──────
let timerDemoraInterval = null;

function actualizarTimers() {
    document.querySelectorAll('tr[data-id]').forEach(fila => {
        const p = pedidosActuales[fila.dataset.id];
        if (!p || p.estado !== 'en preparacion') return;
        const minutos = calcularMinutos(p.tsRecibido || p.fecha);
        const esHoy   = new Date(p.fecha).toDateString() === new Date().toDateString();
        let puntoEl   = fila.querySelector('.punto-demora, .punto-rojo-fijo');
        if (!puntoEl) {
            puntoEl = document.createElement('span');
            const celda = fila.querySelector('td:nth-child(1)');
            if (celda) celda.appendChild(puntoEl);
        }
        if (!esHoy) {
            puntoEl.className = 'punto-rojo-fijo';
            puntoEl.title = 'Pendiente de días anteriores';
        } else if (minutos >= 30) {
            puntoEl.className = `punto-demora ${minutos >= 40 ? 'punto-rojo' : 'punto-naranja'}`;
            puntoEl.title = `⏱ ${formatTimer(minutos)} esperando`;
        }
    });
}

function iniciarTimerDemora() {
    if (timerDemoraInterval) clearInterval(timerDemoraInterval);
    timerDemoraInterval = setInterval(actualizarTimers, 10000);
}

// ── REIMPRIMIR COMANDA ────────────────────────────────────────────
function _toastReimpresion(msg, color = '#2980b9') {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:${color};color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 14px rgba(0,0,0,0.2);pointer-events:none;white-space:nowrap;`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

window.imprimirComanda = async (id) => {
    const p = pedidosActuales[id];
    if (!p) return;
    const btn = document.querySelector('#modal-print-btn button');
    if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; }

    const { error } = await supabase
        .from('pedidos_callcenter')
        .update({ reprint_requested: true })
        .eq('id', id);

    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }

    if (error) {
        alert('Error al enviar solicitud. Intenta de nuevo.');
    } else {
        _toastReimpresion(`Reimprimir #${p.nPedido} — solicitud enviada`);
    }
};

// ── PANEL LATERAL — igual que historialPedidos.js ─────────────────
function abrirPanel() {
    document.getElementById('filtros-panel').classList.add('open');
    document.getElementById('filtros-overlay').classList.add('open');
}
function cerrarPanel() {
    document.getElementById('filtros-panel').classList.remove('open');
    document.getElementById('filtros-overlay').classList.remove('open');
}

document.getElementById('btn-abrir-panel').addEventListener('click', abrirPanel);
document.getElementById('btn-cerrar-panel').addEventListener('click', cerrarPanel);
document.getElementById('filtros-overlay').addEventListener('click', cerrarPanel);

document.getElementById('btn-actualizar').addEventListener('click', () => cargarPedidosActivos());

document.getElementById('btn-filtrar').addEventListener('click', () => {
    const desde  = document.getElementById('filtro-desde').value;
    const hasta  = document.getElementById('filtro-hasta').value;
    const estado = document.getElementById('filtro-estado-panel').value;
    filtrosActivos = { desde: desde || hoyLocal(), hasta: hasta || hoyLocal(), estado };
    cargarPedidosActivos();
    cerrarPanel();
});

document.getElementById('btn-limpiar').addEventListener('click', () => {
    const hoy = hoyLocal();
    document.getElementById('filtro-desde').value         = hoy;
    document.getElementById('filtro-hasta').value         = hoy;
    document.getElementById('filtro-estado-panel').value  = '';
    filtrosActivos = {};
    cargarPedidosActivos();
    cerrarPanel();
});

// ── EVENTOS FILTROS COLUMNA — igual que historialPedidos.js ──────
['cf-npedido','cf-fecha','cf-telefono','cf-cliente','cf-direccion',
 'cf-canal','cf-pago','cf-asesor','cf-estado','cf-obs'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => filtrarColumnas(true));
});

// Recalcular página al redimensionar ventana
window.addEventListener('resize', () => filtrarColumnas());

document.getElementById('cerrar-detalle').addEventListener('click', cerrarModalPedido);

document.getElementById('modal-pedido').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-pedido')) cerrarModalPedido();
});


// ── CANCELAR ──────────────────────────────────────────────────────
window.abrirModalCancelar = (pedidoId, nPedido) => {
    pedidoPendienteCancelar = pedidoId;
    document.getElementById('cancelar-descripcion').textContent = `¿Cancelar el pedido #${nPedido}?`;
    document.getElementById('cancelar-motivo').value = '';
    document.getElementById('modal-cancelar').style.display = 'flex';
    setTimeout(() => document.getElementById('cancelar-motivo').focus(), 100);
};

function cerrarModalCancelar() {
    pedidoPendienteCancelar = null;
    document.getElementById('modal-cancelar').style.display = 'none';
}

document.getElementById('btn-cerrar-cancelar').addEventListener('click', cerrarModalCancelar);

window.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-cancelar')) cerrarModalCancelar();
});

document.getElementById('btn-confirmar-cancelar').addEventListener('click', async () => {
    if (!pedidoPendienteCancelar) return;
    const motivo = document.getElementById('cancelar-motivo').value.trim();

    try {
        const { error } = await supabase
            .from('pedidos_callcenter')
            .update({ estado: 'cancelado', motivo_cancelacion: motivo || null })
            .eq('id', pedidoPendienteCancelar);
        if (error) throw error;
        cerrarModalCancelar();
        cerrarModalPedido();
    } catch (e) {
        alert('Error al cancelar. Intenta de nuevo.');
        console.error(e);
    }
});
