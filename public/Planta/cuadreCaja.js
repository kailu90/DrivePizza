/**
 * cuadreCaja.js — Planta / DrivePizza
 *
 * Módulo de Cuadre de Caja: registro y visualización de ingresos y egresos.
 * Permite cruzar los pagos recibidos de sedes contra los pagos realizados
 * a proveedores y colaboradores, generando un balance por período mensual.
 *
 * Tabla Supabase: `caja_movimientos`
 * Columnas:
 *   id BIGSERIAL, tipo TEXT (ingreso|egreso), categoria TEXT,
 *   concepto TEXT, monto NUMERIC(12,2), fecha DATE,
 *   sede TEXT, proveedor_id BIGINT, proveedor_nombre TEXT,
 *   metodo_pago TEXT, comprobante TEXT, notas TEXT,
 *   usuario TEXT, estado TEXT (pendiente|pagado), periodo_ref TEXT,
 *   created_at TIMESTAMPTZ
 *
 * Categorías ingreso : pago_sede | otro_ingreso
 * Categorías egreso  : proveedor | colaborador | nomina | servicios | impuestos | otro
 *
 * estado='pendiente' → importado desde liquidación, aún no cobrado
 * estado='pagado'    → cobrado / registrado manualmente
 *
 * Roles con acceso   : planta, planta-admin, admin
 * Roles que eliminan : planta-admin, admin
 */

import { supabase }              from '../Api/supabaseConfig.js';
import { verificarAccesoPlanta } from '../Auth/plantaAuth.js';
import { CargarHeader, CargarSidebar, CargarFooter, capitalizarSede, revelarSplash }
    from '../DrivePizza/Shared/components.js';
import { getSedes }     from '../DrivePizza/Shared/sedesService.js';
import { CAJA_CATEGORIAS } from './planta.config.js';
import {
    getPeriodo, getNumeroPeriodo, getPeriodoParaFecha,
    pedidosLiquidables, devolucionesLiquidables, colFechaToUTC,
} from '../Shared/semanas.js';

CargarSidebar();

// ── Estado global ─────────────────────────────────────────────────────────────
let _usuario       = 'Admin';
let _esAdmin       = false;      // planta-admin | admin — puede eliminar movimientos
let _periodo       = _periodoActual();   // { year, month }
let _todos         = [];         // movimientos del período cargados desde BD
let _sedes         = [];         // lista de sedes para el select del dialog
let _proveedores   = [];         // lista de proveedores activos para el select del dialog
let _tipoDialog    = 'ingreso';  // tipo seleccionado actualmente en el dialog

// Vista activa
let _vistaActual = 'resumen';

// Estado del dashboard gerencial
let _gerFecha = _toISO(new Date());   // fecha seleccionada (YYYY-MM-DD)

// Datos de la vista Ventas (calculados, no persisten en BD solos)
let _ventasDatos = [];   // [{ numSemana, desde, hasta, periodoRef, sedes:[...] }]

// Estado del dialog de liquidación
let _liqYear    = new Date().getFullYear();   // año del mes seleccionado
let _liqMonth   = new Date().getMonth() + 1; // mes seleccionado (1-12)
let _liqDatos   = [];            // [{ sede, totalPed, totalDev, totalNeto, periodoRef, hastaDate, numSemana, yaImportado }]

// Estado del dialog de confirmación de pago
let _confirmandoId = null;       // id del movimiento en proceso de confirmación

// Estado del dialog de abono
let _abonoCtx = null;  // { semIdx, sedeName, periodoRef, totalNeto, refId }

// ── Auth ──────────────────────────────────────────────────────────────────────
verificarAccesoPlanta(async ({ username, rol }) => {
    _usuario = username || 'Admin';
    _esAdmin = ['planta-admin', 'admin'].includes(rol);
    CargarHeader(capitalizarSede('Planta'));
    CargarFooter();
    _init().catch(err => { console.error('[cuadreCaja] init error:', err); revelarSplash(); });
});

// ── Inicialización ────────────────────────────────────────────────────────────
async function _init() {
    _actualizarLabelPeriodo();
    _poblarFiltrosCat();

    // Cargar sedes y proveedores en paralelo
    const [sedesData, { data: provData, error: errProv }] = await Promise.all([
        getSedes(),
        supabase.from('proveedores').select('id, nombre').eq('active', true).order('nombre'),
    ]);
    if (errProv) console.error('[cuadreCaja] proveedores:', errProv);

    _sedes       = sedesData || [];
    _proveedores = provData  || [];

    // Mostrar ítems de sidebar exclusivos para admin
    if (_esAdmin) {
        document.querySelectorAll('.sidebar__item--fin-admin').forEach(el => el.style.display = '');
    }

    // Leer vista inicial desde query param ?v= y setearla ANTES de cargar datos
    // para que _renderVistaActual() en _cargarMovimientos() renderice la vista correcta
    const urlVista = new URL(location.href).searchParams.get('v');
    _vistaActual = (urlVista && _VISTAS.includes(urlVista)) ? urlVista : 'resumen';

    // Interceptar clicks en items financieros del sidebar para navegar sin recargar
    document.getElementById('sidebar-container').addEventListener('click', e => {
        const link = e.target.closest('[data-fin-vista]');
        if (!link) return;
        e.preventDefault();
        _switchVista(link.dataset.finVista);
    });

    // Poblar select de sedes en dialogs (movimiento y entrega)
    ['caj-sede', 'ent-sede'].forEach(id => {
        const sel = document.getElementById(id);
        _sedes.forEach(s => {
            const opt = document.createElement('option');
            opt.value       = s.name.toLowerCase();
            opt.textContent = s.name;
            sel.appendChild(opt);
        });
    });

    // Poblar select de proveedores en el dialog principal
    const selProv = document.getElementById('caj-proveedor');
    _proveedores.forEach(p => {
        const opt = document.createElement('option');
        opt.value       = p.id;
        opt.textContent = p.nombre;
        selProv.appendChild(opt);
    });

    await _cargarMovimientos();

    // Activar vista ANTES de revelar el splash para evitar el flash de resumen
    _switchVista(_vistaActual);
    revelarSplash();

    _iniciarRealtime();
}

/** Suscripción Realtime a caja_movimientos — recarga al detectar cambios externos. */
function _iniciarRealtime() {
    supabase
        .channel('caja_movimientos_changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'caja_movimientos' },
            () => {
                _cargarMovimientos();
                if (_vistaActual === 'conciliacion') _cargarConciliacion();
            }
        )
        .subscribe();
}

// ── Período mensual ───────────────────────────────────────────────────────────
function _periodoActual() {
    const hoy = new Date();
    return { year: hoy.getFullYear(), month: hoy.getMonth() + 1 };
}

function _actualizarLabelPeriodo() {
    const MESES = [
        'Enero','Febrero','Marzo','Abril','Mayo','Junio',
        'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
    ];
    document.getElementById('caj-period-label').textContent =
        `${MESES[_periodo.month - 1]} ${_periodo.year}`;
}

/** Retorna { desde, hasta } como strings ISO 'YYYY-MM-DD' para filtrar por fecha. */
function _rangoFechas() {
    const { year, month } = _periodo;
    const desde    = `${year}-${String(month).padStart(2, '0')}-01`;
    const sigMes   = new Date(year, month, 1);
    const hasta    = `${sigMes.getFullYear()}-${String(sigMes.getMonth() + 1).padStart(2, '0')}-01`;
    return { desde, hasta };
}

/** Retorna { periodoRef, periodoNext } como 'YYYY-MM' para filtrar por periodo_ref. */
function _rangoPeriodo() {
    const { year, month } = _periodo;
    const mes        = String(month).padStart(2, '0');
    const sigMes     = new Date(year, month, 1);
    const periodoRef  = `${year}-${mes}`;
    const periodoNext = `${sigMes.getFullYear()}-${String(sigMes.getMonth() + 1).padStart(2, '0')}`;
    return { periodoRef, periodoNext };
}

/**
 * Determina si un movimiento pertenece al período actualmente visualizado.
 * Egresos con periodo_ref explícito se clasifican por ese campo; el resto por fecha.
 */
function _enPeriodoActual(mov) {
    const { periodoRef, periodoNext } = _rangoPeriodo();
    if (mov.tipo === 'egreso' && mov.periodo_ref) {
        return mov.periodo_ref >= periodoRef && mov.periodo_ref < periodoNext;
    }
    const { desde, hasta } = _rangoFechas();
    return mov.fecha >= desde && mov.fecha < hasta;
}

document.getElementById('caj-prev').addEventListener('click', () => {
    _periodo.month--;
    if (_periodo.month < 1) { _periodo.month = 12; _periodo.year--; }
    _actualizarLabelPeriodo();
    _cargarMovimientos();
    if (_vistaActual === 'ingresos' || _vistaActual === 'resumen') _cargarVentas();
    if (_vistaActual === 'entregas')     _cargarEntregas();
    if (_vistaActual === 'conciliacion') _cargarConciliacion();
});

document.getElementById('caj-next').addEventListener('click', () => {
    _periodo.month++;
    if (_periodo.month > 12) { _periodo.month = 1; _periodo.year++; }
    _actualizarLabelPeriodo();
    _cargarMovimientos();
    if (_vistaActual === 'ingresos' || _vistaActual === 'resumen') _cargarVentas();
    if (_vistaActual === 'entregas')     _cargarEntregas();
    if (_vistaActual === 'conciliacion') _cargarConciliacion();
});

// ── Carga de datos ────────────────────────────────────────────────────────────
async function _cargarMovimientos() {
    const { desde, hasta }         = _rangoFechas();
    const { periodoRef, periodoNext } = _rangoPeriodo();

    // Incluye:
    //  a) egresos con periodo_ref explícito dentro del período contable
    //  b) cualquier registro sin periodo_ref cuya fecha cae en el mes
    const filtro = `and(periodo_ref.gte.${periodoRef},periodo_ref.lt.${periodoNext}),` +
                   `and(periodo_ref.is.null,fecha.gte.${desde},fecha.lt.${hasta})`;

    const { data, error } = await supabase
        .from('caja_movimientos')
        .select(`
            id, tipo, categoria, concepto, monto, fecha,
            sede, proveedor_nombre, metodo_pago, comprobante,
            notas, usuario, estado, periodo_ref, recepcion_id, created_at
        `)
        .or(filtro)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[cuadreCaja] cargar movimientos:', error);
        return;
    }

    _todos = data || [];
    _renderVistaActual();
}

/** Renderiza solo la vista activa, evitando trabajo innecesario en otras vistas. */
function _renderVistaActual() {
    if (_vistaActual === 'resumen')  _renderResumen();
    if (_vistaActual === 'gastos')   _renderTabla();
    if (_vistaActual === 'ingresos') _renderTablaIngresos();
    if (_vistaActual === 'informes') _renderInforme();
}

// ── Resumen (4 cards) ─────────────────────────────────────────────────────────
function _renderResumen() {
    const ingresos   = _todos.filter(m => m.tipo === 'ingreso');
    const egresos    = _todos.filter(m => m.tipo === 'egreso');

    const cobrado    = ingresos.filter(m => m.estado !== 'pendiente');

    const totalCobrado   = cobrado.reduce((s, m)   => s + Number(m.monto), 0);
    const totalEgr       = egresos.reduce((s, m)   => s + Number(m.monto), 0);
    const balance        = totalCobrado - totalEgr;

    // "Por Cobrar" se calcula en _renderKPIs() (necesita _ventasDatos)
    document.getElementById('caj-total-cobrado').textContent    = _fmt(totalCobrado);
    document.getElementById('caj-total-egresos').textContent    = _fmt(totalEgr);
    document.getElementById('caj-total-balance').textContent    = _fmt(Math.abs(balance));

    document.getElementById('caj-count-por-cobrar').textContent = '';
    document.getElementById('caj-count-cobrado').textContent    = _plural(cobrado.length);
    document.getElementById('caj-count-egresos').textContent    = _plural(egresos.length);
    document.getElementById('caj-count-total').textContent      = _plural(_todos.length);

    const cardBalance = document.getElementById('caj-card-balance');
    cardBalance.classList.remove('positivo', 'negativo');
    cardBalance.classList.add(balance >= 0 ? 'positivo' : 'negativo');

    _renderKPIs();
    _renderMedioPago();
}

// ── Resumen por medio de pago ─────────────────────────────────────────────────
function _renderMedioPago() {
    const BANCO = new Set(['transferencia', 'tarjeta', 'cheque']);
    const esBanco   = m => BANCO.has(m.metodo_pago);
    const esEfectivo = m => m.metodo_pago === 'efectivo';
    const pagado    = m => m.estado !== 'pendiente';

    // Ingresos: solo los ya cobrados (estado != pendiente)
    // Egresos: todos los registrados
    const ingB = _todos.filter(m => m.tipo === 'ingreso' && pagado(m) && esBanco(m))
                       .reduce((s, m) => s + Number(m.monto), 0);
    const egrB = _todos.filter(m => m.tipo === 'egreso' && esBanco(m))
                       .reduce((s, m) => s + Number(m.monto), 0);
    const sldB = ingB - egrB;
    const mrgB = ingB > 0 ? (sldB / ingB * 100) : null;

    const ingE = _todos.filter(m => m.tipo === 'ingreso' && pagado(m) && esEfectivo(m))
                       .reduce((s, m) => s + Number(m.monto), 0);
    const egrE = _todos.filter(m => m.tipo === 'egreso' && esEfectivo(m))
                       .reduce((s, m) => s + Number(m.monto), 0);
    const sldE = ingE - egrE;
    const mrgE = ingE > 0 ? (sldE / ingE * 100) : null;

    const ingT = ingB + ingE;
    const egrT = egrB + egrE;
    const sldT = sldB + sldE;
    const mrgT = ingT > 0 ? (sldT / ingT * 100) : null;

    const fmtSaldo = (v) => {
        const cls = v >= 0 ? 'caj-medio-pos' : 'caj-medio-neg';
        return `<span class="${cls}">${v < 0 ? '-' : ''}$${Math.abs(Math.round(v)).toLocaleString('es-CO')}</span>`;
    };
    const fmtMargen = (v) => {
        if (v === null) return '<span class="caj-medio-badge caj-medio-badge--neu">—</span>';
        const cls = v >= 0 ? 'caj-medio-badge--pos' : 'caj-medio-badge--neg';
        return `<span class="caj-medio-badge ${cls}">${v >= 0 ? '' : ''}${v.toFixed(1)}%</span>`;
    };
    const fmtVal = (v) => `$${Math.round(v).toLocaleString('es-CO')}`;

    const svgBanco = `<svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/><path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clip-rule="evenodd"/></svg>`;
    const svgEfec  = `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/></svg>`;

    document.getElementById('caj-medio-tbody').innerHTML = `
        <tr>
            <td><div class="caj-medio-row-label">
                <div class="caj-medio-row-icon caj-medio-row-icon--banco">${svgBanco}</div>Banco
            </div></td>
            <td>${fmtVal(ingB)}</td>
            <td>${fmtVal(egrB)}</td>
            <td>${fmtSaldo(sldB)}</td>
            <td>${fmtMargen(mrgB)}</td>
        </tr>
        <tr>
            <td><div class="caj-medio-row-label">
                <div class="caj-medio-row-icon caj-medio-row-icon--efectivo">${svgEfec}</div>Efectivo
            </div></td>
            <td>${fmtVal(ingE)}</td>
            <td>${fmtVal(egrE)}</td>
            <td>${fmtSaldo(sldE)}</td>
            <td>${fmtMargen(mrgE)}</td>
        </tr>
        <tr class="caj-medio-total">
            <td>Total</td>
            <td>${fmtVal(ingT)}</td>
            <td>${fmtVal(egrT)}</td>
            <td>${fmtSaldo(sldT)}</td>
            <td>${fmtMargen(mrgT)}</td>
        </tr>`;

    const saldoBancoHtml    = `<strong class="${sldB >= 0 ? 'caj-medio-pos' : 'caj-medio-neg'}">${sldB < 0 ? '-' : ''}$${Math.abs(Math.round(sldB)).toLocaleString('es-CO')}</strong>`;
    const saldoEfectivoHtml = `<strong class="${sldE >= 0 ? 'caj-medio-pos' : 'caj-medio-neg'}">${sldE < 0 ? '-' : ''}$${Math.abs(Math.round(sldE)).toLocaleString('es-CO')}</strong>`;
    const balanceHtml       = `<strong class="${sldT >= 0 ? 'caj-medio-pos' : 'caj-medio-neg'}">${sldT < 0 ? '-' : ''}$${Math.abs(Math.round(sldT)).toLocaleString('es-CO')}</strong>`;

    document.getElementById('caj-medio-quick-list').innerHTML = `
        <div class="caj-medio-quick-row"><span>Total ingresos</span><strong>$${Math.round(ingT).toLocaleString('es-CO')}</strong></div>
        <div class="caj-medio-quick-row"><span>Total gastos</span><strong>$${Math.round(egrT).toLocaleString('es-CO')}</strong></div>
        <div class="caj-medio-quick-row"><span>Saldo en bancos</span>${saldoBancoHtml}</div>
        <div class="caj-medio-quick-row"><span>Saldo en efectivo</span>${saldoEfectivoHtml}</div>
        <div class="caj-medio-quick-balance"><span>Balance general</span>${balanceHtml}</div>`;
}

// ── KPI Cards globales ────────────────────────────────────────────────────────
function _renderKPIs() {
    const ventas   = _ventasDatos.reduce((s, sem) => s + sem.sedes.reduce((ss, d) => ss + d.totalNeto, 0), 0);
    const egresos  = _todos.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0);
    const utilidad = ventas - egresos;
    const margen   = ventas > 0 ? (utilidad / ventas * 100).toFixed(1) : null;

    // Por Cobrar = ventas del mes - lo ya cobrado a sedes (pagos registrados manualmente)
    const cobradoSedes = _todos
        .filter(m => m.tipo === 'ingreso' && m.categoria === 'pago_sede' && m.estado !== 'pendiente')
        .reduce((s, m) => s + Number(m.monto), 0);
    const porCobrar = Math.max(0, ventas - cobradoSedes);

    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    setEl('caj-total-por-cobrar', ventas ? _fmt(porCobrar) : '—');
    setEl('caj-kpi-ventas', ventas ? _fmt(ventas) : '—');
    setEl('caj-kpi-ventas-sub',
        _ventasDatos.length
            ? `${_ventasDatos.length} semana${_ventasDatos.length !== 1 ? 's' : ''} del mes`
            : 'Sin datos aún');

    const elUtil = document.getElementById('caj-kpi-utilidad');
    if (elUtil) {
        elUtil.textContent = (ventas || egresos) ? _fmt(Math.abs(utilidad)) : '—';
        elUtil.style.color = utilidad >= 0 ? 'var(--color-primario)' : '#c05621';
    }

    const elMargen = document.getElementById('caj-kpi-utilidad-margen');
    if (elMargen) {
        if (margen !== null) {
            elMargen.textContent = `Margen: ${margen}%`;
            elMargen.style.display = '';
        } else {
            elMargen.style.display = 'none';
        }
    }
}

// ── Sidebar Ventas (top sede, alertas, resumen) ────────────────────────────────
function _renderSidebar() {
    // Totales por sede del mes completo
    const totalesSede = {};
    _ventasDatos.forEach(sem => {
        sem.sedes.forEach(d => {
            totalesSede[d.sede] = (totalesSede[d.sede] || 0) + d.totalNeto;
        });
    });
    const sortedSedes = Object.entries(totalesSede).sort((a, b) => b[1] - a[1]);
    const grandTotal  = sortedSedes.reduce((s, [, v]) => s + v, 0);

    // ── Distribución de utilidades ────────────────────────────────────────────
    const elSocios = document.getElementById('caj-side-socios');
    if (elSocios) {
        const egresosTotal = _todos.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0);
        const utilidad = grandTotal - egresosTotal;

        const SOCIOS = [
            { nombre: 'Sandro Salazar',  pct: 50 },
            { nombre: 'Jhonn Andersson', pct: 40 },
            { nombre: 'Esteban Lopez',   pct: 10 },
        ];

        const filas = SOCIOS.map(s => {
            const valor = utilidad * s.pct / 100;
            const cls   = valor >= 0 ? 'caj-medio-pos' : 'caj-medio-neg';
            return `<tr>
                <td class="caj-dist-nombre">${_esc(s.nombre)}</td>
                <td class="caj-dist-pct">${s.pct}%</td>
                <td class="caj-dist-valor ${cls}">${valor < 0 ? '-' : ''}$${Math.abs(Math.round(valor)).toLocaleString('es-CO')}</td>
            </tr>`;
        }).join('');

        const totCls = utilidad >= 0 ? 'caj-medio-pos' : 'caj-medio-neg';
        elSocios.innerHTML = `
            <table class="caj-dist-tabla">
                <thead><tr>
                    <th>Socio</th><th>%</th><th>Valor</th>
                </tr></thead>
                <tbody>${filas}</tbody>
                <tfoot><tr>
                    <td class="caj-dist-nombre" style="font-weight:700">Utilidad total</td>
                    <td class="caj-dist-pct" style="font-weight:700">100%</td>
                    <td class="caj-dist-valor ${totCls}" style="font-weight:700">${utilidad < 0 ? '-' : ''}$${Math.abs(Math.round(utilidad)).toLocaleString('es-CO')}</td>
                </tr></tfoot>
            </table>`;
    }

    // ── Alertas ───────────────────────────────────────────────────────────────
    const pendientes = _todos.filter(m =>
        m.tipo === 'ingreso' && m.categoria === 'pago_sede' && m.estado === 'pendiente'
    );
    const elAlertas = document.getElementById('caj-side-alertas');
    if (elAlertas) {
        if (pendientes.length) {
            const uniqSedes = [...new Set(pendientes.map(m => m.sede))];
            elAlertas.innerHTML = uniqSedes.map(sede =>
                `<div class="caj-side-alerta">
                    <span class="caj-side-alerta-dot"></span>
                    ${_esc(capitalizarSede(sede || '—'))} — cierre pendiente
                 </div>`
            ).join('');
        } else {
            elAlertas.innerHTML = '<p class="caj-side-empty">Sin alertas pendientes</p>';
        }
    }

    // ── Resumen financiero ────────────────────────────────────────────────────
    const ventas   = grandTotal;
    const egresos  = _todos.filter(m => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0);
    const cobrado  = _todos.filter(m => m.tipo === 'ingreso' && m.estado !== 'pendiente').reduce((s, m) => s + Number(m.monto), 0);
    const utilidad = ventas - egresos;
    const margen   = ventas > 0 ? (utilidad / ventas * 100).toFixed(1) + '%' : '—';
    const utColor  = utilidad >= 0 ? 'var(--color-primario)' : '#c05621';

    const elResumen = document.getElementById('caj-side-resumen');
    if (elResumen) {
        elResumen.innerHTML = `
            <div class="caj-side-res-row"><span>Ventas del mes</span><strong>${_fmt(ventas)}</strong></div>
            <div class="caj-side-res-row"><span>Gastos del mes</span><strong>${_fmt(egresos)}</strong></div>
            <div class="caj-side-res-row"><span>Cobrado</span><strong style="color:var(--color-primario)">${_fmt(cobrado)}</strong></div>
            <div class="caj-side-res-row caj-side-res-row--sep"></div>
            <div class="caj-side-res-row caj-side-res-row--total">
                <span>Utilidad</span>
                <strong style="color:${utColor}">${_fmt(Math.abs(utilidad))}</strong>
            </div>
            <div class="caj-side-res-row"><span>Margen</span><strong>${margen}</strong></div>`;
    }
}

// ── Tabla P&L — Balance del período ──────────────────────────────────────────
function _renderPnL() {
    const el = document.getElementById('caj-pnl-contenido');
    if (!el) return;

    const venta = _ventasDatos.reduce((s, sem) => s + sem.sedes.reduce((ss, d) => ss + d.totalNeto, 0), 0);

    const sumCat = cat => _todos
        .filter(m => m.tipo === 'egreso' && m.categoria === cat)
        .reduce((s, m) => s + Number(m.monto), 0);

    const compras   = sumCat('proveedor');
    const nomina    = sumCat('nomina');
    const fijos     = sumCat('servicios');
    const impuestos = sumCat('impuestos');
    const bancarios = sumCat('gastos_bancarios');
    const otros     = sumCat('colaborador') + sumCat('otro');
    const totalEgr  = compras + nomina + fijos + impuestos + bancarios + otros;
    const utilidad  = venta - totalEgr;

    const pct = (v) => venta > 0 ? (v / venta * 100).toFixed(1) + '%' : '—';

    const fila = (label, valor, esTotal = false, esVenta = false) => {
        const valFmt = `$${Math.round(valor).toLocaleString('es-CO')}`;
        const pctFmt = pct(valor);
        if (esVenta) return `
            <tr class="caj-pnl-fila-venta">
                <td>${label}</td>
                <td>${valFmt}</td>
                <td>100%</td>
            </tr>`;
        if (esTotal) {
            const cls = valor >= 0 ? 'caj-medio-pos' : 'caj-medio-neg';
            return `
            <tr class="caj-pnl-fila-total">
                <td>${label}</td>
                <td class="${cls}">${valor < 0 ? '-' : ''}$${Math.abs(Math.round(valor)).toLocaleString('es-CO')}</td>
                <td class="${cls}">${pct(Math.abs(valor))}</td>
            </tr>`;
        }
        return `
            <tr class="caj-pnl-fila${valor === 0 ? ' caj-pnl-fila--cero' : ''}">
                <td>${label}</td>
                <td>${valFmt}</td>
                <td>${pctFmt}</td>
            </tr>`;
    };

    if (!venta && !totalEgr) {
        el.innerHTML = '<p class="caj-side-empty" style="padding:2rem 0">Sin datos este período</p>';
        return;
    }

    el.innerHTML = `
        <table class="caj-pnl-tabla">
            <thead>
                <tr>
                    <th>Concepto</th>
                    <th>Valor</th>
                    <th>% Venta</th>
                </tr>
            </thead>
            <tbody>
                ${fila('Venta', venta, false, true)}
                <tr class="caj-pnl-separador"><td colspan="3"></td></tr>
                ${fila('Compras', compras)}
                ${fila('Nómina', nomina)}
                ${fila('Gastos Fijos', fijos)}
                ${fila('Impuestos', impuestos)}
                ${fila('Gastos Bancarios', bancarios)}
                ${fila('Otros', otros)}
                ${fila('Ingreso Bruto', utilidad, true)}
            </tbody>
        </table>`;
}

// ── Tabla de movimientos ──────────────────────────────────────────────────────
function _renderTabla() {
    _renderKPIsGastos();

    const fFecha    = document.getElementById('gf-fecha')?.value    || '';
    const fEstado   = document.getElementById('gf-estado')?.value   || '';
    const fCat      = document.getElementById('gf-cat')?.value      || '';
    const fConcepto = (document.getElementById('gf-concepto')?.value || '').toLowerCase().trim();
    const fRef      = (document.getElementById('gf-ref')?.value      || '').toLowerCase().trim();
    const fMetodo   = document.getElementById('gf-metodo')?.value   || '';
    const fMonto    = (document.getElementById('gf-monto')?.value    || '').trim();

    let lista = _todos.filter(m => m.tipo === 'egreso');
    if (fFecha)    lista = lista.filter(m => m.fecha === fFecha);
    if (fEstado)   lista = lista.filter(m => m.estado === fEstado);
    if (fCat)      lista = lista.filter(m => m.categoria === fCat);
    if (fConcepto) lista = lista.filter(m => (m.concepto || '').toLowerCase().includes(fConcepto));
    if (fRef) {
        lista = lista.filter(m => {
            const h = [(m.proveedor_nombre || ''), (m.sede || ''), (m.comprobante || '')].join(' ').toLowerCase();
            return h.includes(fRef);
        });
    }
    if (fMetodo)   lista = lista.filter(m => m.metodo_pago === fMetodo);
    if (fMonto)    lista = lista.filter(m => Number(m.monto).toLocaleString('es-CO').includes(fMonto) || String(m.monto).includes(fMonto));

    const tbody = document.getElementById('caj-tbody');
    tbody.innerHTML = '';

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="caj-empty">Sin gastos en este período.</td></tr>`;
        return;
    }

    lista.forEach(m => {
        const fecha    = _formatFecha(m.fecha);
        const catLabel = _labelCategoria(m.categoria);
        const ref      = m.proveedor_nombre
            || (m.sede ? capitalizarSede(m.sede) : '')
            || m.comprobante
            || '';

        const esPendiente = m.estado === 'pendiente';
        const estadoBadge = esPendiente
            ? '<span class="caj-badge caj-badge--pendiente">Pendiente</span>'
            : '<span class="caj-badge caj-badge--pagado">Pagado</span>';

        const acciones = [];
        if (_esAdmin) {
            acciones.push(`<button class="caj-btn-delete" data-id="${m.id}" title="Eliminar movimiento">✕</button>`);
        }

        const conceptoHtml = `${_esc(m.concepto)}${m.recepcion_id
            ? ' <span class="caj-badge-factura">Factura</span>'
            : ''}`;

        const tr = document.createElement('tr');
        if (esPendiente) tr.classList.add('caj-row--pendiente');
        tr.innerHTML = `
            <td>${fecha}</td>
            <td>${estadoBadge}</td>
            <td>${catLabel}</td>
            <td>${conceptoHtml}</td>
            <td style="color:#888;font-size:1.2rem">${_esc(ref)}</td>
            <td style="text-transform:capitalize">${m.metodo_pago || '—'}</td>
            <td class="caj-monto--egreso">$${Number(m.monto).toLocaleString('es-CO')}</td>
            <td class="caj-td-acciones">${acciones.join('')}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ── KPI cards vista Ingresos ──────────────────────────────────────────────────
function _renderKPIsIngresos() {
    const BANCO = new Set(['transferencia', 'tarjeta', 'cheque']);
    const cobrados = _todos.filter(m => m.tipo === 'ingreso' && m.estado !== 'pendiente');

    const efectivo = cobrados.filter(m => m.metodo_pago === 'efectivo')
                             .reduce((s, m) => s + Number(m.monto), 0);
    const bancos   = cobrados.filter(m => BANCO.has(m.metodo_pago))
                             .reduce((s, m) => s + Number(m.monto), 0);
    const total    = efectivo + bancos;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    set('ing-kpi-efectivo',     efectivo ? _fmt(efectivo) : '—');
    set('ing-kpi-efectivo-sub', efectivo ? `${cobrados.filter(m => m.metodo_pago === 'efectivo').length} movimientos` : '');
    set('ing-kpi-bancos',       bancos   ? _fmt(bancos)   : '—');
    set('ing-kpi-bancos-sub',   bancos   ? `${cobrados.filter(m => BANCO.has(m.metodo_pago)).length} movimientos`    : '');
    set('ing-kpi-balance',      total    ? _fmt(total)    : '—');
    set('ing-kpi-balance-sub',  total    ? `${cobrados.length} movimientos en total` : '');
}

// ── KPI cards vista Gastos ────────────────────────────────────────────────────
function _renderKPIsGastos() {
    const BANCO   = new Set(['transferencia', 'tarjeta', 'cheque']);
    const egresos = _todos.filter(m => m.tipo === 'egreso');

    const efectivo = egresos.filter(m => m.metodo_pago === 'efectivo')
                            .reduce((s, m) => s + Number(m.monto), 0);
    const bancos   = egresos.filter(m => BANCO.has(m.metodo_pago))
                            .reduce((s, m) => s + Number(m.monto), 0);
    const total    = egresos.reduce((s, m) => s + Number(m.monto), 0);

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    set('gas-kpi-efectivo',     efectivo ? _fmt(efectivo) : '—');
    set('gas-kpi-efectivo-sub', efectivo ? `${egresos.filter(m => m.metodo_pago === 'efectivo').length} movimientos` : '');
    set('gas-kpi-bancos',       bancos   ? _fmt(bancos)   : '—');
    set('gas-kpi-bancos-sub',   bancos   ? `${egresos.filter(m => BANCO.has(m.metodo_pago)).length} movimientos`    : '');
    set('gas-kpi-total',        total    ? _fmt(total)    : '—');
    set('gas-kpi-total-sub',    total    ? `${egresos.length} movimientos en total` : '');
}

// ── Tabla de ingresos (vista Ingresos) ────────────────────────────────────────
function _renderTablaIngresos() {
    _renderKPIsIngresos();

    const fFecha    = document.getElementById('if-fecha')?.value    || '';
    const fEstado   = document.getElementById('if-estado')?.value   || '';
    const fCat      = document.getElementById('if-cat')?.value      || '';
    const fConcepto = (document.getElementById('if-concepto')?.value || '').toLowerCase().trim();
    const fRef      = (document.getElementById('if-ref')?.value      || '').toLowerCase().trim();
    const fMetodo   = document.getElementById('if-metodo')?.value   || '';
    const fMonto    = (document.getElementById('if-monto')?.value    || '').trim();

    let lista = _todos.filter(m => m.tipo === 'ingreso');
    if (fFecha)    lista = lista.filter(m => m.fecha === fFecha);
    if (fEstado)   lista = lista.filter(m => m.estado === fEstado);
    if (fCat)      lista = lista.filter(m => m.categoria === fCat);
    if (fConcepto) lista = lista.filter(m => (m.concepto || '').toLowerCase().includes(fConcepto));
    if (fRef) {
        lista = lista.filter(m => {
            const h = [(m.proveedor_nombre || ''), (m.sede || ''), (m.comprobante || '')].join(' ').toLowerCase();
            return h.includes(fRef);
        });
    }
    if (fMetodo)   lista = lista.filter(m => m.metodo_pago === fMetodo);
    if (fMonto)    lista = lista.filter(m => Number(m.monto).toLocaleString('es-CO').includes(fMonto) || String(m.monto).includes(fMonto));

    const tbody = document.getElementById('ing-tbody');
    tbody.innerHTML = '';

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="caj-empty">Sin ingresos registrados en este período.</td></tr>`;
        return;
    }

    lista.forEach(m => {
        const fecha      = _formatFecha(m.fecha);
        const catLabel   = _labelCategoria(m.categoria);
        const ref        = m.proveedor_nombre
            || (m.sede ? capitalizarSede(m.sede) : '')
            || m.comprobante || '';
        const esPendiente = m.estado === 'pendiente';

        const estadoBadge = esPendiente
            ? '<span class="caj-badge caj-badge--pendiente">Pendiente</span>'
            : '<span class="caj-badge caj-badge--pagado">Pagado</span>';

        const acciones = [];
        if (esPendiente) {
            acciones.push(`<button class="caj-btn-confirmar" data-id="${m.id}" title="Confirmar pago recibido">✓ Confirmar</button>`);
        }
        if (_esAdmin) {
            acciones.push(`<button class="caj-btn-delete" data-id="${m.id}" title="Eliminar">✕</button>`);
        }

        const conceptoHtml = `${_esc(m.concepto)}${m.recepcion_id
            ? ' <span class="caj-badge-factura">Factura</span>' : ''}`;

        const tr = document.createElement('tr');
        if (esPendiente) tr.classList.add('caj-row--pendiente');
        tr.innerHTML = `
            <td>${fecha}</td>
            <td>${estadoBadge}</td>
            <td>${catLabel}</td>
            <td>${conceptoHtml}</td>
            <td style="color:#888;font-size:1.2rem">${_esc(ref)}</td>
            <td style="text-transform:capitalize">${m.metodo_pago || '—'}</td>
            <td class="caj-monto--ingreso">$${Number(m.monto).toLocaleString('es-CO')}</td>
            <td class="caj-td-acciones">${acciones.join('')}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ── Filtros por columna ───────────────────────────────────────────────────────
['gf-estado','gf-cat','gf-metodo'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', _renderTabla));
['gf-fecha','gf-concepto','gf-ref','gf-monto'].forEach(id =>
    document.getElementById(id)?.addEventListener('input', _renderTabla));

['if-estado','if-cat','if-metodo'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', _renderTablaIngresos));
['if-fecha','if-concepto','if-ref','if-monto'].forEach(id =>
    document.getElementById(id)?.addEventListener('input', _renderTablaIngresos));

/** Pobla los selects de categoría en las filas de filtros. */
function _poblarFiltrosCat() {
    const addOpts = (selId, cats) => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        cats.forEach(c => {
            const opt = document.createElement('option');
            opt.value       = c.value;
            opt.textContent = c.label;
            sel.appendChild(opt);
        });
    };
    addOpts('gf-cat', CAJA_CATEGORIAS.egreso);
    addOpts('if-cat', CAJA_CATEGORIAS.ingreso);
}

// ── Acciones en tabla (eliminar + confirmar) ──────────────────────────────────
async function _onMovimientoClick(e) {
    // Confirmar pago pendiente
    const confBtn = e.target.closest('.caj-btn-confirmar');
    if (confBtn) {
        _abrirDialogConfirmar(parseInt(confBtn.dataset.id));
        return;
    }

    // Eliminar (solo admin)
    const delBtn = e.target.closest('.caj-btn-delete');
    if (!delBtn || !_esAdmin) return;

    const id = parseInt(delBtn.dataset.id);
    if (!confirm('¿Eliminar este movimiento? Esta acción no se puede deshacer.')) return;

    delBtn.disabled = true;

    const { data: deleted, error } = await supabase
        .from('caja_movimientos')
        .delete()
        .eq('id', id)
        .select('id');

    if (error) {
        console.error('[cuadreCaja] eliminar:', error);
        alert('Error al eliminar: ' + error.message);
        delBtn.disabled = false;
        return;
    }

    if (!deleted || deleted.length === 0) {
        alert('No se pudo eliminar. Verificá que tenés permisos de admin en la base de datos.');
        delBtn.disabled = false;
        return;
    }

    _todos = _todos.filter(m => m.id !== id);
    _renderVistaActual();
}

document.getElementById('caj-tbody').addEventListener('click', _onMovimientoClick);
document.getElementById('ing-tbody').addEventListener('click', _onMovimientoClick);

// ── Dialog principal: abrir ───────────────────────────────────────────────────
function _abrirDialog(tipo) {
    _tipoDialog = tipo;
    _actualizarTipoDialog();

    document.getElementById('caj-concepto').value    = '';
    document.getElementById('caj-monto').value       = '';
    document.getElementById('caj-fecha').value       = _toISO(new Date());
    document.getElementById('caj-sede').value        = '';
    document.getElementById('caj-proveedor').value   = '';
    document.getElementById('caj-metodo').value      = 'efectivo';
    document.getElementById('caj-comprobante').value = '';
    document.getElementById('caj-notas').value       = '';
    if (tipo === 'egreso') _actualizarPeriodoContable();

    const errorEl = document.getElementById('caj-error');
    errorEl.style.display  = 'none';
    errorEl.textContent    = '';

    const btnGuardar = document.getElementById('caj-dialog-guardar');
    btnGuardar.disabled    = false;
    btnGuardar.textContent = 'Guardar';

    document.getElementById('caj-dialog').showModal();
    requestAnimationFrame(() => document.getElementById('caj-concepto').focus());
}

/** Actualiza el dialog para reflejar el tipo seleccionado (ingreso/egreso). */
function _actualizarTipoDialog() {
    const tipo = _tipoDialog;

    document.getElementById('caj-tipo-ingreso').className =
        'caj-tipo-btn' + (tipo === 'ingreso' ? ' active-ingreso' : '');
    document.getElementById('caj-tipo-egreso').className =
        'caj-tipo-btn' + (tipo === 'egreso' ? ' active-egreso' : '');

    document.getElementById('caj-dialog-titulo').textContent =
        tipo === 'ingreso' ? 'Registrar ingreso' : 'Registrar egreso';
    document.getElementById('caj-dialog-guardar').className =
        `caj-btn caj-btn--${tipo}`;

    const selCat = document.getElementById('caj-categoria');
    selCat.innerHTML = '';
    CAJA_CATEGORIAS[tipo].forEach(c => {
        const opt = document.createElement('option');
        opt.value       = c.value;
        opt.textContent = c.label;
        selCat.appendChild(opt);
    });

    _actualizarCamposContextuales();
}

function _actualizarCamposContextuales() {
    const tipo = _tipoDialog;
    const cat  = document.getElementById('caj-categoria').value;

    document.getElementById('caj-field-sede').style.display =
        (tipo === 'ingreso' && cat === 'pago_sede') ? '' : 'none';

    document.getElementById('caj-field-proveedor').style.display =
        (tipo === 'egreso' && cat === 'proveedor') ? '' : 'none';

    document.getElementById('caj-field-periodo').style.display =
        (tipo === 'egreso') ? '' : 'none';
}

const _MESES_LABEL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                      'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

/** Puebla el select de período contable con mes anterior, actual y siguiente
 *  basado en la fecha ingresada. Selecciona el mes de la fecha por defecto. */
function _actualizarPeriodoContable() {
    const fechaVal = document.getElementById('caj-fecha').value;
    const base = fechaVal ? new Date(fechaVal + 'T00:00:00') : new Date();
    const sel  = document.getElementById('caj-periodo-contable');
    sel.innerHTML = '';
    for (let offset = -1; offset <= 1; offset++) {
        const d   = new Date(base.getFullYear(), base.getMonth() + offset, 1);
        const y   = d.getFullYear();
        const m   = d.getMonth();
        const val = `${y}-${String(m + 1).padStart(2, '0')}`;
        const opt = document.createElement('option');
        opt.value       = val;
        opt.textContent = `${_MESES_LABEL[m]} ${y}`;
        if (offset === 0) opt.selected = true;
        sel.appendChild(opt);
    }
}

document.getElementById('caj-tipo-ingreso').addEventListener('click', () => {
    _tipoDialog = 'ingreso';
    _actualizarTipoDialog();
});
document.getElementById('caj-tipo-egreso').addEventListener('click', () => {
    _tipoDialog = 'egreso';
    _actualizarTipoDialog();
});
document.getElementById('caj-categoria').addEventListener('change', _actualizarCamposContextuales);
document.getElementById('caj-fecha').addEventListener('change', () => {
    if (_tipoDialog === 'egreso') _actualizarPeriodoContable();
});

document.getElementById('caj-btn-ingreso').addEventListener('click', () => _abrirDialog('ingreso'));
document.getElementById('caj-btn-egreso').addEventListener('click',  () => _abrirDialog('egreso'));

// ── Dialog principal: cerrar ──────────────────────────────────────────────────
document.getElementById('caj-dialog-cerrar').addEventListener('click', () =>
    document.getElementById('caj-dialog').close()
);
document.getElementById('caj-dialog-cancelar').addEventListener('click', () =>
    document.getElementById('caj-dialog').close()
);
document.getElementById('caj-dialog').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.close();
});

// ── Dialog principal: guardar ─────────────────────────────────────────────────
document.getElementById('caj-dialog-guardar').addEventListener('click', async () => {
    const errorEl    = document.getElementById('caj-error');
    const btnGuardar = document.getElementById('caj-dialog-guardar');

    errorEl.style.display = 'none';

    const categoria   = document.getElementById('caj-categoria').value;
    const concepto    = document.getElementById('caj-concepto').value.trim();
    const monto       = parseFloat(document.getElementById('caj-monto').value);
    const fecha       = document.getElementById('caj-fecha').value;
    const metodo      = document.getElementById('caj-metodo').value;
    const comprobante = document.getElementById('caj-comprobante').value.trim();
    const notas       = document.getElementById('caj-notas').value.trim();

    const sedeCampoVisible = document.getElementById('caj-field-sede').style.display !== 'none';
    const provCampoVisible = document.getElementById('caj-field-proveedor').style.display !== 'none';

    const sede           = sedeCampoVisible ? document.getElementById('caj-sede').value      || null : null;
    const provIdRaw      = provCampoVisible ? document.getElementById('caj-proveedor').value         : '';
    const provId         = parseInt(provIdRaw) || null;
    const provNombre     = provId ? (_proveedores.find(p => p.id === provId)?.nombre || null) : null;
    const periodoContable = _tipoDialog === 'egreso'
        ? document.getElementById('caj-periodo-contable').value
        : null;

    if (!concepto) return _showError('El concepto es obligatorio.');
    if (!monto || monto <= 0) return _showError('El monto debe ser mayor a 0.');
    if (!fecha)   return _showError('La fecha es obligatoria.');

    btnGuardar.disabled    = true;
    btnGuardar.textContent = 'Guardando...';

    try {
        const { data: nuevo, error } = await supabase
            .from('caja_movimientos')
            .insert({
                tipo:             _tipoDialog,
                categoria,
                concepto,
                monto,
                fecha,
                sede,
                proveedor_id:     provId,
                proveedor_nombre: provNombre,
                metodo_pago:      metodo,
                comprobante:      comprobante || null,
                notas:            notas || null,
                estado:           'pagado',
                periodo_ref:      periodoContable,
                usuario:          _usuario,
            })
            .select()
            .single();

        if (error) throw error;

        document.getElementById('caj-dialog').close();

        if (_enPeriodoActual(nuevo)) {
            _todos.unshift(nuevo);
            _renderVistaActual();
        }
    } catch (err) {
        console.error('[cuadreCaja] guardar:', err);
        _showError(err.message || 'Error al guardar. Intenta de nuevo.');
        btnGuardar.disabled    = false;
        btnGuardar.textContent = 'Guardar';
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// Dialog Importar Liquidación
// ══════════════════════════════════════════════════════════════════════════════

document.getElementById('caj-btn-importar').addEventListener('click', _abrirDialogLiquidacion);

function _abrirDialogLiquidacion() {
    const hoy  = new Date();
    _liqYear   = hoy.getFullYear();
    _liqMonth  = hoy.getMonth() + 1;
    _liqDatos  = [];
    document.getElementById('caj-liq-error').style.display = 'none';
    document.getElementById('caj-liq-importar').disabled   = true;
    document.getElementById('caj-dialog-liq').showModal();
    _cargarLiqPreview();
}

/**
 * Fuente única de verdad para liquidaciones.
 * Consulta pedidos_planta + movimientos (Devolución) de un mes completo,
 * acumula totales por (semanaIdx, sede) y devuelve { semanas, dataPorSemana }.
 * Usada tanto por el diálogo de importación como por la vista Ventas por Sede.
 */
async function _calcularLiquidacionMes(year, month) {
    const semanas  = _semanasDelMes(year, month);
    const desdeISO = _toISO(semanas[0].desde);
    const hastaISO = _toISO(semanas[semanas.length - 1].hasta);

    const [{ data: rawPedidos, error: errP }, { data: rawDevs, error: errD }] = await Promise.all([
        supabase
            .from('pedidos_planta')
            .select('id_pedido, delivery_date, user_sede, total, status, eliminado')
            .gte('delivery_date', desdeISO)
            .lte('delivery_date', hastaISO),
        supabase
            .from('movimientos')
            .select('sede, valor_total, subtipo, fecha')
            .eq('tipo', 'Devolución')
            .gte('fecha', colFechaToUTC(desdeISO, 'inicio'))
            .lte('fecha', colFechaToUTC(hastaISO, 'fin')),
    ]);

    if (errP) throw errP;
    if (errD) throw errD;

    const dataPorSemana = semanas.map(() => ({}));

    pedidosLiquidables(rawPedidos || []).forEach(p => {
        if (!p.delivery_date) return;
        const sede = (p.user_sede || 'sin sede').toLowerCase();
        if (sede === 'planta producción' || sede === 'planta') return;
        const idx = _semanaIdxParaFecha(p.delivery_date, semanas);
        if (idx === -1) return;
        if (!dataPorSemana[idx][sede]) dataPorSemana[idx][sede] = { totalPed: 0, totalDev: 0 };
        dataPorSemana[idx][sede].totalPed += (p.total || 0);
    });

    devolucionesLiquidables(rawDevs || []).forEach(d => {
        if (!d.fecha) return;
        const sede = d.sede ? d.sede.toLowerCase() : null;
        if (!sede) return;
        const fechaCol = new Date(new Date(d.fecha).getTime() - 5 * 3600 * 1000);
        const fechaISO = `${fechaCol.getUTCFullYear()}-${String(fechaCol.getUTCMonth() + 1).padStart(2, '0')}-${String(fechaCol.getUTCDate()).padStart(2, '0')}`;
        const idx = _semanaIdxParaFecha(fechaISO, semanas);
        if (idx === -1) return;
        if (!dataPorSemana[idx][sede]) dataPorSemana[idx][sede] = { totalPed: 0, totalDev: 0 };
        dataPorSemana[idx][sede].totalDev += (d.valor_total || 0);
    });

    return { semanas, dataPorSemana };
}

async function _cargarLiqPreview() {
    const contenido   = document.getElementById('caj-liq-contenido');
    const btnImportar = document.getElementById('caj-liq-importar');
    const errEl       = document.getElementById('caj-liq-error');

    contenido.innerHTML = '<p class="caj-liq-cargando">Cargando...</p>';
    btnImportar.disabled = true;
    errEl.style.display  = 'none';

    const MESES_N = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    document.getElementById('caj-liq-label').textContent =
        `${MESES_N[_liqMonth - 1]} ${_liqYear}`;

    const mesNum = String(_liqMonth).padStart(2, '0');

    try {
        const { semanas, dataPorSemana } = await _calcularLiquidacionMes(_liqYear, _liqMonth);

        // Construir _liqDatos: una fila por (semana, sede) con datos
        _liqDatos = [];
        semanas.forEach(({ desde, hasta }, idx) => {
            const numSemana  = getNumeroPeriodo(desde);
            const periodoRef = `${_liqYear}-${mesNum}-S${numSemana}`;
            Object.keys(dataPorSemana[idx]).sort().forEach(sede => {
                const { totalPed, totalDev } = dataPorSemana[idx][sede];
                const totalNeto   = totalPed - totalDev;
                const yaImportado = _todos.some(m =>
                    m.periodo_ref === periodoRef && m.sede === sede
                );
                _liqDatos.push({ sede, totalPed, totalDev, totalNeto, periodoRef, hastaDate: hasta, numSemana, yaImportado });
            });
        });

        if (!_liqDatos.length) {
            contenido.innerHTML = '<p class="caj-liq-cargando">Sin pedidos este mes.</p>';
            return;
        }

        // Renderizar filas agrupadas por semana
        const MESES_C = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
        let htmlRows = '';
        let semActual = null;

        _liqDatos.forEach((d, i) => {
            if (d.numSemana !== semActual) {
                semActual = d.numSemana;
                const { desde: semDesde, hasta: semHasta } = semanas[semanas.findIndex(s =>
                    getNumeroPeriodo(s.desde) === semActual
                )];
                const rango = `${semDesde.getDate()} ${MESES_C[semDesde.getMonth()]} – ${semHasta.getDate()} ${MESES_C[semHasta.getMonth()]}`;
                htmlRows += `<tr class="caj-liq-semana-sep">
                    <td colspan="5" class="caj-liq-semana-header">Semana #${semActual} · ${rango}</td>
                </tr>`;
            }
            htmlRows += `<tr>
                <td style="width:3.2rem;text-align:center">
                    ${d.yaImportado
                        ? '<span class="caj-liq-ya" title="Ya importado">✓</span>'
                        : `<input type="checkbox" class="caj-liq-check" data-idx="${i}"
                               ${d.totalNeto > 0 ? 'checked' : ''} style="width:1.5rem;height:1.5rem;cursor:pointer">`
                    }
                </td>
                <td>${capitalizarSede(d.sede)}</td>
                <td class="caj-liq-num caj-liq-num--ing">$${Math.round(d.totalPed).toLocaleString('es-CO')}</td>
                <td class="caj-liq-num caj-liq-num--egr">$${Math.round(d.totalDev).toLocaleString('es-CO')}</td>
                <td class="caj-liq-num caj-liq-num--tot">$${Math.round(d.totalNeto).toLocaleString('es-CO')}</td>
            </tr>`;
        });

        contenido.innerHTML = `
            <table class="caj-tabla caj-liq-tabla">
                <thead>
                    <tr>
                        <th></th>
                        <th>Sede</th>
                        <th style="text-align:right">Pedidos</th>
                        <th style="text-align:right">Devoluciones</th>
                        <th style="text-align:right">Total neto</th>
                    </tr>
                </thead>
                <tbody>${htmlRows}</tbody>
            </table>
        `;

        const haySeleccionables = _liqDatos.some(d => !d.yaImportado && d.totalNeto > 0);
        btnImportar.disabled = !haySeleccionables;

    } catch (err) {
        console.error('[cuadreCaja] liqPreview:', err);
        contenido.innerHTML = '';
        errEl.textContent   = err.message || 'Error al cargar datos de liquidación.';
        errEl.style.display = 'block';
    }
}

async function _importarLiquidacion() {
    const btn   = document.getElementById('caj-liq-importar');
    const errEl = document.getElementById('caj-liq-error');

    btn.disabled    = true;
    btn.textContent = 'Importando...';
    errEl.style.display = 'none';

    const checks       = document.querySelectorAll('.caj-liq-check:checked');
    const seleccionados = Array.from(checks).map(c => _liqDatos[parseInt(c.dataset.idx)]);

    if (!seleccionados.length) {
        btn.disabled    = false;
        btn.textContent = 'Importar seleccionadas';
        return;
    }

    const registros = seleccionados.map(d => ({
        tipo:        'ingreso',
        categoria:   'pago_sede',
        concepto:    `Liq. ${d.periodoRef.replace(/-S/, ' Sem ')} — ${capitalizarSede(d.sede)}`,
        monto:       Math.round(d.totalNeto),
        fecha:       _toISO(d.hastaDate),
        sede:        d.sede,
        metodo_pago: 'efectivo',
        estado:      'pendiente',
        periodo_ref: d.periodoRef,
        usuario:     _usuario,
    }));

    const { error } = await supabase.from('caja_movimientos').insert(registros);

    if (error) {
        console.error('[cuadreCaja] importar:', error);
        errEl.textContent   = error.message;
        errEl.style.display = 'block';
        btn.disabled    = false;
        btn.textContent = 'Importar seleccionadas';
        return;
    }

    document.getElementById('caj-dialog-liq').close();
    await _cargarMovimientos();
    _cargarVentas(); // refresca pivot y checkmarks de ya-importado
}

// Navegación mensual en el dialog de liquidación
document.getElementById('caj-liq-prev').addEventListener('click', () => {
    _liqMonth--;
    if (_liqMonth < 1) { _liqMonth = 12; _liqYear--; }
    _cargarLiqPreview();
});
document.getElementById('caj-liq-next').addEventListener('click', () => {
    _liqMonth++;
    if (_liqMonth > 12) { _liqMonth = 1; _liqYear++; }
    _cargarLiqPreview();
});
document.getElementById('caj-liq-importar').addEventListener('click', _importarLiquidacion);
document.getElementById('caj-liq-cerrar').addEventListener('click', () =>
    document.getElementById('caj-dialog-liq').close()
);
document.getElementById('caj-liq-cancelar').addEventListener('click', () =>
    document.getElementById('caj-dialog-liq').close()
);
document.getElementById('caj-dialog-liq').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.close();
});

// ══════════════════════════════════════════════════════════════════════════════
// Dialog Confirmar Pago
// ══════════════════════════════════════════════════════════════════════════════

function _abrirDialogConfirmar(id) {
    const mov = _todos.find(m => m.id === id);
    if (!mov) return;

    _confirmandoId = id;

    document.getElementById('caj-conf-desc').textContent =
        `${mov.concepto} — $${Number(mov.monto).toLocaleString('es-CO')}`;
    document.getElementById('caj-conf-sede').textContent =
        mov.sede ? capitalizarSede(mov.sede) : '—';
    document.getElementById('caj-conf-metodo').value      = 'efectivo';
    document.getElementById('caj-conf-comprobante').value = '';

    const errEl = document.getElementById('caj-conf-error');
    errEl.style.display = 'none';

    const btn = document.getElementById('caj-conf-guardar');
    btn.disabled    = false;
    btn.textContent = 'Confirmar pago';

    document.getElementById('caj-dialog-confirmar').showModal();
}

async function _confirmarPago() {
    const btn   = document.getElementById('caj-conf-guardar');
    const errEl = document.getElementById('caj-conf-error');

    errEl.style.display = 'none';
    btn.disabled    = true;
    btn.textContent = 'Confirmando...';

    const metodo      = document.getElementById('caj-conf-metodo').value;
    const comprobante = document.getElementById('caj-conf-comprobante').value.trim();

    const { data: updated, error } = await supabase
        .from('caja_movimientos')
        .update({
            estado:      'pagado',
            metodo_pago: metodo,
            comprobante: comprobante || null,
        })
        .eq('id', _confirmandoId)
        .select()
        .single();

    if (error) {
        console.error('[cuadreCaja] confirmarPago:', error);
        errEl.textContent   = error.message;
        errEl.style.display = 'block';
        btn.disabled    = false;
        btn.textContent = 'Confirmar pago';
        return;
    }

    document.getElementById('caj-dialog-confirmar').close();

    // Si está vinculado a una factura, sincronizar recepciones
    if (updated.recepcion_id) {
        const { error: errRec } = await supabase
            .from('recepciones')
            .update({ metodo_pago: metodo })
            .eq('id', updated.recepcion_id);
        if (errRec) console.warn('[cuadreCaja] sync recepciones:', errRec);
    }

    // Actualizar caché local
    const idx = _todos.findIndex(m => m.id === _confirmandoId);
    if (idx !== -1) _todos[idx] = { ..._todos[idx], ...updated };
    _confirmandoId = null;

    _renderVistaActual();
    if (_vistaActual === 'ingresos' || _vistaActual === 'resumen') _cargarVentas();
    if (_vistaActual === 'entregas')     _cargarEntregas();
    if (_vistaActual === 'conciliacion') _cargarConciliacion();
}

document.getElementById('caj-conf-guardar').addEventListener('click', _confirmarPago);
document.getElementById('caj-conf-cerrar').addEventListener('click', () =>
    document.getElementById('caj-dialog-confirmar').close()
);
document.getElementById('caj-conf-cancelar').addEventListener('click', () =>
    document.getElementById('caj-dialog-confirmar').close()
);
document.getElementById('caj-dialog-confirmar').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.close();
});

// ══════════════════════════════════════════════════════════════════════════════
// Pestañas: Movimientos / Informe Mensual
// ══════════════════════════════════════════════════════════════════════════════

const _VISTAS = ['resumen', 'ingresos', 'gastos', 'entregas', 'conciliacion', 'informes', 'gerencial'];

function _switchVista(vista) {
    _vistaActual = vista;
    // Actualizar estado activo en el sidebar principal
    document.querySelectorAll('[data-fin-vista]').forEach(a => {
        a.classList.toggle('sidebar__link--active', a.dataset.finVista === vista);
    });
    // Actualizar URL sin recargar
    history.replaceState(null, '', `?v=${vista}`);
    // Mostrar/ocultar vistas
    _VISTAS.forEach(v => {
        const el = document.getElementById(`fin-view-${v}`);
        if (el) el.style.display = v === vista ? '' : 'none';
    });
    // Cargar datos según vista
    if (vista === 'informes')      _renderInforme();
    if (vista === 'ingresos')      { _cargarVentas(); _renderTablaIngresos(); }
    if (vista === 'resumen')       { _renderResumen(); _cargarVentas(); }
    if (vista === 'entregas')      _cargarEntregas();
    if (vista === 'conciliacion')  _cargarConciliacion();
    if (vista === 'gerencial')     _cargarGerencial();
    if (vista === 'gastos') {
        _renderTabla();
    }
}


// ══════════════════════════════════════════════════════════════════════════════
// Informe Mensual
// ══════════════════════════════════════════════════════════════════════════════

function _renderInforme() {
    const contenido = document.getElementById('caj-informe-contenido');

    // ── Clasificar movimientos ──────────────────────────────────────────────
    // Ingresos cobrados vs pendientes
    const ingCobrado   = _todos.filter(m => m.tipo === 'ingreso' && m.estado !== 'pendiente');
    const ingPendiente = _todos.filter(m => m.tipo === 'ingreso' && m.estado === 'pendiente');

    // Egresos pagados por método: banco (transferencia + tarjeta) vs efectivo
    // Los pendientes (facturas sin pagar) se muestran aparte
    const egrBanco     = _todos.filter(m => m.tipo === 'egreso' && m.estado !== 'pendiente' && m.metodo_pago && m.metodo_pago !== 'efectivo');
    const egrEfectivo  = _todos.filter(m => m.tipo === 'egreso' && m.metodo_pago === 'efectivo');
    const egrPendiente = _todos.filter(m => m.tipo === 'egreso' && m.estado === 'pendiente');

    // ── Totales ────────────────────────────────────────────────────────────
    const totalCobrado   = ingCobrado.reduce((s, m)   => s + Number(m.monto), 0);
    const totalPendiente = ingPendiente.reduce((s, m) => s + Number(m.monto), 0);
    const totalBanco     = egrBanco.reduce((s, m)     => s + Number(m.monto), 0);
    const totalEfectivo  = egrEfectivo.reduce((s, m)  => s + Number(m.monto), 0);
    const totalPorPagar  = egrPendiente.reduce((s, m) => s + Number(m.monto), 0);
    const utilidad       = totalCobrado - totalBanco - totalEfectivo;

    // ── Agrupaciones ──────────────────────────────────────────────────────

    // Ventas cobradas por periodo_ref (semana de liquidación)
    const ventasPorRef = {};
    ingCobrado.forEach(m => {
        const ref = m.periodo_ref || '__otro__';
        ventasPorRef[ref] = (ventasPorRef[ref] || 0) + Number(m.monto);
    });

    // Gastos banco por categoría
    const bancoPorCat = {};
    egrBanco.forEach(m => {
        const cat = _labelCategoria(m.categoria);
        bancoPorCat[cat] = (bancoPorCat[cat] || 0) + Number(m.monto);
    });

    // Egresos pendientes (facturas sin pagar) por proveedor
    const pendientePorProv = {};
    egrPendiente.forEach(m => {
        const prov = m.proveedor_nombre || 'Sin proveedor';
        pendientePorProv[prov] = (pendientePorProv[prov] || 0) + Number(m.monto);
    });

    // Gastos efectivo por semana del mes
    const efectivoPorSem = {};
    egrEfectivo.forEach(m => {
        if (!m.fecha) return;
        const n   = _semanaNumero(m.fecha);
        const key = `Semana #${n}`;
        efectivoPorSem[key] = (efectivoPorSem[key] || 0) + Number(m.monto);
    });

    // ── Helpers de render ─────────────────────────────────────────────────

    /** Convierte "2026-11-S2" → "Semana #2 · Nov 2026" */
    function _labelRef(ref) {
        if (ref === '__otro__') return 'Otros ingresos';
        const m = ref.match(/^(\d{4})-(\d{2})-S(\d+)$/);
        if (m) {
            const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
            return `Semana #${m[3]} · ${MESES[parseInt(m[2]) - 1]} ${m[1]}`;
        }
        return ref;
    }

    function _fila(desc, val, clsVal = '') {
        return `<tr>
            <td>${_esc(desc)}</td>
            <td class="inf-val ${clsVal}">$${Math.round(val).toLocaleString('es-CO')}</td>
        </tr>`;
    }

    function _bloque(titulo, rows, totalLabel, totalVal, clsTot = '') {
        return `
            <div class="caj-inf-bloque">
                <div class="caj-inf-bloque__titulo">${titulo}</div>
                <table class="caj-inf-tabla">
                    <thead><tr><th>Descripción</th><th>Valor</th></tr></thead>
                    <tbody>
                        ${rows || '<tr><td colspan="2" class="inf-empty-row">Sin registros</td></tr>'}
                    </tbody>
                    <tfoot>
                        <tr class="inf-row--total">
                            <td>${totalLabel}</td>
                            <td class="inf-val ${clsTot}">$${Math.round(totalVal).toLocaleString('es-CO')}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>`;
    }

    // ── Construir bloques ─────────────────────────────────────────────────

    // Bloque ventas
    let ventasRows = Object.entries(ventasPorRef)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([ref, v]) => _fila(_labelRef(ref), v, 'inf-val--ing'))
        .join('');
    if (totalPendiente > 0) {
        ventasRows += `<tr class="inf-row--pendiente">
            <td>Por cobrar (pendiente)</td>
            <td class="inf-val inf-val--pend">$${Math.round(totalPendiente).toLocaleString('es-CO')}</td>
        </tr>`;
    }
    const bloqueVentas = _bloque(
        'Ventas del mes (ingresos cobrados)',
        ventasRows,
        'TOTAL COBRADO', totalCobrado, 'inf-val--ing'
    );

    // Bloque banco
    const bancoCats = Object.entries(bancoPorCat)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cat, v]) => _fila(cat, v, 'inf-val--egr'))
        .join('');
    const bloqueBanco = _bloque(
        'Gastos por banco / transferencia',
        bancoCats,
        'TOTAL BANCO', totalBanco, 'inf-val--egr'
    );

    // Bloque efectivo
    const efectivoSems = Object.entries(efectivoPorSem)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sem, v]) => _fila(sem, v, 'inf-val--egr'))
        .join('');
    const bloqueEfectivo = _bloque(
        'Gastos en efectivo',
        efectivoSems,
        'TOTAL EFECTIVO', totalEfectivo, 'inf-val--egr'
    );

    // Bloque por pagar (facturas pendientes) — solo si hay
    const porPagarRows = Object.entries(pendientePorProv)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([prov, v]) => _fila(prov, v, 'inf-val--pend'))
        .join('');
    const bloquePorPagar = totalPorPagar > 0 ? _bloque(
        'Por pagar — facturas pendientes',
        porPagarRows,
        'TOTAL POR PAGAR', totalPorPagar, 'inf-val--pend'
    ) : '';

    // Panel resumen + utilidad (solo movimientos confirmados)
    const isPos = utilidad >= 0;
    const bloqueResumen = `
        <div class="caj-inf-bloque">
            <div class="caj-inf-bloque__titulo">Resumen del mes</div>
            <table class="caj-inf-tabla">
                <thead><tr><th>Descripción</th><th>Valor</th></tr></thead>
                <tbody>
                    ${_fila('Venta cobrada',         totalCobrado,  'inf-val--ing')}
                    ${_fila('Gastos por banco',      totalBanco,    'inf-val--egr')}
                    ${_fila('Gastos en efectivo',    totalEfectivo, 'inf-val--egr')}
                    ${totalPorPagar > 0 ? `<tr class="inf-row--pendiente">
                        <td>Facturas por pagar</td>
                        <td class="inf-val inf-val--pend">$${Math.round(totalPorPagar).toLocaleString('es-CO')}</td>
                    </tr>` : ''}
                </tbody>
            </table>
            <div class="caj-inf-total ${isPos ? 'caj-inf-total--pos' : 'caj-inf-total--neg'}">
                <span class="caj-inf-total__label">UTILIDAD NETA</span>
                <span class="caj-inf-total__label" style="font-size:1.1rem;font-weight:400;color:#aaa">(solo movimientos confirmados)</span>
                <span class="caj-inf-total__valor">${!isPos ? '−' : ''}$${Math.round(Math.abs(utilidad)).toLocaleString('es-CO')}</span>
            </div>
        </div>`;

    // ── Layout final ──────────────────────────────────────────────────────
    contenido.innerHTML = `
        <div class="caj-inf-grid">
            <div class="caj-inf-col">
                ${bloqueVentas}
                ${bloqueBanco}
                ${bloqueEfectivo}
                ${bloquePorPagar}
            </div>
            <div class="caj-inf-col">
                ${bloqueResumen}
            </div>
        </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// Vista Ventas por Sede
// ══════════════════════════════════════════════════════════════════════════════

async function _cargarVentas() {
    const contenido = document.getElementById('caj-ventas-contenido');
    contenido.innerHTML = '<p class="caj-empty">Cargando...</p>';

    const mesNum              = String(_periodo.month).padStart(2, '0');
    const { periodoRef, periodoNext } = _rangoPeriodo();

    try {
        const [
            { semanas, dataPorSemana },
            { data: movReg, error: errM },
        ] = await Promise.all([
            _calcularLiquidacionMes(_periodo.year, _periodo.month),
            supabase
                .from('caja_movimientos')
                .select('id, sede, periodo_ref, estado, monto, metodo_pago, fecha')
                .eq('tipo', 'ingreso')
                .eq('categoria', 'pago_sede')
                .gte('periodo_ref', periodoRef)
                .lt('periodo_ref', periodoNext)
                .order('created_at', { ascending: true }),
        ]);

        if (errM) throw errM;

        // Agrupar por 'periodoRef|sede':
        //   estado='pendiente' → fila de referencia (monto total a cobrar)
        //   estado='pagado'    → abono individual
        const movMap = {};
        (movReg || []).forEach(m => {
            if (!m.periodo_ref || !m.sede) return;
            const key = `${m.periodo_ref}|${m.sede}`;
            if (!movMap[key]) movMap[key] = { refId: null, abonos: [] };
            if (m.estado === 'pendiente') {
                movMap[key].refId = m.id;
            } else {
                movMap[key].abonos.push({
                    id:          m.id,
                    monto:       Number(m.monto),
                    metodo_pago: m.metodo_pago,
                    fecha:       m.fecha,
                });
            }
        });

        // Fecha de hoy en Colombia (UTC-5) para detectar semana en curso
        const _hoyCol = new Date(new Date().getTime() - 5 * 3600 * 1000);
        _hoyCol.setUTCHours(12, 0, 0, 0);

        // Construir _ventasDatos — incluye todas las semanas que ya iniciaron,
        // aunque no tengan datos aún (semana en curso con 0 entregados esa tarde)
        _ventasDatos = semanas
            .filter(({ desde }) => desde <= _hoyCol)   // excluir semanas futuras
            .map(({ desde, hasta }, idx) => {
                const numSemana  = getNumeroPeriodo(desde);
                const periodoRef = `${_periodo.year}-${mesNum}-S${numSemana}`;
                const enCurso    = hasta > _hoyCol;    // semana no ha cerrado
                const sedes      = Object.keys(dataPorSemana[idx]).sort().map(sede => {
                    const { totalPed, totalDev } = dataPorSemana[idx][sede];
                    const totalNeto    = totalPed - totalDev;
                    const entry        = movMap[`${periodoRef}|${sede}`] || null;
                    const abonos       = entry?.abonos || [];
                    const totalAbonado = abonos.reduce((s, a) => s + a.monto, 0);
                    const estado       = !entry ? null
                        : totalAbonado >= totalNeto && totalNeto > 0 ? 'pagado'
                        : abonos.length > 0 ? 'parcial'
                        : 'pendiente';
                    return {
                        sede,
                        nombreDisplay: capitalizarSede(sede),
                        totalPed,
                        totalDev,
                        totalNeto,
                        movId: entry?.refId || null,
                        estado,
                        abonos,
                        totalAbonado,
                    };
                });
                return { numSemana, desde, hasta, periodoRef, enCurso, sedes };
            });

        _renderVentas();

    } catch (err) {
        console.error('[cuadreCaja] cargarVentas:', err);
        contenido.innerHTML = `<p class="caj-empty" style="color:#c05621">${err.message || 'Error al cargar ventas.'}</p>`;
    }
}


function _renderVentas() {
    const contenido = document.getElementById('caj-ventas-contenido');

    if (!_ventasDatos.length) {
        contenido.innerHTML = '<p class="caj-empty">Sin ventas este mes.</p>';
        if (_vistaActual === 'resumen') {
            _renderKPIs();
            _renderSidebar();
        }
        return;
    }

    const MESES_C = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

    // Coleccionar todas las sedes únicas del mes
    const sedesSet = new Set();
    _ventasDatos.forEach(sem => sem.sedes.forEach(d => sedesSet.add(d.sede)));
    const todasSedes = [...sedesSet].sort();

    // Cabecera de semanas
    const thSemanas = _ventasDatos.map(sem => {
        const rango    = `${sem.desde.getDate()} ${MESES_C[sem.desde.getMonth()]} – ${sem.hasta.getDate()} ${MESES_C[sem.hasta.getMonth()]}`;
        const cursoTag = sem.enCurso ? ' <span class="caj-pvt-en-curso">En curso</span>' : '';
        return `<th class="caj-pvt-th-sem${sem.enCurso ? ' caj-pvt-th-sem--curso' : ''}">Sem #${sem.numSemana}${cursoTag}<br><span class="caj-pvt-rango">${rango}</span></th>`;
    }).join('');

    // Fila por sede
    const rows = todasSedes.map(sede => {
        const nombre = capitalizarSede(sede);

        const celdas = _ventasDatos.map((sem, semIdx) => {
            const d = sem.sedes.find(s => s.sede === sede);
            if (!d) return `<td class="caj-pvt-celda caj-pvt-celda--vacia">—</td>`;
            const dotClass = d.estado === 'pagado'                       ? 'caj-pvt-dot--pagado'
                           : (d.estado === 'pendiente' || d.estado === 'parcial') ? 'caj-pvt-dot--pendiente'
                           :                                                         'caj-pvt-dot--noimportado';
            return `<td class="caj-pvt-celda" data-semidx="${semIdx}" data-sede="${_esc(sede)}" role="button" tabindex="0">
                <span class="caj-pvt-dot ${dotClass}"></span>$${Math.round(d.totalNeto).toLocaleString('es-CO')}
            </td>`;
        }).join('');

        const totalSede = _ventasDatos.reduce((s, sem) => {
            const d = sem.sedes.find(s2 => s2.sede === sede);
            return s + (d?.totalNeto || 0);
        }, 0);

        return `<tr>
            <td class="caj-pvt-sede">${_esc(nombre)}</td>
            ${celdas}
            <td class="caj-pvt-total">$${Math.round(totalSede).toLocaleString('es-CO')}</td>
        </tr>`;
    }).join('');

    // Pie: totales por semana
    const footCeldas = _ventasDatos.map(sem => {
        const t = sem.sedes.reduce((s, d) => s + d.totalNeto, 0);
        return `<td class="caj-pvt-foot-num">$${Math.round(t).toLocaleString('es-CO')}</td>`;
    }).join('');
    const grandTotal = _ventasDatos.reduce((s, sem) => s + sem.sedes.reduce((ss, d) => ss + d.totalNeto, 0), 0);

    contenido.innerHTML = `
        <div class="caj-pvt-wrap">
            <table class="caj-tabla caj-pvt-tabla">
                <thead>
                    <tr>
                        <th class="caj-pvt-th-sede">Sede</th>
                        ${thSemanas}
                        <th class="caj-pvt-th-total">Total mes</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
                <tfoot>
                    <tr class="caj-pvt-tfoot">
                        <td class="caj-pvt-foot-label">Total</td>
                        ${footCeldas}
                        <td class="caj-pvt-foot-num caj-pvt-grand">$${Math.round(grandTotal).toLocaleString('es-CO')}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
        <div id="caj-pvt-detalle" class="caj-pvt-detalle" style="display:none"></div>`;

    // Solo actualizar el resumen si el usuario está en esa vista
    if (_vistaActual === 'resumen') {
        _renderKPIs();
        _renderSidebar();
        _renderPnL();
    }
}

function _mostrarDetalleCelda(semIdx, sedeName, celdaEl) {
    const panel = document.getElementById('caj-pvt-detalle');
    const sem   = _ventasDatos[semIdx];
    if (!sem) return;
    const d = sem.sedes.find(s => s.sede === sedeName);
    if (!d) return;

    // Resaltar celda activa
    document.querySelectorAll('.caj-pvt-celda--activa').forEach(el => el.classList.remove('caj-pvt-celda--activa'));
    celdaEl?.classList.add('caj-pvt-celda--activa');

    const MESES_C = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const rango   = `${sem.desde.getDate()} ${MESES_C[sem.desde.getMonth()]} – ${sem.hasta.getDate()} ${MESES_C[sem.hasta.getMonth()]}`;
    const completo = d.totalAbonado >= d.totalNeto && d.totalNeto > 0;
    const pendiente = Math.max(0, d.totalNeto - d.totalAbonado);

    // ── Tabla de abonos ───────────────────────────────────────────────────────
    let abonosHtml = '';
    if (d.abonos.length > 0) {
        const rows = d.abonos.map(a => {
            const fechaFmt = a.fecha
                ? new Date(a.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })
                : '—';
            const metodoLabel = a.metodo_pago === 'efectivo' ? 'Efectivo'
                              : a.metodo_pago === 'transferencia' ? 'Transf.'
                              : a.metodo_pago || '—';
            return `<tr>
                <td>${fechaFmt}</td>
                <td>${metodoLabel}</td>
                <td><strong>$${Math.round(a.monto).toLocaleString('es-CO')}</strong></td>
            </tr>`;
        }).join('');
        abonosHtml = `
            <div class="caj-pvt-abonos-titulo">Cobros registrados</div>
            <table class="caj-pvt-abonos-tabla">
                <thead><tr><th>Fecha</th><th>Método</th><th>Monto</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    // ── Balance cobrado / pendiente ───────────────────────────────────────────
    const balanceHtml = (d.movId || d.abonos.length > 0) ? `
        <div class="caj-pvt-balance">
            <div class="caj-pvt-balance-row">
                <span>Cobrado</span>
                <strong class="caj-pvt-balance-cobrado">$${Math.round(d.totalAbonado).toLocaleString('es-CO')}</strong>
            </div>
            <div class="caj-pvt-balance-row">
                <span>Pendiente</span>
                <strong class="${completo ? 'caj-pvt-balance-ok' : 'caj-pvt-balance-pendiente'}">
                    ${completo ? '✓ Cobro completo' : '$' + Math.round(pendiente).toLocaleString('es-CO')}
                </strong>
            </div>
        </div>` : '';

    // ── Acciones ─────────────────────────────────────────────────────────────
    const accionHtml = !completo
        ? `<button class="caj-btn caj-btn--ingreso" id="caj-pvt-btn-abono" data-semidx="${semIdx}" data-sede="${_esc(sedeName)}">+ Abono</button>`
        : '';

    panel.style.display = 'block';
    panel.innerHTML = `
        <div class="caj-pvt-det-hdr">
            <div>
                <span class="caj-pvt-det-titulo">${_esc(d.nombreDisplay)}</span>
                <span class="caj-pvt-det-sub">Semana #${sem.numSemana} · ${rango}</span>
            </div>
            <button class="caj-dialog-cerrar" id="caj-pvt-det-cerrar" aria-label="Cerrar">✕</button>
        </div>
        <div class="caj-pvt-det-body">
            <div class="caj-pvt-det-row"><span>Pedidos</span><strong>$${Math.round(d.totalPed).toLocaleString('es-CO')}</strong></div>
            ${d.totalDev > 0 ? `<div class="caj-pvt-det-row"><span>Devoluciones</span><strong style="color:#c05621">−$${Math.round(d.totalDev).toLocaleString('es-CO')}</strong></div>` : ''}
            <div class="caj-pvt-det-row caj-pvt-det-row--total"><span>Total a cobrar</span><strong>$${Math.round(d.totalNeto).toLocaleString('es-CO')}</strong></div>
            ${abonosHtml}
            ${balanceHtml}
            ${accionHtml ? `<div class="caj-pvt-det-acciones">${accionHtml}</div>` : ''}
        </div>`;

    document.getElementById('caj-pvt-det-cerrar').addEventListener('click', () => {
        panel.style.display = 'none';
        document.querySelectorAll('.caj-pvt-celda--activa').forEach(el => el.classList.remove('caj-pvt-celda--activa'));
    });

    const btnAbono = document.getElementById('caj-pvt-btn-abono');
    if (btnAbono) btnAbono.addEventListener('click', () => _abrirDialogAbono(semIdx, sedeName));

    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function _abrirDialogAbono(semIdx, sedeName) {
    const sem = _ventasDatos[semIdx];
    const d   = sem?.sedes.find(s => s.sede === sedeName);
    if (!d) return;

    _abonoCtx = { semIdx, sedeName, periodoRef: sem.periodoRef, totalNeto: d.totalNeto, refId: d.movId, hasta: sem.hasta };

    document.getElementById('caj-abono-info').textContent    = `${d.nombreDisplay} · Semana #${sem.numSemana}`;
    document.getElementById('caj-abono-monto').value         = '';
    document.getElementById('caj-abono-metodo').value        = 'efectivo';
    document.getElementById('caj-abono-fecha').value         = _toISO(new Date());
    document.getElementById('caj-abono-notas').value         = '';
    document.getElementById('caj-abono-error').style.display = 'none';
    document.getElementById('caj-abono-titulo').textContent  = 'Registrar abono';

    // Mostrar paso 1
    document.getElementById('caj-abono-step-form').style.display    = '';
    document.getElementById('caj-abono-step-confirm').style.display = 'none';

    document.getElementById('caj-dialog-abono').showModal();
}

// ── Dialog abono: cerrar / cancelar ───────────────────────────────────────────
document.getElementById('caj-abono-cerrar').addEventListener('click',   () => document.getElementById('caj-dialog-abono').close());
document.getElementById('caj-abono-cancelar').addEventListener('click', () => document.getElementById('caj-dialog-abono').close());
document.getElementById('caj-dialog-abono').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.close();
});

// ── Dialog abono: revisar (paso 1 → paso 2) ───────────────────────────────────
document.getElementById('caj-abono-revisar').addEventListener('click', () => {
    const errorEl = document.getElementById('caj-abono-error');
    errorEl.style.display = 'none';

    const monto  = parseFloat(document.getElementById('caj-abono-monto').value);
    const metodo = document.getElementById('caj-abono-metodo').value;
    const fecha  = document.getElementById('caj-abono-fecha').value;
    const notas  = document.getElementById('caj-abono-notas').value.trim();

    if (!monto || monto <= 0) { errorEl.textContent = 'El monto debe ser mayor a 0.'; errorEl.style.display = ''; return; }
    if (!fecha)               { errorEl.textContent = 'La fecha es obligatoria.';      errorEl.style.display = ''; return; }

    const metodoLabel = metodo === 'efectivo' ? 'Efectivo' : 'Banco';
    const fechaFmt    = new Date(fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });

    document.getElementById('caj-abono-conf-sede').textContent   = document.getElementById('caj-abono-info').textContent;
    document.getElementById('caj-abono-conf-monto').textContent  = `$${Math.round(monto).toLocaleString('es-CO')}`;
    document.getElementById('caj-abono-conf-metodo').textContent = metodoLabel;
    document.getElementById('caj-abono-conf-fecha').textContent  = fechaFmt;

    const rowNotas = document.getElementById('caj-abono-conf-row-notas');
    if (notas) {
        document.getElementById('caj-abono-conf-notas').textContent = notas;
        rowNotas.style.display = '';
    } else {
        rowNotas.style.display = 'none';
    }

    document.getElementById('caj-abono-error-conf').style.display  = 'none';
    document.getElementById('caj-abono-guardar').disabled           = false;
    document.getElementById('caj-abono-guardar').textContent        = 'Confirmar abono';
    document.getElementById('caj-abono-titulo').textContent         = 'Confirmar abono';

    document.getElementById('caj-abono-step-form').style.display    = 'none';
    document.getElementById('caj-abono-step-confirm').style.display = '';
});

// ── Dialog abono: volver (paso 2 → paso 1) ────────────────────────────────────
document.getElementById('caj-abono-volver').addEventListener('click', () => {
    document.getElementById('caj-abono-titulo').textContent          = 'Registrar abono';
    document.getElementById('caj-abono-step-form').style.display    = '';
    document.getElementById('caj-abono-step-confirm').style.display = 'none';
});

// ── Dialog abono: confirmar (guardar en BD) ────────────────────────────────────
document.getElementById('caj-abono-guardar').addEventListener('click', async () => {
    const errorEl = document.getElementById('caj-abono-error-conf');
    const btn     = document.getElementById('caj-abono-guardar');
    errorEl.style.display = 'none';

    const monto  = parseFloat(document.getElementById('caj-abono-monto').value);
    const metodo = document.getElementById('caj-abono-metodo').value;
    const fecha  = document.getElementById('caj-abono-fecha').value;
    const notas  = document.getElementById('caj-abono-notas').value.trim();

    btn.disabled    = true;
    btn.textContent = 'Guardando...';

    const ctx = _abonoCtx;
    const sem = _ventasDatos[ctx.semIdx];
    const d   = sem?.sedes.find(s => s.sede === ctx.sedeName);

    try {
        // Si no existe fila de referencia (pendiente), crearla automáticamente
        if (!ctx.refId) {
            const { data: ref, error: errRef } = await supabase
                .from('caja_movimientos')
                .insert({
                    tipo:        'ingreso',
                    categoria:   'pago_sede',
                    concepto:    `Liq. ${ctx.periodoRef.replace(/-S/, ' Sem ')} — ${d?.nombreDisplay || ctx.sedeName}`,
                    monto:       Math.round(ctx.totalNeto),
                    fecha:       _toISO(ctx.hasta),
                    sede:        ctx.sedeName,
                    metodo_pago: null,
                    estado:      'pendiente',
                    periodo_ref: ctx.periodoRef,
                    usuario:     _usuario,
                })
                .select('id').single();
            if (errRef) throw errRef;
            ctx.refId = ref.id;
        }

        // Insertar abono
        const numAbono = (d?.abonos?.length || 0) + 1;
        const { data: nuevo, error } = await supabase
            .from('caja_movimientos')
            .insert({
                tipo:        'ingreso',
                categoria:   'pago_sede',
                concepto:    `Abono ${numAbono} · ${d?.nombreDisplay || ctx.sedeName} Sem ${sem.numSemana}`,
                monto:       Math.round(monto),
                fecha,
                sede:        ctx.sedeName,
                metodo_pago: metodo,
                estado:      'pagado',
                periodo_ref: ctx.periodoRef,
                notas:       notas || null,
                usuario:     _usuario,
            })
            .select().single();
        if (error) throw error;

        document.getElementById('caj-dialog-abono').close();

        if (_enPeriodoActual(nuevo)) _todos.unshift(nuevo);
        await _cargarVentas();
        // Reabrir panel con datos frescos
        _mostrarDetalleCelda(ctx.semIdx, ctx.sedeName, null);

    } catch (err) {
        console.error('[cuadreCaja] guardar abono:', err);
        errorEl.textContent   = err.message || 'Error al guardar.';
        errorEl.style.display = '';
        btn.disabled    = false;
        btn.textContent = 'Confirmar abono';
    }
});

// Acciones inline en la vista Ventas
document.getElementById('caj-ventas-contenido').addEventListener('click', async e => {
    // Confirmar pago (reutiliza dialog existente)
    const btnConf = e.target.closest('.caj-btn-confirmar');
    if (btnConf) {
        _abrirDialogConfirmar(parseInt(btnConf.dataset.id));
        return;
    }

    // Clic en celda de la tabla pivote → panel de detalle
    const celda = e.target.closest('.caj-pvt-celda[data-semidx]');
    if (celda) {
        _mostrarDetalleCelda(parseInt(celda.dataset.semidx), celda.dataset.sede, celda);
        return;
    }

});

// ══════════════════════════════════════════════════════════════════════════════
// Conciliación
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Carga ventas y entregas si no están en caché, luego renderiza la vista.
 * Se llama al activar la vista y al cambiar de período.
 */
async function _cargarConciliacion() {
    document.getElementById('con-contenido').innerHTML =
        '<p class="caj-empty">Cargando conciliación...</p>';

    const loads = [];
    if (!_ventasDatos.length) loads.push(_cargarVentas());
    if (!_entregas.length)    loads.push(_cargarEntregas());
    if (loads.length) await Promise.all(loads);

    _renderConciliacion();
}

function _renderConciliacion() {
    const contenido = document.getElementById('con-contenido');

    // ── 1. Esperado por sede: sum(totalNeto) de todas las semanas ──────────────
    const esperado  = {};   // sede → number
    for (const sem of _ventasDatos) {
        for (const s of sem.sedes) {
            esperado[s.sede] = (esperado[s.sede] || 0) + s.totalNeto;
        }
    }

    // ── 2. Registrado en caja_movimientos (pago_sede) por sede ─────────────────
    const cobrado  = {};   // sede → number (estado=pagado)
    const pendiente = {};  // sede → number (estado=pendiente)
    for (const m of _todos) {
        if (m.tipo !== 'ingreso' || m.categoria !== 'pago_sede' || !m.sede) continue;
        if (m.estado === 'pendiente') {
            pendiente[m.sede] = (pendiente[m.sede] || 0) + Number(m.monto);
        } else {
            cobrado[m.sede] = (cobrado[m.sede] || 0) + Number(m.monto);
        }
    }

    // ── 3. Entregado físicamente por sede (caja_entregas_efectivo) ─────────────
    const entregado = {};  // sede → number
    for (const e of _entregas) {
        entregado[e.sede] = (entregado[e.sede] || 0) + Number(e.monto);
    }

    // ── 4. Unir todas las sedes conocidas ──────────────────────────────────────
    const sedes = [...new Set([
        ...Object.keys(esperado),
        ...Object.keys(cobrado),
        ...Object.keys(pendiente),
        ...Object.keys(entregado),
    ])].sort();

    if (!sedes.length) {
        contenido.innerHTML = '<p class="caj-empty">Sin datos para conciliar en este período.</p>';
        return;
    }

    // ── 5. Totales globales ────────────────────────────────────────────────────
    let totEsp = 0, totCob = 0, totPend = 0, totEnt = 0;

    const filas = sedes.map(sede => {
        const esp  = esperado[sede]   || 0;
        const cob  = cobrado[sede]    || 0;
        const pend = pendiente[sede]  || 0;
        const ent  = entregado[sede]  || 0;
        const dif  = cob - ent;   // >0 registrado sin entregar, <0 entregado sin registrar

        totEsp  += esp;
        totCob  += cob;
        totPend += pend;
        totEnt  += ent;

        // Dot de estado: OK si dif===0 y pend===0, PEND si hay pendiente, DIF si hay diferencia
        let dotClass = 'con-dot--ok';
        if (pend > 0)       dotClass = 'con-dot--pend';
        if (dif !== 0)      dotClass = 'con-dot--dif';

        const difHtml = dif === 0
            ? `<span class="con-val--zero">$0</span>`
            : dif > 0
                ? `<span class="con-val--pend">+${_fmt(dif)}</span>`
                : `<span class="con-val--neg">${_fmt(dif)}</span>`;

        return `
            <tr>
                <td>
                    <span class="con-estado-dot ${dotClass}"></span>
                    ${_esc(capitalizarSede(sede))}
                </td>
                <td>${esp   ? _fmt(esp)  : '<span class="con-val--zero">—</span>'}</td>
                <td class="${cob  ? 'con-val--ok'  : ''}">${cob  ? _fmt(cob)  : '<span class="con-val--zero">—</span>'}</td>
                <td class="${pend ? 'con-val--pend' : ''}">${pend ? _fmt(pend) : '<span class="con-val--zero">—</span>'}</td>
                <td class="${ent  ? 'con-val--ok'  : ''}">${ent  ? _fmt(ent)  : '<span class="con-val--zero">—</span>'}</td>
                <td>${difHtml}</td>
            </tr>
        `;
    }).join('');

    const totDif  = totCob - totEnt;
    const totDifHtml = totDif === 0
        ? `<span class="con-val--zero">$0</span>`
        : totDif > 0
            ? `<span class="con-val--pend">+${_fmt(totDif)}</span>`
            : `<span class="con-val--neg">${_fmt(totDif)}</span>`;

    contenido.innerHTML = `
        <div class="con-tabla-wrap">
            <div class="con-tabla-titulo">
                <svg viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
                    <path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/>
                </svg>
                Conciliación por sede — resumen del mes
            </div>
            <table class="con-tabla">
                <thead>
                    <tr>
                        <th>Sede</th>
                        <th>Esperado (ventas)</th>
                        <th>Registrado cobrado</th>
                        <th>Pendiente de cobro</th>
                        <th>Entregado (efectivo)</th>
                        <th>Dif. registro vs entrega</th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
                <tfoot>
                    <tr>
                        <td>Total</td>
                        <td>${_fmt(totEsp)}</td>
                        <td>${_fmt(totCob)}</td>
                        <td>${totPend ? `<span class="con-val--pend">${_fmt(totPend)}</span>` : _fmt(0)}</td>
                        <td>${_fmt(totEnt)}</td>
                        <td>${totDifHtml}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;
}

// ══════════════════════════════════════════════════════════════════════════════
// Entregas de efectivo
// ══════════════════════════════════════════════════════════════════════════════

let _entregas = [];   // cache del período actual

// ── Carga y renderizado ────────────────────────────────────────────────────────
async function _cargarEntregas() {
    const tbody = document.getElementById('ent-tbody');
    tbody.innerHTML = `<tr><td colspan="8" class="caj-empty">Cargando...</td></tr>`;

    const { desde, hasta } = _rangoFechas();
    const { data, error } = await supabase
        .from('caja_entregas_efectivo')
        .select('id, sede, fecha, monto, metodo, concepto, comprobante, notas, conciliado, usuario, created_at')
        .gte('fecha', desde)
        .lt('fecha', hasta)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[entregas] cargar:', error);
        tbody.innerHTML = `<tr><td colspan="8" class="caj-empty">Error al cargar entregas</td></tr>`;
        return;
    }
    _entregas = data || [];
    _renderTablaEntregas();
}

function _renderTablaEntregas() {
    const tbody = document.getElementById('ent-tbody');
    if (!_entregas.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="caj-empty">Sin entregas registradas este mes</td></tr>`;
        return;
    }

    tbody.innerHTML = _entregas.map(e => `
        <tr>
            <td>${_formatFecha(e.fecha)}</td>
            <td>${_esc(capitalizarSede(e.sede))}</td>
            <td>${_esc(e.concepto)}</td>
            <td>${e.metodo === 'transferencia' ? 'Transferencia' : 'Efectivo'}</td>
            <td style="color:${e.comprobante ? 'inherit' : '#ccc'}">${_esc(e.comprobante) !== '—' ? _esc(e.comprobante) : '—'}</td>
            <td>${e.conciliado
                ? '<span class="caj-badge caj-badge--pagado">Conciliado</span>'
                : '<span class="caj-badge caj-badge--pendiente">Pendiente</span>'}</td>
            <td style="text-align:right" class="caj-monto--ingreso">${_fmt(e.monto)}</td>
            <td>
                ${!e.conciliado && _esAdmin
                    ? `<div class="caj-td-acciones"><button class="caj-btn-delete" data-ent-id="${e.id}" title="Eliminar">🗑</button></div>`
                    : ''}
            </td>
        </tr>
    `).join('');

    // Fila total
    const total = _entregas.reduce((s, e) => s + Number(e.monto), 0);
    tbody.insertAdjacentHTML('beforeend', `
        <tr class="inf-row--total">
            <td colspan="6" style="text-align:right;font-size:1.2rem">Total del mes</td>
            <td class="inf-val inf-val--ing">${_fmt(total)}</td>
            <td></td>
        </tr>
    `);
}

// ── Dialog nueva entrega ───────────────────────────────────────────────────────
const _entDialog  = document.getElementById('ent-dialog');
const _entError   = document.getElementById('ent-error');

function _abrirDialogEntrega() {
    _entError.style.display = 'none';
    document.getElementById('ent-sede').value       = '';
    document.getElementById('ent-fecha').value       = _toISO(new Date());
    document.getElementById('ent-monto').value       = '';
    document.getElementById('ent-metodo').value      = 'efectivo';
    document.getElementById('ent-concepto').value    = 'Entrega de efectivo';
    document.getElementById('ent-comprobante').value = '';
    document.getElementById('ent-notas').value       = '';
    _entDialog.showModal();
}

function _cerrarDialogEntrega() {
    _entDialog.close();
}

document.getElementById('ent-btn-nueva').addEventListener('click',       _abrirDialogEntrega);
document.getElementById('ent-dialog-cerrar').addEventListener('click',   _cerrarDialogEntrega);
document.getElementById('ent-dialog-cancelar').addEventListener('click', _cerrarDialogEntrega);
_entDialog.addEventListener('click', e => { if (e.target === _entDialog) _entDialog.close(); });

document.getElementById('ent-dialog-guardar').addEventListener('click', async () => {
    _entError.style.display = 'none';

    const sede       = document.getElementById('ent-sede').value.trim();
    const fecha      = document.getElementById('ent-fecha').value;
    const monto      = parseInt(document.getElementById('ent-monto').value, 10);
    const metodo     = document.getElementById('ent-metodo').value;
    const concepto   = document.getElementById('ent-concepto').value.trim();
    const comprobante = document.getElementById('ent-comprobante').value.trim();
    const notas      = document.getElementById('ent-notas').value.trim();

    if (!sede)              return _mostrarErrorEnt('Selecciona una sede.');
    if (!fecha)             return _mostrarErrorEnt('La fecha es obligatoria.');
    if (!monto || monto < 1) return _mostrarErrorEnt('El monto debe ser mayor a cero.');
    if (!concepto)          return _mostrarErrorEnt('El concepto es obligatorio.');

    const btn = document.getElementById('ent-dialog-guardar');
    btn.disabled = true;

    const { data, error } = await supabase
        .from('caja_entregas_efectivo')
        .insert([{
            sede,
            fecha,
            monto,
            metodo,
            concepto,
            comprobante : comprobante || null,
            notas       : notas       || null,
            usuario     : _usuario,
        }])
        .select()
        .single();

    btn.disabled = false;

    if (error) {
        console.error('[entregas] guardar:', error);
        return _mostrarErrorEnt('Error al guardar. Intenta de nuevo.');
    }

    _cerrarDialogEntrega();

    // Actualizar caché local si la fecha cae en el período actual
    const { desde, hasta } = _rangoFechas();
    if (data.fecha >= desde && data.fecha < hasta) {
        _entregas.unshift(data);
        _renderTablaEntregas();
    }
});

function _mostrarErrorEnt(msg) {
    _entError.textContent    = msg;
    _entError.style.display  = 'block';
}

// ── Eliminar entrega ───────────────────────────────────────────────────────────
document.getElementById('ent-tbody').addEventListener('click', async e => {
    const btn = e.target.closest('[data-ent-id]');
    if (!btn) return;
    if (!_esAdmin) return;

    const id = btn.dataset.entId;
    if (!confirm('¿Eliminar esta entrega? Esta acción no se puede deshacer.')) return;

    const { error } = await supabase
        .from('caja_entregas_efectivo')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('[entregas] eliminar:', error);
        alert('Error al eliminar la entrega.');
        return;
    }

    _entregas = _entregas.filter(e => e.id !== id);
    _renderTablaEntregas();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Formatea un número como pesos colombianos con signo $. */
function _fmt(n) {
    return `$${Number(n).toLocaleString('es-CO')}`;
}

/** Convierte una fecha local a string 'YYYY-MM-DD' sin desfase UTC. */
function _toISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Formatea un string de fecha ISO ('YYYY-MM-DD') para mostrar en tabla. */
function _formatFecha(iso) {
    if (!iso) return '—';
    return new Date(iso + 'T12:00:00')
        .toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Retorna el label legible de una categoría a partir de su value. */
function _labelCategoria(value) {
    const todas = [...CAJA_CATEGORIAS.ingreso, ...CAJA_CATEGORIAS.egreso];
    return todas.find(c => c.value === value)?.label || value;
}

/** Genera texto de conteo de movimientos. */
function _plural(n) {
    return `${n} movimiento${n !== 1 ? 's' : ''}`;
}

/** Escapa HTML básico para evitar XSS al insertar texto en innerHTML. */
function _esc(str) {
    if (!str) return '—';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Retorna el número de semana del mes (1-6) para una fecha ISO 'YYYY-MM-DD'. */
function _semanaNumero(fechaISO) {
    const date = new Date(fechaISO + 'T12:00:00');
    const { desde } = getPeriodoParaFecha(date);
    return getNumeroPeriodo(desde);
}

/** Muestra un mensaje de error en el dialog principal. */
function _showError(msg) {
    const el = document.getElementById('caj-error');
    el.textContent   = msg;
    el.style.display = 'block';
}

/**
 * Retorna todas las semanas (períodos) de un mes dado.
 * Cada entrada: { desde: Date, hasta: Date }
 */
function _semanasDelMes(year, month) {
    const semanas = [];
    let cursor = new Date(year, month - 1, 1, 12, 0, 0);
    while (cursor.getMonth() === month - 1) {
        const { desde, hasta } = getPeriodoParaFecha(cursor);
        semanas.push({ desde, hasta });
        const siguiente = new Date(hasta);
        siguiente.setDate(siguiente.getDate() + 1);
        siguiente.setHours(12, 0, 0, 0);
        cursor = siguiente;
    }
    return semanas;
}

/**
 * Retorna el índice en `semanas` al que pertenece una fecha ISO 'YYYY-MM-DD'.
 * Devuelve -1 si no cae en ninguna semana.
 */
function _semanaIdxParaFecha(fechaISO, semanas) {
    const fecha = new Date(fechaISO + 'T12:00:00');
    return semanas.findIndex(({ desde, hasta }) => fecha >= desde && fecha <= hasta);
}

// ══════════════════════════════════════════════════════════════════════════════
// Dashboard Gerencial — resumen diario cross-sede (admin)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Carga cierres y egresos de todas las sedes para la fecha seleccionada.
 * Solo accesible para planta-admin / admin.
 */
async function _cargarGerencial() {
    const contenido = document.getElementById('ger-contenido');
    const kpiRow    = document.getElementById('ger-kpi-row');

    contenido.innerHTML  = '<p class="caj-empty">Cargando datos...</p>';
    kpiRow.style.display = 'none';

    // Sincronizar input con estado
    document.getElementById('ger-fecha').value = _gerFecha;

    const [
        { data: cierres, error: errC },
        { data: egresos, error: errE },
    ] = await Promise.all([
        supabase
            .from('sede_caja_cierres')
            .select('id, sede, fecha, informe_z, ing_efectivo, ing_transferencia, ing_datafono, ing_rappi, ing_otros, estado')
            .eq('fecha', _gerFecha),
        supabase
            .from('sede_caja_egresos')
            .select('id, sede, fecha, monto')
            .eq('fecha', _gerFecha),
    ]);

    if (errC || errE) {
        console.error('[gerencial] cargar:', errC || errE);
        contenido.innerHTML = '<p class="caj-empty">Error al cargar datos.</p>';
        return;
    }

    _renderGerencial(cierres || [], egresos || []);
}

function _renderGerencial(cierres, egresos) {
    const contenido = document.getElementById('ger-contenido');
    const kpiRow    = document.getElementById('ger-kpi-row');

    // Agrupar egresos por sede
    const egrPorSede = {};
    egresos.forEach(e => {
        egrPorSede[e.sede] = (egrPorSede[e.sede] || 0) + Number(e.monto);
    });

    // Mapa de cierres por sede
    const cierrePorSede = {};
    cierres.forEach(c => { cierrePorSede[c.sede] = c; });

    if (!_sedes.length) {
        contenido.innerHTML = '<p class="caj-empty">Sin sedes disponibles.</p>';
        return;
    }

    let totalIngresos = 0, totalEgresos = 0, sedesConReporte = 0;

    const filas = _sedes.map(s => {
        const sedeName = s.name.toLowerCase();
        const c        = cierrePorSede[sedeName];
        const egrSede  = egrPorSede[sedeName] || 0;

        if (!c) {
            return `
                <tr class="ger-row--sin-reporte">
                    <td class="ger-sede-nombre">${_esc(s.name)}</td>
                    <td colspan="11"><span class="ger-sin-reporte">Sin reporte</span></td>
                </tr>`;
        }

        sedesConReporte++;

        const informeZ  = Number(c.informe_z)        || 0;
        const efectivo  = Number(c.ing_efectivo)      || 0;
        const transf    = Number(c.ing_transferencia) || 0;
        const datafono  = Number(c.ing_datafono)      || 0;
        const rappi     = Number(c.ing_rappi)         || 0;
        const otros     = Number(c.ing_otros)         || 0;
        const totalReal = efectivo + transf + datafono + rappi + otros;
        const dif       = informeZ - totalReal;
        const balance   = totalReal - egrSede;

        totalIngresos += totalReal;
        totalEgresos  += egrSede;

        const estadoBadge = c.estado === 'cerrado'
            ? '<span class="caj-badge caj-badge--pagado">Cerrado</span>'
            : '<span class="caj-badge caj-badge--pendiente">Borrador</span>';

        const difClass = dif === 0 ? 'con-val--ok' : (dif > 0 ? 'con-val--pend' : 'con-val--neg');

        return `
            <tr>
                <td class="ger-sede-nombre">${_esc(s.name)}</td>
                <td>${estadoBadge}</td>
                <td style="text-align:right">${informeZ ? _fmt(informeZ) : '—'}</td>
                <td style="text-align:right">${efectivo  ? _fmt(efectivo)  : '—'}</td>
                <td style="text-align:right">${transf    ? _fmt(transf)    : '—'}</td>
                <td style="text-align:right">${datafono  ? _fmt(datafono)  : '—'}</td>
                <td style="text-align:right">${rappi     ? _fmt(rappi)     : '—'}</td>
                <td style="text-align:right">${otros     ? _fmt(otros)     : '—'}</td>
                <td style="text-align:right" class="caj-monto--ingreso">${_fmt(totalReal)}</td>
                <td style="text-align:right" class="caj-monto--egreso">${egrSede ? _fmt(egrSede) : '—'}</td>
                <td style="text-align:right" class="${balance >= 0 ? 'caj-monto--ingreso' : 'caj-monto--egreso'}">${_fmt(balance)}</td>
                <td style="text-align:right" class="${difClass}">${dif !== 0 ? _fmt(dif) : '✓'}</td>
            </tr>`;
    }).join('');

    const totalBalance = totalIngresos - totalEgresos;

    contenido.innerHTML = `
        <div class="ger-tabla-wrap">
            <table class="ger-tabla">
                <thead>
                    <tr>
                        <th>Sede</th>
                        <th>Estado</th>
                        <th style="text-align:right">Informe Z</th>
                        <th style="text-align:right">Efectivo</th>
                        <th style="text-align:right">Transf.</th>
                        <th style="text-align:right">Datáfono</th>
                        <th style="text-align:right">Rappi</th>
                        <th style="text-align:right">Otros</th>
                        <th style="text-align:right">Total real</th>
                        <th style="text-align:right">Egresos</th>
                        <th style="text-align:right">Balance</th>
                        <th style="text-align:right">Dif. caja</th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
                <tfoot>
                    <tr>
                        <td colspan="8" style="text-align:right;font-weight:600">Totales</td>
                        <td style="text-align:right;font-weight:600" class="caj-monto--ingreso">${_fmt(totalIngresos)}</td>
                        <td style="text-align:right;font-weight:600" class="caj-monto--egreso">${_fmt(totalEgresos)}</td>
                        <td style="text-align:right;font-weight:600" class="${totalBalance >= 0 ? 'caj-monto--ingreso' : 'caj-monto--egreso'}">${_fmt(totalBalance)}</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        </div>`;

    // KPI cards
    kpiRow.style.display = '';
    document.getElementById('ger-kpi-sedes').textContent     = `${sedesConReporte} / ${_sedes.length}`;
    document.getElementById('ger-kpi-sedes-sub').textContent = 'con reporte';
    document.getElementById('ger-kpi-ingresos').textContent  = sedesConReporte ? _fmt(totalIngresos) : '—';
    document.getElementById('ger-kpi-egresos').textContent   = sedesConReporte ? _fmt(totalEgresos)  : '—';

    const elBalance = document.getElementById('ger-kpi-balance');
    const elBCard   = document.getElementById('ger-kpi-card-balance');
    elBalance.textContent = sedesConReporte ? _fmt(Math.abs(totalBalance)) : '—';
    if (sedesConReporte) {
        elBCard.classList.toggle('positivo', totalBalance >= 0);
        elBCard.classList.toggle('negativo', totalBalance <  0);
    }
}

// ── Navegación fecha gerencial ─────────────────────────────────────────────────
function _gerNavDia(delta) {
    const d = new Date(_gerFecha + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    _gerFecha = _toISO(d);
    _cargarGerencial();
}

document.getElementById('ger-prev').addEventListener('click',   () => _gerNavDia(-1));
document.getElementById('ger-next').addEventListener('click',   () => _gerNavDia(+1));
document.getElementById('ger-fecha').addEventListener('change', e => {
    if (!e.target.value) return;
    _gerFecha = e.target.value;
    _cargarGerencial();
});
