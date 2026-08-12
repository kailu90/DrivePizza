import { supabase } from '../Api/supabaseConfig.js';
import { mostrarSkeleton, ocultarSkeleton } from "../Shared/skeleton.js";
import { colFechaToUTC } from "../Shared/semanas.js";
import { revelarSplash } from '../Shared/components.js';

// ── CONDICIONES DE VALIDEZ POR JORNADA ───────────────────────────────────
// Un asesor entra al ranking si cumple AMBAS:
//   1. Span ≥ 15 min entre primer y último pedido de la jornada
//   2. Al menos 3 pedidos en la jornada
const MIN_SPAN_MS  = 15 * 60 * 1000; // 15 minutos
const MIN_PEDIDOS  = 3;

// ── JORNADAS ─────────────────────────────────────────────────────────────
const JORNADAS = [
    { key: 'tarde', label: '☀️ Tarde', rango: '11:30 AM – 6:00 PM', inicio: 11 * 60 + 30, fin: 18 * 60 },
    { key: 'noche', label: '🌙 Noche', rango: '6:00 PM – 11:00 PM',  inicio: 18 * 60,       fin: 23 * 60 },
];

function toDate(fecha) {
    return fecha ? new Date(fecha) : new Date();
}

function getJornada(fecha) {
    const d   = toDate(fecha);
    const min = d.getHours() * 60 + d.getMinutes();
    // Tolerancia de ±5 min solo en los extremos del día (inicio de la primera
    // jornada y fin de la última) para no crear solapamiento entre jornadas
    for (let i = 0; i < JORNADAS.length; i++) {
        const j         = JORNADAS[i];
        const iniConTol = i === 0                   ? j.inicio - 5 : j.inicio;
        const finConTol = i === JORNADAS.length - 1 ? j.fin    + 5 : j.fin;
        if (min >= iniConTol && min < finConTol) return j.key;
    }
    return 'otro';
}

function hoyLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatHora(date) {
    return new Intl.DateTimeFormat('es-CO', {
        hour: '2-digit', minute: '2-digit', hour12: true
    }).format(date);
}

function horasActivas(firstTs, lastTs) {
    if (!firstTs || !lastTs || firstTs === lastTs) return null;
    return (lastTs - firstTs) / (1000 * 60 * 60);
}

const BORDE_MS = 10 * 60 * 1000; // 10 minutos — zona de borde al inicio/fin de cada bloque

/**
 * Construye los bloques de tiempo de una jornada.
 * El primer bloque puede ser fraccionario (ej. 11:30–12:00 = 0.5h).
 * Los demás son de 1h exacta.
 */
function construirBloques(jornada, midnight) {
    const bloques    = [];
    const inicioMs   = midnight + jornada.inicio * 60 * 1000;
    const finMs      = midnight + jornada.fin    * 60 * 1000;
    const primerFinMs = midnight + Math.ceil(jornada.inicio / 60) * 3600 * 1000;

    // Primer bloque (puede ser 0.5h si la jornada no empieza en punto)
    bloques.push({
        inicio: inicioMs,
        fin:    primerFinMs,
        horas:  (primerFinMs - inicioMs) / 3600000,
    });

    // Bloques completos de 1h
    let cursor = primerFinMs;
    while (cursor < finMs) {
        bloques.push({ inicio: cursor, fin: cursor + 3600000, horas: 1 });
        cursor += 3600000;
    }
    return bloques;
}

/**
 * Calcula horas efectivas de trabajo usando activación de bloques.
 *
 * Reglas de activación:
 *  - Un pedido en el INTERIOR del bloque (fuera de los 10 min de borde) → activa el bloque solo.
 *  - Un pedido SOLITARIO en los ÚLTIMOS 10 min (borde-fin) → no activa el bloque;
 *    fluye al siguiente bloque activo.
 *  - Un pedido SOLITARIO en los PRIMEROS 10 min (borde-inicio) → no activa el bloque;
 *    fluye al bloque anterior activo.
 *  - Si hay MÚLTIPLES pedidos en zona de borde (hay respaldo) → activan el bloque normalmente.
 *
 * @param {number[]} timestamps - Timestamps (ms) de pedidos en la jornada
 * @param {object}   jornada    - { inicio, fin } en minutos desde medianoche
 * @param {number}   midnight   - Timestamp del inicio del día (00:00:00)
 */
function calcularHorasEfectivas(timestamps, jornada, midnight) {
    if (!timestamps.length) return { horas: 0, bloquesActivados: 0 };

    const bloques = construirBloques(jornada, midnight);

    // Clasificar cada timestamp: en qué bloque cae y si es borde
    const porBloque = {}; // bloqueIdx → { interiores: [], bordes: [] }
    for (const ts of timestamps) {
        const idx = bloques.findIndex(b => ts >= b.inicio && ts < b.fin);
        if (idx < 0) continue;
        const b             = bloques[idx];
        const enBordeInicio = (ts - b.inicio) < BORDE_MS;
        const enBordeFin    = (b.fin   - ts)  < BORDE_MS;
        if (!porBloque[idx]) porBloque[idx] = { interiores: [], bordes: [] };
        if (enBordeInicio || enBordeFin) porBloque[idx].bordes.push({ ts, enBordeFin, enBordeInicio });
        else                             porBloque[idx].interiores.push(ts);
    }

    // Determinar qué bloques quedan activos
    // Un bloque se activa si:
    //   a) tiene ≥1 pedido interior, O
    //   b) tiene múltiples pedidos (hay respaldo entre bordes, o borde + interior)
    // Un pedido solitario en zona de borde NO activa el bloque por sí solo.
    const bloquesActivos = new Set();

    for (const [idxStr, { interiores, bordes }] of Object.entries(porBloque)) {
        const idx   = Number(idxStr);
        const total = interiores.length + bordes.length;
        if (interiores.length > 0 || total > 1) {
            bloquesActivos.add(idx);
        }
        // Si total === 1 y es borde solitario: no activa — fluye al bloque adyacente activo
    }

    // Calcular horas y rango de bloques activos
    let horas = 0;
    let primerBloqueIni = null;
    let ultimoBloqueFin = null;

    for (const idx of [...bloquesActivos].sort((a, b) => a - b)) {
        horas += bloques[idx].horas;
        if (primerBloqueIni === null) primerBloqueIni = bloques[idx].inicio;
        ultimoBloqueFin = bloques[idx].fin;
    }

    return { horas, bloquesActivados: bloquesActivos.size, primerBloqueIni, ultimoBloqueFin };
}

function renderMedalla(pos) {
    if (pos === 1) return '🥇';
    if (pos === 2) return '🥈';
    if (pos === 3) return '🥉';
    return `#${pos}`;
}

// ── RENDER DE UN RANKING POR JORNADA ─────────────────────────────────────
function renderRankingJornada(jornada, filas) {
    if (!filas.length) return '';

    const filasValidas    = filas.filter(f => !f.excluido);
    const totalJornada    = filasValidas.reduce((s, f) => s + f.count, 0);
    const promedioJornada = filasValidas.length
        ? filasValidas.reduce((s, f) => s + f.rate, 0) / filasValidas.length
        : null;

    const promedioStr = `
        <span class="ra-avg-badge">Total: <strong>${totalJornada} ped</strong></span>
        ${promedioJornada !== null
            ? `<span class="ra-avg-badge">Promedio: <strong>${promedioJornada.toFixed(1)} ped/h</strong></span>`
            : ''}`;

    if (!filasValidas.length) return '';

    let rankPos = 0;
    const rows = filasValidas.map(({ asesor, count, firstTs, lastTs, rate, horasEfectivas, bloqueIni, bloqueFin }) => {
        const h = horasActivas(firstTs, lastTs);

        rankPos++;
        const medalla   = renderMedalla(rankPos);
        const rankClass = rankPos === 1 ? 'ra-rank-1' : rankPos === 2 ? 'ra-rank-2' : rankPos === 3 ? 'ra-rank-3' : '';

        // Mostrar rango de bloques activos (ej. "11:30 AM – 3:00 PM")
        const horarioStr = bloqueIni && bloqueFin
            ? `${formatHora(new Date(bloqueIni))} – ${formatHora(new Date(bloqueFin))}`
            : firstTs ? formatHora(new Date(firstTs)) : '—';
        const durStr = '';

        const horasStr = horasEfectivas !== null ? `${horasEfectivas.toFixed(1)}h` : '';
        const rateCell = `<strong>${rate.toFixed(1)}</strong> ped/h <small class="ra-dur">(${horasStr})</small>`;

        return `<tr class="inventory-management__row ${rankClass}">
            <td class="ra-num ra-medal">${medalla}</td>
            <td class="ra-name">${asesor}</td>
            <td class="ra-horario">${horarioStr}${durStr}</td>
            <td class="ra-num ra-bold">${count}</td>
            <td class="ra-num ra-rate">${rateCell}</td>
        </tr>`;
    }).join('');

    const promedioRow = `
        <tr class="ra-avg-row">
            <td colspan="5" class="ra-avg-label">
                Promedio jornada: <strong>${promedioJornada.toFixed(1)}</strong> ped/h
            </td>
        </tr>`;

    const colorClass = jornada.key === 'tarde' ? 'ra-section--tarde' : 'ra-section--noche';

    return `
    <div class="ra-section ${colorClass}">
        <div class="ra-section-header">
            <span class="ra-section-title">${jornada.label} &nbsp;<small>${jornada.rango}</small></span>
            ${promedioStr}
        </div>
        <div class="ra-table-wrap">
            <table class="ra-table">
                <thead>
                    <tr class="ra-head-top">
                        <th class="col-${jornada.key}">#</th>
                        <th class="col-${jornada.key} ra-th-asesor">Asesor</th>
                        <th class="col-${jornada.key}">Horario activo</th>
                        <th class="col-${jornada.key}">Pedidos</th>
                        <th class="col-${jornada.key}">Ped/hora</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                    ${promedioRow}
                </tbody>
            </table>
        </div>
    </div>`;
}

// ── REPORTE PRINCIPAL ─────────────────────────────────────────────────────
let sedeUsuario = null;

async function cargarReporte(fecha) {
    const contenedor = document.getElementById('reporte-contenedor');
    if (!contenedor) return;
    contenedor.innerHTML = `<p class="ra-empty">Cargando...</p>`;

    try {
        let q = supabase
            .from('pedidos_callcenter')
            .select('n_pedido, asesor, fecha, sede, estado')
            .gte('fecha', colFechaToUTC(fecha, 'inicio'))
            .lte('fecha', colFechaToUTC(fecha, 'fin'))
            .order('fecha', { ascending: true });
        const { data, error } = await q;
        if (error) throw error;
        let pedidos = (data || []).map(p => ({
            nPedido: p.n_pedido, asesor: p.asesor, fecha: p.fecha, sede: p.sede, estado: p.estado
        }));

        if (sedeUsuario) pedidos = pedidos.filter(p => p.sede === sedeUsuario);

        // Excluir cancelados
        pedidos = pedidos.filter(p => p.estado !== 'cancelado');

        if (!pedidos.length) {
            contenedor.innerHTML = `<p class="ra-empty">No hay pedidos para ${fecha}.</p>`;
            return;
        }

        // ── Agrupar por asesor y jornada ──────────────────────────────
        const datos = {};

        pedidos.forEach(p => {
            const asesor  = p.asesor || 'Sin asesor';
            const jornada = getJornada(p.fecha);
            const ts      = toDate(p.fecha).getTime();

            if (!datos[asesor]) {
                datos[asesor] = {
                    tarde: { count: 0, firstTs: null, lastTs: null, timestamps: [] },
                    noche: { count: 0, firstTs: null, lastTs: null, timestamps: [] },
                };
            }
            if (jornada === 'otro') return;

            const j = datos[asesor][jornada];
            j.count++;
            j.timestamps.push(ts);
            if (j.firstTs === null || ts < j.firstTs) j.firstTs = ts;
            if (j.lastTs  === null || ts > j.lastTs)  j.lastTs  = ts;
        });

        // ── Construir y renderizar ranking por jornada ────────────────
        let html = '';
        let totalDia = 0;

        for (const jornada of JORNADAS) {
            const filas = Object.entries(datos)
                .filter(([, d]) => d[jornada.key].count > 0)
                .map(([asesor, d]) => {
                    const { count, firstTs, lastTs, timestamps } = d[jornada.key];
                    const spanMs  = (firstTs && lastTs) ? lastTs - firstTs : 0;
                    const excluido = count < MIN_PEDIDOS || spanMs < MIN_SPAN_MS;
                    let rate = null, horasEfectivas = null, bloqueIni = null, bloqueFin = null;
                    if (!excluido && firstTs) {
                        const midnight = new Date(new Date(firstTs).setHours(0, 0, 0, 0)).getTime();
                        const { horas, primerBloqueIni, ultimoBloqueFin } = calcularHorasEfectivas(timestamps, jornada, midnight);
                        horasEfectivas = horas;
                        rate    = horas > 0 ? count / horas : null;
                        bloqueIni = primerBloqueIni;
                        bloqueFin = ultimoBloqueFin;
                    }
                    return { asesor, count, firstTs, lastTs, rate, horasEfectivas, excluido, spanMs, bloqueIni, bloqueFin };
                })
                .sort((a, b) => {
                    if (a.excluido && !b.excluido) return 1;
                    if (!a.excluido && b.excluido) return -1;
                    return (b.rate ?? 0) - (a.rate ?? 0);
                });

            totalDia += filas.reduce((s, f) => s + f.count, 0); // incluye excluidos
            html += renderRankingJornada(jornada, filas);
        }

        html += `
        <div class="ra-total-dia">
            <span>Total del día:</span>
            <strong>${totalDia} pedidos</strong>
        </div>`;

        contenedor.innerHTML = html;

    } catch (err) {
        console.error('Error cargando reporte:', err);
        contenedor.innerHTML = `<p class="ra-empty" style="color:red;">Error al cargar: ${err.message}</p>`;
    }
}

// ── AUTH ──────────────────────────────────────────────────────────────────
mostrarSkeleton('historial');

async function obtenerUsuarioCC() {
    if (window.parent !== window && window.parent._usuarioCCPromise) {
        return await window.parent._usuarioCCPromise;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('usuarios').select('*').eq('id', user.id).single();
    if (!data) return null;
    return { uid: user.id, email: user.email, username: data.username || "", sede: data.sede || "", rol: data.rol || "" };
}

(async () => {
    try {
        const usuario = await obtenerUsuarioCC();
        const ROLES_REPORTE = ['callcenter', 'callcenter-admin', 'admin'];
        if (!usuario?.rol || !ROLES_REPORTE.includes(usuario.rol)) { window.top.location.href = "../index.html"; return; }

        sedeUsuario = usuario.rol === 'pizzeria' ? usuario.sede : null;
        document.getElementById('username').textContent = usuario.username || '';
        const homeUrl = usuario.rol === 'pizzeria' ? '../Pizzerias/pizzerias.html' : './callcenter.html';
        document.getElementById('btn-home').onclick = () => window.location.href = homeUrl;
        document.getElementById('btn-logout').addEventListener('click', async () => {
            if (confirm('¿Cerrar sesión?')) {
                await supabase.auth.signOut();
                window.top.location.href = '../index.html';
            }
        });

        const hoy = hoyLocal();
        document.getElementById('filtro-fecha').value = hoy;
        cargarReporte(hoy);

        document.getElementById('btn-consultar').addEventListener('click', () => {
            const fecha = document.getElementById('filtro-fecha').value;
            if (fecha) cargarReporte(fecha);
        });

        document.getElementById('filtro-fecha').addEventListener('keydown', e => {
            if (e.key === 'Enter') cargarReporte(e.target.value);
        });

        ocultarSkeleton('contenido-principal');
        document.body.classList.add('loaded');
        revelarSplash();
    } catch (err) {
        console.error('Error en auth reporte asesores:', err);
        document.body.classList.add('loaded');
        revelarSplash();
    }
})();

// ── Popover SIP ──────────────────────────────────────────────────────────────
document.getElementById('btn-sip-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('sip-popover').classList.toggle('visible');
});
document.addEventListener('click', () => document.getElementById('sip-popover')?.classList.remove('visible'));

// ── Estado SIP desde el shell padre ─────────────────────────────────────────
const SIP_LABELS_R = { registered: 'Registrado', ringing: 'Llamando...', incall: 'En llamada', offline: 'Desconectado' };
window.addEventListener('message', e => {
    if (e.data?.type !== 'sip-state') return;
    const s   = e.data.state || 'offline';
    const dot = document.getElementById('sip-dot-hdr');
    if (dot) { dot.style.display = 'block'; dot.className = s; }
    const est = document.getElementById('sip-pop-estado');
    const ext = document.getElementById('sip-pop-ext');
    if (est) est.textContent = SIP_LABELS_R[s] || s;
    if (ext) ext.textContent = e.data.extension ? 'Ext. ' + e.data.extension : '—';
});
if (window.parent !== window) window.parent.postMessage({ type: 'frame-ready' }, '*');
