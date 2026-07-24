/**
 * adminBarrios.js
 * Administración CRUD de barrios_domicilio en Supabase.
 * Solo accesible para roles: admin, callcenter-admin.
 */

import { supabase }                        from '../Api/supabaseConfig.js';
import { mostrarSkeleton, ocultarSkeleton } from '../Shared/skeleton.js';
import { initNavButtons }                   from './navCallCenter.js';
import { openBarriosModal }                 from './modalBarrios.js';
import { domicilios as domiciliosLocal }    from './domicilios.js';
import { invalidarCacheBarrios }            from './barriosService.js';

const ROLES_PERMITIDOS = ['admin', 'callcenter-admin'];

let _sede    = 'cabecera';
let _barrios = [];
let _query   = '';
let _usuario = '';    // username del usuario activo

// ── Auth ──────────────────────────────────────────────────────────────────────
mostrarSkeleton('historial');

(async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { window.top.location.href = '../index.html'; return; }

        const { data: usuario } = await supabase
            .from('usuarios')
            .select('username, rol')
            .eq('id', user.id)
            .single();

        if (!usuario || !ROLES_PERMITIDOS.includes(usuario.rol)) {
            alert('No tienes permisos para acceder a esta página.');
            window.location.href = './callcenter.html';
            return;
        }

        _usuario = usuario.username || '';
        document.getElementById('username').textContent = _usuario;
        document.getElementById('btn-home').onclick = () => { window.location.href = './callcenter.html'; };
        document.getElementById('btn-logout').addEventListener('click', async () => {
            if (confirm('¿Cerrar sesión?')) {
                await supabase.auth.signOut();
                window.top.location.href = '../index.html';
            }
        });

        initNavButtons('adminBarrios', { onBarrios: openBarriosModal });

        if (usuario.rol !== 'admin') {
            document.getElementById('migration-banner').style.display = 'none';
        }

        document.body.classList.add('loaded');
        ocultarSkeleton('contenido-principal');

        _cargarSede(_sede);

    } catch (e) {
        console.error('Error auth adminBarrios:', e);
        document.body.classList.add('loaded');
    }
})();

// ── Vistas: barrios vs log ────────────────────────────────────────────────────
function _mostrarVista(vista) {
    document.getElementById('ab-view-barrios').style.display = vista === 'barrios' ? '' : 'none';
    document.getElementById('ab-view-log').style.display     = vista === 'log'     ? '' : 'none';
    document.getElementById('btn-agregar-barrio').style.display = vista === 'barrios' ? '' : 'none';
    document.getElementById('btn-ver-log').classList.toggle('active', vista === 'log');
}

// ── Sede toggle ───────────────────────────────────────────────────────────────
document.getElementById('admin-sede-nav').querySelectorAll('.sede-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#admin-sede-nav .sede-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _sede = btn.dataset.sede;
        document.getElementById('ab-titulo').textContent = btn.textContent;
        document.getElementById('admin-barrios-search').value = '';
        _query = '';
        _mostrarVista('barrios');
        _cargarSede(_sede);
    });
});

document.getElementById('btn-ver-log').addEventListener('click', () => {
    document.querySelectorAll('#admin-sede-nav .cat-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('ab-titulo').textContent = 'Log de cambios';
    _mostrarVista('log');
    _cargarLog();
});

// ── Búsqueda ──────────────────────────────────────────────────────────────────
document.getElementById('admin-barrios-search').addEventListener('input', e => {
    _query = e.target.value.toLowerCase().trim();
    _renderTabla();
});

// ── Cargar sede ───────────────────────────────────────────────────────────────
async function _cargarSede(sede) {
    _setStatus('Cargando...', '');
    const { data, error } = await supabase
        .from('barrios_domicilio')
        .select('id, barrio, valor')
        .eq('sede', sede)
        .order('barrio');

    if (error) { _setStatus('Error al cargar barrios.', 'error'); return; }
    _barrios = data ?? [];
    _setStatus(_barrios.length ? `${_barrios.length} barrios` : 'Sin barrios registrados.', '');
    _renderTabla();
}

// ── Render tabla ──────────────────────────────────────────────────────────────
function _renderTabla() {
    const tbody = document.getElementById('barrios-tbody');
    const filtrados = _barrios.filter(b =>
        !_query || b.barrio.toLowerCase().includes(_query)
    );

    if (!filtrados.length) {
        tbody.innerHTML = `<tr><td colspan="3" class="barrios-empty">Sin resultados</td></tr>`;
        return;
    }

    tbody.innerHTML = filtrados.map(b => `
        <tr data-id="${b.id}">
            <td class="td-barrio">${_esc(b.barrio)}</td>
            <td class="td-valor">$${b.valor.toLocaleString('es-CO')}</td>
            <td class="td-accion">
                <button class="btn-edit"   data-action="edit">Editar</button>
                <button class="btn-delete" data-action="delete">Eliminar</button>
            </td>
        </tr>
    `).join('');

    tbody.querySelectorAll('tr[data-id]').forEach(tr => {
        const id = Number(tr.dataset.id);
        tr.querySelector('[data-action="edit"]').addEventListener('click', () => _editarFila(tr, id));
        tr.querySelector('[data-action="delete"]').addEventListener('click', () => _eliminar(id, tr));
    });
}

// ── Editar fila inline ────────────────────────────────────────────────────────
function _editarFila(tr, id) {
    const item = _barrios.find(b => b.id === id);
    if (!item) return;

    tr.innerHTML = `
        <td class="td-barrio"><input class="input-edit" id="edit-barrio-${id}" value="${_esc(item.barrio)}"></td>
        <td class="td-valor"><input class="input-edit" id="edit-valor-${id}" value="${item.valor}" type="number" min="0"></td>
        <td class="td-accion">
            <button class="btn-save"   id="save-${id}">Guardar</button>
            <button class="btn-cancel" id="cancel-${id}">Cancelar</button>
        </td>
    `;

    document.getElementById(`save-${id}`).addEventListener('click', () => _guardarEdicion(id));
    document.getElementById(`cancel-${id}`).addEventListener('click', () => _renderTabla());
    document.getElementById(`edit-barrio-${id}`).focus();
}

async function _guardarEdicion(id) {
    const barrio = document.getElementById(`edit-barrio-${id}`).value.trim();
    const valor  = parseInt(document.getElementById(`edit-valor-${id}`).value, 10);

    if (!barrio)                      { alert('El nombre del barrio no puede estar vacío.'); return; }
    if (isNaN(valor) || valor < 4000) { alert('Valida el valor del domicilio, tiene un valor muy bajo.'); return; }
    if (valor > 50000)               { alert('Valida el valor del domicilio, tiene un valor muy alto.'); return; }

    _setStatus('Guardando...', '');
    const { error } = await supabase
        .from('barrios_domicilio')
        .update({ barrio, valor })
        .eq('id', id);

    if (error) { _setStatus('Error al guardar.', 'error'); return; }

    const valorAnterior = _barrios.find(b => b.id === id)?.valor;
    const idx = _barrios.findIndex(b => b.id === id);
    if (idx >= 0) _barrios[idx] = { id, barrio, valor };
    invalidarCacheBarrios(_sede);
    _registrarLog('editar', _sede, barrio, valorAnterior, valor);
    _toast(`✓ "${barrio}" actualizado correctamente`);
    _setStatus('Guardado.', 'ok');
    _renderTabla();
}

// ── Eliminar ──────────────────────────────────────────────────────────────────
async function _eliminar(id, tr) {
    const item = _barrios.find(b => b.id === id);
    if (!item) return;
    if (!confirm(`¿Eliminar "${item.barrio}"?`)) return;

    tr.style.opacity = '0.4';
    const { error } = await supabase
        .from('barrios_domicilio')
        .delete()
        .eq('id', id);

    if (error) { tr.style.opacity = ''; _setStatus('Error al eliminar.', 'error'); return; }

    const nombreEliminado = item.barrio;
    _registrarLog('eliminar', _sede, nombreEliminado, item.valor, null);
    _barrios = _barrios.filter(b => b.id !== id);
    invalidarCacheBarrios(_sede);
    _toast(`🗑 "${nombreEliminado}" eliminado`);
    _setStatus('Eliminado.', 'ok');
    _renderTabla();
}

// ── Modal agregar barrio ──────────────────────────────────────────────────────
function _abrirModalAgregar() {
    document.getElementById('modal-barrio-nombre').value = '';
    document.getElementById('modal-barrio-valor').value  = '';
    const sedeLabel = document.querySelector('#admin-sede-nav .cat-btn.active')?.textContent || _sede;
    document.getElementById('modal-barrio-sede-label').textContent = sedeLabel;
    document.getElementById('modal-agregar-barrio').style.display = 'flex';
    document.getElementById('modal-barrio-nombre').focus();
}

function _cerrarModalAgregar() {
    document.getElementById('modal-agregar-barrio').style.display = 'none';
}

document.getElementById('btn-agregar-barrio').addEventListener('click', _abrirModalAgregar);
document.getElementById('btn-cerrar-modal-barrio').addEventListener('click', _cerrarModalAgregar);
document.getElementById('btn-cancelar-modal-barrio').addEventListener('click', _cerrarModalAgregar);
document.getElementById('modal-agregar-barrio').addEventListener('click', e => {
    if (e.target.id === 'modal-agregar-barrio') _cerrarModalAgregar();
});

document.getElementById('btn-guardar-modal-barrio').addEventListener('click', _guardarNuevo);
document.getElementById('modal-barrio-nombre').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('modal-barrio-valor').focus();
});
document.getElementById('modal-barrio-valor').addEventListener('keydown', e => {
    if (e.key === 'Enter') _guardarNuevo();
});

async function _guardarNuevo() {
    const barrio = document.getElementById('modal-barrio-nombre').value.trim();
    const valor  = parseInt(document.getElementById('modal-barrio-valor').value, 10);

    if (!barrio)                        { alert('El nombre del barrio no puede estar vacío.'); return; }
    if (isNaN(valor) || valor < 4000)   { alert('Valida el valor del domicilio, tiene un valor muy bajo.'); return; }
    if (valor > 50000)                 { alert('Valida el valor del domicilio, tiene un valor muy alto.'); return; }

    const btnGuardar = document.getElementById('btn-guardar-modal-barrio');
    btnGuardar.disabled = true;

    const { data, error } = await supabase
        .from('barrios_domicilio')
        .insert({ sede: _sede, barrio, valor })
        .select('id, barrio, valor')
        .single();

    btnGuardar.disabled = false;

    if (error) {
        _setStatus(error.code === '23505' ? 'Ya existe ese barrio en esta sede.' : 'Error al guardar.', 'error');
        return;
    }

    _cerrarModalAgregar();
    _registrarLog('crear', _sede, barrio, null, valor);
    _barrios.push(data);
    _barrios.sort((a, b) => a.barrio.localeCompare(b.barrio));
    invalidarCacheBarrios(_sede);
    _toast(`✓ "${barrio}" agregado correctamente`);
    _setStatus('Barrio agregado.', 'ok');
    _renderTabla();
}

// ── Migración desde domicilios.js ─────────────────────────────────────────────
document.getElementById('btn-migrar').addEventListener('click', async () => {
    if (!confirm('¿Importar todos los barrios desde el archivo local a Supabase?\nSe omitirán duplicados.')) return;

    const btn = document.getElementById('btn-migrar');
    btn.disabled    = true;
    btn.textContent = 'Importando...';

    const filas = [];
    for (const [sede, barrios] of Object.entries(domiciliosLocal)) {
        for (const [barrio, valor] of Object.entries(barrios)) {
            filas.push({ sede, barrio, valor });
        }
    }

    const CHUNK = 500;
    let errores = 0;

    for (let i = 0; i < filas.length; i += CHUNK) {
        const { error } = await supabase
            .from('barrios_domicilio')
            .upsert(filas.slice(i, i + CHUNK), { onConflict: 'sede,barrio', ignoreDuplicates: true });
        if (error) { errores++; console.error(error); }
    }

    invalidarCacheBarrios();
    btn.disabled    = false;
    btn.textContent = 'Importar datos locales';

    if (!errores) {
        document.getElementById('migration-banner').style.display = 'none';
        _setStatus(`Importación completada: ${filas.length} barrios procesados.`, 'ok');
    } else {
        _setStatus(`Importación con errores — revisa la consola.`, 'error');
    }

    _cargarSede(_sede);
});

// ── Log de cambios ────────────────────────────────────────────────────────────
async function _registrarLog(accion, sede, barrio, valor_ant, valor_nuevo) {
    await supabase.from('barrios_log').insert({
        accion, sede, barrio,
        valor_ant:   valor_ant  ?? null,
        valor_nuevo: valor_nuevo ?? null,
        usuario: _usuario,
    });
}

async function _cargarLog() {
    const tbody = document.getElementById('log-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="barrios-empty">Cargando...</td></tr>';

    const { data, error } = await supabase
        .from('barrios_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

    if (error) {
        tbody.innerHTML = '<tr><td colspan="7" class="barrios-empty" style="color:#c0392b;">Error al cargar el log.</td></tr>';
        return;
    }

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="barrios-empty">Sin registros aún.</td></tr>';
        return;
    }

    const fmt = ts => new Intl.DateTimeFormat('es-CO', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date(ts));

    const fmtValor = v => v != null ? `$${Number(v).toLocaleString('es-CO')}` : '—';

    tbody.innerHTML = data.map(r => `
        <tr>
            <td><span class="log-badge ${r.accion}">${r.accion}</span></td>
            <td>${_esc(r.sede)}</td>
            <td>${_esc(r.barrio)}</td>
            <td>${fmtValor(r.valor_ant)}</td>
            <td>${fmtValor(r.valor_nuevo)}</td>
            <td>${_esc(r.usuario)}</td>
            <td style="white-space:nowrap;">${fmt(r.created_at)}</td>
        </tr>
    `).join('');
}


// ── Helpers ───────────────────────────────────────────────────────────────────
let _toastTimer = null;
function _toast(msg) {
    const el = document.getElementById('ab-toast');
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('visible'), 3000);
}

function _setStatus(msg, cls) {
    const el = document.getElementById('barrios-status');
    el.textContent = msg;
    el.className   = cls;
}

function _esc(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
