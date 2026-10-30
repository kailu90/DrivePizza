import { initVersionBanner, CargarHeader, CargarSidebar, CargarFooter, capitalizarSede } from '../Shared/components.js';
import { supabase } from '../Api/supabaseConfig.js';
import { colFechaToUTC } from '../Shared/semanas.js';
import { ESTADO_BADGE } from '../Shared/badges.js';
import { normalizarPedido, poblarModal, cerrarModal } from '../Shared/modalDetalle.js';
import { renderStepper, cambiarEstado as _cambiarEstado } from '../Shared/stepper.js';
initVersionBanner();

let _pedidosDash = [];

const fmtCOP = v => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0
}).format(v);

function setPct(elId, actual, anterior, invertir = false) {
    if (!anterior) return;
    const raw = ((actual - anterior) / anterior) * 100;
    const pct = Math.round(raw * 10) / 10; // un decimal
    if (pct === 0) return;
    const el  = document.getElementById(elId);
    if (!el) return;
    el.textContent = (pct > 0 ? '+' : '') + pct + '%';
    const subiendo = invertir ? pct <= 0 : pct >= 0;
    el.className   = 'piz-pct ' + (subiendo ? 'piz-pct--up' : 'piz-pct--down');
}

// ── Stepper global (cierra modal; kanban se actualiza vía realtime) ──────────
window.cambiarEstado = (id, estado) => _cambiarEstado(supabase, id, estado, cerrarModal);

// ── Colores kanban desde ESTADO_BADGE ────────────────────────────────────────
function aplicarColoresKanban() {
    const MAPA = [
        { sel: '.piz-kanban__col--cola   .piz-kanban__hdr', estado: 'recibido'       },
        { sel: '.piz-kanban__col--prep   .piz-kanban__hdr', estado: 'en preparacion' },
        { sel: '.piz-kanban__col--camino .piz-kanban__hdr', estado: 'despachado'     },
    ];
    MAPA.forEach(({ sel, estado }) => {
        const el = document.querySelector(sel);
        if (!el) return;
        const { bg } = ESTADO_BADGE[estado] || {};
        if (!bg) return;
        el.style.background = bg + '22'; // tint al ~13% de opacidad
        el.style.color = bg;
    });
}

// ── Helpers tiempo ────────────────────────────────────────────────────────────
function _minutosDesde(ts) {
    if (!ts) return null;
    return Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
}
function _formatTimer(min) {
    if (min === null) return '';
    if (min < 60) return `${min}m`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
}

// ── Kanban ────────────────────────────────────────────────────────────────────
const _kbanCache = new Map();

function _kbanCard(p) {
    _kbanCache.set(String(p.id), p);
    const min      = _minutosDesde(p.fecha);
    const timerTxt = _formatTimer(min);
    const timerCls = min === null ? '' : min < 20 ? 'kban-time--green' : min < 35 ? 'kban-time--orange' : 'kban-time--red';
    const prods    = p.productos || [];
    const resumen  = prods.length
        ? prods[0].nombre + (prods.length > 1 ? ` +${prods.length - 1}` : '')
        : '—';
    return `<div class="piz-kanban__card" data-id="${p.id}">
        <div class="piz-kanban__card-top">
            <span class="piz-kanban__num">#${p.n_pedido ?? '—'}</span>
            ${timerTxt ? `<span class="piz-kanban__time ${timerCls}">${timerTxt}</span>` : ''}
        </div>
        <div class="piz-kanban__nombre">${p.nombre || '—'}</div>
        <div class="piz-kanban__bottom">
            <span class="piz-kanban__prod">${resumen}</span>
            <span class="piz-kanban__precio">${p.total ? fmtCOP(p.total) : '—'}</span>
        </div>
    </div>`;
}

function _kbanCol(idItems, idCount, pedidos) {
    const el  = document.getElementById(idItems);
    const cnt = document.getElementById(idCount);
    if (!el) return;
    if (cnt) cnt.textContent = pedidos.length;
    el.innerHTML = pedidos.length
        ? pedidos.map(_kbanCard).join('')
        : '<div class="piz-kanban__empty">Sin pedidos</div>';
}

function renderKanban(pedidos) {
    _kbanCache.clear();
    _kbanCol('kban-cola',   'kban-cola-count',   pedidos.filter(p => p.estado === 'recibido'));
    _kbanCol('kban-prep',   'kban-prep-count',   pedidos.filter(p => p.estado === 'en preparacion'));
    _kbanCol('kban-camino', 'kban-camino-count', pedidos.filter(p => p.estado === 'despachado'));
}

// ── Alertas de demora ─────────────────────────────────────────────────────────
function renderAlertas(pedidos) {
    const alertas = pedidos
        .filter(p => ['recibido', 'en preparacion'].includes(p.estado))
        .map(p => ({ ...p, min: _minutosDesde(p.fecha) }))
        .filter(p => p.min !== null && p.min >= 30)
        .sort((a, b) => b.min - a.min);

    const el = document.getElementById('alertas-lista');
    if (!el) return;
    if (!alertas.length) {
        el.innerHTML = '<div class="piz-alertas__empty">Sin alertas activas ✓</div>';
        return;
    }
    el.innerHTML = alertas.map(p => `
        <div class="piz-alerta-row">
            <span class="piz-alerta__num">#${p.n_pedido ?? '—'}</span>
            <span class="piz-alerta__nombre">${p.nombre || '—'}</span>
            <span class="piz-alerta__tiempo">${_formatTimer(p.min)}</span>
            <span class="piz-alerta__precio">${p.total ? fmtCOP(p.total) : '—'}</span>
        </div>
    `).join('');
}

// ── Top productos del día ─────────────────────────────────────────────────────
function renderTopProductos(pedidos) {
    const mapa = new Map();
    pedidos.filter(p => p.estado !== 'cancelado').forEach(p => {
        (p.productos || []).forEach(prod => {
            const k = prod.nombre || '?';
            mapa.set(k, (mapa.get(k) || 0) + (prod.qty || 1));
        });
    });
    const sorted = [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const maxVal = sorted[0]?.[1] || 1;

    const el = document.getElementById('top-prods-lista');
    if (!el) return;
    if (!sorted.length) {
        el.innerHTML = '<div class="piz-kanban__empty">Sin datos aún</div>';
        return;
    }
    el.innerHTML = sorted.map(([nombre, count], i) => `
        <div class="piz-top-row">
            <span class="piz-top-rank">${i + 1}</span>
            <span class="piz-top-nombre">${nombre}</span>
            <div class="piz-top-bar-wrap"><div class="piz-top-bar" style="width:${Math.round(count / maxVal * 100)}%"></div></div>
            <span class="piz-top-count">${count}</span>
        </div>
    `).join('');
}

// ── Canales de ingreso ────────────────────────────────────────────────────────
function renderCanales(pedidos) {
    const activos = pedidos.filter(p => p.estado !== 'cancelado');
    const total   = activos.length || 1;
    [
        { id: 'wa',  match: c => c === 'whatsapp' },
        { id: 'ivr', match: c => c === 'ivr'      },
    ].forEach(({ id, match }) => {
        const count   = activos.filter(p => match(p.canal)).length;
        const pct     = Math.round(count / total * 100);
        const countEl = document.getElementById(`canal-${id}-count`);
        const pctEl   = document.getElementById(`canal-${id}-pct`);
        const barEl   = document.getElementById(`canal-${id}-bar`);
        if (countEl) countEl.textContent = count;
        if (pctEl)   pctEl.textContent   = pct + '%';
        if (barEl)   barEl.style.width   = pct + '%';
    });
}

// ── Realtime ──────────────────────────────────────────────────────────────────
function _actualizarKPIs() {
    const total      = _pedidosDash.filter(p => p.estado !== 'cancelado').length;
    const entregados = _pedidosDash.filter(p => p.estado === 'entregado').length;
    const cancelados = _pedidosDash.filter(p => p.estado === 'cancelado').length;
    document.getElementById('kpi-total').textContent      = total;
    document.getElementById('kpi-entregados').textContent = entregados;
    document.getElementById('kpi-cancelados').textContent = cancelados;
}

let _realtimeChannel = null;

function suscribirRealtime(sede) {
    if (_realtimeChannel) supabase.removeChannel(_realtimeChannel);

    _realtimeChannel = supabase
        .channel(`kanban-${sede}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'pedidos_callcenter',
            filter: `sede=eq.${sede}`,
        }, ({ eventType, new: nuevo, old: viejo }) => {
            const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

            if (eventType === 'INSERT') {
                const fechaPedido = nuevo.fecha
                    ? new Date(nuevo.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
                    : null;
                if (fechaPedido === hoy && nuevo.tipo !== 'reserva') {
                    _pedidosDash.unshift(nuevo);
                }
            } else if (eventType === 'UPDATE') {
                const idx = _pedidosDash.findIndex(p => p.id === nuevo.id);
                if (idx !== -1) {
                    _pedidosDash[idx] = nuevo;
                } else {
                    // Pedido de hoy que no estaba en el array (ej: llegó justo al cargar)
                    const fechaPedido = nuevo.fecha
                        ? new Date(nuevo.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
                        : null;
                    if (fechaPedido === hoy && nuevo.tipo !== 'reserva') {
                        _pedidosDash.unshift(nuevo);
                    }
                }
            } else if (eventType === 'DELETE') {
                const idx = _pedidosDash.findIndex(p => p.id === viejo.id);
                if (idx !== -1) _pedidosDash.splice(idx, 1);
            }

            renderKanban(_pedidosDash);
            _actualizarKPIs();
            renderAlertas(_pedidosDash);
            renderTopProductos(_pedidosDash);
            renderCanales(_pedidosDash);
        })
        .subscribe();
}

// ── Shell helpers ─────────────────────────────────────────────────────────────
const getMain    = () => document.getElementById('dashboard__main');
const getWelcome = () => document.getElementById('piz-welcome');
const getFrame   = () => document.getElementById('main-frame');

function navegar(href) {
    const esShell = !href || href === './pizzerias.html';
    if (esShell) {
        getMain()?.classList.remove('frame-activo');
        getWelcome().style.display = '';
        getFrame().style.display = 'none';
    } else {
        getMain()?.classList.add('frame-activo');
        getWelcome().style.display = 'none';
        getFrame().style.display = 'block';
        const url = new URL(href, window.location.href).href;
        if (getFrame().src !== url) getFrame().src = href;
    }
}

function marcarActivo(el) {
    document.querySelectorAll('#sidebar .sidebar__link').forEach(l => {
        l.style.background = '';
        l.style.fontWeight = '';
    });
    if (el) {
        el.style.background = 'rgba(255,255,255,0.12)';
        el.style.fontWeight = '700';
    }
}

// ── Inyectar CSS en iframe para ocultar header/sidebar propios ────────────────
document.addEventListener('DOMContentLoaded', () => {
    const iframeEl = document.getElementById('main-frame');
    if (!iframeEl) return;
    iframeEl.addEventListener('load', () => {
        try {
            const doc = iframeEl.contentDocument;
            if (!doc || doc.getElementById('piz-shell-embed')) return;
            const style = doc.createElement('style');
            style.id = 'piz-shell-embed';
            style.textContent = `
                .main-header, #header-container, #sidebar-container,
                .toggle-btn, .pw-page-transition,
                #footer-container, .dashboard__footer { display: none !important; }
                .dashboard__main, .inventory__main {
                    margin-left: 0 !important;
                    margin-top: 0 !important;
                }
            `;
            doc.head.appendChild(style);
        } catch(e) {}
    });
});

// ── Dashboard: carga de datos ─────────────────────────────────────────────────


async function cargarDashboard(sede) { try {
    const ahora    = new Date();
    const hoy      = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const ayerDate = new Date(ahora);
    ayerDate.setDate(ayerDate.getDate() - 1);
    const ayer = ayerDate.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

    // Rango mes actual: primer día del mes → hoy
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
        .toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

    // Rango mes anterior: día 1 → mismo día que hoy (período equivalente)
    const inicioMesAnt = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
        .toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const diasEnMesAnt = new Date(ahora.getFullYear(), ahora.getMonth(), 0).getDate();
    const diaEquiv     = Math.min(ahora.getDate(), diasEnMesAnt);
    const finMesAnt    = new Date(ahora.getFullYear(), ahora.getMonth() - 1, diaEquiv)
        .toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

    const [
        { data: pedidosHoy },
        { data: pedidosAyer },
        { data: pedidosMes },
        { data: pedidosMesAnt },
    ] = await Promise.all([
        supabase
            .from('pedidos_callcenter')
            .select('*')
            .eq('sede', sede)
            .gte('fecha', colFechaToUTC(hoy, 'inicio'))
            .lte('fecha', colFechaToUTC(hoy, 'fin'))
            .order('fecha', { ascending: false }),
        supabase
            .from('pedidos_callcenter')
            .select('total, estado')
            .eq('sede', sede)
            .gte('fecha', colFechaToUTC(ayer, 'inicio'))
            .lte('fecha', colFechaToUTC(ayer, 'fin')),
        supabase
            .from('pedidos_callcenter')
            .select('total, estado')
            .eq('sede', sede)
            .gte('fecha', colFechaToUTC(inicioMes, 'inicio'))
            .lte('fecha', colFechaToUTC(hoy, 'fin')),
        supabase
            .from('pedidos_callcenter')
            .select('total, estado')
            .eq('sede', sede)
            .gte('fecha', colFechaToUTC(inicioMesAnt, 'inicio'))
            .lte('fecha', colFechaToUTC(finMesAnt, 'fin')),
    ]);

    const noReserva = p => p.tipo !== 'reserva';
    const pedidos   = (pedidosHoy || []).filter(noReserva);
    const noCancel  = p => p.estado !== 'cancelado';

    // ── KPIs del día ──────────────────────────────────────────────
    const total      = pedidos.filter(p => p.estado !== 'cancelado').length;
    const entregados = pedidos.filter(p => p.estado === 'entregado').length;
    const cancelados = pedidos.filter(p => p.estado === 'cancelado').length;

    document.getElementById('kpi-total').textContent      = total;
    document.getElementById('kpi-entregados').textContent = entregados;
    document.getElementById('kpi-cancelados').textContent = cancelados;

    // ── Ventas del día ────────────────────────────────────────────
    const ayerArr    = pedidosAyer || [];
    const ventasHoy  = pedidos.filter(noCancel).reduce((s, p) => s + (p.total || 0), 0);
    const ventasAyer = ayerArr.filter(noCancel).reduce((s, p) => s + (p.total || 0), 0);
    const countHoy   = pedidos.filter(noCancel).length;
    const countAyer  = ayerArr.filter(noCancel).length;
    const ticketProm = countHoy  > 0 ? ventasHoy  / countHoy  : 0;
    const ticketAyer = countAyer > 0 ? ventasAyer / countAyer : 0;
    const prodsVend  = pedidos.filter(noCancel)
        .reduce((s, p) => s + (p.productos || []).reduce((qs, i) => qs + (i.qty || 1), 0), 0);

    document.getElementById('dash-ventas-total').textContent  = fmtCOP(ventasHoy);
    document.getElementById('dash-ticket').textContent        = fmtCOP(ticketProm);
    document.getElementById('dash-pedidos-count').textContent = countHoy;

    if (ventasAyer > 0) {
        const pct   = Math.round(((ventasHoy - ventasAyer) / ventasAyer) * 100);
        const badge = document.getElementById('dash-ventas-badge');
        badge.textContent = (pct >= 0 ? '+' : '') + pct + '% vs. ayer';
        badge.className   = 'piz-badge ' + (pct >= 0 ? 'piz-badge--up' : 'piz-badge--down');
    }

    // ── Resumen del mes ───────────────────────────────────────────
    const mesPedidos    = pedidosMes    || [];
    const mesAntPedidos = pedidosMesAnt || [];

    const ventasMes    = mesPedidos.filter(noCancel).reduce((s, p) => s + (p.total || 0), 0);
    const ventasMesAnt = mesAntPedidos.filter(noCancel).reduce((s, p) => s + (p.total || 0), 0);
    const countMes     = mesPedidos.filter(noCancel).length;
    const countMesAnt  = mesAntPedidos.filter(noCancel).length;
    const ticketMes    = countMes    > 0 ? ventasMes    / countMes    : 0;
    const ticketMesAnt = countMesAnt > 0 ? ventasMesAnt / countMesAnt : 0;
    const cancelMes    = mesPedidos.filter(p => p.estado === 'cancelado').length;
    const cancelMesAnt = mesAntPedidos.filter(p => p.estado === 'cancelado').length;

    const mesLabel = ahora.toLocaleDateString('es-CO', {
        month: 'long', year: 'numeric', timeZone: 'America/Bogota'
    });
    const mesAntAbrev = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
        .toLocaleDateString('es-CO', { month: 'short', timeZone: 'America/Bogota' });

    document.getElementById('dash-mes-label').textContent =
        mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);

    document.getElementById('mes-ventas-total').textContent  = fmtCOP(ventasMes);
    document.getElementById('mes-pedidos-count').textContent = countMes;
    document.getElementById('mes-ticket').textContent        = fmtCOP(ticketMes);

    if (ventasMesAnt > 0) {
        const pct   = Math.round(((ventasMes - ventasMesAnt) / ventasMesAnt) * 100);
        const badge = document.getElementById('mes-ventas-badge');
        badge.textContent = (pct >= 0 ? '+' : '') + pct + '%';
        badge.className   = 'piz-badge ' + (pct >= 0 ? 'piz-badge--up' : 'piz-badge--down');
    }

    _pedidosDash = pedidos;
    renderKanban(pedidos);
    renderAlertas(pedidos);
    renderTopProductos(pedidos);
    renderCanales(pedidos);
    } catch (err) { console.error('[dashboard]', err); }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: perfil } = await supabase
        .from('usuarios').select('rol, ciudad, sede').eq('id', user.id).single();

    const rolUsuario = perfil?.rol ?? null;
    const esCartago  = (perfil?.ciudad || '').toLowerCase() === 'cartago';
    const sede       = perfil?.sede || '';

    aplicarColoresKanban();
    CargarHeader(capitalizarSede(sede), null);
    CargarFooter();

    CargarSidebar(() => {
        // Ocultar secciones de BGA para sedes de Cartago
        if (esCartago) {
            ['sb-section-operacion', 'sb-section-planta'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        }

        // Mostrar items de Gastrofusión si aplica
        if (rolUsuario === 'gastrofusion') {
            ['sb-section-gf', 'sb-item-tomar-gf', 'sb-item-cierre-gf'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = '';
            });
        }

        // Interceptar clicks del sidebar → iframe
        document.querySelectorAll('#sidebar .sidebar__link[href]').forEach(a => {
            const href = a.getAttribute('href');
            a.addEventListener('click', e => {
                e.preventDefault();
                navegar(href);
                marcarActivo(a);
            });
        });

        // Marcar Dashboard activo por defecto
        const linkDash = document.querySelector('#sidebar .sidebar__link[href="./pizzerias.html"]');
        if (linkDash) marcarActivo(linkDash);
    });

    // Botón "Ver todos los pedidos"
    document.getElementById('btn-ver-pedidos')?.addEventListener('click', () => {
        navegar('./pedidosPizzeria.html');
        const link = document.querySelector('#sidebar .sidebar__link[href="./pedidosPizzeria.html"]');
        if (link) marcarActivo(link);
    });

    // Fecha del día en header de ventas
    const fechaHoy = new Date().toLocaleDateString('es-CO', {
        day: 'numeric', month: 'long', timeZone: 'America/Bogota'
    });
    const fechaEl = document.getElementById('dash-ventas-fecha');
    if (fechaEl) fechaEl.textContent = fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1);

    // Cargar datos del dashboard + suscribir realtime
    if (sede) {
        cargarDashboard(sede);
        suscribirRealtime(sede);
        // Refrescar timers del kanban y alertas cada minuto
        setInterval(() => {
            if (_pedidosDash.length) {
                renderKanban(_pedidosDash);
                renderAlertas(_pedidosDash);
            }
        }, 60_000);
    }

    // Kanban — click en card abre modal
    document.querySelector('.piz-kanban')?.addEventListener('click', e => {
        const card = e.target.closest('.piz-kanban__card[data-id]');
        if (!card) return;
        const row = _kbanCache.get(card.dataset.id);
        if (row) {
            const p = normalizarPedido(row);
            poblarModal(p, { stepperHtml: renderStepper(p) });
        }
    });

    // Modal detalle — cerrar
    document.getElementById('cerrar-detalle')?.addEventListener('click', cerrarModal);
    document.getElementById('modal-pedido')?.addEventListener('click', e => {
        if (e.target === document.getElementById('modal-pedido')) cerrarModal();
    });
});
