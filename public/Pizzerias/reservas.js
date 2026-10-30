import { supabase } from '../Api/supabaseConfig.js';
import { CargarHeader, CargarSidebar, CargarFooter, capitalizarSede } from '../Shared/components.js';
import { getSedes } from '../Shared/sedesService.js';
import { normalizarPedido, poblarModal, cerrarModal } from '../Shared/modalDetalle.js';

// ── Constantes ─────────────────────────────────────────────────────────────────
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const ROLES_OK = new Set(['pizzeria', 'planta', 'admin', 'gastrofusion']);

// ── Estado global ──────────────────────────────────────────────────────────────
let _sede            = '';
let _aforo           = 30;
let _reservasMes     = [];   // reservas del mes visible en el calendario
let _reservasHoy     = [];   // reservas de hoy (para KPIs, panel y alertas)
let _fechaSel        = '';   // fecha seleccionada en el calendario (YYYY-MM-DD)
let _calAnio         = new Date().getFullYear();
let _calMes          = new Date().getMonth();
const _cache         = new Map(); // id → reserva (lookup rápido para el modal)

// ── Helpers ────────────────────────────────────────────────────────────────────
function hoyLocal() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

function horaAhoraLocal() {
    return new Date().toLocaleTimeString('es-CO', {
        timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false
    });
}

function fmtHora(h) {
    if (!h) return '—';
    const [hh, mm] = h.split(':');
    const hora = parseInt(hh, 10);
    return `${hora % 12 || 12}:${mm} ${hora >= 12 ? 'p.m.' : 'a.m.'}`;
}

function fmtFecha(f) {
    if (!f) return '—';
    const [y, m, d] = f.split('-');
    return `${parseInt(d, 10)} ${MESES[parseInt(m, 10) - 1].slice(0, 3)}. ${y}`;
}

function estadoBadge(estado) {
    const MAP = {
        pendiente:        { label: 'Pendiente',  cls: 'rsv-estado--orange' },
        recibido:         { label: 'Confirmada', cls: 'rsv-estado--green'  },
        'en preparacion': { label: 'En espera',  cls: 'rsv-estado--red'    },
        entregado:        { label: 'Completada', cls: 'rsv-estado--gray'   },
        cancelado:        { label: 'Cancelada',  cls: 'rsv-estado--dark'   },
    };
    const e = MAP[estado] || { label: estado, cls: '' };
    return `<span class="rsv-estado ${e.cls}">${e.label}</span>`;
}

function dotClass(estado) {
    return {
        recibido:         'rsv-dot--green',
        pendiente:        'rsv-dot--orange',
        'en preparacion': 'rsv-dot--red',
        entregado:        'rsv-dot--gray',
        cancelado:        'rsv-dot--gray',
    }[estado] || '';
}

function canalBadge(canal) {
    if (canal === 'whatsapp') return '<span class="rsv-canal rsv-canal--wa">WhatsApp</span>';
    if (canal === 'ivr')      return '<span class="rsv-canal rsv-canal--ivr">IVR</span>';
    return `<span class="rsv-canal">${canal || '—'}</span>`;
}

// ── Modal detalle — usa Shared/modalDetalle.js ────────────────────────────────
// poblarModal y cerrarModal vienen del import al inicio del archivo

// ── KPIs ──────────────────────────────────────────────────────────────────────
function renderKPIs() {
    const total       = _reservasHoy.length;
    const confirmadas = _reservasHoy.filter(r => r.estado === 'recibido').length;
    const pendientes  = _reservasHoy.filter(r => r.estado === 'pendiente').length;

    document.getElementById('kpi-reservas-hoy').textContent = total;
    document.getElementById('kpi-reservas-sub').textContent =
        `${confirmadas} confirmadas · ${pendientes} pendientes`;

    // Próxima reserva
    const ahoraHH = horaAhoraLocal();
    const proxima = _reservasHoy
        .filter(r => r.hora_reserva > ahoraHH && r.estado !== 'cancelado' && r.estado !== 'entregado')
        .sort((a, b) => a.hora_reserva.localeCompare(b.hora_reserva))[0];

    if (proxima) {
        document.getElementById('kpi-proxima-hora').textContent = fmtHora(proxima.hora_reserva);
        document.getElementById('kpi-proxima-info').textContent =
            `${proxima.nombre} · ${proxima.cantidad_personas ?? '—'} personas`;
    } else {
        document.getElementById('kpi-proxima-hora').textContent = 'Sin pendientes';
        document.getElementById('kpi-proxima-info').textContent = 'para el resto del día';
    }

    // Ocupación estimada (personas confirmadas / aforo)
    const personas = _reservasHoy
        .filter(r => r.estado === 'recibido' || r.estado === 'en preparacion')
        .reduce((s, r) => s + (r.cantidad_personas || 0), 0);
    const pct = _aforo > 0 ? Math.min(100, Math.round((personas / _aforo) * 100)) : 0;
    document.getElementById('kpi-ocupacion').textContent = `${pct}%`;
    const fill = document.getElementById('rsv-progreso-fill');
    if (fill) {
        fill.style.width   = `${pct}%`;
        fill.style.background = pct >= 80 ? '#e74c3c' : pct >= 50 ? '#e67e22' : 'var(--color-primario)';
    }

    // Mes actual — usando _reservasMes (ya filtrado por el mes visible = mes actual al inicio)
    const mesActual = `${_calAnio}-${String(_calMes + 1).padStart(2, '0')}`;
    const delMes = _reservasMes.filter(r => r.fecha_reserva?.startsWith(mesActual) && r.estado !== 'cancelado').length;
    document.getElementById('kpi-mes').textContent = delMes;
    document.getElementById('kpi-mes-sub').textContent = MESES[_calMes];
}

// ── Calendario ────────────────────────────────────────────────────────────────
function renderCalendario() {
    document.getElementById('rsv-cal-mes').textContent = `${MESES[_calMes]} ${_calAnio}`;

    const primerDia  = new Date(_calAnio, _calMes, 1).getDay();
    const diasEnMes  = new Date(_calAnio, _calMes + 1, 0).getDate();
    const hoy        = hoyLocal();

    // Agrupar reservas por fecha
    const porFecha = {};
    _reservasMes.forEach(r => {
        if (!r.fecha_reserva) return;
        (porFecha[r.fecha_reserva] ??= []).push(r);
    });

    let html = '';

    // Celdas vacías iniciales
    for (let i = 0; i < primerDia; i++) {
        html += '<div class="rsv-cal-day rsv-cal-day--outside"></div>';
    }

    for (let d = 1; d <= diasEnMes; d++) {
        const fecha = `${_calAnio}-${String(_calMes + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const del   = porFecha[fecha] || [];
        const esHoy = fecha === hoy;
        const esSel = fecha === _fechaSel;

        let cls = 'rsv-cal-day';
        if (esHoy) cls += ' rsv-cal-day--today';
        if (esSel) cls += ' rsv-cal-day--selected';

        const estados       = [...new Set(del.map(r => r.estado))];
        const dots          = estados.map(e => `<span class="rsv-dot ${dotClass(e)}"></span>`).join('');
        const totalPersonas = del.reduce((s, r) => s + (r.cantidad_personas || 0), 0);
        const infoHtml      = del.length > 0 ? `
            <span class="rsv-cal-day__count">${del.length} reserva${del.length !== 1 ? 's' : ''}</span>
            <span class="rsv-cal-day__personas">${totalPersonas} persona${totalPersonas !== 1 ? 's' : ''}</span>
        ` : '';

        html += `
            <div class="${cls}" data-fecha="${fecha}">
                <span class="rsv-cal-day__num">${d}</span>
                ${infoHtml}
                <div class="rsv-cal-day__dots">${dots}</div>
            </div>`;
    }

    const grid = document.getElementById('rsv-cal-grid');
    grid.innerHTML = html;

    grid.querySelectorAll('.rsv-cal-day[data-fecha]').forEach(cell => {
        cell.addEventListener('click', () => {
            _fechaSel = cell.dataset.fecha;
            renderCalendario();
            renderPanel();
        });
    });
}

// ── Panel derecho ─────────────────────────────────────────────────────────────
function renderPanel() {
    const hoy   = hoyLocal();
    const esHoy = _fechaSel === hoy;

    // Título dinámico
    document.getElementById('rsv-panel-titulo').textContent = esHoy
        ? 'Reservas de hoy'
        : `Reservas del ${fmtFecha(_fechaSel)}`;

    // Reservas del día seleccionado
    let del = esHoy
        ? [..._reservasHoy]
        : _reservasMes.filter(r => r.fecha_reserva === _fechaSel);

    del.sort((a, b) => (a.hora_reserva || '').localeCompare(b.hora_reserva || ''));

    const activas = del.filter(r => r.estado !== 'cancelado');
    const countEl = document.getElementById('rsv-panel-count');
    countEl.textContent   = activas.length;
    countEl.style.display = activas.length ? '' : 'none';

    const lista      = document.getElementById('rsv-panel-lista');
    const btnVerTodas = document.getElementById('rsv-ver-todas');
    const MAX        = 5;

    if (!del.length) {
        lista.innerHTML       = '<p class="rsv-empty">Sin reservas para este día</p>';
        btnVerTodas.style.display = 'none';
        return;
    }

    lista.innerHTML = del.slice(0, MAX).map(r => `
        <div class="rsv-panel-item rsv-panel-item--link" data-id="${r.id}">
            <div class="rsv-panel-item__hora">${fmtHora(r.hora_reserva)}</div>
            <div class="rsv-panel-item__info">
                <div class="rsv-panel-item__nombre">${r.nombre || '—'}</div>
                <div class="rsv-panel-item__meta">${r.cantidad_personas ? r.cantidad_personas + ' pers. · ' : ''}${r.telefono || ''}</div>
                ${r.obs ? `<div class="rsv-panel-item__obs">${r.obs}</div>` : ''}
            </div>
            ${estadoBadge(r.estado)}
        </div>
    `).join('');

    lista.querySelectorAll('.rsv-panel-item--link[data-id]').forEach(el => {
        el.addEventListener('click', () => {
            const r = _cache.get(el.dataset.id);
            if (r) poblarModal(normalizarPedido(r));
        });
    });

    if (del.length > MAX) {
        btnVerTodas.textContent   = `Ver todas las reservas del día (${del.length}) →`;
        btnVerTodas.style.display = '';
    } else {
        btnVerTodas.style.display = 'none';
    }
}

// ── Alertas del día ───────────────────────────────────────────────────────────
function renderAlertas() {
    const ahoraHH  = horaAhoraLocal();
    const ahoraMs  = new Date();
    const alertas  = [];

    _reservasHoy.forEach(r => {
        if (!r.hora_reserva || r.estado === 'cancelado' || r.estado === 'entregado') return;

        // Próxima en menos de 30 minutos
        const [hh, mm] = r.hora_reserva.split(':').map(Number);
        const rsvMs    = new Date(ahoraMs);
        rsvMs.setHours(hh, mm, 0, 0);
        const diffMin  = Math.round((rsvMs - ahoraMs) / 60000);
        if (diffMin > 0 && diffMin <= 30) {
            alertas.push({
                texto: `Próxima reserva en ${diffMin} min`,
                sub:   `${r.nombre} · ${r.cantidad_personas ?? '—'} personas`,
                cls:   'rsv-alerta--red',
            });
        }

        // Grupo grande (>= 8 personas)
        if ((r.cantidad_personas || 0) >= 8) {
            alertas.push({
                texto: `Mesa grande — ${r.cantidad_personas} personas`,
                sub:   `${fmtHora(r.hora_reserva)} · ${r.nombre}`,
                cls:   'rsv-alerta--orange',
            });
        }

        // Celebración especial
        if (/cumple|aniversario|celebra|festej/i.test(r.obs || '')) {
            alertas.push({
                texto: 'Celebración especial',
                sub:   `${fmtHora(r.hora_reserva)} · ${r.nombre}`,
                cls:   'rsv-alerta--purple',
            });
        }
    });

    const countEl = document.getElementById('rsv-alertas-count');
    countEl.textContent   = alertas.length;
    countEl.style.display = alertas.length ? '' : 'none';

    document.getElementById('rsv-alertas-lista').innerHTML = alertas.length
        ? alertas.map(a => `
            <div class="rsv-alerta ${a.cls}">
                <div class="rsv-alerta__texto">${a.texto}</div>
                <div class="rsv-alerta__sub">${a.sub}</div>
            </div>`).join('')
        : '<p class="rsv-empty">Sin alertas para hoy</p>';
}

// ── Tabla próximas reservas ────────────────────────────────────────────────────
function renderTabla(reservas) {
    const tbody = document.getElementById('rsv-tabla-body');
    if (!reservas.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="inventory-management__cell" style="text-align:center;padding:2rem;">Sin próximas reservas</td></tr>';
        return;
    }
    tbody.innerHTML = reservas.map(r => `
        <tr class="inventory-management__row rsv-fila-link" data-id="${r.id}">
            <td class="inventory-management__cell">
                <div style="font-weight:600;">${fmtFecha(r.fecha_reserva)}</div>
                <div style="color:#aaa;font-size:1.1rem;">${fmtHora(r.hora_reserva)}</div>
            </td>
            <td class="inventory-management__cell" style="text-align:left;font-weight:600;">${r.nombre || '—'}</td>
            <td class="inventory-management__cell">${r.cantidad_personas ?? '—'}</td>
            <td class="inventory-management__cell">${r.telefono || '—'}</td>
            <td class="inventory-management__cell">${canalBadge(r.canal)}</td>
            <td class="inventory-management__cell">${estadoBadge(r.estado)}</td>
            <td class="inventory-management__cell" style="text-align:left;color:#777;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.obs || '—'}</td>
        </tr>
    `).join('');

    tbody.querySelectorAll('.rsv-fila-link[data-id]').forEach(tr => {
        tr.addEventListener('click', () => {
            const r = _cache.get(tr.dataset.id);
            if (r) poblarModal(normalizarPedido(r));
        });
    });
}

// ── Queries Supabase ──────────────────────────────────────────────────────────
async function cargarMes() {
    const inicio   = `${_calAnio}-${String(_calMes + 1).padStart(2,'0')}-01`;
    const ultimoDia = new Date(_calAnio, _calMes + 1, 0).getDate();
    const fin      = `${_calAnio}-${String(_calMes + 1).padStart(2,'0')}-${String(ultimoDia).padStart(2,'0')}`;

    const { data } = await supabase
        .from('pedidos_callcenter')
        .select('id,n_pedido,nombre,telefono,sede,asesor,fecha,tipo,fecha_reserva,hora_reserva,cantidad_personas,estado,canal,obs')
        .eq('tipo', 'reserva')
        .eq('sede', _sede)
        .gte('fecha_reserva', inicio)
        .lte('fecha_reserva', fin)
        .order('fecha_reserva')
        .order('hora_reserva');

    _reservasMes = data || [];
    _reservasMes.forEach(r => _cache.set(String(r.id), r));
}

async function cargarHoy() {
    const { data } = await supabase
        .from('pedidos_callcenter')
        .select('id,n_pedido,nombre,telefono,sede,asesor,fecha,tipo,fecha_reserva,hora_reserva,cantidad_personas,estado,canal,obs')
        .eq('tipo', 'reserva')
        .eq('sede', _sede)
        .eq('fecha_reserva', hoyLocal())
        .order('hora_reserva');

    _reservasHoy = data || [];
    _reservasHoy.forEach(r => _cache.set(String(r.id), r));
}

async function cargarProximas() {
    const { data } = await supabase
        .from('pedidos_callcenter')
        .select('id,n_pedido,nombre,telefono,sede,asesor,fecha,tipo,fecha_reserva,hora_reserva,cantidad_personas,estado,canal,obs')
        .eq('tipo', 'reserva')
        .eq('sede', _sede)
        .gte('fecha_reserva', hoyLocal())
        .neq('estado', 'cancelado')
        .order('fecha_reserva')
        .order('hora_reserva')
        .limit(50);

    (data || []).forEach(r => _cache.set(String(r.id), r));
    renderTabla(data || []);
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {

    // Auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.top.location.href = '../index.html'; return; }

    const { data: perfil } = await supabase
        .from('usuarios').select('rol, sede').eq('id', user.id).single();

    if (!ROLES_OK.has(perfil?.rol)) { window.top.location.href = '../index.html'; return; }

    _sede     = perfil?.sede || '';
    _fechaSel = hoyLocal();

    // Aforo desde sedes
    const sedes    = await getSedes();
    const sedeData = sedes.find(s => s.name.toLowerCase() === _sede.toLowerCase());
    _aforo         = sedeData?.aforo ?? 30;

    // Shell
    CargarHeader(capitalizarSede(_sede), null);
    CargarFooter();
    CargarSidebar();

    // Fecha de hoy en encabezado
    const label = new Date().toLocaleDateString('es-CO', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        timeZone: 'America/Bogota',
    });
    const fechaEl = document.getElementById('rsv-fecha-hoy');
    if (fechaEl) fechaEl.textContent = label.charAt(0).toUpperCase() + label.slice(1);

    // Modal
    const modalEl = document.getElementById('modal-pedido');
    document.getElementById('cerrar-detalle').addEventListener('click', cerrarModal);
    modalEl.addEventListener('click', e => { if (e.target === modalEl) cerrarModal(); });

    // Navegación del calendario
    document.getElementById('rsv-mes-prev').addEventListener('click', async () => {
        _calMes--;
        if (_calMes < 0) { _calMes = 11; _calAnio--; }
        await cargarMes();
        renderCalendario();
        // Actualizar KPI mes si volvemos al mes actual
        renderKPIs();
    });
    document.getElementById('rsv-mes-next').addEventListener('click', async () => {
        _calMes++;
        if (_calMes > 11) { _calMes = 0; _calAnio++; }
        await cargarMes();
        renderCalendario();
        renderKPIs();
    });

    // Cargar datos iniciales en paralelo
    await Promise.all([cargarMes(), cargarHoy()]);

    renderKPIs();
    renderCalendario();
    renderPanel();
    renderAlertas();

    // Tabla próximas (independiente, no bloquea el render inicial)
    cargarProximas();
});
