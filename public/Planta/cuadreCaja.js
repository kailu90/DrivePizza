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
let _vistaActual = 'movimientos';

// Datos de la vista Ventas (calculados, no persisten en BD solos)
let _ventasDatos = [];   // [{ numSemana, desde, hasta, periodoRef, sedes:[...] }]

// Estado del dialog de liquidación
let _liqYear    = new Date().getFullYear();   // año del mes seleccionado
let _liqMonth   = new Date().getMonth() + 1; // mes seleccionado (1-12)
let _liqDatos   = [];            // [{ sede, totalPed, totalDev, totalNeto, periodoRef, hastaDate, numSemana, yaImportado }]

// Estado del dialog de confirmación de pago
let _confirmandoId = null;       // id del movimiento en proceso de confirmación

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
    _poblarFiltroCategoria();

    // Cargar sedes y proveedores en paralelo
    const [sedesData, { data: provData, error: errProv }] = await Promise.all([
        getSedes(),
        supabase.from('proveedores').select('id, nombre').eq('active', true).order('nombre'),
    ]);
    if (errProv) console.error('[cuadreCaja] proveedores:', errProv);

    _sedes       = sedesData || [];
    _proveedores = provData  || [];

    // Poblar select de sedes en el dialog principal
    const selSede = document.getElementById('caj-sede');
    _sedes.forEach(s => {
        const opt = document.createElement('option');
        opt.value       = s.name.toLowerCase();
        opt.textContent = s.name;
        selSede.appendChild(opt);
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
    revelarSplash();
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

document.getElementById('caj-prev').addEventListener('click', () => {
    _periodo.month--;
    if (_periodo.month < 1) { _periodo.month = 12; _periodo.year--; }
    _actualizarLabelPeriodo();
    _cargarMovimientos();
    if (_vistaActual === 'ventas') _cargarVentas();
});

document.getElementById('caj-next').addEventListener('click', () => {
    _periodo.month++;
    if (_periodo.month > 12) { _periodo.month = 1; _periodo.year++; }
    _actualizarLabelPeriodo();
    _cargarMovimientos();
    if (_vistaActual === 'ventas') _cargarVentas();
});

// ── Carga de datos ────────────────────────────────────────────────────────────
async function _cargarMovimientos() {
    const { desde, hasta } = _rangoFechas();

    const { data, error } = await supabase
        .from('caja_movimientos')
        .select(`
            id, tipo, categoria, concepto, monto, fecha,
            sede, proveedor_nombre, metodo_pago, comprobante,
            notas, usuario, estado, periodo_ref, recepcion_id, created_at
        `)
        .gte('fecha', desde)
        .lt('fecha', hasta)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[cuadreCaja] cargar movimientos:', error);
        return;
    }

    _todos = data || [];
    _renderResumen();
    _renderTabla();
    if (_vistaActual === 'informe') _renderInforme();
}

// ── Resumen (4 cards) ─────────────────────────────────────────────────────────
function _renderResumen() {
    const ingresos   = _todos.filter(m => m.tipo === 'ingreso');
    const egresos    = _todos.filter(m => m.tipo === 'egreso');

    const porCobrar  = ingresos.filter(m => m.estado === 'pendiente');
    const cobrado    = ingresos.filter(m => m.estado !== 'pendiente');

    const totalPorCobrar = porCobrar.reduce((s, m) => s + Number(m.monto), 0);
    const totalCobrado   = cobrado.reduce((s, m)   => s + Number(m.monto), 0);
    const totalEgr       = egresos.reduce((s, m)   => s + Number(m.monto), 0);
    const balance        = totalCobrado - totalEgr;

    document.getElementById('caj-total-por-cobrar').textContent = _fmt(totalPorCobrar);
    document.getElementById('caj-total-cobrado').textContent    = _fmt(totalCobrado);
    document.getElementById('caj-total-egresos').textContent    = _fmt(totalEgr);
    document.getElementById('caj-total-balance').textContent    = _fmt(Math.abs(balance));

    document.getElementById('caj-count-por-cobrar').textContent = _plural(porCobrar.length);
    document.getElementById('caj-count-cobrado').textContent    = _plural(cobrado.length);
    document.getElementById('caj-count-egresos').textContent    = _plural(egresos.length);
    document.getElementById('caj-count-total').textContent      = _plural(_todos.length);

    const cardBalance = document.getElementById('caj-card-balance');
    cardBalance.classList.remove('positivo', 'negativo');
    cardBalance.classList.add(balance >= 0 ? 'positivo' : 'negativo');
}

// ── Tabla de movimientos ──────────────────────────────────────────────────────
function _renderTabla() {
    const filtroTipo = document.getElementById('caj-filtro-tipo').value;
    const filtroCat  = document.getElementById('caj-filtro-cat').value;

    let lista = _todos;
    if (filtroTipo) lista = lista.filter(m => m.tipo === filtroTipo);
    if (filtroCat)  lista = lista.filter(m => m.categoria === filtroCat);

    const tbody = document.getElementById('caj-tbody');
    tbody.innerHTML = '';

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="caj-empty">Sin movimientos en este período.</td></tr>`;
        return;
    }

    lista.forEach(m => {
        const fecha    = _formatFecha(m.fecha);
        const catLabel = _labelCategoria(m.categoria);
        const ref      = m.proveedor_nombre
            || (m.sede ? capitalizarSede(m.sede) : '')
            || m.comprobante
            || '';

        const esPendiente  = m.estado === 'pendiente';
        const estadoBadge  = esPendiente
            ? '<span class="caj-badge caj-badge--pendiente">Pendiente</span>'
            : '<span class="caj-badge caj-badge--pagado">Pagado</span>';

        const acciones = [];
        if (esPendiente && m.tipo === 'ingreso') {
            acciones.push(`<button class="caj-btn-confirmar" data-id="${m.id}" title="Confirmar pago recibido">✓</button>`);
        }
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
            <td><span class="caj-badge caj-badge--${m.tipo}">${m.tipo === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}</span></td>
            <td>${estadoBadge}</td>
            <td>${catLabel}</td>
            <td>${conceptoHtml}</td>
            <td style="color:#888;font-size:1.2rem">${_esc(ref)}</td>
            <td style="text-transform:capitalize">${m.metodo_pago}</td>
            <td style="text-align:right" class="caj-monto--${m.tipo}">$${Number(m.monto).toLocaleString('es-CO')}</td>
            <td class="caj-td-acciones">${acciones.join('')}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ── Filtros ───────────────────────────────────────────────────────────────────
document.getElementById('caj-filtro-tipo').addEventListener('change', _renderTabla);
document.getElementById('caj-filtro-cat').addEventListener('change',  _renderTabla);

/** Pobla el select de categoría en la barra de filtros con todas las categorías. */
function _poblarFiltroCategoria() {
    const sel   = document.getElementById('caj-filtro-cat');
    const todas = [...CAJA_CATEGORIAS.ingreso, ...CAJA_CATEGORIAS.egreso];
    todas.forEach(c => {
        const opt = document.createElement('option');
        opt.value       = c.value;
        opt.textContent = c.label;
        sel.appendChild(opt);
    });
}

// ── Acciones en tabla (eliminar + confirmar) ──────────────────────────────────
document.getElementById('caj-tbody').addEventListener('click', async e => {
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

    const { error } = await supabase
        .from('caja_movimientos')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('[cuadreCaja] eliminar:', error);
        alert('Error al eliminar: ' + error.message);
        delBtn.disabled = false;
        return;
    }

    _todos = _todos.filter(m => m.id !== id);
    _renderResumen();
    _renderTabla();
});

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

    const sede       = sedeCampoVisible ? document.getElementById('caj-sede').value      || null : null;
    const provIdRaw  = provCampoVisible ? document.getElementById('caj-proveedor').value         : '';
    const provId     = parseInt(provIdRaw) || null;
    const provNombre = provId ? (_proveedores.find(p => p.id === provId)?.nombre || null) : null;

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
                usuario:          _usuario,
            })
            .select()
            .single();

        if (error) throw error;

        document.getElementById('caj-dialog').close();

        const { desde, hasta } = _rangoFechas();
        if (nuevo.fecha >= desde && nuevo.fecha < hasta) {
            _todos.unshift(nuevo);
            _renderResumen();
            _renderTabla();
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

    // Calcular todas las semanas del mes
    const semanas  = _semanasDelMes(_liqYear, _liqMonth);
    const desdeISO = _toISO(semanas[0].desde);
    const hastaISO = _toISO(semanas[semanas.length - 1].hasta);
    const mesNum   = String(_liqMonth).padStart(2, '0');

    try {
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

        // Acumular pedidos y devoluciones por (semanaIdx, sede)
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
            // Convertir timestamp UTC a fecha Colombia (UTC-5)
            const fechaCol = new Date(new Date(d.fecha).getTime() - 5 * 3600 * 1000);
            const fechaISO = `${fechaCol.getUTCFullYear()}-${String(fechaCol.getUTCMonth() + 1).padStart(2, '0')}-${String(fechaCol.getUTCDate()).padStart(2, '0')}`;
            const idx = _semanaIdxParaFecha(fechaISO, semanas);
            if (idx === -1) return;
            if (!dataPorSemana[idx][sede]) dataPorSemana[idx][sede] = { totalPed: 0, totalDev: 0 };
            dataPorSemana[idx][sede].totalDev += (d.valor_total || 0);
        });

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

    _renderResumen();
    _renderTabla();
    if (_vistaActual === 'ventas') _cargarVentas();
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

function _switchVista(vista) {
    _vistaActual = vista;
    document.getElementById('caj-tab-movimientos').classList.toggle('caj-tab--active', vista === 'movimientos');
    document.getElementById('caj-tab-ventas').classList.toggle('caj-tab--active',      vista === 'ventas');
    document.getElementById('caj-tab-informe').classList.toggle('caj-tab--active',     vista === 'informe');
    document.getElementById('caj-view-movimientos').style.display = vista === 'movimientos' ? '' : 'none';
    document.getElementById('caj-view-ventas').style.display      = vista === 'ventas'      ? '' : 'none';
    document.getElementById('caj-view-informe').style.display     = vista === 'informe'     ? '' : 'none';
    if (vista === 'informe') _renderInforme();
    if (vista === 'ventas')  _cargarVentas();
}

document.getElementById('caj-tab-movimientos').addEventListener('click', () => _switchVista('movimientos'));
document.getElementById('caj-tab-ventas').addEventListener('click',      () => _switchVista('ventas'));
document.getElementById('caj-tab-informe').addEventListener('click',     () => _switchVista('informe'));

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

    const semanas  = _semanasDelMes(_periodo.year, _periodo.month);
    const desdeISO = _toISO(semanas[0].desde);
    const hastaISO = _toISO(semanas[semanas.length - 1].hasta);
    const mesNum   = String(_periodo.month).padStart(2, '0');

    try {
        const [
            { data: rawPedidos, error: errP },
            { data: rawDevs,    error: errD },
            { data: movReg,     error: errM },
        ] = await Promise.all([
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
            supabase
                .from('caja_movimientos')
                .select('id, sede, periodo_ref, estado, monto')
                .eq('tipo', 'ingreso')
                .eq('categoria', 'pago_sede')
                .gte('fecha', desdeISO)
                .lte('fecha', hastaISO),
        ]);

        if (errP) throw errP;
        if (errD) throw errD;
        if (errM) throw errM;

        // Acumular pedidos y devoluciones por (semanaIdx, sede)
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

        // Mapa de registros ya importados: 'periodoRef|sede' → { id, estado }
        const movMap = {};
        (movReg || []).forEach(m => {
            if (m.periodo_ref && m.sede) movMap[`${m.periodo_ref}|${m.sede}`] = { id: m.id, estado: m.estado };
        });

        // Construir _ventasDatos
        _ventasDatos = semanas.map(({ desde, hasta }, idx) => {
            const numSemana  = getNumeroPeriodo(desde);
            const periodoRef = `${_periodo.year}-${mesNum}-S${numSemana}`;
            const sedes      = Object.keys(dataPorSemana[idx]).sort().map(sede => {
                const { totalPed, totalDev } = dataPorSemana[idx][sede];
                const totalNeto = totalPed - totalDev;
                const mov       = movMap[`${periodoRef}|${sede}`] || null;
                return {
                    sede,
                    nombreDisplay: capitalizarSede(sede),
                    totalPed,
                    totalDev,
                    totalNeto,
                    movId:  mov?.id    || null,
                    estado: mov?.estado || null,   // null = sin registrar
                };
            });
            return { numSemana, desde, hasta, periodoRef, sedes };
        }).filter(s => s.sedes.length > 0);

        _renderVentas();

    } catch (err) {
        console.error('[cuadreCaja] cargarVentas:', err);
        contenido.innerHTML = `<p class="caj-empty" style="color:#991b1b">${err.message || 'Error al cargar ventas.'}</p>`;
    }
}

function _renderVentas() {
    const contenido = document.getElementById('caj-ventas-contenido');

    if (!_ventasDatos.length) {
        contenido.innerHTML = '<p class="caj-empty">Sin ventas este mes.</p>';
        return;
    }

    const MESES_C = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    let html = '';

    _ventasDatos.forEach((sem, semIdx) => {
        const rango    = `${sem.desde.getDate()} ${MESES_C[sem.desde.getMonth()]} – ${sem.hasta.getDate()} ${MESES_C[sem.hasta.getMonth()]}`;
        const totalSem = sem.sedes.reduce((s, d) => s + d.totalNeto, 0);

        const rows = sem.sedes.map(d => {
            let badgeHtml, accionHtml;

            if (d.estado === 'pagado') {
                badgeHtml  = '<span class="caj-badge caj-badge--pagado">Pagado</span>';
                accionHtml = '';
            } else if (d.estado === 'pendiente') {
                badgeHtml  = '<span class="caj-badge caj-badge--pendiente">Pendiente</span>';
                accionHtml = `<button class="caj-btn-confirmar" data-id="${d.movId}" title="Confirmar pago recibido">✓ Confirmar</button>`;
            } else {
                badgeHtml  = '<span class="caj-badge caj-vta-badge--noimportado">Sin registrar</span>';
                accionHtml = `<button class="caj-vta-btn-registrar" data-week-idx="${semIdx}" data-sede="${d.sede}">↓ Registrar</button>`;
            }

            const devHtml = d.totalDev > 0
                ? `<span style="color:#991b1b">−$${Math.round(d.totalDev).toLocaleString('es-CO')}</span>`
                : '<span style="color:#ccc">—</span>';

            return `<tr>
                <td class="caj-vta-sede">${_esc(d.nombreDisplay)}</td>
                <td class="caj-vta-num caj-vta-num--ped">$${Math.round(d.totalPed).toLocaleString('es-CO')}</td>
                <td class="caj-vta-num">${devHtml}</td>
                <td class="caj-vta-num caj-vta-num--tot">$${Math.round(d.totalNeto).toLocaleString('es-CO')}</td>
                <td>${badgeHtml}</td>
                <td class="caj-td-acciones">${accionHtml}</td>
            </tr>`;
        }).join('');

        html += `
            <div class="caj-vta-semana">
                <div class="caj-vta-semana__hdr">
                    <span class="caj-vta-semana__titulo">Semana #${sem.numSemana} <span class="caj-vta-semana__rango">· ${rango}</span></span>
                    <span class="caj-vta-semana__total">$${Math.round(totalSem).toLocaleString('es-CO')}</span>
                </div>
                <div class="caj-vta-tabla-wrap">
                    <table class="caj-tabla">
                        <thead>
                            <tr>
                                <th>Sede</th>
                                <th style="text-align:right">Pedidos</th>
                                <th style="text-align:right">Devoluciones</th>
                                <th style="text-align:right">Total neto</th>
                                <th>Estado</th>
                                <th style="width:13rem"></th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>`;
    });

    contenido.innerHTML = html;
}

// Acciones inline en la vista Ventas
document.getElementById('caj-ventas-contenido').addEventListener('click', async e => {
    // Confirmar pago (reutiliza dialog existente)
    const btnConf = e.target.closest('.caj-btn-confirmar');
    if (btnConf) {
        _abrirDialogConfirmar(parseInt(btnConf.dataset.id));
        return;
    }

    // Registrar como pendiente directamente
    const btnReg = e.target.closest('.caj-vta-btn-registrar');
    if (!btnReg) return;

    const semIdx   = parseInt(btnReg.dataset.weekIdx);
    const sedeName = btnReg.dataset.sede;
    const semData  = _ventasDatos[semIdx];
    const sedeData = semData?.sedes.find(s => s.sede === sedeName);
    if (!sedeData) return;

    btnReg.disabled    = true;
    btnReg.textContent = 'Registrando...';

    const { data: nuevo, error } = await supabase
        .from('caja_movimientos')
        .insert({
            tipo:        'ingreso',
            categoria:   'pago_sede',
            concepto:    `Liq. ${semData.periodoRef.replace(/-S/, ' Sem ')} — ${sedeData.nombreDisplay}`,
            monto:       Math.round(sedeData.totalNeto),
            fecha:       _toISO(semData.hasta),
            sede:        sedeData.sede,
            metodo_pago: 'efectivo',
            estado:      'pendiente',
            periodo_ref: semData.periodoRef,
            usuario:     _usuario,
        })
        .select()
        .single();

    if (error) {
        console.error('[cuadreCaja] registrar venta sede:', error);
        alert('Error al registrar: ' + error.message);
        btnReg.disabled    = false;
        btnReg.textContent = '↓ Registrar';
        return;
    }

    // Sincronizar _todos para la pestaña Movimientos
    const { desde, hasta } = _rangoFechas();
    if (nuevo.fecha >= desde && nuevo.fecha < hasta) {
        _todos.unshift(nuevo);
        _renderResumen();
    }

    // Recargar vista ventas
    await _cargarVentas();
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
