/**
 * cuadreSede.js — Pizzerías / DrivePizza
 *
 * Cuadre de caja diario por sede: registra ingresos (Informe Z + desglose
 * por canal) y egresos (variable, fijo, nómina, otro) del día.
 *
 * Tablas Supabase:
 *   sede_caja_cierres  — un registro por día por sede (encabezado del cierre)
 *   sede_caja_egresos  — múltiples egresos por día por sede
 *
 * Roles con acceso: pizzeria, planta-admin, admin
 */

import { supabase } from '../Api/supabaseConfig.js';
import { verificarAccesoPlanta } from '../Auth/plantaAuth.js';
import {
    CargarHeader, CargarSidebar, CargarFooter,
    capitalizarSede, revelarSplash,
} from '../DrivePizza/Shared/components.js';

CargarSidebar();

const ROLES_ACCESO = ['pizzeria', 'planta-admin', 'admin'];

const TIPO_GASTO_LABELS = {
    variable: 'Variable',
    fijo:     'Fijo',
    nomina:   'Nómina',
    otro:     'Otro',
};

// ── Estado global ─────────────────────────────────────────────────────────────
let _usuario     = 'Admin';
let _sede        = '';
let _esAdmin     = false;
let _fecha       = _toISO(new Date());
let _cierre      = null;   // registro sede_caja_cierres del día
let _egresos     = [];     // registros sede_caja_egresos del día
let _vistaActual = 'dia';

// ── Auth ──────────────────────────────────────────────────────────────────────
verificarAccesoPlanta(async ({ username, sede, rol }) => {
    _usuario = username || 'Admin';
    _sede    = (sede || '').toLowerCase();
    _esAdmin = ['planta-admin', 'admin'].includes(rol);

    if (!_sede) {
        document.getElementById('dashboard__main').innerHTML =
            '<p style="text-align:center;padding:5rem;color:#888;font-size:1.4rem">Tu usuario no tiene sede asignada.</p>';
        revelarSplash();
        return;
    }

    CargarHeader(capitalizarSede(_sede));
    CargarFooter();
    _init().catch(err => { console.error('[cuadreSede] init:', err); revelarSplash(); });
}, ROLES_ACCESO);

// ── Init ──────────────────────────────────────────────────────────────────────
async function _init() {
    _actualizarLabelFecha();
    await _cargarDia();
    revelarSplash();
}

// ── Navegación de fecha (día a día) ───────────────────────────────────────────
function _toISO(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function _actualizarLabelFecha() {
    const d = new Date(_fecha + 'T12:00:00');
    document.getElementById('sc-fecha-label').textContent =
        d.toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

    // Deshabilitar "siguiente" si ya es hoy
    document.getElementById('sc-next').disabled = (_fecha >= _toISO(new Date()));
}

document.getElementById('sc-prev').addEventListener('click', () => {
    const d = new Date(_fecha + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    _fecha = _toISO(d);
    _actualizarLabelFecha();
    _cargarDia();
});

document.getElementById('sc-next').addEventListener('click', () => {
    if (_fecha >= _toISO(new Date())) return;
    const d = new Date(_fecha + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    _fecha = _toISO(d);
    _actualizarLabelFecha();
    _cargarDia();
});

// ── Carga del día ─────────────────────────────────────────────────────────────
async function _cargarDia() {
    const [{ data: cierreData, error: errC }, { data: egresosData, error: errE }] = await Promise.all([
        supabase
            .from('sede_caja_cierres')
            .select('*')
            .eq('sede', _sede)
            .eq('fecha', _fecha)
            .maybeSingle(),
        supabase
            .from('sede_caja_egresos')
            .select('*')
            .eq('sede', _sede)
            .eq('fecha', _fecha)
            .order('created_at', { ascending: true }),
    ]);

    if (errC) console.error('[cuadreSede] cargar cierre:', errC);
    if (errE) console.error('[cuadreSede] cargar egresos:', errE);

    _cierre  = cierreData  || null;
    _egresos = egresosData || [];

    _renderTodo();
}

function _renderTodo() {
    _renderEstadoBadge();
    _renderFormIngresos();
    _renderTablaEgresos();
    _renderCards();
    _renderDiferencia();

    const cerrado = _cierre?.estado === 'cerrado';
    const btn = document.getElementById('sc-btn-cerrar-dia');
    btn.style.display = cerrado ? 'none' : '';
    btn.disabled      = false;
    btn.textContent   = 'Cerrar día';
}

// ── Badge de estado ────────────────────────────────────────────────────────────
function _renderEstadoBadge() {
    const el     = document.getElementById('sc-estado-badge');
    const estado = _cierre?.estado || null;
    if (!estado) {
        el.textContent = '';
        el.className   = '';
    } else if (estado === 'cerrado') {
        el.textContent = 'Cerrado';
        el.className   = 'sc-estado-badge sc-estado--cerrado';
    } else {
        el.textContent = 'Borrador';
        el.className   = 'sc-estado-badge sc-estado--borrador';
    }
}

// ── Totales calculados ────────────────────────────────────────────────────────
function _calcTotales() {
    const c             = _cierre;
    const informeZ      = Number(c?.informe_z)         || 0;
    const ingEfectivo   = Number(c?.ing_efectivo)      || 0;
    const ingTransf     = Number(c?.ing_transferencia) || 0;
    const ingDatafono   = Number(c?.ing_datafono)      || 0;
    const ingRappi      = Number(c?.ing_rappi)         || 0;
    const ingOtros      = Number(c?.ing_otros)         || 0;
    const totalIngresos = ingEfectivo + ingTransf + ingDatafono + ingRappi + ingOtros;
    const totalEgresos  = _egresos.reduce((s, e) => s + Number(e.monto), 0);
    const balance       = totalIngresos - totalEgresos;
    const diferencia    = informeZ - totalIngresos; // >0 faltante, <0 sobrante
    return { informeZ, totalIngresos, totalEgresos, balance, diferencia };
}

// ── Cards resumen ──────────────────────────────────────────────────────────────
function _renderCards() {
    const { informeZ, totalIngresos, totalEgresos, balance } = _calcTotales();

    document.getElementById('sc-card-z-monto').textContent   = _fmt(informeZ);
    document.getElementById('sc-card-ing-monto').textContent = _fmt(totalIngresos);
    document.getElementById('sc-card-egr-monto').textContent = _fmt(totalEgresos);
    document.getElementById('sc-card-bal-monto').textContent = _fmt(Math.abs(balance));

    const cardBal = document.getElementById('sc-card-balance');
    cardBal.classList.remove('positivo', 'negativo');
    cardBal.classList.add(balance >= 0 ? 'positivo' : 'negativo');
}

// ── Banner diferencia de caja ──────────────────────────────────────────────────
function _renderDiferencia() {
    const { diferencia, informeZ } = _calcTotales();
    const el = document.getElementById('sc-diferencia-bar');

    if (!informeZ) { el.style.display = 'none'; return; }

    el.style.display = '';
    const abs = Math.abs(Math.round(diferencia));

    if (abs === 0) {
        el.className = 'sc-diferencia-bar sc-dif--ok';
        el.innerHTML = `<span class="sc-dif-icon">&#10003;</span> Sin diferencia de caja — Informe Z cuadra con ingresos registrados`;
    } else if (diferencia > 0) {
        el.className = 'sc-diferencia-bar sc-dif--faltante';
        el.innerHTML = `<span class="sc-dif-icon">!</span> Faltante de caja: <strong>$${abs.toLocaleString('es-CO')}</strong> — El Informe Z supera los ingresos registrados`;
    } else {
        el.className = 'sc-diferencia-bar sc-dif--sobrante';
        el.innerHTML = `<span class="sc-dif-icon">&#8679;</span> Sobrante de caja: <strong>$${abs.toLocaleString('es-CO')}</strong> — Los ingresos registrados superan el Informe Z`;
    }
}

// ── Formulario ingresos ────────────────────────────────────────────────────────
function _renderFormIngresos() {
    const c       = _cierre;
    const cerrado = c?.estado === 'cerrado';

    document.getElementById('sc-ing-z').value             = c?.informe_z         || '';
    document.getElementById('sc-ing-efectivo').value      = c?.ing_efectivo      || '';
    document.getElementById('sc-ing-transferencia').value = c?.ing_transferencia || '';
    document.getElementById('sc-ing-datafono').value      = c?.ing_datafono      || '';
    document.getElementById('sc-ing-rappi').value         = c?.ing_rappi         || '';
    document.getElementById('sc-ing-otros').value         = c?.ing_otros         || '';

    const idsIng = ['sc-ing-z','sc-ing-efectivo','sc-ing-transferencia','sc-ing-datafono','sc-ing-rappi','sc-ing-otros'];
    idsIng.forEach(id => { document.getElementById(id).disabled = cerrado; });

    document.getElementById('sc-btn-guardar-ing').style.display = cerrado ? 'none' : '';
    _actualizarTotalReal();
}

function _actualizarTotalReal() {
    const val = id => parseFloat(document.getElementById(id).value) || 0;
    const total = val('sc-ing-efectivo') + val('sc-ing-transferencia') +
                  val('sc-ing-datafono') + val('sc-ing-rappi')       + val('sc-ing-otros');
    document.getElementById('sc-ing-total').textContent = _fmt(total);

    // Actualizar diferencia en tiempo real (usando valor del input Z)
    const z = parseFloat(document.getElementById('sc-ing-z').value) || 0;
    if (z > 0) {
        const dif   = z - total;
        const el    = document.getElementById('sc-diferencia-bar');
        const abs   = Math.abs(Math.round(dif));
        el.style.display = '';
        if (abs === 0) {
            el.className = 'sc-diferencia-bar sc-dif--ok';
            el.innerHTML = `<span class="sc-dif-icon">&#10003;</span> Sin diferencia de caja`;
        } else if (dif > 0) {
            el.className = 'sc-diferencia-bar sc-dif--faltante';
            el.innerHTML = `<span class="sc-dif-icon">!</span> Faltante: <strong>$${abs.toLocaleString('es-CO')}</strong>`;
        } else {
            el.className = 'sc-diferencia-bar sc-dif--sobrante';
            el.innerHTML = `<span class="sc-dif-icon">&#8679;</span> Sobrante: <strong>$${abs.toLocaleString('es-CO')}</strong>`;
        }
    }
}

['sc-ing-z','sc-ing-efectivo','sc-ing-transferencia','sc-ing-datafono','sc-ing-rappi','sc-ing-otros']
    .forEach(id => document.getElementById(id).addEventListener('input', _actualizarTotalReal));

// Guardar ingresos (upsert)
document.getElementById('sc-btn-guardar-ing').addEventListener('click', async () => {
    const btn = document.getElementById('sc-btn-guardar-ing');
    btn.disabled    = true;
    btn.textContent = 'Guardando...';

    const payload = {
        sede:              _sede,
        fecha:             _fecha,
        informe_z:         parseFloat(document.getElementById('sc-ing-z').value)             || null,
        ing_efectivo:      parseFloat(document.getElementById('sc-ing-efectivo').value)      || 0,
        ing_transferencia: parseFloat(document.getElementById('sc-ing-transferencia').value) || 0,
        ing_datafono:      parseFloat(document.getElementById('sc-ing-datafono').value)      || 0,
        ing_rappi:         parseFloat(document.getElementById('sc-ing-rappi').value)         || 0,
        ing_otros:         parseFloat(document.getElementById('sc-ing-otros').value)         || 0,
        usuario:           _usuario,
        updated_at:        new Date().toISOString(),
    };

    const { data, error } = _cierre
        ? await supabase.from('sede_caja_cierres').update(payload).eq('id', _cierre.id).select().single()
        : await supabase.from('sede_caja_cierres').insert({ ...payload, estado: 'borrador' }).select().single();

    if (error) {
        console.error('[cuadreSede] guardar ingresos:', error);
        alert('Error al guardar: ' + error.message);
    } else {
        _cierre = data;
        _renderCards();
        _renderDiferencia();
        _renderEstadoBadge();
        const btnCerrar = document.getElementById('sc-btn-cerrar-dia');
        btnCerrar.style.display = '';
    }

    btn.disabled    = false;
    btn.textContent = 'Guardar ingresos';
});

// ── Tabla egresos ──────────────────────────────────────────────────────────────
function _renderTablaEgresos() {
    const cerrado = _cierre?.estado === 'cerrado';
    const tbody   = document.getElementById('sc-egresos-tbody');

    document.getElementById('sc-btn-add-egreso').style.display = cerrado ? 'none' : '';
    tbody.innerHTML = '';

    if (!_egresos.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="sc-empty">Sin egresos registrados.</td></tr>`;
        return;
    }

    _egresos.forEach(e => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${_esc(e.concepto)}</td>
            <td><span class="sc-badge-tipo sc-tipo--${e.tipo_gasto}">${TIPO_GASTO_LABELS[e.tipo_gasto] || e.tipo_gasto}</span></td>
            <td style="text-transform:capitalize;color:#888;font-size:1.2rem">${e.metodo_pago}</td>
            <td style="text-align:right;font-weight:700;color:#991b1b">$${Number(e.monto).toLocaleString('es-CO')}</td>
            <td class="sc-td-acciones">
                ${!cerrado ? `<button class="sc-btn-del" data-id="${e.id}" title="Eliminar">✕</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Fila de total
    const totalEgr = _egresos.reduce((s, e) => s + Number(e.monto), 0);
    const trTotal  = document.createElement('tr');
    trTotal.className = 'sc-row-total';
    trTotal.innerHTML = `
        <td colspan="3" style="font-weight:700;color:#666">Total egresos</td>
        <td style="text-align:right;font-weight:700;color:#991b1b">$${Math.round(totalEgr).toLocaleString('es-CO')}</td>
        <td></td>
    `;
    tbody.appendChild(trTotal);
}

// Eliminar egreso
document.getElementById('sc-egresos-tbody').addEventListener('click', async e => {
    const btn = e.target.closest('.sc-btn-del');
    if (!btn) return;

    const id = parseInt(btn.dataset.id);
    if (!confirm('¿Eliminar este egreso?')) return;

    btn.disabled = true;
    const { error } = await supabase.from('sede_caja_egresos').delete().eq('id', id);

    if (error) {
        console.error('[cuadreSede] eliminar egreso:', error);
        alert('Error: ' + error.message);
        btn.disabled = false;
        return;
    }

    _egresos = _egresos.filter(eg => eg.id !== id);
    _renderTablaEgresos();
    _renderCards();
});

// ── Dialog egreso: abrir / cerrar ─────────────────────────────────────────────
document.getElementById('sc-btn-add-egreso').addEventListener('click', () => {
    document.getElementById('sc-egr-tipo').value        = 'variable';
    document.getElementById('sc-egr-concepto').value    = '';
    document.getElementById('sc-egr-monto').value       = '';
    document.getElementById('sc-egr-metodo').value      = 'efectivo';
    document.getElementById('sc-egr-comprobante').value = '';
    document.getElementById('sc-egr-notas').value       = '';
    document.getElementById('sc-egr-error').style.display = 'none';

    const btn = document.getElementById('sc-egr-guardar');
    btn.disabled    = false;
    btn.textContent = 'Guardar egreso';

    document.getElementById('sc-dialog-egreso').showModal();
    requestAnimationFrame(() => document.getElementById('sc-egr-concepto').focus());
});

document.getElementById('sc-egr-cerrar').addEventListener('click',   () => document.getElementById('sc-dialog-egreso').close());
document.getElementById('sc-egr-cancelar').addEventListener('click', () => document.getElementById('sc-dialog-egreso').close());
document.getElementById('sc-dialog-egreso').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.close();
});

// ── Dialog egreso: guardar ────────────────────────────────────────────────────
document.getElementById('sc-egr-guardar').addEventListener('click', async () => {
    const btn   = document.getElementById('sc-egr-guardar');
    const errEl = document.getElementById('sc-egr-error');

    errEl.style.display = 'none';

    const tipo        = document.getElementById('sc-egr-tipo').value;
    const concepto    = document.getElementById('sc-egr-concepto').value.trim();
    const monto       = parseFloat(document.getElementById('sc-egr-monto').value);
    const metodo      = document.getElementById('sc-egr-metodo').value;
    const comprobante = document.getElementById('sc-egr-comprobante').value.trim();
    const notas       = document.getElementById('sc-egr-notas').value.trim();

    if (!concepto)        { errEl.textContent = 'El concepto es obligatorio.';     errEl.style.display = 'block'; return; }
    if (!monto || monto <= 0) { errEl.textContent = 'El monto debe ser mayor a 0.'; errEl.style.display = 'block'; return; }

    btn.disabled    = true;
    btn.textContent = 'Guardando...';

    const { data: nuevo, error } = await supabase
        .from('sede_caja_egresos')
        .insert({
            sede:        _sede,
            fecha:       _fecha,
            tipo_gasto:  tipo,
            concepto,
            monto,
            metodo_pago: metodo,
            comprobante: comprobante || null,
            notas:       notas       || null,
            usuario:     _usuario,
        })
        .select()
        .single();

    if (error) {
        console.error('[cuadreSede] insertar egreso:', error);
        errEl.textContent   = error.message;
        errEl.style.display = 'block';
        btn.disabled    = false;
        btn.textContent = 'Guardar egreso';
        return;
    }

    document.getElementById('sc-dialog-egreso').close();
    _egresos.push(nuevo);
    _renderTablaEgresos();
    _renderCards();
});

// ── Cerrar día ─────────────────────────────────────────────────────────────────
document.getElementById('sc-btn-cerrar-dia').addEventListener('click', async () => {
    const { informeZ, totalIngresos } = _calcTotales();

    if (!informeZ && !totalIngresos && !_egresos.length) {
        alert('Registra al menos el Informe Z o algún movimiento antes de cerrar el día.');
        return;
    }

    if (!confirm('¿Confirmar cierre del día?\n\nUna vez cerrado no podrás editar ingresos ni agregar egresos.')) return;

    const btn = document.getElementById('sc-btn-cerrar-dia');
    btn.disabled    = true;
    btn.textContent = 'Cerrando...';

    let error;

    if (!_cierre) {
        // Sin cierre previo: crear con estado cerrado directamente
        const { data, error: err } = await supabase
            .from('sede_caja_cierres')
            .insert({
                sede: _sede, fecha: _fecha,
                ing_efectivo: 0, ing_transferencia: 0, ing_datafono: 0,
                ing_rappi: 0, ing_otros: 0,
                estado: 'cerrado', usuario: _usuario,
                updated_at: new Date().toISOString(),
            })
            .select().single();
        _cierre = data;
        error   = err;
    } else {
        const { data, error: err } = await supabase
            .from('sede_caja_cierres')
            .update({ estado: 'cerrado', updated_at: new Date().toISOString() })
            .eq('id', _cierre.id)
            .select().single();
        _cierre = data;
        error   = err;
    }

    if (error) {
        console.error('[cuadreSede] cerrar día:', error);
        alert('Error al cerrar: ' + error.message);
        btn.disabled    = false;
        btn.textContent = 'Cerrar día';
        return;
    }

    _renderTodo();
});

// ── Pestañas ───────────────────────────────────────────────────────────────────
function _switchVista(vista) {
    _vistaActual = vista;
    document.getElementById('sc-tab-dia').classList.toggle('sc-tab--active',       vista === 'dia');
    document.getElementById('sc-tab-historial').classList.toggle('sc-tab--active', vista === 'historial');
    document.getElementById('sc-view-dia').style.display        = vista === 'dia'       ? '' : 'none';
    document.getElementById('sc-view-historial').style.display  = vista === 'historial' ? '' : 'none';
    if (vista === 'historial') _cargarHistorial();
}

document.getElementById('sc-tab-dia').addEventListener('click',       () => _switchVista('dia'));
document.getElementById('sc-tab-historial').addEventListener('click', () => _switchVista('historial'));

// ── Historial (últimos 60 días) ────────────────────────────────────────────────
async function _cargarHistorial() {
    const contenido = document.getElementById('sc-hist-contenido');
    contenido.innerHTML = '<p class="sc-empty">Cargando...</p>';

    const hoyD  = new Date();
    const desdeD = new Date(hoyD);
    desdeD.setDate(desdeD.getDate() - 60);

    const hasta = _toISO(hoyD);
    const desde = _toISO(desdeD);

    const [{ data: cierres, error: errC }, { data: egData, error: errE }] = await Promise.all([
        supabase
            .from('sede_caja_cierres')
            .select('*')
            .eq('sede', _sede)
            .gte('fecha', desde)
            .lte('fecha', hasta)
            .order('fecha', { ascending: false }),
        supabase
            .from('sede_caja_egresos')
            .select('fecha, monto')
            .eq('sede', _sede)
            .gte('fecha', desde)
            .lte('fecha', hasta),
    ]);

    if (errC || errE) {
        contenido.innerHTML = `<p class="sc-empty" style="color:#991b1b">Error al cargar historial.</p>`;
        return;
    }

    if (!cierres?.length) {
        contenido.innerHTML = '<p class="sc-empty">Sin registros en los últimos 60 días.</p>';
        return;
    }

    // Acumular egresos por fecha
    const egrPorFecha = {};
    (egData || []).forEach(e => {
        egrPorFecha[e.fecha] = (egrPorFecha[e.fecha] || 0) + Number(e.monto);
    });

    const rows = cierres.map(c => {
        const totalIng = (Number(c.ing_efectivo) + Number(c.ing_transferencia) +
                          Number(c.ing_datafono)  + Number(c.ing_rappi) + Number(c.ing_otros));
        const totalEgr = egrPorFecha[c.fecha] || 0;
        const balance  = totalIng - totalEgr;
        const dif      = (Number(c.informe_z) || 0) - totalIng;
        const fechaFmt = new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-CO', {
            weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
        });

        const difHtml = dif === 0
            ? `<span style="color:#15803d">$0</span>`
            : dif > 0
                ? `<span style="color:#92400e">−$${Math.round(Math.abs(dif)).toLocaleString('es-CO')}</span>`
                : `<span style="color:#1e40af">+$${Math.round(Math.abs(dif)).toLocaleString('es-CO')}</span>`;

        return `<tr class="sc-hist-row" data-fecha="${c.fecha}" style="cursor:pointer" title="Ver este día">
            <td>${fechaFmt}</td>
            <td style="text-align:right">${c.informe_z != null ? _fmt(c.informe_z) : '—'}</td>
            <td style="text-align:right;color:var(--color-primario);font-weight:700">${_fmt(totalIng)}</td>
            <td style="text-align:right;color:#991b1b;font-weight:700">${_fmt(totalEgr)}</td>
            <td style="text-align:right;font-weight:700" class="${balance >= 0 ? 'sc-pos' : 'sc-neg'}">${balance < 0 ? '−' : ''}${_fmt(Math.abs(balance))}</td>
            <td style="text-align:right">${difHtml}</td>
            <td><span class="sc-estado-badge ${c.estado === 'cerrado' ? 'sc-estado--cerrado' : 'sc-estado--borrador'}">${c.estado === 'cerrado' ? 'Cerrado' : 'Borrador'}</span></td>
        </tr>`;
    }).join('');

    contenido.innerHTML = `
        <div class="sc-hist-wrap">
            <table class="sc-tabla">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th style="text-align:right">Informe Z</th>
                        <th style="text-align:right">Ingresos</th>
                        <th style="text-align:right">Egresos</th>
                        <th style="text-align:right">Balance</th>
                        <th style="text-align:right">Dif. caja</th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <p style="font-size:1.1rem;color:#aaa;margin-top:1rem;text-align:center">
            Haz clic en una fila para ver el detalle del día.
        </p>`;

    // Navegar al día al hacer clic
    contenido.querySelectorAll('.sc-hist-row').forEach(tr => {
        tr.addEventListener('click', () => {
            _fecha = tr.dataset.fecha;
            _actualizarLabelFecha();
            _cargarDia();
            _switchVista('dia');
        });
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _fmt(n) {
    return `$${Number(n).toLocaleString('es-CO')}`;
}

function _esc(str) {
    if (!str) return '—';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
