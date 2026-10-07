import { supabase }        from '../Api/supabaseConfig.js';
import { getSedes }         from '../Shared/sedesService.js';
import { initVersionBanner } from '../Shared/components.js';

const ROLES_OK          = ['callcenter-admin', 'admin'];
const SEDES_EXCLUIDAS   = ['planta produccion', 'gastrofusion'];

// ── Auth ──────────────────────────────────────────────────────
const { data: { user } } = await supabase.auth.getUser();
if (!user) { window.top.location.href = '/index.html'; }

const { data: perfil } = await supabase
    .from('usuarios').select('rol').eq('id', user.id).single();

if (!ROLES_OK.includes(perfil?.rol)) {
    window.top.location.href = '/index.html';
}

initVersionBanner();

// ── Estado ────────────────────────────────────────────────────
let _periodo = '30d';
let _sede    = '';

// ── Sedes ─────────────────────────────────────────────────────
const sedes = await getSedes();
const $sede = document.getElementById('mc-sede');
sedes
    .filter(s => !SEDES_EXCLUIDAS.includes(s.name.toLowerCase()))
    .forEach(s => {
        const o = document.createElement('option');
        o.value       = s.name.toLowerCase();
        o.textContent = s.name;
        $sede.appendChild(o);
    });
$sede.addEventListener('change', () => { _sede = $sede.value; cargar(); });

// ── Period chips ──────────────────────────────────────────────
document.querySelectorAll('.mc-chip').forEach(btn =>
    btn.addEventListener('click', () => {
        document.querySelector('.mc-chip.active')?.classList.remove('active');
        btn.classList.add('active');
        _periodo = btn.dataset.p;
        cargar();
    })
);

// ── Rango Colombia UTC-5 ──────────────────────────────────────
function colIni(y, m, d) {
    // Colombia 00:00 = UTC 05:00
    return new Date(Date.UTC(y, m, d, 5, 0, 0, 0)).toISOString();
}

function getRango(p) {
    const fin = new Date().toISOString();
    const col = new Date(Date.now() - 5 * 3600_000); // fecha actual en Colombia
    const cy  = col.getUTCFullYear();
    const cm  = col.getUTCMonth();
    const cd  = col.getUTCDate();

    const ini = {
        '7d':  colIni(cy, cm, cd - 6),
        '30d': colIni(cy, cm, cd - 29),
        'mes': colIni(cy, cm, 1),
        '3m':  colIni(cy, cm - 3, 1),
        'año': colIni(cy, 0, 1),
    }[p];

    return { ini, fin };
}

// ── Formatos ──────────────────────────────────────────────────
const fmtNum  = n => new Intl.NumberFormat('es-CO').format(n);
const fmtPeso = n => '$\u00a0' + new Intl.NumberFormat('es-CO').format(Math.round(n));
const fmtPct  = (a, b) => b > 0 ? (a / b * 100).toFixed(1) + '%' : '0%';

// ── Indicador de cambio vs período anterior ────────────────────
// invertir=true: subir es malo (cancelados)
function fmtCambio(actual, anterior, invertir = false) {
    if (!anterior || anterior === 0) {
        return `<span class="mc-change neutral">— sin datos previos</span>`;
    }
    const pct  = ((actual - anterior) / anterior * 100);
    const sube = pct > 0;
    const bueno = invertir ? !sube : sube;
    const cls   = pct === 0 ? 'neutral' : bueno ? 'positive' : 'negative';
    const arrow = sube ? '↑' : pct < 0 ? '↓' : '→';
    const signo = sube ? '+' : '';
    return `<span class="mc-change ${cls}">${arrow} ${signo}${pct.toFixed(1)}% vs período anterior</span>`;
}

// ── Carga ─────────────────────────────────────────────────────
async function cargar() {
    setEsqueleto();
    const { ini, fin } = getRango(_periodo);

    const [resumen] = await Promise.all([
        supabase.rpc('metricas_cc_resumen', { p_fecha_ini: ini, p_fecha_fin: fin, p_sede: _sede || null }),
        cargarGraficas(ini, fin),
    ]);

    if (resumen.error) { console.error(resumen.error); return; }
    renderKpis(resumen.data);
}

// ── SVGs ──────────────────────────────────────────────────────
const SVG = {
    pedidos: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="1"/>
        <path d="M9 12l2 2 4-4"/></svg>`,

    domicilios: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round">
        <rect x="1" y="3" width="15" height="13" rx="1"/>
        <path d="M16 8h4l3 3v5h-7V8z"/>
        <circle cx="5.5" cy="18.5" r="2.5"/>
        <circle cx="18.5" cy="18.5" r="2.5"/></svg>`,

    ventas: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
        <polyline points="17 6 23 6 23 12"/></svg>`,

    ticket: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`,

    vdom: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        <circle cx="12" cy="9" r="2.5"/></svg>`,

    cancelados: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/></svg>`,
};

// ── Render tarjetas ───────────────────────────────────────────
function renderKpis(data) {
    const a  = data.actual;
    const p  = data.anterior;
    const pctCancel = fmtPct(a.cancelados, a.total_con_cancelados);
    const recoger   = a.pedidos_total - a.domicilios;

    const cards = [
        {
            svg: SVG.pedidos, color: '#2980b9', bg: '#e3f1fb',
            label:  'Pedidos',
            value:  fmtNum(a.pedidos_total),
            sub:    `${fmtNum(a.total_con_cancelados)} recibidos en total`,
            cambio: fmtCambio(a.pedidos_total, p.pedidos_total),
        },
        {
            svg: SVG.domicilios, color: '#e67e22', bg: '#fdf0e0',
            label:  'Domicilios',
            value:  fmtNum(a.domicilios),
            sub:    `${fmtNum(recoger)} para recoger en sede`,
            cambio: fmtCambio(a.domicilios, p.domicilios),
        },
        {
            svg: SVG.ventas, color: '#27ae60', bg: '#e8f8ef',
            label:  'Ventas totales',
            value:  fmtPeso(a.ventas_total),
            sub:    'suma de pedidos completados',
            cambio: fmtCambio(a.ventas_total, p.ventas_total),
        },
        {
            svg: SVG.ticket, color: '#8e44ad', bg: '#f3e8fa',
            label:  'Ticket promedio',
            value:  fmtPeso(a.ticket_promedio),
            sub:    'valor promedio por pedido',
            cambio: fmtCambio(a.ticket_promedio, p.ticket_promedio),
        },
        {
            svg: SVG.vdom, color: '#16a085', bg: '#e8f7f4',
            label:  'Valor domicilios',
            value:  fmtPeso(a.valor_domicilios),
            sub:    'cobrado en fletes',
            cambio: fmtCambio(a.valor_domicilios, p.valor_domicilios),
        },
        {
            svg: SVG.cancelados, color: '#e74c3c', bg: '#fce8e8',
            label:  'Cancelados',
            value:  fmtNum(a.cancelados),
            sub:    `${pctCancel} del total recibido`,
            cambio: fmtCambio(a.cancelados, p.cancelados, true),
        },
    ];

    document.getElementById('mc-kpis').innerHTML = cards.map(c => `
        <div class="mc-card">
            <div class="mc-card-head">
                <div class="mc-card-icon" style="background:${c.bg};color:${c.color}">
                    ${c.svg}
                </div>
                <span class="mc-card-label">${c.label}</span>
            </div>
            <div class="mc-card-value">${c.value}</div>
            <div class="mc-card-cambio">${c.cambio}</div>
            <div class="mc-card-sub">${c.sub}</div>
        </div>
    `).join('');
}

function setEsqueleto() {
    document.getElementById('mc-kpis').innerHTML =
        Array(6).fill('<div class="mc-card mc-skel"></div>').join('');
}

// ── Gráficas ──────────────────────────────────────────────────
const DIAS_LABEL   = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES_ABREV  = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

let _chartDias   = null;
let _chartEvol   = null;
let _chartVentas = null;

function getAgrupacion(p) {
    return { '7d': 'dia', '30d': 'dia', 'mes': 'dia', '3m': 'semana', 'año': 'mes' }[p] || 'mes';
}

function fmtLabel(str, agrupacion) {
    if (agrupacion === 'mes') {
        const [, m] = str.split('-');
        return MESES_ABREV[parseInt(m)];
    }
    if (agrupacion === 'semana') {
        const [, w] = str.split('-');
        return `S${parseInt(w)}`;
    }
    // dia: "2026-10-07" → "07/10"
    const [, m, d] = str.split('-');
    return `${d}/${m}`;
}

function destroyCharts() {
    _chartDias?.destroy();   _chartDias   = null;
    _chartEvol?.destroy();   _chartEvol   = null;
    _chartVentas?.destroy(); _chartVentas = null;
}

const CHART_DEFAULTS = {
    plugins: { legend: { display: false } },
    scales: {
        y: { grid: { color: '#f5f5f5' }, ticks: { font: { size: 11 }, color: '#aaa' } },
        x: { grid: { display: false },   ticks: { font: { size: 11 }, color: '#888' } },
    },
    animation: { duration: 400 },
};

async function cargarGraficas(ini, fin) {
    const agrupacion = getAgrupacion(_periodo);

    const [{ data: dataDias }, { data: dataEvol }] = await Promise.all([
        supabase.rpc('metricas_cc_dias_semana', { p_fecha_ini: ini, p_fecha_fin: fin, p_sede: _sede || null }),
        supabase.rpc('metricas_cc_evolucion',   { p_fecha_ini: ini, p_fecha_fin: fin, p_sede: _sede || null, p_agrupacion: agrupacion }),
    ]);

    destroyCharts();

    // ── Chart 1: Domicilios por día de la semana ───────────
    if (dataDias?.length) {
        const maxDom = Math.max(...dataDias.map(r => r.domicilios));
        _chartDias = new Chart(document.getElementById('chart-dias'), {
            type: 'bar',
            data: {
                labels: dataDias.map(r => DIAS_LABEL[r.dia]),
                datasets: [{
                    data: dataDias.map(r => r.domicilios),
                    backgroundColor: dataDias.map(r =>
                        r.domicilios === maxDom ? '#e67e22' : '#fbd5a8'
                    ),
                    borderRadius: 6,
                    borderSkipped: false,
                }],
            },
            options: { ...CHART_DEFAULTS },
        });
    }

    // ── Chart 2: Domicilios + pedidos por período ──────────
    if (dataEvol?.length) {
        const labels     = dataEvol.map(r => fmtLabel(r.periodo, agrupacion));
        const domicilios = dataEvol.map(r => r.domicilios);
        const pedidos    = dataEvol.map(r => r.pedidos);

        _chartEvol = new Chart(document.getElementById('chart-evolucion'), {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Domicilios',
                        data: domicilios,
                        backgroundColor: '#fbd5a8',
                        borderColor: '#e67e22',
                        borderWidth: 1.5,
                        borderRadius: 4,
                        borderSkipped: false,
                    },
                    {
                        label: 'Pedidos',
                        data: pedidos,
                        type: 'line',
                        borderColor: '#2980b9',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: '#2980b9',
                        tension: 0.35,
                        yAxisID: 'y',
                    },
                ],
            },
            options: {
                ...CHART_DEFAULTS,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { font: { size: 11 }, boxWidth: 12, color: '#666' },
                    },
                },
                scales: {
                    ...CHART_DEFAULTS.scales,
                    x: { ...CHART_DEFAULTS.scales.x, ticks: { font: { size: 10 }, color: '#888', maxRotation: 45 } },
                },
            },
        });
    }

    // ── Chart 3: Evolución de ventas ───────────────────────
    if (dataEvol?.length) {
        const labels = dataEvol.map(r => fmtLabel(r.periodo, agrupacion));
        const ventas = dataEvol.map(r => r.ventas);

        _chartVentas = new Chart(document.getElementById('chart-ventas'), {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    data: ventas,
                    borderColor: '#27ae60',
                    backgroundColor: 'rgba(39,174,96,0.08)',
                    borderWidth: 2.5,
                    pointRadius: 3,
                    pointBackgroundColor: '#27ae60',
                    tension: 0.4,
                    fill: true,
                }],
            },
            options: {
                ...CHART_DEFAULTS,
                scales: {
                    ...CHART_DEFAULTS.scales,
                    y: {
                        ...CHART_DEFAULTS.scales.y,
                        ticks: {
                            font: { size: 11 }, color: '#aaa',
                            callback: v => '$' + Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 0 }).format(v),
                        },
                    },
                    x: { ...CHART_DEFAULTS.scales.x, ticks: { font: { size: 10 }, color: '#888', maxRotation: 45 } },
                },
            },
        });
    }
}

// ── Inicio ────────────────────────────────────────────────────
cargar();
