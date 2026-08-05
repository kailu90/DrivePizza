import { supabase } from '../Api/supabaseConfig.js';
import { mostrarSkeleton, ocultarSkeleton } from '../Shared/skeleton.js';
import { initNavButtons } from './navCallCenter.js';
import { openBarriosModal } from './modalBarrios.js';

const SEDE_LABELS = {
    cabecera: 'Cabecera', cañaveral: 'Cañaveral', acropolis: 'Acrópolis',
    piedecuesta: 'Piedecuesta', megamall: 'Megamall', unico: 'Único',
};

let clienteActual      = null;
let _usuarioActual     = '';
let _reactivarCli      = null;
let _reactivarDias     = 0;
let _reactivarSede     = '';
let _tagsReactivacion  = [];   // lista de tags cargados de BD
let _tagReactivarSel   = null; // tag seleccionado en el modal
let _vista        = 'todos';  // 'todos' | 'historial' | 'log' | 'motivos' | 'hist-react'
let _filtroTags   = [];       // [] | ['frecuente', 'vip', ...]
let _tabActivo    = 'todos';  // 'todos' | 'frecuentes' | nombre_tag
let _filtroDias   = null;     // null | 30 | 60 | 90
let _sortCol      = 'fecha';  // 'telefono' | 'nombre' | 'pedidos' | 'fecha'
let _sortDir      = 'desc';   // 'asc' | 'desc'

function _calcPorPagina() {
    return Math.max(15, Math.floor((window.innerHeight - 250) / 46));
}
let POR_PAGINA  = _calcPorPagina();
let paginaActual = 1;
window.addEventListener('resize', () => { POR_PAGINA = _calcPorPagina(); });

// ── BÚSQUEDA ──────────────────────────────────────────────────────────────────
async function buscarClientes(query = '', pagina = 1) {
    const q      = query.trim();
    const offset = (pagina - 1) * POR_PAGINA;

    const digitos  = q.replace(/\D/g, '');
    const esNumero = digitos.length >= 2;

    const supabaseCol = _sortCol === 'telefono'      ? 'telefono'
        : _sortCol === 'nombre'         ? 'nombre'
        : _sortCol === 'total_pedidos'  ? 'total_pedidos'
        : 'updated_at';

    let req = supabase
        .from('clientes')
        .select('id, telefono, nombre, tags, updated_at, total_pedidos, fecha_ultima_reactivacion, direcciones_cliente(count)')
        .order(supabaseCol, { ascending: _sortDir === 'asc' })
        .range(offset, offset + POR_PAGINA - 1);

    if (q && esNumero) {
        req = req.ilike('telefono', `%${digitos}%`);
    } else if (q) {
        req = req.ilike('nombre', `%${q}%`);
    }

    if (_tabActivo === 'frecuentes') {
        req = req.gte('total_pedidos', 3);
    } else if (_tabActivo !== 'todos' && _filtroTags.length) {
        req = req.overlaps('tags', _filtroTags);
    }
    if (_filtroDias) {
        const corte = new Date();
        corte.setDate(corte.getDate() - _filtroDias);
        req = req.lt('updated_at', corte.toISOString());
    }

    const { data, error } = await req;
    if (error) console.error('Error búsqueda clientes:', error);
    return { data: data || [] };
}

function formatFecha(iso) {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('es-CO', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(new Date(iso));
}

function renderPaginacion(total, pagina) {
    const totalPags = Math.ceil(total / POR_PAGINA);
    const el = document.getElementById('clientes-paginacion');
    if (totalPags <= 1) { el.innerHTML = ''; return; }
    el.innerHTML = `
        <button class="pag-btn" id="pag-prev" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
        <span class="pag-info">Página ${pagina} de ${totalPags}</span>
        <button class="pag-btn" id="pag-next" ${pagina >= totalPags ? 'disabled' : ''}>Siguiente →</button>`;
    el.querySelector('#pag-prev')?.addEventListener('click', () => ejecutarBusqueda(pagina - 1));
    el.querySelector('#pag-next')?.addEventListener('click', () => ejecutarBusqueda(pagina + 1));
}

// ── TODOS (cache + prefetch) ──────────────────────────────────────────────────
const _todosCache = new Map(); // `${query}:${pagina}` → { data, count }

async function _fetchTodosPagina(q, pagina) {
    const key = `${q}:${pagina}`;
    if (_todosCache.has(key)) return _todosCache.get(key);
    const result = await buscarClientes(q, pagina);
    _todosCache.set(key, result);
    return result;
}

// ── SIDEBAR NAV ───────────────────────────────────────────────────────────────
function _setVistaActiva(vista) {
    _disconnectObserver();
    _vista = vista;

    const esHistorial  = vista === 'historial';
    const esLog        = vista === 'log';
    const esMotivos    = vista === 'motivos';
    const esHistReact  = vista === 'hist-react';
    const esClientes   = !esHistorial && !esLog && !esMotivos && !esHistReact;

    document.getElementById('cli-vista-clientes').style.display        = esClientes  ? 'flex' : 'none';
    document.getElementById('historial-topbar').style.display          = esHistorial ? 'flex' : 'none';
    document.getElementById('historial-dias-bar').style.display        = esHistorial ? 'flex' : 'none';
    document.getElementById('historial-react-section').style.display   = esHistorial ? 'flex' : 'none';
    document.getElementById('sidebar-historial-filtros').style.display = esHistorial ? ''     : 'none';
    document.getElementById('cli-vista-log').style.display             = esLog       ? 'flex' : 'none';
    document.getElementById('cli-vista-motivos').style.display         = esMotivos   ? 'flex' : 'none';
    document.getElementById('cli-vista-hist-react').style.display      = esHistReact ? 'flex' : 'none';

    document.getElementById('btn-ir-clientes').classList.toggle('active',       esClientes);
    document.getElementById('btn-ir-reactivaciones').classList.toggle('active', esHistorial);
    document.getElementById('btn-ir-log').classList.toggle('active',            esLog);
    document.getElementById('btn-ir-hist-react').classList.toggle('active',     esHistReact);

    if (esClientes) {
        document.getElementById('buscar-cliente-input').value = '';
        document.querySelector('.clientes-search-wrap').style.display = vista === 'todos' ? '' : 'none';
        document.getElementById('btn-nuevo-cliente').style.display    = vista === 'todos' ? '' : 'none';
    }
    if (!esHistorial) {
        document.getElementById('hist-filtro-busqueda').value = '';
    }
}

// ── RENDER HELPERS ────────────────────────────────────────────────────────────
let _clientesData = []; // acumula todos los clientes visibles en scroll

function _rowHtml(c) {
    const tags = (c.tags || []).map(t =>
        `<span style="background:#f0e8ff;color:#6c3d8f;padding:2px 8px;border-radius:10px;font-size:1.1rem;margin:1px;">${t}</span>`
    ).join(' ');
    const numDirs      = c.direcciones_cliente?.[0]?.count ?? '—';
    const ultimaFecha  = c.updated_at ? formatFecha(c.updated_at) : '—';

    return `<tr class="inventory-management__row fila-cliente" style="cursor:pointer;" data-id="${c.id}">
        <td class="inventory-management__cell col-tel" style="font-weight:700;">${c.telefono}</td>
        <td class="inventory-management__cell col-nombre">${c.nombre || '—'}</td>
        <td class="inventory-management__cell col-tags-td">${tags || '—'}</td>
        <td class="inventory-management__cell col-pedidos-td" style="text-align:center;font-weight:700;color:var(--color-primario);">${c.total_pedidos ?? 0}</td>
        <td class="inventory-management__cell col-dirs-td" style="text-align:center;">${numDirs}</td>
        <td class="inventory-management__cell col-ultimo-td">
            <div class="cli-ultimo-wrap">
                <span class="cli-ultimo-fecha">${ultimaFecha}</span>
            </div>
        </td>
        <td class="inventory-management__cell col-acciones-td" style="text-align:center;">
            <button class="btn-ver-detalle">Ver detalle</button>
        </td>
    </tr>`;
}

function _bindRows(rows) {
    rows.forEach(tr => {
        tr.addEventListener('click', () => {
            const cli = _clientesData.find(c => String(c.id) === tr.dataset.id);
            if (cli) abrirModal(cli);
        });
    });
}

function _actualizarCount() {
    const n = _clientesData.length;
    document.getElementById('clientes-count').textContent = n ? `${n} cargados` : '';
}

function renderTabla(clientes) {
    _clientesData = [...clientes];
    const tbody = document.getElementById('clientes-tbody');
    _actualizarCount();

    if (!clientes.length) {
        tbody.innerHTML = `<tr><td class="inventory-management__cell" colspan="7"
            style="text-align:center;padding:30px;color:#aaa;">
            No se encontraron clientes.</td></tr>`;
        document.getElementById('clientes-count').textContent = '';
        return;
    }

    tbody.innerHTML = clientes.map(c => _rowHtml(c)).join('');
    _bindRows([...tbody.querySelectorAll('.fila-cliente')]);
}

function appendTabla(clientes) {
    _clientesData = [..._clientesData, ...clientes];
    _actualizarCount();
    const tbody    = document.getElementById('clientes-tbody');
    const template = document.createElement('template');
    template.innerHTML = clientes.map(c => _rowHtml(c)).join('');
    const newRows = [...template.content.querySelectorAll('.fila-cliente')];
    newRows.forEach(row => tbody.appendChild(row));
    _bindRows(newRows);
}

// ── INFINITE SCROLL ───────────────────────────────────────────────────────────
let _infPage       = 1;
let _infQuery      = '';
let _infLoading    = false;
let _infHasMore    = true; // false cuando el último fetch devolvió < POR_PAGINA
let _scrollHandler = null;
let _scrollWrapRef = null;

function _disconnectObserver() {
    if (_scrollHandler) {
        if (_scrollWrapRef) _scrollWrapRef.removeEventListener('scroll', _scrollHandler);
        window.removeEventListener('scroll', _scrollHandler);
        _scrollHandler = null;
        _scrollWrapRef = null;
    }
    const sp = document.getElementById('sentinel-spinner');
    if (sp) sp.style.display = 'none';
}

// fetchFn: (pagina) => Promise<data[]>
// Detecta scroll tanto en el contenedor interno como en la ventana
function _initScrollObserver(fetchFn) {
    _disconnectObserver();
    if (!_infHasMore) return;

    const scrollWrap = document.querySelector('.clientes-table-wrap');
    const sentinel   = document.getElementById('clientes-sentinel');

    _scrollHandler = async () => {
        if (_infLoading || !_infHasMore) return;

        // Condición 1: sentinel visible en la ventana (página scrollea)
        const rect         = sentinel.getBoundingClientRect();
        const nearViewport = rect.top <= window.innerHeight + 200;

        // Condición 2: cerca del fondo del contenedor interno
        const wrapNearBottom = scrollWrap
            ? scrollWrap.scrollTop + scrollWrap.clientHeight >= scrollWrap.scrollHeight - 150
            : false;

        if (!nearViewport && !wrapNearBottom) return;

        _infLoading = true;
        document.getElementById('sentinel-spinner').style.display = 'block';

        const nextPage = _infPage + 1;
        const data     = await fetchFn(nextPage);

        if (data.length) {
            _infPage = nextPage;
            appendTabla(data);
        }

        document.getElementById('sentinel-spinner').style.display = 'none';
        _infLoading = false;

        if (data.length < POR_PAGINA) {
            _infHasMore = false;
            _disconnectObserver();
        } else {
            // Si el sentinel sigue visible después de cargar, continuar
            setTimeout(_scrollHandler, 0);
        }
    };

    _scrollWrapRef = scrollWrap;
    if (scrollWrap) scrollWrap.addEventListener('scroll', _scrollHandler);
    window.addEventListener('scroll', _scrollHandler);

    // Verificar inmediatamente (sentinel puede estar ya en pantalla)
    setTimeout(_scrollHandler, 50);
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
async function abrirModal(clienteBasico) {
    // Cargar datos completos con direcciones
    const { data } = await supabase
        .from('clientes')
        .select('*, direcciones_cliente(*)')
        .eq('id', clienteBasico.id)
        .single();
    if (!data) return;

    data.direcciones_cliente?.sort((a, b) =>
        (b.predeterminada ? 1 : 0) - (a.predeterminada ? 1 : 0) ||
        new Date(b.created_at) - new Date(a.created_at)
    );

    clienteActual = data;

    document.getElementById('modal-cli-tel').textContent = data.telefono;
    document.getElementById('cli-nombre').value = data.nombre || '';
    document.getElementById('cli-notas').value  = data.notas  || '';

    // Tags
    const tags = data.tags || [];
    document.querySelectorAll('#modal-cliente-detalle .tag-chip').forEach(chip => {
        chip.classList.toggle('active', tags.includes(chip.dataset.tag));
    });

    // Direcciones
    renderDirecciones(data.direcciones_cliente || []);

    // Botón historial
    document.getElementById('btn-ver-historial').onclick = () => {
        window.location.href = `./historialPedidos.html?telefono=${encodeURIComponent(data.telefono)}`;
    };

    document.getElementById('modal-cliente-detalle').style.display = 'flex';
}

function cerrarModal() {
    document.getElementById('modal-cliente-detalle').style.display = 'none';
    clienteActual = null;
}

async function _logCambio(clienteId, telefono, nombreCliente, accion, detalle = {}) {
    const { error } = await supabase.from('clientes_log').insert({
        cliente_id:     clienteId,
        telefono,
        nombre_cliente: nombreCliente || telefono,
        accion,
        detalle,
        asesor:         _usuarioActual,
    });
    if (error) console.error('[clientes_log] Error al insertar:', error.message, error);
}

async function eliminarCliente() {
    if (!clienteActual) return;
    if (!confirm(`¿Eliminar a "${clienteActual.nombre || clienteActual.telefono}"? Se borrarán también sus direcciones.`)) return;

    const id = clienteActual.id;
    _logCambio(id, clienteActual.telefono, clienteActual.nombre, 'eliminar_cliente', {
        nombre: clienteActual.nombre,
        notas:  clienteActual.notas,
        tags:   clienteActual.tags,
    });
    await supabase.from('direcciones_cliente').delete().eq('cliente_id', id);
    const { error } = await supabase.from('clientes').delete().eq('id', id);
    if (error) { alert('Error al eliminar.'); return; }

    cerrarModal();
    document.querySelector(`tr[data-id="${id}"]`)?.remove();
    _clientesData = _clientesData.filter(c => c.id !== id);
}

function _actualizarConteoDir(clienteId, delta) {
    const idx = _clientesData.findIndex(c => String(c.id) === String(clienteId));
    if (idx === -1) return;
    const actual = _clientesData[idx].direcciones_cliente?.[0]?.count ?? 0;
    const nuevo  = Math.max(0, actual + delta);
    _clientesData[idx] = { ..._clientesData[idx], direcciones_cliente: [{ count: nuevo }] };
    const cell = document.querySelector(`tr[data-id="${clienteId}"] .col-dirs-td`);
    if (cell) cell.textContent = nuevo;
}

function renderDirecciones(dirs) {
    const container = document.getElementById('cli-dirs');
    if (!dirs.length) {
        container.innerHTML = `<p class="dir-empty">Sin direcciones registradas.</p>`;
        return;
    }
    container.innerHTML = dirs.map(d => `
        <div class="dir-item ${d.predeterminada ? 'predeterminada' : ''}" data-dir-id="${d.id}">
            <div class="dir-item-info">
                <div class="dir-item-dir">${d.direccion}</div>
                <div class="dir-item-meta">
                    ${d.barrio || ''}
                </div>
            </div>
            <div class="dir-item-actions">
                <button class="btn-dir-pred ${d.predeterminada ? 'active' : ''}"
                        data-dir-id="${d.id}" title="Marcar como predeterminada">
                    ${d.predeterminada ? '★' : '☆'}
                </button>
                <button class="btn-dir-del" data-dir-id="${d.id}" title="Eliminar">✕</button>
            </div>
        </div>`).join('');

    // Predeterminada
    container.querySelectorAll('.btn-dir-pred').forEach(btn => {
        btn.addEventListener('click', async () => {
            const dirId  = btn.dataset.dirId;
            const dirData = clienteActual.direcciones_cliente?.find(d => d.id === dirId);
            // Quitar predeterminada a todas
            await supabase.from('direcciones_cliente')
                .update({ predeterminada: false })
                .eq('cliente_id', clienteActual.id);
            // Poner predeterminada a esta
            await supabase.from('direcciones_cliente')
                .update({ predeterminada: true })
                .eq('id', dirId);
            _logCambio(clienteActual.id, clienteActual.telefono, clienteActual.nombre,
                'marcar_predeterminada', { direccion: dirData?.direccion, barrio: dirData?.barrio });
            // Refrescar
            const updated = clienteActual.direcciones_cliente.map(d =>
                ({ ...d, predeterminada: d.id === dirId })
            );
            clienteActual.direcciones_cliente = updated;
            renderDirecciones(updated);
        });
    });

    // Eliminar
    container.querySelectorAll('.btn-dir-del').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('¿Eliminar esta dirección?')) return;
            const dirId   = btn.dataset.dirId;
            const dirData = clienteActual.direcciones_cliente?.find(d => d.id === dirId);
            await supabase.from('direcciones_cliente').delete().eq('id', dirId);
            _logCambio(clienteActual.id, clienteActual.telefono, clienteActual.nombre,
                'eliminar_direccion', { direccion: dirData?.direccion, barrio: dirData?.barrio });
            clienteActual.direcciones_cliente = clienteActual.direcciones_cliente.filter(d => d.id !== dirId);
            renderDirecciones(clienteActual.direcciones_cliente);
            _actualizarConteoDir(clienteActual.id, -1);
        });
    });
}

// ── AGREGAR DIRECCIÓN ─────────────────────────────────────────────────────────
async function guardarNuevaDireccion() {
    const direccion = document.getElementById('nueva-dir-direccion').value.trim();
    if (!direccion) { alert('La dirección es obligatoria.'); return; }

    const barrio  = document.getElementById('nueva-dir-barrio').value.trim() || null;
    const sede_id = document.getElementById('nueva-dir-sede').value || null;

    const btn = document.getElementById('btn-guardar-dir');
    btn.textContent = 'Guardando...';
    btn.disabled = true;

    const esPrimera = !clienteActual.direcciones_cliente?.length;

    const { error } = await supabase.from('direcciones_cliente').insert({
        cliente_id:    clienteActual.id,
        direccion,
        barrio,
        sede_id,
        predeterminada: esPrimera,
    });

    btn.textContent = 'Agregar';
    btn.disabled = false;

    if (error) { alert('Error al guardar: ' + error.message); return; }

    _logCambio(clienteActual.id, clienteActual.telefono, clienteActual.nombre,
        'agregar_direccion', { direccion, barrio, sede_id });

    // Recargar datos del cliente
    const { data } = await supabase
        .from('clientes')
        .select('*, direcciones_cliente(*)')
        .eq('id', clienteActual.id)
        .single();
    if (data) {
        clienteActual = data;
        data.direcciones_cliente?.sort((a, b) =>
            (b.predeterminada ? 1 : 0) - (a.predeterminada ? 1 : 0) ||
            new Date(b.created_at) - new Date(a.created_at)
        );
        renderDirecciones(data.direcciones_cliente || []);
        _actualizarConteoDir(clienteActual.id, +1);
    }

    document.getElementById('nueva-dir-form').style.display = 'none';
    document.getElementById('btn-add-dir').style.display = '';
    document.getElementById('nueva-dir-direccion').value = '';
    document.getElementById('nueva-dir-barrio').value    = '';
    document.getElementById('nueva-dir-sede').value      = '';
}

// ── NUEVO CLIENTE ─────────────────────────────────────────────────────────────
function abrirModalNuevo() {
    document.getElementById('nuevo-telefono').value = '';
    document.getElementById('nuevo-nombre').value   = '';
    document.getElementById('nuevo-notas').value    = '';
    document.querySelectorAll('.nuevo-tag').forEach(c => c.classList.remove('active'));
    document.getElementById('modal-nuevo-cliente').style.display = 'flex';
    document.getElementById('nuevo-telefono').focus();
}

function cerrarModalNuevo() {
    document.getElementById('modal-nuevo-cliente').style.display = 'none';
}

async function crearCliente() {
    const telefono = document.getElementById('nuevo-telefono').value.replace(/\D/g, '');
    if (!telefono) { alert('El teléfono es obligatorio.'); return; }

    const nombre = document.getElementById('nuevo-nombre').value.trim();
    const notas  = document.getElementById('nuevo-notas').value.trim();
    const tags   = [...document.querySelectorAll('.nuevo-tag.active')].map(c => c.dataset.tag);

    const btn = document.getElementById('btn-crear-cliente');
    btn.textContent = 'Creando...';
    btn.disabled = true;

    const { data: nuevoCli, error } = await supabase.from('clientes').insert({
        telefono, nombre, notas, tags, updated_at: new Date().toISOString()
    }).select('id').single();

    btn.textContent = 'Crear cliente';
    btn.disabled = false;

    if (error) {
        if (error.code === '23505') alert('Ya existe un cliente con ese teléfono.');
        else alert('Error al crear: ' + error.message);
        return;
    }
    _logCambio(nuevoCli?.id, telefono, nombre, 'crear_cliente', { nombre, notas, tags });
    cerrarModalNuevo();
    ejecutarBusqueda(1);
}

// ── GUARDAR ───────────────────────────────────────────────────────────────────
async function guardarCliente() {
    if (!clienteActual) return;
    const nombre = document.getElementById('cli-nombre').value.trim();
    const notas  = document.getElementById('cli-notas').value.trim();
    const tags   = [...document.querySelectorAll('#modal-cliente-detalle .tag-chip.active')].map(c => c.dataset.tag);

    const antes = {
        nombre: clienteActual.nombre || '',
        notas:  clienteActual.notas  || '',
        tags:   [...(clienteActual.tags || [])].sort(),
    };

    const btn = document.getElementById('btn-guardar-cli');
    btn.textContent = 'Guardando...';
    btn.disabled = true;

    const { error } = await supabase.from('clientes').update({
        nombre, notas, tags
    }).eq('id', clienteActual.id);

    btn.textContent = 'Guardar';
    btn.disabled = false;

    if (error) { alert('Error al guardar: ' + error.message); return; }

    const campos = [];
    if (antes.nombre !== nombre) campos.push('nombre');
    if (antes.notas  !== notas)  campos.push('notas');
    if (JSON.stringify(antes.tags) !== JSON.stringify([...tags].sort())) campos.push('tags');
    if (campos.length) {
        _logCambio(clienteActual.id, clienteActual.telefono, nombre, 'editar_datos', {
            campos,
            antes:   { nombre: antes.nombre, notas: antes.notas, tags: clienteActual.tags || [] },
            despues: { nombre, notas, tags },
        });
    }

    // Actualizar fila en el DOM sin recargar la lista (preserva orden y vista actual)
    const idx = _clientesData.findIndex(c => String(c.id) === String(clienteActual.id));
    if (idx !== -1) {
        _clientesData[idx] = { ..._clientesData[idx], nombre, notas, tags };
        const oldRow = document.querySelector(`tr[data-id="${clienteActual.id}"]`);
        if (oldRow) {
            const tpl = document.createElement('template');
            tpl.innerHTML = _rowHtml(_clientesData[idx]);
            const newRow = tpl.content.firstElementChild;
            _bindRows([newRow]);
            oldRow.replaceWith(newRow);
        }
    }

    cerrarModal();
}

// ── AUTH + INIT ───────────────────────────────────────────────────────────────
mostrarSkeleton('historial');

async function obtenerUsuarioCC() {
    if (window.parent !== window && window.parent._usuarioCCPromise) {
        return await window.parent._usuarioCCPromise;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('usuarios').select('*').eq('id', user.id).single();
    if (!data) return null;
    return { uid: user.id, username: data.username || '', rol: data.rol || '' };
}

(async () => {
    try {
        const usuario = await obtenerUsuarioCC();
        const ROLES_CC = ['callcenter', 'callcenter-admin', 'admin'];
        if (!usuario?.rol || !ROLES_CC.includes(usuario.rol)) { window.top.location.href = '../index.html'; return; }

        document.getElementById('username').textContent = usuario.username;
        _usuarioActual = usuario.username;
        if (['callcenter-admin', 'admin'].includes(usuario.rol)) {
            document.getElementById('btn-ir-motivos').style.display = '';
        }
        document.getElementById('btn-home').onclick = () => window.location.href = './callcenter.html';
        document.getElementById('btn-logout').addEventListener('click', async () => {
            if (confirm('¿Cerrar sesión?')) {
                await supabase.auth.signOut();
                window.top.location.href = '../index.html';
            }
        });

        ocultarSkeleton('contenido-principal');
        document.body.classList.add('loaded');
        _updateSortIcons();

        // Carga inicial
        await Promise.all([cargarTags(), _cargarTagsReactivacion(), ejecutarBusqueda()]);
        _cargarStats();
        _iniciarRealtime();
        _scheduleMidnightRefresh();
    } catch (err) {
        console.error('Error auth clientes:', err);
        document.body.classList.add('loaded');
    }
})();

// ── STATS CLIENTES ────────────────────────────────────────────────────────────
async function _cargarStats() {
    const [
        { count: total },
        { count: frecuentes },
        { count: reactivados },
    ] = await Promise.all([
        supabase.from('clientes').select('*', { count: 'exact', head: true }),
        supabase.from('clientes').select('*', { count: 'exact', head: true }).gte('total_pedidos', 3),
        supabase.from('reactivaciones').select('*', { count: 'exact', head: true }),
    ]);

    const fmt = n => n != null ? Number(n).toLocaleString('es-CO') : '—';
    document.getElementById('stat-total-clientes').textContent   = fmt(total);
    document.getElementById('stat-frecuentes').textContent       = fmt(frecuentes);
    document.getElementById('stat-reactivados-total').textContent= fmt(reactivados);

    // Pedidos totales: suma de total_pedidos en clientes
    const { data: pData } = await supabase.from('clientes').select('total_pedidos').not('total_pedidos', 'is', null);
    const pedidosTot = (pData || []).reduce((s, r) => s + (r.total_pedidos || 0), 0);
    document.getElementById('stat-pedidos-total').textContent = fmt(pedidosTot);

    // Badge frecuentes en tab
    document.getElementById('tab-badge-frecuentes').textContent = fmt(frecuentes);
}

// ── FILTER TABS (Todos / Frecuentes) ──────────────────────────────────────────
document.querySelector('#cli-filter-tabs .cli-tab[data-filter="todos"]').addEventListener('click', function () {
    _tabActivo = 'todos';
    _filtroTags = [];
    _activarTab(this);
    _aplicarFiltros();
});
document.querySelector('#cli-filter-tabs .cli-tab[data-filter="frecuentes"]').addEventListener('click', function () {
    _tabActivo = 'frecuentes';
    _filtroTags = [];
    _activarTab(this);
    _aplicarFiltros();
});

// ── TAGS DINÁMICOS ────────────────────────────────────────────────────────────
let _todosLosTags = [];
const _capTag = t => t.charAt(0).toUpperCase() + t.slice(1);

function _renderTagsFiltro() {
    const tabs = document.getElementById('cli-filter-tabs');
    // Preserva los botones fijos (Todos + Frecuentes) y agrega los tags dinámicos antes del botón + Tag
    // Elimina tabs de tags anteriores
    tabs.querySelectorAll('.cli-tab[data-filter="tag"]').forEach(el => el.remove());
    tabs.querySelector('#btn-add-tag')?.remove();

    const tagTabs = _todosLosTags.map(t =>
        `<button class="cli-tab${_tabActivo === t ? ' active' : ''}" data-filter="tag" data-tag="${t}">${_capTag(t)}</button>`
    ).join('');
    tabs.insertAdjacentHTML('beforeend', tagTabs + `<button class="btn-add-tag" id="btn-add-tag">+ Tag</button>`);

    tabs.querySelectorAll('.cli-tab[data-filter="tag"]').forEach(btn => {
        btn.addEventListener('click', () => {
            _tabActivo = btn.dataset.tag;
            _filtroTags = [btn.dataset.tag];
            _activarTab(btn);
            _aplicarFiltros();
        });
    });
    document.getElementById('btn-add-tag').addEventListener('click', _abrirCrearTag);
}

function _activarTab(btnActivo) {
    document.querySelectorAll('#cli-filter-tabs .cli-tab').forEach(b => b.classList.remove('active'));
    btnActivo.classList.add('active');
}

function _renderTagsModal() {
    const wrap = document.getElementById('cli-tags');
    if (!wrap) return;
    wrap.innerHTML = _todosLosTags.map(t =>
        `<span class="tag-chip" data-tag="${t}">${_capTag(t)}</span>`
    ).join('');
    wrap.querySelectorAll('.tag-chip').forEach(chip => {
        chip.addEventListener('click', () => chip.classList.toggle('active'));
    });
}

function _renderTagsNuevoModal() {
    const wrap = document.getElementById('nuevo-cli-tags');
    if (!wrap) return;
    wrap.innerHTML = _todosLosTags.map(t =>
        `<span class="tag-chip nuevo-tag" data-tag="${t}">${_capTag(t)}</span>`
    ).join('');
    wrap.querySelectorAll('.nuevo-tag').forEach(chip => {
        chip.addEventListener('click', () => chip.classList.toggle('active'));
    });
}

async function cargarTags() {
    const { data } = await supabase.from('tags_clientes').select('nombre').order('nombre');
    _todosLosTags = (data || []).map(t => t.nombre);
    _renderTagsFiltro();
    _renderTagsModal();
    _renderTagsNuevoModal();
}

function _abrirCrearTag() {
    const bar = document.getElementById('cli-filter-tabs');
    document.getElementById('btn-add-tag').style.display = 'none';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'Nombre del tag...';
    inp.className = 'tag-input-nuevo';
    inp.maxLength = 30;
    bar.appendChild(inp);
    inp.focus();

    const confirmar = async () => {
        if (inp.value.trim()) await _crearTag(inp.value.trim());
        else _renderTagsFiltro();
    };
    inp.addEventListener('keydown', async e => {
        if (e.key === 'Enter')  await confirmar();
        if (e.key === 'Escape') _renderTagsFiltro();
    });
    inp.addEventListener('blur', () => setTimeout(_renderTagsFiltro, 200));
}

async function _crearTag(nombre) {
    if (_todosLosTags.some(t => t.toLowerCase() === nombre.toLowerCase())) {
        _renderTagsFiltro(); return;
    }
    const { error } = await supabase.from('tags_clientes').insert({ nombre });
    if (error) { alert('Error al crear tag: ' + error.message); _renderTagsFiltro(); return; }
    _todosLosTags.push(nombre);
    _todosLosTags.sort((a, b) => a.localeCompare(b));
    _renderTagsFiltro();
    _renderTagsModal();
    _renderTagsNuevoModal();
}

// ── TAGS REACTIVACIÓN ─────────────────────────────────────────────────────────
async function _cargarTagsReactivacion() {
    const { data } = await supabase.from('tags_reactivacion').select('nombre').order('nombre');
    _tagsReactivacion = (data || []).map(t => t.nombre);
}

function _renderTagsReactivar() {
    const wrap = document.getElementById('reactivar-tags-wrap');
    _tagReactivarSel = null;
    wrap.innerHTML = _tagsReactivacion.map(t =>
        `<span class="reactivar-tag" data-tag="${t}">${t}</span>`
    ).join('') + `<button class="btn-add-tag" id="btn-add-react-tag" type="button">+ Crear</button>`;

    wrap.querySelectorAll('.reactivar-tag').forEach(chip => {
        chip.addEventListener('click', () => {
            wrap.querySelectorAll('.reactivar-tag').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            _tagReactivarSel = chip.dataset.tag;
        });
    });

    document.getElementById('btn-add-react-tag').addEventListener('click', _abrirCrearTagReactivar);
}

function _abrirCrearTagReactivar() {
    const wrap = document.getElementById('reactivar-tags-wrap');
    document.getElementById('btn-add-react-tag').style.display = 'none';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'Nombre del motivo...';
    inp.className = 'tag-input-nuevo';
    inp.maxLength = 40;
    wrap.appendChild(inp);
    inp.focus();

    const confirmar = async () => {
        const nombre = inp.value.trim();
        if (nombre) await _crearTagReactivacion(nombre);
        else _renderTagsReactivar();
    };
    inp.addEventListener('keydown', async e => {
        if (e.key === 'Enter')  { e.preventDefault(); await confirmar(); }
        if (e.key === 'Escape') _renderTagsReactivar();
    });
    inp.addEventListener('blur', () => setTimeout(_renderTagsReactivar, 200));
}

async function _crearTagReactivacion(nombre) {
    if (_tagsReactivacion.some(t => t.toLowerCase() === nombre.toLowerCase())) {
        _renderTagsReactivar(); return;
    }
    const { error } = await supabase.from('tags_reactivacion').insert({ nombre });
    if (error) { alert('Error al crear: ' + error.message); _renderTagsReactivar(); return; }
    _tagsReactivacion.push(nombre);
    _tagsReactivacion.sort((a, b) => a.localeCompare(b));
    _renderTagsReactivar();
    // Auto-seleccionar el tag recién creado
    setTimeout(() => {
        const chip = document.querySelector(`.reactivar-tag[data-tag="${nombre}"]`);
        if (chip) chip.click();
    }, 0);
}

// ── GESTIÓN MOTIVOS ───────────────────────────────────────────────────────────
async function cargarMotivos() {
    const lista = document.getElementById('motivos-lista');
    lista.innerHTML = '<p style="color:#999;font-size:1.3rem;padding:10px 0;">Cargando…</p>';
    const { data, error } = await supabase.from('tags_reactivacion').select('id, nombre').order('nombre');
    if (error) { lista.innerHTML = `<p style="color:#e74c3c;">${error.message}</p>`; return; }
    if (!data?.length) { lista.innerHTML = '<p style="color:#999;font-size:1.3rem;padding:10px 0;">Sin motivos registrados.</p>'; return; }
    lista.innerHTML = data.map(t =>
        `<div class="motivo-item">
            <span>${t.nombre}</span>
            <button class="btn-eliminar-motivo" data-id="${t.id}" title="Eliminar">×</button>
        </div>`
    ).join('');
    lista.querySelectorAll('.btn-eliminar-motivo').forEach(btn => {
        btn.addEventListener('click', () => _eliminarMotivo(Number(btn.dataset.id), btn.closest('.motivo-item').querySelector('span').textContent));
    });
}

async function _crearMotivo() {
    const input = document.getElementById('motivo-input');
    const nombre = input.value.trim();
    if (!nombre) return;
    if (_tagsReactivacion.some(t => t.toLowerCase() === nombre.toLowerCase())) {
        input.value = '';
        return;
    }
    const { error } = await supabase.from('tags_reactivacion').insert({ nombre });
    if (error) {
        if (error.code === '23505') { alert(`El motivo "${nombre}" ya existe.`); }
        else { alert('Error al crear: ' + error.message); }
        return;
    }
    input.value = '';
    await _cargarTagsReactivacion();
    await cargarMotivos();
}

async function _eliminarMotivo(id, nombre) {
    if (!confirm(`¿Eliminar el motivo "${nombre}"?`)) return;
    const { error } = await supabase.from('tags_reactivacion').delete().eq('id', id);
    if (error) { alert('Error al eliminar: ' + error.message); return; }
    await _cargarTagsReactivacion();
    await cargarMotivos();
}

// ── REACTIVACIÓN ──────────────────────────────────────────────────────────────
function abrirModalReactivar(cli, dias, sedePreset = '') {
    _reactivarCli  = cli;
    _reactivarDias = dias;
    _reactivarSede = sedePreset || '';
    document.getElementById('modal-reactivar-titulo').textContent = cli.nombre || cli.telefono;
    document.getElementById('reactivar-nombre').textContent  = cli.nombre || cli.telefono;
    document.getElementById('reactivar-tel').textContent     = cli.telefono;
    document.getElementById('reactivar-dias').textContent    = `${dias} días sin ordenar`;
    document.getElementById('reactivar-notas').value         = '';
    _renderTagsReactivar();
    document.getElementById('modal-reactivar').style.display = 'flex';
    document.getElementById('reactivar-notas').focus();
}

async function registrarReactivacion() {
    if (!_reactivarCli) return;
    if (!_reactivarCli.id) {
        alert('⚠️ No se encontró un registro de cliente para este número en el CRM. Ve a la pestaña Clientes, créalo con el número ' + (_reactivarCli.telefono || '') + ' y vuelve a intentarlo.');
        return;
    }
    if (!_tagReactivarSel) {
        alert('⚠️ Selecciona un motivo antes de confirmar.');
        return;
    }
    const notas = document.getElementById('reactivar-notas').value.trim();
    const btn   = document.getElementById('btn-confirmar-reactivar');

    btn.textContent = 'Registrando...';
    btn.disabled    = true;

    const { error } = await supabase.from('reactivaciones').insert({
        cliente_id:     _reactivarCli.id,
        telefono:       _reactivarCli.telefono,
        nombre_cliente: _reactivarCli.nombre || '',
        dias_inactivo:  _reactivarDias,
        agente:         _usuarioActual,
        notas:          notas || null,
        sede:           _reactivarSede || null,
        resultado:      'exitosa',
        tag:            _tagReactivarSel,
    });

    btn.textContent = 'Confirmar reactivación';
    btn.disabled    = false;

    if (error) { alert('Error al registrar: ' + error.message); return; }

    await supabase.from('clientes')
        .update({ fecha_ultima_reactivacion: new Date().toISOString() })
        .eq('id', _reactivarCli.id);

    document.getElementById('modal-reactivar').style.display = 'none';

    // Quitar la fila del DOM de inmediato
    const filaActiva = document.querySelector(`.hist-row-clickable[data-cliente-id="${_reactivarCli.id}"]`);
    if (filaActiva) filaActiva.remove();

    _reactivarCli = null;
    _actualizarResumenRapido();
    cargarHistorial(_histPagina);
}

// ── LOG CLIENTES ──────────────────────────────────────────────────────────────
const LOG_POR_PAGINA = 30;

const LOG_ACCION_LABEL = {
    crear_cliente:       { txt: 'Crear cliente',      cls: 'crear'       },
    editar_datos:        { txt: 'Editar datos',        cls: 'editar'      },
    eliminar_cliente:    { txt: 'Eliminar cliente',    cls: 'eliminar-c'  },
    agregar_direccion:   { txt: 'Agregar dirección',   cls: 'agregar-dir' },
    eliminar_direccion:  { txt: 'Eliminar dirección',  cls: 'eliminar-d'  },
    marcar_predeterminada: { txt: 'Dir. predeterminada', cls: 'pred'      },
};

function _formatLogDetalle(accion, detalle = {}) {
    if (accion === 'editar_datos')
        return `Campos: ${(detalle.campos || []).join(', ')}`;
    if (accion === 'agregar_direccion' || accion === 'eliminar_direccion' || accion === 'marcar_predeterminada')
        return [detalle.direccion, detalle.barrio].filter(Boolean).join(' — ') || '—';
    if (accion === 'crear_cliente')
        return detalle.nombre ? `Nombre: ${detalle.nombre}` : '—';
    return '—';
}

function _rowLogHtml(r) {
    const fecha = r.created_at
        ? new Date(r.created_at).toLocaleString('es-CO', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit' })
        : '—';
    const accionInfo = LOG_ACCION_LABEL[r.accion] || { txt: r.accion, cls: 'editar' };
    const detalle    = _formatLogDetalle(r.accion, r.detalle || {});
    return `<tr class="inventory-management__row">
        <td class="inventory-management__cell" style="white-space:nowrap;font-size:1.15rem;">${fecha}</td>
        <td class="inventory-management__cell">${r.asesor || '—'}</td>
        <td class="inventory-management__cell">${r.nombre_cliente || '—'}</td>
        <td class="inventory-management__cell" style="font-weight:700;">${r.telefono || '—'}</td>
        <td class="inventory-management__cell"><span class="log-accion-badge ${accionInfo.cls}">${accionInfo.txt}</span></td>
        <td class="inventory-management__cell" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${detalle}</td>
    </tr>`;
}

async function cargarLog(pagina = 1) {
    const tbody = document.getElementById('log-tbody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#999;">Cargando...</td></tr>';

    const offset = (pagina - 1) * LOG_POR_PAGINA;
    const { data, error } = await supabase
        .from('clientes_log')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + LOG_POR_PAGINA - 1);

    if (error) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:#999;">Error al cargar.</td></tr>';
        return;
    }

    tbody.innerHTML = data.length
        ? data.map(_rowLogHtml).join('')
        : '<tr><td colspan="6" style="text-align:center;padding:30px;color:#999;">Sin registros.</td></tr>';

    // Paginación simple
    const pag = document.getElementById('log-paginacion');
    pag.innerHTML = `
        <button class="pag-btn" id="log-pag-prev" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
        <span class="pag-info">Página ${pagina}</span>
        <button class="pag-btn" id="log-pag-next" ${data.length < LOG_POR_PAGINA ? 'disabled' : ''}>Siguiente →</button>`;
    pag.querySelector('#log-pag-prev')?.addEventListener('click', () => cargarLog(pagina - 1));
    pag.querySelector('#log-pag-next')?.addEventListener('click', () => cargarLog(pagina + 1));
}

document.getElementById('btn-ir-log').addEventListener('click', () => {
    _setVistaActiva('log');
    cargarLog(1);
});

document.getElementById('btn-ir-motivos').addEventListener('click', () => {
    _setVistaActiva('motivos');
    cargarMotivos();
});

document.getElementById('btn-ir-hist-react').addEventListener('click', () => {
    _setVistaActiva('hist-react');
    _hrLlenarSelectTag();
    cargarHistorialReact(1);
});

// ── HISTORIAL DE REACTIVACIONES ───────────────────────────────────────────────
const HR_POR_PAGINA = 30;
let _hrPagina = 1;

function _hrFmtFecha(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString('es-CO', { day:'2-digit', month:'2-digit', year:'2-digit' })
        + ' ' + d.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' });
}

async function cargarHistorialReact(pagina = 1) {
    _hrPagina = pagina;
    const tbody = document.getElementById('hist-react-tbody');
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#999;">Cargando...</td></tr>`;

    const desde  = document.getElementById('hr-fecha-desde').value;
    const hasta  = document.getElementById('hr-fecha-hasta').value;
    const agente = document.getElementById('hr-filtro-agente').value.trim();
    const tag    = document.getElementById('hr-filtro-tag').value;
    const offset = (pagina - 1) * HR_POR_PAGINA;

    let query = supabase
        .from('reactivaciones')
        .select('id, fecha, telefono, nombre_cliente, dias_inactivo, agente, notas, tag', { count: 'exact' })
        .order('fecha', { ascending: false })
        .range(offset, offset + HR_POR_PAGINA - 1);

    if (desde)  query = query.gte('fecha', desde + 'T00:00:00');
    if (hasta)  query = query.lte('fecha', hasta + 'T23:59:59');
    if (agente) query = query.ilike('agente', '%' + agente + '%');
    if (tag)    query = query.eq('tag', tag);

    const { data, error, count } = await query;

    if (error) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#e74c3c;">${error.message}</td></tr>`;
        return;
    }
    if (!data?.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#999;">Sin registros.</td></tr>`;
        document.getElementById('hist-react-paginacion').innerHTML = '';
        return;
    }

    tbody.innerHTML = data.map(r => `
        <tr class="inventory-management__row">
            <td class="inventory-management__cell" style="white-space:nowrap;">${_hrFmtFecha(r.fecha)}</td>
            <td class="inventory-management__cell" style="font-weight:700;">${r.telefono || '—'}</td>
            <td class="inventory-management__cell">${r.nombre_cliente || '—'}</td>
            <td class="inventory-management__cell" style="text-align:center;font-weight:700;">${r.dias_inactivo ?? '—'}</td>
            <td class="inventory-management__cell">${r.agente || '—'}</td>
            <td class="inventory-management__cell">${r.tag ? `<span class="hr-tag-pill">${r.tag}</span>` : '—'}</td>
            <td class="inventory-management__cell hr-notas-cell" title="${(r.notas || '').replace(/"/g, '&quot;')}">${r.notas || '—'}</td>
        </tr>
    `).join('');

    _renderHrPaginacion(pagina, count || 0);
}

function _renderHrPaginacion(pagina, total) {
    const totalPags = Math.ceil(total / HR_POR_PAGINA);
    const el = document.getElementById('hist-react-paginacion');
    if (totalPags <= 1) { el.innerHTML = ''; return; }

    let html = '';
    for (let i = 1; i <= totalPags; i++) {
        if (i === 1 || i === totalPags || Math.abs(i - pagina) <= 1) {
            html += `<button class="pag-btn${i === pagina ? ' active' : ''}" data-p="${i}">${i}</button>`;
        } else if (Math.abs(i - pagina) === 2) {
            html += `<span class="pag-ellipsis">…</span>`;
        }
    }
    el.innerHTML = html;
    el.querySelectorAll('.pag-btn').forEach(btn =>
        btn.addEventListener('click', () => cargarHistorialReact(Number(btn.dataset.p)))
    );
}

function _hrLlenarSelectTag() {
    const sel = document.getElementById('hr-filtro-tag');
    const actual = sel.value;
    sel.innerHTML = '<option value="">Todos los motivos</option>' +
        _tagsReactivacion.map(t => `<option value="${t}">${t}</option>`).join('');
    sel.value = actual;
}

// Filtros con debounce
let _hrTimer = null;
function _hrFiltrar() {
    clearTimeout(_hrTimer);
    _hrTimer = setTimeout(() => cargarHistorialReact(1), 350);
}
document.getElementById('hr-fecha-desde').addEventListener('change', _hrFiltrar);
document.getElementById('hr-fecha-hasta').addEventListener('change', _hrFiltrar);
document.getElementById('hr-filtro-agente').addEventListener('input', _hrFiltrar);
document.getElementById('hr-filtro-tag').addEventListener('change', () => cargarHistorialReact(1));
document.getElementById('hr-btn-limpiar').addEventListener('click', () => {
    document.getElementById('hr-fecha-desde').value = '';
    document.getElementById('hr-fecha-hasta').value = '';
    document.getElementById('hr-filtro-agente').value = '';
    document.getElementById('hr-filtro-tag').value = '';
    cargarHistorialReact(1);
});

document.getElementById('btn-crear-motivo').addEventListener('click', _crearMotivo);
document.getElementById('motivo-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') _crearMotivo();
});

// ── REALTIME ──────────────────────────────────────────────────────────────────
function _iniciarRealtime() {
    supabase.channel('rt-clientes')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clientes' }, ({ new: nuevo }) => {
            const idx = _clientesData.findIndex(c => String(c.id) === String(nuevo.id));
            if (idx === -1) return;
            // Preservar conteo de direcciones (no viene en el evento)
            const dirs = _clientesData[idx].direcciones_cliente;
            _clientesData[idx] = { ..._clientesData[idx], ...nuevo, direcciones_cliente: dirs };
            const oldRow = document.querySelector(`tr[data-id="${nuevo.id}"]`);
            if (!oldRow) return;
            const tpl = document.createElement('template');
            tpl.innerHTML = _rowHtml(_clientesData[idx]);
            const newRow = tpl.content.firstElementChild;
            _bindRows([newRow]);
            oldRow.replaceWith(newRow);
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'clientes' }, ({ old }) => {
            _clientesData = _clientesData.filter(c => String(c.id) !== String(old.id));
            document.querySelector(`tr[data-id="${old.id}"]`)?.remove();
            _todosCache.clear();
            _actualizarCount();
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clientes' }, () => {
            _todosCache.clear();
            if (_vista === 'todos') ejecutarBusqueda(1);
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direcciones_cliente' }, ({ new: nueva }) => {
            if (nueva?.cliente_id) _actualizarConteoDir(nueva.cliente_id, +1);
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'direcciones_cliente' }, ({ old }) => {
            // old.cliente_id disponible solo si la tabla tiene REPLICA IDENTITY FULL
            if (old?.cliente_id) _actualizarConteoDir(old.cliente_id, -1);
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactivaciones' }, () => {
            if (_vista === 'historial') {
                _actualizarConteosPills();
                _actualizarResumenRapido();
            }
        })
        .subscribe();
}

// ── REFRESCO MEDIANOCHE ───────────────────────────────────────────────────────
function _scheduleMidnightRefresh() {
    const ahora   = new Date();
    const manana  = new Date(ahora);
    manana.setDate(manana.getDate() + 1);
    manana.setHours(0, 0, 0, 0);
    const ms = manana - ahora;

    setTimeout(() => {
        _todosCache.clear();
        ejecutarBusqueda(1);
        _scheduleMidnightRefresh(); // reprogramar para la siguiente medianoche
    }, ms);
}

// ── SKELETON FILAS ────────────────────────────────────────────────────────────
function _skeletonFilasClientes(n) {
    // Variantes de ancho para nombre y tags para que no sean todas iguales
    const nombresW = ['55%', '70%', '45%', '80%', '60%'];
    const tagsCols = [
        '<div class="sk-block" style="width:52px;height:20px;border-radius:10px;display:inline-block;"></div>',
        '<div class="sk-block" style="width:52px;height:20px;border-radius:10px;display:inline-block;"></div><div class="sk-block" style="width:40px;height:20px;border-radius:10px;display:inline-block;margin-left:4px;"></div>',
        '',
        '<div class="sk-block" style="width:44px;height:20px;border-radius:10px;display:inline-block;"></div>',
        '',
    ];
    return Array.from({ length: n }, (_, i) => {
        const idx = i % 5;
        return `<tr class="inventory-management__row">
            <td class="inventory-management__cell col-tel sk-td">
                <div class="sk-block" style="width:90%;"></div>
            </td>
            <td class="inventory-management__cell col-nombre sk-td">
                <div class="sk-block" style="width:${nombresW[idx]};"></div>
            </td>
            <td class="inventory-management__cell col-tags-td sk-td">
                ${tagsCols[idx]}
            </td>
            <td class="inventory-management__cell col-pedidos-td sk-td" style="text-align:center;">
                <div class="sk-block" style="width:32px;margin:0 auto;"></div>
            </td>
            <td class="inventory-management__cell col-dirs-td sk-td" style="text-align:center;">
                <div class="sk-block" style="width:24px;margin:0 auto;"></div>
            </td>
            <td class="inventory-management__cell col-ultimo-td sk-td">
                <div class="sk-block" style="width:80px;"></div>
            </td>
            <td class="inventory-management__cell col-acciones-td sk-td"></td>
        </tr>`;
    }).join('');
}

// ── EVENTOS ───────────────────────────────────────────────────────────────────
const searchInput = document.getElementById('buscar-cliente-input');
const btnBuscar   = document.getElementById('btn-buscar-cliente');

async function ejecutarBusqueda(pagina = 1, fromSearch = false) {
    paginaActual = pagina;
    const q = searchInput.value.trim();

    _disconnectObserver();

    if (fromSearch) {
        _todosCache.clear();
        btnBuscar.textContent = 'Buscando...';
        btnBuscar.disabled = true;
    }

    if (!_todosCache.has(`${q}:${pagina}`)) {
        document.getElementById('clientes-tbody').innerHTML = _skeletonFilasClientes(POR_PAGINA);
    }

    const { data } = await _fetchTodosPagina(q, pagina);

    _infPage  = pagina;
    _infQuery = q;

    renderTabla(data);

    // Paginación prev/next
    const pag = document.getElementById('clientes-paginacion');
    const hasNext = data.length === POR_PAGINA;
    if (pagina <= 1 && !hasNext) {
        pag.innerHTML = '';
    } else {
        pag.innerHTML = `
            <button class="pag-btn" id="pag-prev" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
            <span class="pag-info">Página ${pagina}</span>
            <button class="pag-btn" id="pag-next" ${!hasNext ? 'disabled' : ''}>Siguiente →</button>`;
        pag.querySelector('#pag-prev')?.addEventListener('click', () => ejecutarBusqueda(pagina - 1));
        pag.querySelector('#pag-next')?.addEventListener('click', () => ejecutarBusqueda(pagina + 1));
    }

    if (fromSearch) {
        btnBuscar.textContent = 'Buscar';
        btnBuscar.disabled = false;
    }
}

// ── Ordenamiento de tabla ─────────────────────────────────────────────────────
function _updateSortIcons() {
    document.querySelectorAll('#clientes-thead-row .sort-th').forEach(th => {
        const col    = th.dataset.sort;
        const icon   = th.querySelector('.sort-icon');
        const isText = col === 'nombre';

        if (col === _sortCol) {
            icon.textContent = _sortDir === 'asc' ? '▲' : '▼';
            th.classList.add('sort-active');
            // El tooltip muestra qué pasará al hacer clic (la dirección opuesta)
            th.dataset.tooltip = _sortDir === 'asc'
                ? (isText ? 'Ordenar Z → A'        : 'Ordenar de mayor a menor')
                : (isText ? 'Ordenar A → Z'        : 'Ordenar de menor a mayor');
        } else {
            icon.textContent = '▲▼';
            th.classList.remove('sort-active');
            // Primera vez: muestra la dirección por defecto que se aplicará
            const defaultDesc = col === 'pedidos' || col === 'fecha' || col === 'total_pedidos' || col === 'dirs';
            th.dataset.tooltip = defaultDesc
                ? 'Ordenar de mayor a menor'
                : isText ? 'Ordenar A → Z' : 'Ordenar de menor a mayor';
        }
    });
}

function _sortClienteData() {
    const dir = _sortDir === 'asc' ? 1 : -1;
    _clientesData.sort((a, b) => {
        let va, vb;
        if (_sortCol === 'telefono') {
            va = a.telefono || ''; vb = b.telefono || '';
        } else if (_sortCol === 'nombre') {
            va = (a.nombre || '').toLowerCase(); vb = (b.nombre || '').toLowerCase();
        } else if (_sortCol === 'total_pedidos') {
            va = a.total_pedidos ?? 0; vb = b.total_pedidos ?? 0;
        } else if (_sortCol === 'tags') {
            va = (a.tags || []).length; vb = (b.tags || []).length;
        } else if (_sortCol === 'dirs') {
            va = a.direcciones_cliente?.[0]?.count ?? 0;
            vb = b.direcciones_cliente?.[0]?.count ?? 0;
        } else if (_sortCol === 'pedidos') {
            va = new Date(a.updated_at || 0); vb = new Date(b.updated_at || 0);
        } else { // fecha
            const fa = _vista === 'reactivacion' ? a.ultimo_pedido : a.updated_at;
            const fb = _vista === 'reactivacion' ? b.ultimo_pedido : b.updated_at;
            va = new Date(fa || 0); vb = new Date(fb || 0);
        }
        if (va < vb) return -dir;
        if (va > vb) return  dir;
        return 0;
    });
    const tbody = document.getElementById('clientes-tbody');
    tbody.innerHTML = _clientesData.map(c => _rowHtml(c)).join('');
    _bindRows([...tbody.querySelectorAll('.fila-cliente')]);
    _actualizarCount();
}

document.querySelectorAll('#clientes-thead-row .sort-th').forEach(th => {
    th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (_sortCol === col) {
            _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            _sortCol = col;
            // Por defecto: desc para pedidos/fecha/dirs, asc para texto
            _sortDir = (col === 'pedidos' || col === 'fecha' || col === 'dirs') ? 'desc' : 'asc';
        }
        _updateSortIcons();

        const supabaseSortable = ['telefono', 'nombre', 'total_pedidos', 'fecha'];
        if (_vista === 'todos' && supabaseSortable.includes(col)) {
            _todosCache.clear();
            ejecutarBusqueda(1);
        } else {
            _sortClienteData();
        }
    });
});

// ── Panel de filtros (sidebar fijo) ───────────────────────────────────────────
function _aplicarFiltros() {
    _filtroTags = [...document.querySelectorAll('.tag-filtro.active')].map(c => c.dataset.tag).filter(Boolean);
    const diasChip = document.querySelector('.dias-filtro.active');
    _filtroDias = diasChip?.dataset.dias ? Number(diasChip.dataset.dias) : null;
    _todosCache.clear();
    _setVistaActiva('todos');
    ejecutarBusqueda(1);
}

// Tags: multi-select, filtran al instante
document.querySelectorAll('.tag-filtro').forEach(chip => {
    chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        _aplicarFiltros();
    });
});

// Días: selección exclusiva, filtra al instante
document.querySelectorAll('.dias-filtro').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.dias-filtro').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        _aplicarFiltros();
    });
});


let debounceTimer = null;

btnBuscar.addEventListener('click', () => ejecutarBusqueda(1, true));
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') ejecutarBusqueda(1, true); });
searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => ejecutarBusqueda(1, true), 300);
});

document.getElementById('cerrar-modal-cli').addEventListener('click', cerrarModal);
document.getElementById('btn-guardar-cli').addEventListener('click', guardarCliente);
document.getElementById('btn-eliminar-cliente').addEventListener('click', eliminarCliente);
document.getElementById('modal-cliente-detalle').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-cliente-detalle')) cerrarModal();
});

document.getElementById('btn-add-dir').addEventListener('click', () => {
    document.getElementById('nueva-dir-form').style.display = 'block';
    document.getElementById('btn-add-dir').style.display = 'none';
    document.getElementById('nueva-dir-direccion').focus();
});
document.getElementById('btn-cancelar-dir').addEventListener('click', () => {
    document.getElementById('nueva-dir-form').style.display = 'none';
    document.getElementById('btn-add-dir').style.display = '';
});
document.getElementById('btn-guardar-dir').addEventListener('click', guardarNuevaDireccion);

document.getElementById('btn-nuevo-cliente').addEventListener('click', abrirModalNuevo);
document.getElementById('cerrar-modal-nuevo').addEventListener('click', cerrarModalNuevo);
document.getElementById('btn-crear-cliente').addEventListener('click', crearCliente);
document.getElementById('modal-nuevo-cliente').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-nuevo-cliente')) cerrarModalNuevo();
});

function _cerrarModalReactivar() {
    document.getElementById('modal-reactivar').style.display = 'none';
    _reactivarCli = null;
}
document.getElementById('cerrar-modal-reactivar').addEventListener('click', _cerrarModalReactivar);
document.getElementById('btn-confirmar-reactivar').addEventListener('click', registrarReactivacion);
document.getElementById('modal-reactivar').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-reactivar')) _cerrarModalReactivar();
});

// ── HISTORIAL REACTIVACIONES ──────────────────────────────────────────────────
let _histPagina   = 1;
let _histTotal    = 0;
let _histPDias    = 1;    // p_dias activo según chip seleccionado
let _histPDiasMax = null; // p_dias_max activo (null = sin límite superior)

function _calcHistPorPagina() {
    return Math.max(15, Math.floor((window.innerHeight - 300) / 46));
}
let HIST_POR_PAGINA = _calcHistPorPagina();
window.addEventListener('resize', () => { HIST_POR_PAGINA = _calcHistPorPagina(); });

// ── Tracking "Copiado hoy" por teléfono ──────────────────────────────────────
const _SS_KEY = 'react_copiados';

function _getCopiadoHoy(tel) {
    try {
        const d  = JSON.parse(sessionStorage.getItem(_SS_KEY) || '{}');
        const ts = d[tel];
        if (!ts) return null;
        return new Date(ts).toDateString() === new Date().toDateString() ? ts : null;
    } catch { return null; }
}

function _marcarCopiado(tel) {
    try {
        const d = JSON.parse(sessionStorage.getItem(_SS_KEY) || '{}');
        d[tel]  = new Date().toISOString();
        sessionStorage.setItem(_SS_KEY, JSON.stringify(d));
    } catch {}
}

function _desmarcarCopiado(tel) {
    try {
        const d = JSON.parse(sessionStorage.getItem(_SS_KEY) || '{}');
        delete d[tel];
        sessionStorage.setItem(_SS_KEY, JSON.stringify(d));
    } catch {}
}

function _contarCopiadosHoy() {
    try {
        const d   = JSON.parse(sessionStorage.getItem(_SS_KEY) || '{}');
        const hoy = new Date().toDateString();
        return Object.values(d).filter(ts => new Date(ts).toDateString() === hoy).length;
    } catch { return 0; }
}

async function _fetchHistorialPage(pagina) {
    const sede     = document.getElementById('hist-filtro-sede')?.value || null;
    const busqueda = document.getElementById('hist-filtro-busqueda').value.trim();

    const [{ data, error }, { data: total }] = await Promise.all([
        supabase.rpc('clientes_por_reactivar', {
            p_dias:     _histPDias,
            p_dias_max: _histPDiasMax || null,
            p_sede:     sede || null,
            p_busqueda: busqueda || null,
            p_pagina:   pagina,
            p_limite:   HIST_POR_PAGINA,
        }),
        supabase.rpc('clientes_por_reactivar_count', {
            p_dias:     _histPDias,
            p_dias_max: _histPDiasMax || null,
            p_sede:     sede || null,
        }),
    ]);

    if (error) { console.error('clientes_por_reactivar error:', error); return []; }
    _histTotal = Number(total ?? 0);
    return data || [];
}

function _estadoHtml(r) {
    if (r.fue_reactivado && r.fecha_reactivacion) {
        const f = new Date(r.fecha_reactivacion).toLocaleDateString('es-CO',
            { day: '2-digit', month: 'short', year: 'numeric' });
        return `<div class="estado-cell">
            <div class="estado-dot-row">
                <span class="estado-dot reactivado"></span>
                <span class="estado-label reactivado">Reactivado</span>
            </div>
            <span class="estado-sub">${f}</span>
        </div>`;
    }
    const copiadoTs = _getCopiadoHoy(r.telefono);
    if (copiadoTs) {
        const hora  = new Date(copiadoTs).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        const esHoy = new Date(copiadoTs).toDateString() === new Date().toDateString();
        return `<div class="estado-cell">
            <div class="estado-dot-row">
                <span class="estado-dot copiado"></span>
                <span class="estado-label copiado">Copiado</span>
            </div>
            <span class="estado-sub">${esHoy ? 'Hoy' : 'Ayer'}, ${hora}</span>
        </div>`;
    }
    return `<div class="estado-cell">
        <div class="estado-dot-row">
            <span class="estado-dot pendiente"></span>
            <span class="estado-label pendiente">Pendiente</span>
        </div>
    </div>`;
}

function _rowHistorialHtml(r) {
    const dias    = r.dias_inactivo ?? 0;
    const diasCls = dias >= 120 ? 'critico' : dias >= 60 ? 'moderado' : '';

    const pedidos = r.total_pedidos ?? 0;
    const valor   = r.valor_total
        ? `$${Math.round(r.valor_total).toLocaleString('es-CO')}`
        : '';
    const meta = [
        pedidos ? `${pedidos} pedido${pedidos !== 1 ? 's' : ''}` : '',
        valor,
    ].filter(Boolean).join(' • ');

    const fechaUltimo = r.ultimo_pedido
        ? new Date(r.ultimo_pedido).toLocaleDateString('es-CO',
            { day: '2-digit', month: 'short', year: 'numeric' })
        : '—';

    const sede   = SEDE_LABELS[r.ultima_sede] || r.ultima_sede || '—';
    const tel    = r.telefono || '';
    const nombre = (r.nombre_cliente || '—').replace(/</g, '&lt;');
    const prod   = (r.ultimo_producto || '').replace(/</g, '&lt;');

    return `<tr class="inventory-management__row hist-row-clickable" style="cursor:pointer;"
        data-cliente-id="${r.cliente_id || ''}"
        data-nombre="${nombre}"
        data-tel="${tel}"
        data-sede="${r.ultima_sede || ''}"
        data-dias="${dias}"
        data-id="">
        <td class="inventory-management__cell">
            <div class="tel-cell">
                <svg class="tel-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6.1 6.1l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                ${tel || '—'}
            </div>
        </td>
        <td class="inventory-management__cell">
            <div class="cli-react-nombre">${nombre}</div>
            ${meta ? `<div class="cli-react-meta">${meta}</div>` : ''}
        </td>
        <td class="inventory-management__cell react-col-sede">${sede}</td>
        <td class="inventory-management__cell react-col-ultimo">
            <div class="ultimo-wrap">
                <span class="ultimo-fecha">${fechaUltimo}</span>
                ${prod ? `<span class="ultimo-producto">${prod}</span>` : ''}
            </div>
        </td>
        <td class="inventory-management__cell" style="text-align:center;">
            <span class="dias-badge ${diasCls}">${dias}d</span>
        </td>
        <td class="inventory-management__cell estado-td">${_estadoHtml(r)}</td>
        <td class="inventory-management__cell react-col-accion">
            <button class="btn-copiar-tel${_getCopiadoHoy(tel) ? ' copiado' : ''}" data-tel="${tel}" data-reactivado="${r.fue_reactivado ? '1' : ''}" data-fecha-react="${r.fecha_reactivacion || ''}">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Copiar teléfono
            </button>
        </td>
    </tr>`;
}

function _renderPaginacion(pagina, total) {
    const pag       = document.getElementById('historial-react-paginacion');
    const totalPags = Math.max(1, Math.ceil(total / HIST_POR_PAGINA));
    const desde     = total ? (pagina - 1) * HIST_POR_PAGINA + 1 : 0;
    const hasta     = Math.min(pagina * HIST_POR_PAGINA, total);

    const nums = [];
    if (totalPags <= 7) {
        for (let i = 1; i <= totalPags; i++) nums.push(i);
    } else {
        nums.push(1);
        if (pagina > 3) nums.push('…');
        for (let i = Math.max(2, pagina - 1); i <= Math.min(totalPags - 1, pagina + 1); i++) nums.push(i);
        if (pagina < totalPags - 2) nums.push('…');
        nums.push(totalPags);
    }

    const btns = nums.map(n =>
        n === '…'
            ? `<span class="react-pag-ellipsis">…</span>`
            : `<button class="react-pag-btn${n === pagina ? ' active' : ''}" data-pag="${n}">${n}</button>`
    ).join('');

    pag.className = 'react-paginacion';
    pag.innerHTML = `
        <span class="react-pag-info">Mostrando ${desde}–${hasta} de ${total.toLocaleString('es-CO')} clientes</span>
        <div class="react-pag-pages">
            <button class="react-pag-btn" data-pag="${pagina - 1}" ${pagina <= 1 ? 'disabled' : ''}>‹</button>
            ${btns}
            <button class="react-pag-btn" data-pag="${pagina + 1}" ${pagina >= totalPags ? 'disabled' : ''}>›</button>
        </div>`;

    pag.querySelectorAll('.react-pag-btn[data-pag]').forEach(btn => {
        btn.addEventListener('click', () => {
            const p = parseInt(btn.dataset.pag);
            if (!isNaN(p) && p >= 1 && p <= totalPags) cargarHistorial(p);
        });
    });
}

async function _actualizarResumenRapido() {
    const sede      = document.getElementById('hist-filtro-sede')?.value || null;
    const hoyInicio = new Date();
    hoyInicio.setHours(0, 0, 0, 0);

    const [{ data: pendientes }, { count: reactivados }] = await Promise.all([
        supabase.rpc('clientes_por_reactivar_count', {
            p_dias: 1, p_dias_max: null, p_sede: sede,
        }),
        supabase.from('reactivaciones')
            .select('*', { count: 'exact', head: true })
            .eq('resultado', 'exitosa')
            .gte('fecha', hoyInicio.toISOString()),
    ]);

    document.getElementById('resumen-pendientes').textContent =
        pendientes != null ? Number(pendientes).toLocaleString('es-CO') : '—';
    document.getElementById('resumen-copiados').textContent = _contarCopiadosHoy();
    document.getElementById('resumen-reactivados').textContent =
        reactivados != null ? reactivados : '—';
}

async function cargarHistorial(pagina = 1) {
    _histPagina = pagina;
    const tbody = document.getElementById('historial-react-tbody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#999;">Cargando...</td></tr>';
    document.getElementById('historial-react-paginacion').innerHTML = '';

    const data = await _fetchHistorialPage(pagina);

    tbody.innerHTML = data.length
        ? data.map(_rowHistorialHtml).join('')
        : '<tr><td colspan="7" style="text-align:center;padding:30px;color:#999;">Sin clientes para reactivar con este filtro.</td></tr>';

    _renderPaginacion(pagina, _histTotal);
    _actualizarResumenRapido();

    // Bind botones "Copiar teléfono"
    tbody.querySelectorAll('.btn-copiar-tel').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const tel          = btn.dataset.tel;
            if (!tel) return;
            const fueReactivado = btn.dataset.reactivado === '1';
            const fechaReact    = btn.dataset.fechaReact || null;
            const tr            = btn.closest('tr');
            const td            = tr?.querySelector('.estado-td');

            if (btn.classList.contains('copiado')) {
                // Desmarcar: revertir estado
                _desmarcarCopiado(tel);
                btn.classList.remove('copiado');
                if (td) td.innerHTML = _estadoHtml({
                    telefono:          tel,
                    fue_reactivado:    fueReactivado,
                    fecha_reactivacion: fechaReact || null,
                });
            } else {
                // Marcar: copiar al clipboard
                try { await navigator.clipboard.writeText(tel); } catch {}
                _marcarCopiado(tel);
                btn.classList.add('copiado');
                if (td) td.innerHTML = _estadoHtml({
                    telefono:          tel,
                    fue_reactivado:    fueReactivado,
                    fecha_reactivacion: fechaReact || null,
                });
            }
            document.getElementById('resumen-copiados').textContent = _contarCopiadosHoy();
        });
    });
}


document.getElementById('historial-react-tbody').addEventListener('click', e => {
    const tr = e.target.closest('.hist-row-clickable');
    if (!tr) return;
    abrirModalReactivar(
        { id: tr.dataset.clienteId, nombre: tr.dataset.nombre, telefono: tr.dataset.tel },
        parseInt(tr.dataset.dias) || 0,
        tr.dataset.sede,
        tr.dataset.id || null
    );
});

document.getElementById('btn-ir-clientes').addEventListener('click', () => {
    _todosCache.clear();
    _setVistaActiva('todos');
    ejecutarBusqueda(1);
});

document.getElementById('btn-ir-reactivaciones').addEventListener('click', () => {
    _setVistaActiva('historial');
    cargarHistorial(1);
    _actualizarConteosPills();
    _actualizarResumenRapido();
});

document.getElementById('hist-filtro-sede').addEventListener('change', () => {
    cargarHistorial(1);
    _actualizarConteosPills();
});


async function _actualizarConteosPills() {
    const sede = document.getElementById('hist-filtro-sede')?.value || null;
    const chips = [
        { id: 'chip-count-todos', p_dias: 1,   p_dias_max: null },
        { id: 'chip-count-lt30',  p_dias: 1,   p_dias_max: 30   },
        { id: 'chip-count-30',    p_dias: 30,  p_dias_max: null },
        { id: 'chip-count-60',    p_dias: 60,  p_dias_max: null },
        { id: 'chip-count-90',    p_dias: 90,  p_dias_max: null },
        { id: 'chip-count-120',   p_dias: 120, p_dias_max: null },
        { id: 'chip-count-180',   p_dias: 180, p_dias_max: null },
    ];
    await Promise.all(chips.map(async ({ id, p_dias, p_dias_max }) => {
        const { data } = await supabase.rpc('clientes_por_reactivar_count', {
            p_dias, p_dias_max, p_sede: sede,
        });
        const el = document.getElementById(id);
        if (el) el.textContent = data != null ? Number(data).toLocaleString('es-CO') : '—';
    }));
}

document.querySelectorAll('.react-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.react-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        _histPDias    = parseInt(chip.dataset.pDias)    || 1;
        _histPDiasMax = parseInt(chip.dataset.pDiasMax) || null;
        cargarHistorial(1);
    });
});

let _histBusquedaTimer = null;
document.getElementById('hist-filtro-busqueda').addEventListener('input', () => {
    clearTimeout(_histBusquedaTimer);
    _histBusquedaTimer = setTimeout(() => cargarHistorial(1), 400);
});

// ─────────────────────────────────────────────────────────────────────────────
initNavButtons('clientes', { onBarrios: openBarriosModal });
if (window.parent !== window) window.parent.postMessage({ type: 'frame-ready' }, '*');
