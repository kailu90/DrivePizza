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
let _reactivarId       = null; // null = INSERT nuevo, string = UPDATE existente
let _vista        = 'todos';  // 'todos' | 'frecuentes' | 'reactivacion'
let _filtroTags   = [];       // [] | ['frecuente', 'vip', ...]  (multi-select)
let _filtroDias   = null;     // null | 30 | 60 | 90
let _sortCol      = 'fecha';  // 'telefono' | 'nombre' | 'pedidos' | 'fecha'
let _sortDir      = 'desc';   // 'asc' | 'desc'

const POR_PAGINA  = 20;
let   paginaActual = 1;

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

    if (_filtroTags.length) req = req.overlaps('tags', _filtroTags);
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

// ── REACTIVACIÓN (RPC) ────────────────────────────────────────────────────────
const _reactivacionCache = new Map();

async function _fetchReactivacionPagina(pagina) {
    if (_reactivacionCache.has(pagina)) return _reactivacionCache.get(pagina);
    const { data, error } = await supabase.rpc('clientes_reactivacion', {
        limite:        POR_PAGINA,
        desplazamiento: (pagina - 1) * POR_PAGINA,
    });
    if (error) { console.error('Error reactivación:', error); return []; }
    let result = data || [];
    if (_filtroTags.length) result = result.filter(c => _filtroTags.some(t => (c.tags || []).includes(t)));
    _reactivacionCache.set(pagina, result);
    return result;
}

async function ejecutarReactivacion(pagina = 1) {
    if (pagina === 1) {
        document.getElementById('clientes-count').textContent = 'Cargando...';
        document.getElementById('clientes-tbody').innerHTML =
            `<tr><td class="inventory-management__cell" colspan="5"
                style="text-align:center;padding:30px;color:#aaa;">Cargando...</td></tr>`;
        document.getElementById('clientes-paginacion').innerHTML = '';
    }

    const data = await _fetchReactivacionPagina(pagina);

    _infPage    = pagina;
    _infHasMore = data.length === POR_PAGINA;

    if (pagina === 1) {
        renderTabla(data);
    } else {
        appendTabla(data);
    }

    if (data.length === POR_PAGINA) _fetchReactivacionPagina(pagina + 1);
    _initScrollObserver(_fetchReactivacionPagina);
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

// ── FRECUENTES (RPC) ──────────────────────────────────────────────────────────
const _frecuentesCache = new Map(); // pagina → data[]

async function _fetchFrecuentesPagina(pagina) {
    if (_frecuentesCache.has(pagina)) return _frecuentesCache.get(pagina);
    const offset = (pagina - 1) * POR_PAGINA;
    const { data, error } = await supabase.rpc('clientes_por_frecuencia', {
        limite: POR_PAGINA,
        desplazamiento: offset,
    });
    if (error) { console.error('Error frecuentes:', error); return []; }
    let result = data || [];
    if (_filtroTags.length) result = result.filter(c => _filtroTags.some(t => (c.tags || []).includes(t)));
    _frecuentesCache.set(pagina, result);
    return result;
}

async function ejecutarFrecuentes(pagina = 1) {
    if (pagina === 1) {
        document.getElementById('clientes-count').textContent = 'Cargando...';
        document.getElementById('clientes-tbody').innerHTML =
            `<tr><td class="inventory-management__cell" colspan="5"
                style="text-align:center;padding:30px;color:#aaa;">Cargando...</td></tr>`;
        document.getElementById('clientes-paginacion').innerHTML = '';
    }

    const data = await _fetchFrecuentesPagina(pagina);

    _infPage    = pagina;
    _infHasMore = data.length === POR_PAGINA;

    if (pagina === 1) {
        renderTabla(data);
    } else {
        appendTabla(data);
    }

    if (data.length === POR_PAGINA) _fetchFrecuentesPagina(pagina + 1);
    _initScrollObserver(_fetchFrecuentesPagina);
}

// ── SIDEBAR NAV ───────────────────────────────────────────────────────────────
function _setVistaActiva(vista) {
    _disconnectObserver();
    _vista = vista;

    const esHistorial = vista === 'historial';
    const esLog       = vista === 'log';
    const esClientes  = !esHistorial && !esLog;

    document.getElementById('cli-vista-clientes').style.display        = esClientes  ? ''     : 'none';
    document.getElementById('historial-dias-bar').style.display        = esHistorial ? 'flex' : 'none';
    document.getElementById('historial-react-section').style.display   = esHistorial ? 'flex' : 'none';
    document.getElementById('sidebar-historial-filtros').style.display = esHistorial ? ''     : 'none';
    document.getElementById('cli-vista-log').style.display             = esLog       ? 'flex' : 'none';

    document.getElementById('btn-ir-clientes').classList.toggle('active',       esClientes);
    document.getElementById('btn-ir-reactivaciones').classList.toggle('active', esHistorial);
    document.getElementById('btn-ir-log').classList.toggle('active',            esLog);

    if (esClientes) {
        document.getElementById('buscar-cliente-input').value = '';
        document.querySelector('.clientes-search-wrap').style.display = vista === 'todos' ? '' : 'none';
        document.getElementById('btn-nuevo-cliente').style.display    = vista === 'todos' ? '' : 'none';
    }
}

// ── RENDER HELPERS ────────────────────────────────────────────────────────────
let _clientesData = []; // acumula todos los clientes visibles en scroll

function _rowHtml(c) {
    const tags = (c.tags || []).map(t =>
        `<span style="background:#f0e8ff;color:#6c3d8f;padding:2px 8px;border-radius:10px;font-size:1.1rem;margin:1px;">${t}</span>`
    ).join(' ');
    const nombre  = (c.nombre || '').replace(/"/g, '&quot;');
    const numDirs = c.direcciones_cliente?.[0]?.count ?? '—';

    return `<tr class="inventory-management__row fila-cliente" style="cursor:pointer;" data-id="${c.id}">
        <td class="inventory-management__cell col-tel" style="font-weight:700;">${c.telefono}</td>
        <td class="inventory-management__cell col-nombre">${c.nombre || '—'}</td>
        <td class="inventory-management__cell col-tags-td">${tags || '—'}</td>
        <td class="inventory-management__cell col-pedidos-td" style="text-align:center;font-weight:700;color:var(--color-primario);">${c.total_pedidos ?? 0}</td>
        <td class="inventory-management__cell col-dirs-td" style="text-align:center;">${numDirs}</td>
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
        tbody.innerHTML = `<tr><td class="inventory-management__cell" colspan="5"
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

function _logCambio(clienteId, telefono, nombreCliente, accion, detalle = {}) {
    supabase.from('clientes_log').insert({
        cliente_id:     clienteId,
        telefono,
        nombre_cliente: nombreCliente || telefono,
        accion,
        detalle,
        asesor:         _usuarioActual,
    }).then(({ error }) => { if (error) console.warn('Log error:', error.message); });
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
        await Promise.all([cargarTags(), ejecutarBusqueda()]);
        _iniciarRealtime();
        _scheduleMidnightRefresh();
    } catch (err) {
        console.error('Error auth clientes:', err);
        document.body.classList.add('loaded');
    }
})();

// ── TAGS DINÁMICOS ────────────────────────────────────────────────────────────
let _todosLosTags = [];
const _capTag = t => t.charAt(0).toUpperCase() + t.slice(1);

function _renderTagsFiltro() {
    const bar = document.querySelector('.clientes-tags-bar');
    bar.innerHTML = _todosLosTags.map(t =>
        `<span class="tag-chip tag-filtro" data-tag="${t}">${_capTag(t)}</span>`
    ).join('') + `<button class="btn-add-tag" id="btn-add-tag">+ Tag</button>`;

    bar.querySelectorAll('.tag-filtro').forEach(chip => {
        chip.addEventListener('click', () => { chip.classList.toggle('active'); _aplicarFiltros(); });
    });
    document.getElementById('btn-add-tag').addEventListener('click', _abrirCrearTag);
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
    const bar = document.querySelector('.clientes-tags-bar');
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

// ── REACTIVACIÓN ──────────────────────────────────────────────────────────────
function abrirModalReactivar(cli, dias, sedePreset = '', id = null) {
    _reactivarId   = id;
    _reactivarCli  = cli;
    _reactivarDias = dias;
    const sedeLabel = SEDE_LABELS[sedePreset] || sedePreset || 'Reactivación';
    document.getElementById('modal-reactivar-titulo').textContent = sedeLabel;
    document.getElementById('reactivar-nombre').textContent  = cli.nombre || cli.telefono;
    document.getElementById('reactivar-tel').textContent     = cli.telefono;
    document.getElementById('reactivar-dias').textContent    = `${dias} días sin ordenar`;
    document.getElementById('reactivar-sede').value          = sedePreset || '';
    document.getElementById('reactivar-resultado').value     = 'pendiente';
    document.getElementById('reactivar-notas').value         = '';
    document.getElementById('modal-reactivar').style.display = 'flex';
    document.getElementById('reactivar-notas').focus();
}

async function registrarReactivacion() {
    if (!_reactivarCli) return;
    const notas     = document.getElementById('reactivar-notas').value.trim();
    const sede      = document.getElementById('reactivar-sede').value || null;
    const resultado = document.getElementById('reactivar-resultado').value || 'pendiente';
    const btn       = document.getElementById('btn-confirmar-reactivar');

    if (!sede) { alert('⚠️ Selecciona una sede.'); return; }

    btn.textContent = 'Registrando...';
    btn.disabled    = true;

    // ── UPDATE registro existente (desde historial "Por reactivar") ──
    if (_reactivarId) {
        const { error } = await supabase.from('reactivaciones')
            .update({ sede, resultado, notas: notas || null, agente: _usuarioActual })
            .eq('id', _reactivarId);

        if (error) {
            alert('Error al actualizar: ' + error.message);
            btn.textContent = 'Confirmar reactivación';
            btn.disabled = false;
            return;
        }

        if (resultado === 'exitosa' && _reactivarCli.id) {
            await supabase.from('clientes')
                .update({ fecha_ultima_reactivacion: new Date().toISOString() })
                .eq('id', _reactivarCli.id);
        }

        btn.textContent = 'Confirmar reactivación';
        btn.disabled    = false;
        document.getElementById('modal-reactivar').style.display = 'none';
        _reactivarCli = null;
        _reactivarId  = null;
        cargarHistorial(_histPagina);
        return;
    }

    // ── INSERT nuevo registro (desde tabla de clientes) ──
    const { error } = await supabase.from('reactivaciones').insert({
        cliente_id:     _reactivarCli.id,
        telefono:       _reactivarCli.telefono,
        nombre_cliente: _reactivarCli.nombre || '',
        dias_inactivo:  _reactivarDias,
        agente:         _usuarioActual,
        notas:          notas || null,
        sede,
        resultado,
    });

    if (error) {
        alert('Error al registrar: ' + error.message);
        btn.textContent = 'Confirmar reactivación';
        btn.disabled = false;
        return;
    }

    const ahora = new Date().toISOString();
    await supabase.from('clientes')
        .update({ fecha_ultima_reactivacion: ahora })
        .eq('id', _reactivarCli.id);

    const idx = _clientesData.findIndex(c => String(c.id) === String(_reactivarCli.id));
    if (idx !== -1) {
        _clientesData[idx] = { ..._clientesData[idx], fecha_ultima_reactivacion: ahora };
        const oldRow = document.querySelector(`tr[data-id="${_reactivarCli.id}"]`);
        if (oldRow) {
            const tpl = document.createElement('template');
            tpl.innerHTML = _rowHtml(_clientesData[idx]);
            const newRow = tpl.content.firstElementChild;
            _bindRows([newRow]);
            oldRow.replaceWith(newRow);
        }
    }

    btn.textContent = 'Confirmar reactivación';
    btn.disabled    = false;
    document.getElementById('modal-reactivar').style.display = 'none';
    _reactivarCli = null;
    _reactivarId  = null;
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
        _frecuentesCache.clear();
        _reactivacionCache.clear();
        ejecutarBusqueda(1);
        _scheduleMidnightRefresh(); // reprogramar para la siguiente medianoche
    }, ms);
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
        document.getElementById('clientes-tbody').innerHTML =
            `<tr><td class="inventory-management__cell" colspan="5"
                style="text-align:center;padding:30px;color:#aaa;">Cargando...</td></tr>`;
    }

    const { data } = await _fetchTodosPagina(q, pagina);

    _infPage    = pagina;
    _infQuery   = q;
    _infHasMore = data.length === POR_PAGINA;

    renderTabla(data);
    document.getElementById('clientes-paginacion').innerHTML = '';

    if (fromSearch) {
        btnBuscar.textContent = 'Buscar';
        btnBuscar.disabled = false;
    }

    // Captura q en el closure — el observer siempre buscará con esta query
    const queryCapturada = q;
    _initScrollObserver(p => _fetchTodosPagina(queryCapturada, p).then(r => r.data));
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
    _frecuentesCache.clear();
    _reactivacionCache.clear();
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
    _reactivarId  = null;
}
document.getElementById('cerrar-modal-reactivar').addEventListener('click', _cerrarModalReactivar);
document.getElementById('btn-confirmar-reactivar').addEventListener('click', registrarReactivacion);
document.getElementById('modal-reactivar').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-reactivar')) _cerrarModalReactivar();
});

// ── HISTORIAL REACTIVACIONES ──────────────────────────────────────────────────
let _histPagina     = 1;
let _histHasMore    = false;
let _histFiltroDias  = null;        // null | 30 | 60 | 90
let _histFiltroEstado = 'pendiente'; // 'pendiente' | 'exitosa'
// Filas que caben en pantalla: altura disponible / altura aprox por fila (46px)
// Overhead: header 54px + padding cli-main 48px + pills 40px + thead 46px + paginacion 44px
function _calcHistPorPagina() {
    return Math.max(15, Math.floor((window.innerHeight - 232) / 46));
}
let HIST_POR_PAGINA = _calcHistPorPagina();
window.addEventListener('resize', () => { HIST_POR_PAGINA = _calcHistPorPagina(); });

const RESULTADO_LABELS = {
    pendiente: 'Pendiente', exitosa: 'Exitosa',
    no_contesta: 'No contesta', rechaza: 'Rechaza',
};

async function _fetchHistorialPage(pagina) {
    const sede   = document.getElementById('hist-filtro-sede').value;
    const agente = document.getElementById('hist-filtro-agente').value.trim();
    const desde  = document.getElementById('hist-filtro-desde').value;
    const hasta  = document.getElementById('hist-filtro-hasta').value;
    const offset = (pagina - 1) * HIST_POR_PAGINA;

    // "Por reactivar" — consulta pedidos_callcenter via RPC (sin LIMIT interno)
    if (_histFiltroEstado === 'pendiente') {
        const pDias   = _histFiltroDias || 1;
        const diasMax = _histFiltroDias === 1  ? 30
                      : _histFiltroDias === 30 ? 60
                      : _histFiltroDias === 60 ? 90
                      : null;
        const { data, error } = await supabase
            .rpc('clientes_por_reactivar', {
                p_dias:     pDias,
                p_dias_max: diasMax,
                p_sede:     sede || null,
                p_pagina:   pagina,
                p_limite:   HIST_POR_PAGINA,
            });
        if (error) { console.error('Por reactivar error:', error); return []; }
        return (data || []).map(r => ({ ...r, _desde_rpc: true }));
    }

    // "Activados" — consulta tabla reactivaciones
    let req = supabase
        .from('reactivaciones')
        .select('*')
        .eq('resultado', 'exitosa')
        .order('created_at', { ascending: false })
        .range(offset, offset + HIST_POR_PAGINA - 1);

    if (sede)   req = req.eq('sede', sede);
    if (agente) req = req.ilike('agente', `%${agente}%`);
    if (desde)  req = req.gte('created_at', desde);
    if (hasta)  req = req.lte('created_at', hasta + 'T23:59:59');

    const { data, error } = await req;
    if (error) { console.error('Historial error:', error); return []; }
    return data || [];
}

function _rowHistorialHtml(r) {
    const diasCls = (r.dias_inactivo || 0) >= 90 ? 'critico' : 'moderado';

    // Fila desde RPC clientes_por_reactivar ("Por reactivar")
    if (r._desde_rpc) {
        const fecha  = r.ultimo_pedido
            ? new Date(r.ultimo_pedido).toLocaleString('es-CO', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit' })
            : '—';
        const sede   = SEDE_LABELS[r.ultima_sede] || r.ultima_sede || '—';
        const nombre = (r.nombre_cliente || '').replace(/"/g, '&quot;');
        return `<tr class="inventory-management__row hist-row-clickable"
            data-id="" data-cliente-id="${r.cliente_id || ''}"
            data-nombre="${nombre}" data-tel="${r.telefono || ''}"
            data-sede="${r.ultima_sede || ''}" data-dias="${r.dias_inactivo || 0}">
            <td class="inventory-management__cell" style="font-weight:700;">${r.telefono || '—'}</td>
            <td class="inventory-management__cell">${r.nombre_cliente || '—'}</td>
            <td class="inventory-management__cell">${sede}</td>
            <td class="inventory-management__cell" style="text-align:center;"><span class="dias-badge ${diasCls}">${r.dias_inactivo ?? '—'}d</span></td>
            <td class="inventory-management__cell">—</td>
            <td class="inventory-management__cell" style="white-space:nowrap;font-size:1.2rem;">${fecha}</td>
            <td class="inventory-management__cell">—</td>
        </tr>`;
    }

    // Fila desde tabla reactivaciones ("Reactivados")
    const fecha    = r.created_at
        ? new Date(r.created_at).toLocaleString('es-CO', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit' })
        : '—';
    const sede     = SEDE_LABELS[r.sede] || r.sede || '—';
    const notas    = (r.notas || '').replace(/</g, '&lt;');
    const nombre   = (r.nombre_cliente || '').replace(/"/g, '&quot;');
    return `<tr class="inventory-management__row hist-row-clickable"
        data-id="${r.id}" data-cliente-id="${r.cliente_id || ''}"
        data-nombre="${nombre}" data-tel="${r.telefono || ''}"
        data-sede="${r.sede || ''}" data-dias="${r.dias_inactivo || 0}">
        <td class="inventory-management__cell" style="font-weight:700;">${r.telefono || '—'}</td>
        <td class="inventory-management__cell">${r.nombre_cliente || '—'}</td>
        <td class="inventory-management__cell">${sede}</td>
        <td class="inventory-management__cell" style="text-align:center;"><span class="dias-badge ${diasCls}">${r.dias_inactivo ?? '—'}d</span></td>
        <td class="inventory-management__cell">${r.agente || '—'}</td>
        <td class="inventory-management__cell" style="white-space:nowrap;font-size:1.2rem;">${fecha}</td>
        <td class="inventory-management__cell" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${notas}">${notas || '—'}</td>
    </tr>`;
}

async function cargarHistorial(pagina = 1) {
    _histPagina = pagina;
    const tbody = document.getElementById('historial-react-tbody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#999;">Cargando...</td></tr>';

    const data = await _fetchHistorialPage(pagina);
    _histHasMore = data.length === HIST_POR_PAGINA;

    tbody.innerHTML = data.length
        ? data.map(_rowHistorialHtml).join('')
        : '<tr><td colspan="7" style="text-align:center;padding:30px;color:#999;">No hay reactivaciones registradas.</td></tr>';

    const pag = document.getElementById('historial-react-paginacion');
    pag.innerHTML = '';
    if (pagina > 1) {
        const prev = document.createElement('button');
        prev.className   = 'btn-buscar-cliente';
        prev.textContent = '← Anterior';
        prev.addEventListener('click', () => cargarHistorial(pagina - 1));
        pag.appendChild(prev);
    }
    if (_histHasMore) {
        const next = document.createElement('button');
        next.className   = 'btn-buscar-cliente';
        next.textContent = 'Siguiente →';
        next.addEventListener('click', () => cargarHistorial(pagina + 1));
        pag.appendChild(next);
    }
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
    _setVistaActiva('todos');
    ejecutarBusqueda(1);
});

document.getElementById('btn-ir-reactivaciones').addEventListener('click', () => {
    _setVistaActiva('historial');
    cargarHistorial(1);
    _actualizarConteosPills();
});

document.getElementById('btn-abrir-filtros-hist').addEventListener('click', () => {
    document.getElementById('modal-filtros-hist').style.display = 'flex';
});
document.getElementById('cerrar-modal-filtros-hist').addEventListener('click', () => {
    document.getElementById('modal-filtros-hist').style.display = 'none';
});
document.getElementById('modal-filtros-hist').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-filtros-hist'))
        document.getElementById('modal-filtros-hist').style.display = 'none';
});

document.getElementById('btn-buscar-historial').addEventListener('click', () => {
    document.getElementById('modal-filtros-hist').style.display = 'none';
    cargarHistorial(1);
    if (_histFiltroEstado === 'pendiente') _actualizarConteosPills();
});

document.getElementById('hist-filtro-sede').addEventListener('change', () => {
    cargarHistorial(1);
    if (_histFiltroEstado === 'pendiente') _actualizarConteosPills();
});

document.querySelectorAll('.hist-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.hist-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _histFiltroEstado = btn.dataset.estado;
        cargarHistorial(1);
    });
});

async function _actualizarConteosPills() {
    const sede = document.getElementById('hist-filtro-sede').value || null;
    const rangos = [
        { dias: '',  p_dias: 1,  p_dias_max: null },  // Todos: 1+
        { dias: 1,   p_dias: 1,  p_dias_max: 30  },   // 1-29 días
        { dias: 30,  p_dias: 30, p_dias_max: 60  },   // +30: 30–59 días
        { dias: 60,  p_dias: 60, p_dias_max: 90  },   // +60: 60–89 días
        { dias: 90,  p_dias: 90, p_dias_max: null },  // +90: 90+ días
    ];

    await Promise.all(rangos.map(async ({ dias, p_dias, p_dias_max }) => {
        const { data, error } = await supabase
            .rpc('clientes_por_reactivar_count', { p_dias, p_dias_max, p_sede: sede });
        const chip = document.querySelector(`.dias-filtro-hist[data-dias="${dias}"]`);
        if (!chip) return;
        let badge = chip.querySelector('.pill-count');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'pill-count';
            chip.appendChild(badge);
        }
        badge.textContent = error ? '' : (data ?? 0);
    }));
}

document.querySelectorAll('.dias-filtro-hist').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.dias-filtro-hist').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        _histFiltroDias = chip.dataset.dias ? Number(chip.dataset.dias) : null;
        cargarHistorial(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
initNavButtons('clientes', { onBarrios: openBarriosModal });
if (window.parent !== window) window.parent.postMessage({ type: 'frame-ready' }, '*');
