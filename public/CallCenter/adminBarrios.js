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
import { getSedes }                         from '../Shared/sedesService.js';
import { revelarSplash }                    from '../Shared/components.js';

const ROLES_PERMITIDOS = ['admin', 'callcenter-admin', 'callcenter'];
const ROLES_EDITOR     = ['admin', 'callcenter-admin'];

let _sede           = '';
let _barrios        = [];
let _query          = '';
let _soloSinCoords  = false;
let _usuario        = '';
let _esEditor       = false; // true solo para admin y callcenter-admin
let _modalDetalleId = null;

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

        _usuario  = usuario.username || '';
        _esEditor = ROLES_EDITOR.includes(usuario.rol);

        document.getElementById('username').textContent = _usuario;
        document.getElementById('btn-home').onclick = () => {
            window.parent.postMessage({ type: 'nav-loading' }, '*');
            window.location.href = './callcenter.html';
        };
        document.getElementById('btn-logout').addEventListener('click', async () => {
            if (confirm('¿Cerrar sesión?')) {
                await supabase.auth.signOut();
                window.top.location.href = '../index.html';
            }
        });

        initNavButtons('adminBarrios', { onBarrios: openBarriosModal });

        // Solo editores ven controles de escritura
        if (!_esEditor) {
            ['btn-agregar-barrio', 'btn-filtro-sin-coords'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        }

        if (usuario.rol !== 'admin') {
            document.getElementById('migration-banner').style.display = 'none';
        }

        const sedes = await getSedes();
        const nav   = document.getElementById('admin-sede-nav');
        sedes.forEach((s, i) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sede-btn' + (i === 0 ? ' active' : '');
            btn.dataset.sede = s.name.toLowerCase();
            btn.textContent  = s.name;
            nav.appendChild(btn);
        });
        _sede = sedes[0]?.name.toLowerCase() || '';
        document.getElementById('ab-titulo').textContent = sedes[0]?.name || '';

        document.body.classList.add('loaded');
        revelarSplash();
        ocultarSkeleton('contenido-principal');

        _cargarSede(_sede);

    } catch (e) {
        console.error('Error auth adminBarrios:', e);
        document.body.classList.add('loaded');
        revelarSplash();
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
document.getElementById('admin-sede-nav').addEventListener('click', e => {
    const btn = e.target.closest('.sede-btn');
    if (!btn) return;
    document.querySelectorAll('#admin-sede-nav .sede-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _sede = btn.dataset.sede;
    document.getElementById('ab-titulo').textContent = btn.textContent;
    document.getElementById('admin-barrios-search').value = '';
    _query = '';
    _soloSinCoords = false;
    document.getElementById('btn-filtro-sin-coords').classList.replace('btn-save', 'btn-edit');
    _mostrarVista('barrios');
    _cargarSede(_sede);
});

document.getElementById('btn-ver-log').addEventListener('click', () => {
    document.querySelectorAll('#admin-sede-nav .sede-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('ab-titulo').textContent = 'Log de cambios';
    _mostrarVista('log');
    _cargarLog();
});

// ── Búsqueda ──────────────────────────────────────────────────────────────────
document.getElementById('admin-barrios-search').addEventListener('input', e => {
    _query = e.target.value.toLowerCase().trim();
    _renderTabla();
});

document.getElementById('btn-filtro-sin-coords').addEventListener('click', () => {
    _soloSinCoords = !_soloSinCoords;
    const btn = document.getElementById('btn-filtro-sin-coords');
    btn.classList.toggle('btn-save',   _soloSinCoords);
    btn.classList.toggle('btn-edit',  !_soloSinCoords);
    _renderTabla();
});

// ── Geocodificación (Nominatim) ───────────────────────────────────────────────
async function _geocodificarBarrio(barrio) {
    try {
        const q   = encodeURIComponent(`${barrio}, Bucaramanga, Santander, Colombia`);
        const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=1`,
            { headers: { 'User-Agent': 'EverestCentral/1.0' } }
        );
        const data = await res.json();
        if (data.length) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    } catch (e) {
        console.warn('Geocodificación fallida para:', barrio, e);
    }
    return { lat: null, lng: null };
}

// ── Cargar sede ───────────────────────────────────────────────────────────────
async function _cargarSede(sede) {
    _setStatus('Cargando...', '');
    const { data, error } = await supabase
        .from('barrios_domicilio')
        .select('id, barrio, valor, lat, lng')
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
        (!_query || b.barrio.toLowerCase().includes(_query)) &&
        (!_soloSinCoords || b.lat == null)
    );

    if (!filtrados.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="barrios-empty">Sin resultados</td></tr>`;
        return;
    }

    tbody.innerHTML = filtrados.map(b => `
        <tr data-id="${b.id}">
            <td class="td-barrio td-barrio--clickable">${_esc(b.barrio)}</td>
            <td class="td-valor">$${b.valor.toLocaleString('es-CO')}</td>
            <td class="td-coord">${b.lat != null ? b.lat.toFixed(5) : '<span style="color:#ccc;">—</span>'}</td>
            <td class="td-coord">${b.lng != null ? b.lng.toFixed(5) : '<span style="color:#ccc;">—</span>'}</td>
        </tr>
    `).join('');

    tbody.querySelectorAll('tr[data-id]').forEach(tr => {
        const id = Number(tr.dataset.id);
        tr.addEventListener('click', () => _abrirModalDetalle(id));
    });
}

// ── Modal detalle / edición ───────────────────────────────────────────────────
function _abrirModalDetalle(id) {
    const item = _barrios.find(b => b.id === id);
    if (!item) return;
    _modalDetalleId = id;

    document.getElementById('modal-det-sede').textContent  = _sede;
    document.getElementById('modal-det-barrio').value       = item.barrio;
    document.getElementById('modal-det-valor').value        = item.valor;
    document.getElementById('modal-det-lat').value          = item.lat ?? '';
    document.getElementById('modal-det-lng').value          = item.lng ?? '';

    // Controles de edición: visibles solo para editores
    ['modal-det-maps-url', 'modal-det-maps-parse', 'modal-det-eliminar',
     'modal-det-guardar', 'modal-det-cancelar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = _esEditor ? '' : 'none';
    });

    // Inputs de solo lectura para no editores
    ['modal-det-barrio', 'modal-det-valor', 'modal-det-lat', 'modal-det-lng'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.readOnly = !_esEditor;
    });

    document.getElementById('modal-detalle-barrio').style.display = 'flex';
    if (_esEditor) document.getElementById('modal-det-barrio').focus();
}

function _cerrarModalDetalle() {
    document.getElementById('modal-detalle-barrio').style.display = 'none';
    _modalDetalleId = null;
}

async function _guardarModalDetalle() {
    const id     = _modalDetalleId;
    const barrio = document.getElementById('modal-det-barrio').value.trim();
    const valor  = parseInt(document.getElementById('modal-det-valor').value, 10);
    const latVal = document.getElementById('modal-det-lat').value.trim();
    const lngVal = document.getElementById('modal-det-lng').value.trim();

    if (!barrio)                      { alert('El nombre del barrio no puede estar vacío.'); return; }
    if (isNaN(valor) || valor < 4000) { alert('Valida el valor del domicilio, tiene un valor muy bajo.'); return; }
    if (valor > 50000)                { alert('Valida el valor del domicilio, tiene un valor muy alto.'); return; }

    const item      = _barrios.find(b => b.id === id);
    const updateObj = {
        barrio, valor,
        lat: latVal ? parseFloat(latVal) : null,
        lng: lngVal ? parseFloat(lngVal) : null,
    };

    _setStatus('Guardando...', '');
    const { error } = await supabase
        .from('barrios_domicilio')
        .update(updateObj)
        .eq('id', id);

    if (error) { _setStatus('Error al guardar.', 'error'); return; }

    const valorAnterior = item?.valor;
    const idx = _barrios.findIndex(b => b.id === id);
    if (idx >= 0) _barrios[idx] = { ...item, ...updateObj, id };
    invalidarCacheBarrios(_sede);
    _registrarLog('editar', _sede, barrio, valorAnterior, valor);
    _cerrarModalDetalle();
    _toast(`✓ "${barrio}" actualizado correctamente`);
    _setStatus('Guardado.', 'ok');
    _renderTabla();
}

// Listeners del modal de detalle (se registran una sola vez al cargar)
document.getElementById('btn-cerrar-modal-detalle').addEventListener('click', _cerrarModalDetalle);
document.getElementById('modal-det-cancelar').addEventListener('click', _cerrarModalDetalle);
document.getElementById('modal-det-guardar').addEventListener('click', _guardarModalDetalle);
document.getElementById('modal-detalle-barrio').addEventListener('click', e => {
    if (e.target.id === 'modal-detalle-barrio') _cerrarModalDetalle();
});
document.getElementById('modal-det-barrio').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('modal-det-valor').focus();
});
document.getElementById('modal-det-valor').addEventListener('keydown', e => {
    if (e.key === 'Enter') _guardarModalDetalle();
});
document.getElementById('modal-det-ir-maps').addEventListener('click', () => {
    const lat = document.getElementById('modal-det-lat').value.trim();
    const lng = document.getElementById('modal-det-lng').value.trim();
    if (!lat || !lng) { alert('Ingresa las coordenadas primero.'); return; }
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
});

document.getElementById('modal-det-maps-parse').addEventListener('click', () => {
    const url   = document.getElementById('modal-det-maps-url').value.trim();
    const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (match) {
        document.getElementById('modal-det-lat').value      = match[1];
        document.getElementById('modal-det-lng').value      = match[2];
        document.getElementById('modal-det-maps-url').value = '';
    } else {
        alert('No se encontraron coordenadas en la URL.\nAsegúrate de copiar la URL completa desde la barra del navegador en Google Maps.');
    }
});
document.getElementById('modal-det-eliminar').addEventListener('click', async () => {
    const id   = _modalDetalleId;
    const item = _barrios.find(b => b.id === id);
    if (!item || !confirm(`¿Eliminar "${item.barrio}"?`)) return;
    const tr = document.querySelector(`tr[data-id="${id}"]`);
    _cerrarModalDetalle();
    await _eliminar(id, tr);
});

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
    _setStatus('Geocodificando...', '');

    const { lat, lng } = await _geocodificarBarrio(barrio);

    const { data, error } = await supabase
        .from('barrios_domicilio')
        .insert({ sede: _sede, barrio, valor, lat, lng })
        .select('id, barrio, valor, lat, lng')
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
