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
 *   usuario TEXT, created_at TIMESTAMPTZ
 *
 * Categorías ingreso : pago_sede | otro_ingreso
 * Categorías egreso  : proveedor | colaborador | nomina | servicios | impuestos | otro
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

CargarSidebar();

// ── Estado global ─────────────────────────────────────────────────────────────
let _usuario     = 'Admin';
let _esAdmin     = false;      // planta-admin | admin — puede eliminar movimientos
let _periodo     = _periodoActual();   // { year, month }
let _todos       = [];         // movimientos del período cargados desde BD
let _sedes       = [];         // lista de sedes para el select del dialog
let _proveedores = [];         // lista de proveedores activos para el select del dialog
let _tipoDialog  = 'ingreso';  // tipo seleccionado actualmente en el dialog

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

    // Poblar select de sedes en el dialog
    const selSede = document.getElementById('caj-sede');
    _sedes.forEach(s => {
        const opt = document.createElement('option');
        opt.value       = s.name.toLowerCase();
        opt.textContent = s.name;
        selSede.appendChild(opt);
    });

    // Poblar select de proveedores en el dialog
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

// ── Período ───────────────────────────────────────────────────────────────────
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
    const sigMes   = new Date(year, month, 1);   // new Date(year, month) → día 1 del mes siguiente
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
            notas, usuario, created_at
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
}

// ── Resumen (cards) ───────────────────────────────────────────────────────────
function _renderResumen() {
    const ingresos  = _todos.filter(m => m.tipo === 'ingreso');
    const egresos   = _todos.filter(m => m.tipo === 'egreso');
    const totalIng  = ingresos.reduce((s, m) => s + Number(m.monto), 0);
    const totalEgr  = egresos.reduce((s, m)  => s + Number(m.monto), 0);
    const balance   = totalIng - totalEgr;

    document.getElementById('caj-total-ingresos').textContent = _fmt(totalIng);
    document.getElementById('caj-total-egresos').textContent  = _fmt(totalEgr);
    document.getElementById('caj-total-balance').textContent  = _fmt(Math.abs(balance));
    document.getElementById('caj-count-ingresos').textContent = _plural(ingresos.length);
    document.getElementById('caj-count-egresos').textContent  = _plural(egresos.length);
    document.getElementById('caj-count-total').textContent    = _plural(_todos.length);

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
        tbody.innerHTML = `<tr><td colspan="8" class="caj-empty">Sin movimientos en este período.</td></tr>`;
        return;
    }

    lista.forEach(m => {
        const fecha    = _formatFecha(m.fecha);
        const catLabel = _labelCategoria(m.categoria);

        // Referencia: proveedor > sede > comprobante > usuario
        const ref = m.proveedor_nombre
            || (m.sede ? capitalizarSede(m.sede) : '')
            || m.comprobante
            || '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${fecha}</td>
            <td><span class="caj-badge caj-badge--${m.tipo}">${m.tipo === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}</span></td>
            <td>${catLabel}</td>
            <td>${_esc(m.concepto)}</td>
            <td style="color:#888; font-size:1.2rem">${_esc(ref)}</td>
            <td style="text-transform:capitalize">${m.metodo_pago}</td>
            <td style="text-align:right" class="caj-monto--${m.tipo}">$${Number(m.monto).toLocaleString('es-CO')}</td>
            <td>${_esAdmin ? `<button class="caj-btn-delete" data-id="${m.id}" title="Eliminar movimiento">✕</button>` : ''}</td>
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

// ── Eliminar movimiento (solo admin) ─────────────────────────────────────────
document.getElementById('caj-tbody').addEventListener('click', async e => {
    const btn = e.target.closest('.caj-btn-delete');
    if (!btn || !_esAdmin) return;

    const id = parseInt(btn.dataset.id);
    if (!confirm('¿Eliminar este movimiento? Esta acción no se puede deshacer.')) return;

    btn.disabled = true;

    const { error } = await supabase
        .from('caja_movimientos')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('[cuadreCaja] eliminar:', error);
        alert('Error al eliminar: ' + error.message);
        btn.disabled = false;
        return;
    }

    _todos = _todos.filter(m => m.id !== id);
    _renderResumen();
    _renderTabla();
});

// ── Dialog: abrir ─────────────────────────────────────────────────────────────
function _abrirDialog(tipo) {
    _tipoDialog = tipo;
    _actualizarTipoDialog();

    // Limpiar campos
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

    // Resaltar botón activo
    document.getElementById('caj-tipo-ingreso').className =
        'caj-tipo-btn' + (tipo === 'ingreso' ? ' active-ingreso' : '');
    document.getElementById('caj-tipo-egreso').className =
        'caj-tipo-btn' + (tipo === 'egreso' ? ' active-egreso' : '');

    // Título y color del botón guardar
    document.getElementById('caj-dialog-titulo').textContent =
        tipo === 'ingreso' ? 'Registrar ingreso' : 'Registrar egreso';
    document.getElementById('caj-dialog-guardar').className =
        `caj-btn caj-btn--${tipo}`;

    // Reconstruir opciones de categoría según tipo
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

/**
 * Muestra u oculta los campos opcionales (sede, proveedor)
 * según el tipo y categoría seleccionados.
 */
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

// ── Dialog: cerrar ────────────────────────────────────────────────────────────
document.getElementById('caj-dialog-cerrar').addEventListener('click', () =>
    document.getElementById('caj-dialog').close()
);
document.getElementById('caj-dialog-cancelar').addEventListener('click', () =>
    document.getElementById('caj-dialog').close()
);
// Cerrar al hacer clic en el backdrop
document.getElementById('caj-dialog').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.close();
});

// ── Dialog: guardar ───────────────────────────────────────────────────────────
document.getElementById('caj-dialog-guardar').addEventListener('click', async () => {
    const errorEl    = document.getElementById('caj-error');
    const btnGuardar = document.getElementById('caj-dialog-guardar');

    errorEl.style.display = 'none';

    // Leer valores del formulario
    const categoria   = document.getElementById('caj-categoria').value;
    const concepto    = document.getElementById('caj-concepto').value.trim();
    const monto       = parseFloat(document.getElementById('caj-monto').value);
    const fecha       = document.getElementById('caj-fecha').value;
    const metodo      = document.getElementById('caj-metodo').value;
    const comprobante = document.getElementById('caj-comprobante').value.trim();
    const notas       = document.getElementById('caj-notas').value.trim();

    // Campos contextuales (solo si su contenedor es visible)
    const sedeCampoVisible = document.getElementById('caj-field-sede').style.display !== 'none';
    const provCampoVisible = document.getElementById('caj-field-proveedor').style.display !== 'none';

    const sede      = sedeCampoVisible  ? document.getElementById('caj-sede').value      || null : null;
    const provIdRaw = provCampoVisible  ? document.getElementById('caj-proveedor').value         : '';
    const provId    = parseInt(provIdRaw) || null;
    const provNombre = provId
        ? (_proveedores.find(p => p.id === provId)?.nombre || null)
        : null;

    // Validación
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
                usuario:          _usuario,
            })
            .select()
            .single();

        if (error) throw error;

        document.getElementById('caj-dialog').close();

        // Actualizar caché local solo si el nuevo registro pertenece al período visible
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

/** Muestra un mensaje de error en el dialog. */
function _showError(msg) {
    const el = document.getElementById('caj-error');
    el.textContent   = msg;
    el.style.display = 'block';
}
