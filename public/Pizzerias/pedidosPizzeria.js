import { supabase } from '../Api/supabaseConfig.js';
import { mostrarSkeleton, ocultarSkeleton } from '../Shared/skeleton.js';
import { colFechaToUTC } from '../Shared/semanas.js';
import { initVersionBanner } from '../Shared/components.js';
import { badgeEstado, badgeCanal } from '../Shared/badges.js';
initVersionBanner();
const ESTADOS_ACTIVOS = new Set(['recibido', 'en preparacion', 'despachado']);

let sedeActual = '';
let pedidosActuales = {};       // id → objeto pedido
let pedidoEnModal   = null;     // id del pedido abierto en el modal
let pedidoPendienteCancelar = null;
let filtrosActivos  = {};       // { desde, hasta, estado }
let paginaActual    = 1;

// Igual que historial pero dinámico según altura de pantalla
function calcularPageSize() {
    const thead = document.querySelector('.inventory-management__thead');
    const card  = document.querySelector('.ped-table-card');
    if (!thead || !card) return 20;
    const cardTop  = card.getBoundingClientRect().top;
    const theadH   = thead.offsetHeight;
    const pagH     = 56; // altura aprox de la barra de paginación
    const available = window.innerHeight - cardTop - theadH - pagH - 8;
    return Math.max(5, Math.floor(available / 46)); // ~46px por fila
}

const MINUTOS_AUTO_PREPARACION = 5;
const timersPreparacion = new Map(); // pedidoId → timeoutId

function toDate(ts) {
    return ts ? new Date(ts) : null;
}

// Igual que historialPedidos.js
function normalizarPedido(row) {
    return {
        id:               String(row.id),
        nPedido:          row.n_pedido,
        nombre:           row.nombre,
        telefono:         row.telefono,
        direccion:        row.direccion,
        sede:             row.sede,
        pago:             row.pago,
        obs:              row.obs,
        acompanamientos:  row.acompanamientos || null,
        productos:        row.productos || [],
        total:            row.total,
        asesor:           row.asesor,
        fecha:            row.fecha,
        estado:           row.estado,
        canal:            row.canal,
        domicilio:        row.domicilio || null,
        tipo:             row.tipo || null,
        tsRecibido:       row.ts_recibido,
        tsPreparacion:    row.ts_preparacion,
        tsDespachado:     row.ts_despachado,
        cantidadPersonas: row.cantidad_personas,
        fechaReserva:     row.fecha_reserva,
        horaReserva:      row.hora_reserva,
    };
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

function _formatFechaReservaLocal(fechaStr) {
    const [y, m, d] = fechaStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-CO', {
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
}

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

    document.getElementById('username').textContent   = `Hola ${username}`;
    document.getElementById('sede-label').textContent = sedeLabel;

    const hoy = hoyLocal();
    document.getElementById('filtro-desde').value = hoy;
    document.getElementById('filtro-hasta').value = hoy;

    document.body.classList.add('loaded');
    ocultarSkeleton('contenido-principal');
    iniciarListener(sede);
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
            .in('estado', estado ? [estado] : [...ESTADOS_ACTIVOS])
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
            if (actualizado) poblarModal(actualizado);
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
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_callcenter' }, () => {
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

    const preparacion = todos.filter(p => p.estado === 'en preparacion');
    const despachado  = todos.filter(p => p.estado === 'despachado');
    document.getElementById('count-preparacion').textContent =
        `${preparacion.length} preparando`;
    document.getElementById('count-despachado').textContent =
        `${despachado.length} despachado${despachado.length !== 1 ? 's' : ''}`;

    const tbody = document.getElementById('orders-tbody');
    const empty = document.getElementById('empty-state');

    if (todos.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        renderPaginacion(0);
        return;
    }

    empty.style.display = 'none';

    const pageSize    = calcularPageSize();
    const totalPaginas = Math.ceil(todos.length / pageSize);
    if (paginaActual > totalPaginas) paginaActual = totalPaginas;
    const inicio = (paginaActual - 1) * pageSize;
    const pagina = todos.slice(inicio, inicio + pageSize);

    tbody.innerHTML = pagina.map(renderFila).join('');
    tbody.querySelectorAll('tr[data-id]').forEach(fila => {
        fila.addEventListener('click', () => {
            const pedido = pedidosActuales[fila.dataset.id];
            if (pedido) { pedidoEnModal = pedido.id; poblarModal(pedido); document.getElementById('modal-pedido').style.display = 'flex'; }
        });
    });

    renderPaginacion(todos.length, pageSize);
}

// ── PAGINACIÓN — igual que historialPedidos.js ────────────────────
function renderPaginacion(total, pageSize) {
    const contenedor  = document.getElementById('paginacion');
    const size        = pageSize || calcularPageSize();
    const totalPaginas = Math.ceil(total / size);
    if (totalPaginas <= 1) { contenedor.innerHTML = ''; return; }

    contenedor.innerHTML = `
        <button class="pag-btn" id="pag-prev" ${paginaActual === 1 ? 'disabled' : ''}>← Anterior</button>
        <span class="pag-info">Página ${paginaActual} de ${totalPaginas} &nbsp;·&nbsp; ${total} pedidos</span>
        <button class="pag-btn" id="pag-next" ${paginaActual === totalPaginas ? 'disabled' : ''}>Siguiente →</button>
    `;
    document.getElementById('pag-prev').addEventListener('click', () => { if (paginaActual > 1) { paginaActual--; filtrarColumnas(); } });
    document.getElementById('pag-next').addEventListener('click', () => { if (paginaActual < totalPaginas) { paginaActual++; filtrarColumnas(); } });
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
    if (reiniciarPagina) paginaActual = 1;
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

    const canalLabel = p.canal === 'whatsapp' ? '📱 WhatsApp'
                     : p.canal === 'ivr'       ? '📞 IVR'
                     : p.canal === 'web'        ? '🌐 Web'
                     : p.canal === 'google'     ? '🌐 Google'
                     : p.canal ?? '—';

    const obsDisplay = p.obs
        ? p.obs.substring(0, 30) + (p.obs.length > 30 ? '…' : '')
        : '—';

    return `
        <tr class="inventory-management__row fila-activa" data-id="${p.id}">
            <td class="inventory-management__cell">#${p.nPedido ?? '—'}</td>
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

function infoReserva(p) {
    const partes = [];
    if (p.fechaReserva) partes.push(`📅 ${_formatFechaReservaLocal(p.fechaReserva)}`);
    if (p.horaReserva)  partes.push(`🕐 ${p.horaReserva}`);
    if (p.cantidadPersonas) partes.push(`👥 ${p.cantidadPersonas} pers.`);
    return partes.length ? partes.join(' · ') : '📅 Reserva';
}

function poblarModal(p) {
    const esDomicilio = p.domicilio?.tipo !== 'recoger';

    // Header: N° pedido + fecha/hora
    document.getElementById('modal-npedido').textContent = `#${p.nPedido}`;
    if (p.fecha) {
        const _d = new Date(p.fecha);
        const _fechaPart = new Intl.DateTimeFormat('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(_d);
        const _horaPart  = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true }).format(_d);
        document.getElementById('modal-fecha-header').innerHTML = `${_fechaPart} <strong>${_horaPart}</strong>`;
    }

    // Cliente
    document.getElementById('modal-cliente').textContent = p.nombre ?? '—';

    // Meta: teléfono · sede · asesor + pago + canal
    const canalLabel = badgeCanal(p.canal);
    document.getElementById('modal-meta').innerHTML =
        `${p.telefono ?? '—'} &nbsp;·&nbsp; 🏬 ${p.sede ?? '—'} &nbsp;·&nbsp; 👤 ${p.asesor ?? '—'}` +
        `<br><small>Pago: ${p.pago ?? '—'} &nbsp;·&nbsp; ${canalLabel}</small>`;

    // Entrega
    document.getElementById('modal-entrega').innerHTML = esDomicilio
        ? `📍 ${p.direccion ?? ''}${p.domicilio?.barrio ? ` · ${p.domicilio.barrio}` : ''}`
        : `🏪 Recoge en tienda`;

    // Productos
    document.getElementById('modal-productos').innerHTML =
        (p.productos || [])
        .slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }))
        .map(prod => `<li><strong>${prod.qty || 1}×</strong> ${prod.nombre}${prod.obs ? ` <span style="color:#888;font-size:0.85em;">— ${prod.obs}</span>` : ''}</li>`)
        .join('');

    // Totals
    document.getElementById('modal-totals-box').style.display = '';
    document.getElementById('modal-total').textContent = formatPrecio(p.total || 0);
    const domRow = document.getElementById('modal-domicilio-row');
    if (esDomicilio && p.domicilio?.valor) {
        domRow.style.display = 'flex';
        document.getElementById('modal-domicilio').textContent = formatPrecio(p.domicilio.valor);
    } else {
        domRow.style.display = 'none';
    }
    document.getElementById('modal-total-final').textContent = formatPrecio((p.total || 0) + (esDomicilio ? (p.domicilio?.valor || 0) : 0));

    // Obs
    document.getElementById('modal-obs').innerHTML =
        (p.acompanamientos ? `<div class="mpedido-obs">🥗 <strong>Acompañamientos:</strong> ${p.acompanamientos}</div>` : '') +
        (p.obs ? `<div class="mpedido-obs">💬 ${p.obs}</div>` : '');

    // Stepper
    document.getElementById('modal-stepper').innerHTML = renderStepper(p);

    // Cancelar
    const puedeCancel = p.estado === 'en preparacion';
    document.getElementById('modal-cancel-area').innerHTML = puedeCancel
        ? `<button class="btn-cancelar-pedido" onclick="abrirModalCancelar('${p.id}', '${p.nPedido}')">✕ Cancelar pedido</button>`
        : '';
}

function cerrarModalPedido() {
    pedidoEnModal = null;
    document.getElementById('modal-pedido').style.display = 'none';
}

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

// ── STEPPER ───────────────────────────────────────────────────────
function renderStepper(p) {
    const steps      = p.tipo === 'reserva' ? STEPS_RESERVA : STEPS;
    const currentIdx = steps.findIndex(s => s.key === p.estado);
    let html = '<div class="stepper">';

    steps.forEach((step, i) => {
        let cls = '', onclick = '', icon = step.icon;

        if (i < currentIdx) {
            cls  = 'step-done';
            icon = ICON_CHECK;
        } else if (i === currentIdx) {
            cls = 'step-active';
        } else if (i === currentIdx + 1) {
            cls    = 'step-next';
            onclick = `onclick="cambiarEstado('${p.id}', '${step.key}')"`;
        } else {
            cls = 'step-locked';
        }

        html += `<div class="step ${cls}" ${onclick}>
            <div class="step-circle">${icon}</div>
            <span class="step-label">${step.label}</span>
        </div>`;

        if (i < steps.length - 1) {
            html += `<div class="step-connector ${i < currentIdx ? 'active' : ''}"></div>`;
        }
    });

    html += '</div>';
    return html;
}

// ── CAMBIAR ESTADO ────────────────────────────────────────────────
const TS_MAP = {
    'en preparacion': 'ts_preparacion',
    'despachado':     'ts_despachado',
    'entregado':      'ts_entregado',
};

window.cambiarEstado = async (pedidoId, nuevoEstado) => {
    try {
        const campos = { estado: nuevoEstado };
        if (TS_MAP[nuevoEstado]) campos[TS_MAP[nuevoEstado]] = new Date().toISOString();

        const { error } = await supabase
            .from('pedidos_callcenter')
            .update(campos)
            .eq('id', pedidoId);

        if (error) throw error;
    } catch (e) {
        alert('Error al actualizar el estado. Intenta de nuevo.');
        console.error(e);
    }
};

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
