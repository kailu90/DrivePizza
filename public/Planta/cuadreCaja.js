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

// Estado del dialog de liquidación
let _liqOffset   = 0;            // offset de semanas respecto a la semana actual
let _liqDatos    = [];           // [{ sede, totalNeto, periodoRef, yaImportado }]

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
});

document.getElementById('caj-next').addEventListener('click', () => {
    _periodo.month++;
    if (_periodo.month > 12) { _periodo.month = 1; _periodo.year++; }
    _actualizarLabelPeriodo();
    _cargarMovimientos();
});

// ── Carga de datos ────────────────────────────────────────────────────────────
async function _cargarMovimientos() {
    const { desde, hasta } = _rangoFechas();

    const { data, error } = await supabase
        .from('caja_movimientos')
        .select(`
            id, tipo, categoria, concepto, monto, fecha,
            sede, proveedor_nombre, metodo_pago, comprobante,
            notas, usuario, estado, periodo_ref, created_at
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

        const tr = document.createElement('tr');
        if (esPendiente) tr.classList.add('caj-row--pendiente');
        tr.innerHTML = `
            <td>${fecha}</td>
            <td><span class="caj-badge caj-badge--${m.tipo}">${m.tipo === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}</span></td>
            <td>${estadoBadge}</td>
            <td>${catLabel}</td>
            <td>${_esc(m.concepto)}</td>
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
    _liqOffset = 0;
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

    const { desde: desdeDate, hasta: hastaDate } = getPeriodo(_liqOffset);
    const desde = _toISO(desdeDate);
    const hasta  = _toISO(hastaDate);

    const semana    = getNumeroPeriodo(desdeDate);
    const año       = hastaDate.getFullYear();
    const mesNum    = String(hastaDate.getMonth() + 1).padStart(2, '0');
    const periodoRef = `${año}-${mesNum}-S${semana}`;

    const MESES_C = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    document.getElementById('caj-liq-label').textContent =
        `Semana #${semana} · ${desdeDate.getDate()} ${MESES_C[desdeDate.getMonth()]} – ` +
        `${hastaDate.getDate()} ${MESES_C[hastaDate.getMonth()]} ${año}`;

    try {
        const [{ data: rawPedidos, error: errP }, { data: rawDevs, error: errD }] = await Promise.all([
            supabase
                .from('pedidos_planta')
                .select('id_pedido, delivery_date, user_sede, total, status, eliminado')
                .gte('delivery_date', desde)
                .lte('delivery_date', hasta),
            supabase
                .from('movimientos')
                .select('sede, valor_total, subtipo')
                .eq('tipo', 'Devolución')
                .gte('fecha', desdeDate.toISOString())
                .lte('fecha', colFechaToUTC(hasta, 'fin')),
        ]);

        if (errP) throw errP;
        if (errD) throw errD;

        // Agrupar pedidos por sede
        const pedidosPorSede = {};
        pedidosLiquidables(rawPedidos || []).forEach(p => {
            const sede = (p.user_sede || 'sin sede').toLowerCase();
            if (sede === 'planta producción' || sede === 'planta') return;
            pedidosPorSede[sede] = (pedidosPorSede[sede] || 0) + (p.total || 0);
        });

        // Agrupar devoluciones por sede
        const devPorSede = {};
        devolucionesLiquidables(rawDevs || []).forEach(d => {
            const sede = d.sede ? d.sede.toLowerCase() : null;
            if (!sede) return;
            devPorSede[sede] = (devPorSede[sede] || 0) + (d.valor_total || 0);
        });

        const sedes = Object.keys(pedidosPorSede).sort();

        if (!sedes.length) {
            contenido.innerHTML = '<p class="caj-liq-cargando">Sin pedidos esta semana.</p>';
            return;
        }

        _liqDatos = sedes.map(sede => {
            const totalPed  = pedidosPorSede[sede] || 0;
            const totalDev  = devPorSede[sede]     || 0;
            const totalNeto = totalPed - totalDev;
            const yaImportado = _todos.some(m =>
                m.periodo_ref === periodoRef && m.sede === sede
            );
            return { sede, totalPed, totalDev, totalNeto, periodoRef, yaImportado };
        });

        const rows = _liqDatos.map((d, i) => `
            <tr>
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
            </tr>
        `).join('');

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
                <tbody>${rows}</tbody>
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

    const { hasta: hastaDate } = getPeriodo(_liqOffset);

    const registros = seleccionados.map(d => ({
        tipo:        'ingreso',
        categoria:   'pago_sede',
        concepto:    `Liq. ${d.periodoRef.replace(/-S/, ' Sem ')} — ${capitalizarSede(d.sede)}`,
        monto:       Math.round(d.totalNeto),
        fecha:       _toISO(hastaDate),
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

// Navegación de semanas en el dialog de liquidación
document.getElementById('caj-liq-prev').addEventListener('click', () => {
    _liqOffset--;
    _cargarLiqPreview();
});
document.getElementById('caj-liq-next').addEventListener('click', () => {
    _liqOffset++;
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

    // Actualizar caché local
    const idx = _todos.findIndex(m => m.id === _confirmandoId);
    if (idx !== -1) _todos[idx] = { ..._todos[idx], ...updated };
    _confirmandoId = null;

    _renderResumen();
    _renderTabla();
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
    document.getElementById('caj-tab-informe').classList.toggle('caj-tab--active',     vista === 'informe');
    document.getElementById('caj-view-movimientos').style.display = vista === 'movimientos' ? '' : 'none';
    document.getElementById('caj-view-informe').style.display     = vista === 'informe'     ? '' : 'none';
    if (vista === 'informe') _renderInforme();
}

document.getElementById('caj-tab-movimientos').addEventListener('click', () => _switchVista('movimientos'));
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

    // Egresos por método: banco (transferencia + tarjeta) vs efectivo
    const egrBanco    = _todos.filter(m => m.tipo === 'egreso' && m.metodo_pago !== 'efectivo');
    const egrEfectivo = _todos.filter(m => m.tipo === 'egreso' && m.metodo_pago === 'efectivo');

    // ── Totales ────────────────────────────────────────────────────────────
    const totalCobrado   = ingCobrado.reduce((s, m)   => s + Number(m.monto), 0);
    const totalPendiente = ingPendiente.reduce((s, m) => s + Number(m.monto), 0);
    const totalBanco     = egrBanco.reduce((s, m)     => s + Number(m.monto), 0);
    const totalEfectivo  = egrEfectivo.reduce((s, m)  => s + Number(m.monto), 0);
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

    // Panel resumen + utilidad
    const isPos = utilidad >= 0;
    const bloqueResumen = `
        <div class="caj-inf-bloque">
            <div class="caj-inf-bloque__titulo">Resumen del mes</div>
            <table class="caj-inf-tabla">
                <thead><tr><th>Descripción</th><th>Valor</th></tr></thead>
                <tbody>
                    ${_fila('Venta del mes',         totalCobrado,  'inf-val--ing')}
                    ${_fila('Gastos por banco',      totalBanco,    'inf-val--egr')}
                    ${_fila('Gastos en efectivo',    totalEfectivo, 'inf-val--egr')}
                </tbody>
            </table>
            <div class="caj-inf-total ${isPos ? 'caj-inf-total--pos' : 'caj-inf-total--neg'}">
                <span class="caj-inf-total__label">UTILIDAD NETA</span>
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
            </div>
            <div class="caj-inf-col">
                ${bloqueResumen}
            </div>
        </div>`;
}

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
