import { supabase } from '../Api/supabaseConfig.js';
import { mostrarSkeleton, ocultarSkeleton } from '../Shared/skeleton.js';
import { initNavButtons } from './navCallCenter.js';
import { openBarriosModal } from './modalBarrios.js';

const SEDE_LABELS = {
    cabecera: 'Cabecera', cañaveral: 'Cañaveral', acropolis: 'Acrópolis',
    piedecuesta: 'Piedecuesta', megamall: 'Megamall', unico: 'Único',
};

let clienteActual = null;
let _vista        = 'todos';  // 'todos' | 'frecuentes' | 'reactivacion'

const POR_PAGINA  = 20;
let   paginaActual = 1;

// ── BÚSQUEDA ──────────────────────────────────────────────────────────────────
async function buscarClientes(query = '', pagina = 1) {
    const q      = query.trim();
    const offset = (pagina - 1) * POR_PAGINA;

    const digitos  = q.replace(/\D/g, '');
    const esNumero = digitos.length >= 2;

    let req = supabase
        .from('clientes')
        .select('id, telefono, nombre, tags, updated_at, direcciones_cliente(direccion, predeterminada)')
        .order('updated_at', { ascending: false })
        .range(offset, offset + POR_PAGINA - 1);

    if (q && esNumero) {
        req = req.ilike('telefono', `%${digitos}%`);
    } else if (q) {
        req = req.ilike('nombre', `%${q}%`);
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
    const result = data || [];
    _reactivacionCache.set(pagina, result);
    return result;
}

async function ejecutarReactivacion(pagina = 1) {
    if (pagina === 1) {
        document.getElementById('clientes-count').textContent = 'Cargando...';
        document.getElementById('clientes-tbody').innerHTML =
            `<tr><td class="inventory-management__cell" colspan="6"
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
    const result = data || [];
    _frecuentesCache.set(pagina, result);
    return result;
}

async function ejecutarFrecuentes(pagina = 1) {
    paginaActual = pagina;

    if (pagina === 1 && _frecuentesCache.size === 0) {
        document.getElementById('clientes-count').textContent = 'Cargando...';
        // Carga páginas 1 y 2 en paralelo
        const [data1] = await Promise.all([
            _fetchFrecuentesPagina(1),
            _fetchFrecuentesPagina(2),
        ]);
        _mostrarFrecuentes(data1, 1);
    } else {
        const data = await _fetchFrecuentesPagina(pagina);
        _mostrarFrecuentes(data, pagina);
        // Prefetch siguiente en background
        if (data.length === POR_PAGINA) _fetchFrecuentesPagina(pagina + 1);
    }
}

function _mostrarFrecuentes(data, pagina) {
    renderTabla(data, data.length);
    document.getElementById('clientes-count').textContent =
        data.length ? `${(pagina - 1) * POR_PAGINA + 1}–${(pagina - 1) * POR_PAGINA + data.length}` : 'Sin resultados';

    const paginEl = document.getElementById('clientes-paginacion');
    const hayAnterior = pagina > 1;
    const haysiguiente = data.length === POR_PAGINA || _frecuentesCache.has(pagina + 1);
    paginEl.innerHTML = (hayAnterior || haysiguiente) ? `
        <button class="pag-btn" id="frec-prev" ${!hayAnterior ? 'disabled' : ''}>← Anterior</button>
        <span class="pag-info">Página ${pagina}</span>
        <button class="pag-btn" id="frec-next" ${!haysiguiente ? 'disabled' : ''}>Siguiente →</button>
    ` : '';
    paginEl.querySelector('#frec-prev')?.addEventListener('click', () => ejecutarFrecuentes(pagina - 1));
    paginEl.querySelector('#frec-next')?.addEventListener('click', () => ejecutarFrecuentes(pagina + 1));
}

// ── SIDEBAR NAV ───────────────────────────────────────────────────────────────
function _setVistaActiva(vista) {
    _disconnectObserver();
    _vista = vista;
    document.querySelectorAll('.cli-sidebar .sede-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`nav-${vista}`)?.classList.add('active');

    const esReactivacion = vista === 'reactivacion';
    const esFrecuentes   = vista === 'frecuentes';

    document.getElementById('th-pedidos').style.display  = (esFrecuentes || esReactivacion) ? '' : 'none';
    document.getElementById('th-pedidos').textContent    = esReactivacion ? 'Días sin pedir' : 'Pedidos';
    document.querySelector('.col-fecha-th').textContent  = esReactivacion ? 'Último pedido'  : 'Última actividad';
    document.querySelector('.col-dir-th').style.display  = esReactivacion ? 'none' : '';

    document.getElementById('buscar-cliente-input').value = '';
    document.querySelector('.clientes-search-wrap').style.display   = vista === 'todos' ? '' : 'none';
    document.getElementById('btn-nuevo-cliente').style.display      = vista === 'todos' ? '' : 'none';
}

// ── RENDER HELPERS ────────────────────────────────────────────────────────────
let _clientesData = []; // acumula todos los clientes visibles en scroll

function _rowHtml(c) {
    const esFrecuentes   = _vista === 'frecuentes';
    const esReactivacion = _vista === 'reactivacion';

    const dirs    = c.direcciones_cliente || [];
    const dirPred = dirs.find(d => d.predeterminada) || dirs[0] || null;
    const dirTexto = esReactivacion ? '—' : (dirPred ? dirPred.direccion : '—');

    const fechaMostrar = esReactivacion ? c.ultimo_pedido : c.updated_at;

    const tags = (c.tags || []).map(t =>
        `<span style="background:#f0e8ff;color:#6c3d8f;padding:2px 8px;border-radius:10px;font-size:1.1rem;margin:1px;">${t}</span>`
    ).join(' ');

    let colPedidos = '';
    if (esFrecuentes) {
        colPedidos = `<td class="inventory-management__cell" style="text-align:center;font-weight:700;color:var(--color-primario);">${c.total_pedidos ?? 0}</td>`;
    } else if (esReactivacion) {
        const dias = c.dias_inactivo ?? 0;
        const cls  = dias >= 90 ? 'critico' : 'moderado';
        colPedidos = `<td class="inventory-management__cell" style="text-align:center;"><span class="dias-badge ${cls}">${dias}d</span></td>`;
    }
    return `<tr class="inventory-management__row fila-cliente" style="cursor:pointer;" data-id="${c.id}">
        <td class="inventory-management__cell col-tel" style="font-weight:700;">${c.telefono}</td>
        <td class="inventory-management__cell col-nombre">${c.nombre || '—'}</td>
        <td class="inventory-management__cell col-dir-td" title="${dirTexto}">${dirTexto}</td>
        <td class="inventory-management__cell col-tags-td">${tags || '—'}</td>
        ${colPedidos}
        <td class="inventory-management__cell col-fecha-td">${formatFecha(c.updated_at)}</td>
        <td class="inventory-management__cell td-acciones">
            <button class="btn-eliminar-cli" data-id="${c.id}" data-nombre="${c.nombre || c.telefono}" title="Eliminar cliente">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                     fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
                <span>Eliminar</span>
            </button>
        </td>
    </tr>`;
}

function _bindRows(rows) {
    rows.forEach(tr => {
        tr.addEventListener('click', e => {
            if (e.target.closest('.btn-eliminar-cli')) return;
            const cli = _clientesData.find(c => c.id === tr.dataset.id);
            if (cli) abrirModal(cli);
        });
        tr.querySelector('.btn-eliminar-cli')?.addEventListener('click', async e => {
            e.stopPropagation();
            const btn = e.currentTarget;
            if (!confirm(`¿Eliminar a "${btn.dataset.nombre}"? Se borrarán también sus direcciones.`)) return;
            tr.style.opacity = '0.4';
            await supabase.from('direcciones_cliente').delete().eq('cliente_id', btn.dataset.id);
            const { error } = await supabase.from('clientes').delete().eq('id', btn.dataset.id);
            if (error) { tr.style.opacity = ''; return; }
            tr.remove();
            _clientesData = _clientesData.filter(c => c.id !== btn.dataset.id);
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
        tbody.innerHTML = `<tr><td class="inventory-management__cell" colspan="6"
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
let _observer      = null;

function _disconnectObserver() {
    if (_observer) { _observer.disconnect(); _observer = null; }
    const sp = document.getElementById('sentinel-spinner');
    if (sp) sp.style.display = 'none';
}

// fetchFn: (pagina) => Promise<data[]>  — se captura en el closure al crear el observer
function _initScrollObserver(fetchFn) {
    _disconnectObserver();
    if (!_infHasMore) return;

    const sentinel = document.getElementById('clientes-sentinel');
    const section  = sentinel.closest('section');

    _observer = new IntersectionObserver(async ([entry]) => {
        if (!entry.isIntersecting || _infLoading || !_infHasMore) return;
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
        }
    }, { root: section, threshold: 0.1 });

    _observer.observe(sentinel);
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
    document.querySelectorAll('.tag-chip').forEach(chip => {
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
            const dirId = btn.dataset.dirId;
            // Quitar predeterminada a todas
            await supabase.from('direcciones_cliente')
                .update({ predeterminada: false })
                .eq('cliente_id', clienteActual.id);
            // Poner predeterminada a esta
            await supabase.from('direcciones_cliente')
                .update({ predeterminada: true })
                .eq('id', dirId);
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
            const dirId = btn.dataset.dirId;
            await supabase.from('direcciones_cliente').delete().eq('id', dirId);
            clienteActual.direcciones_cliente = clienteActual.direcciones_cliente.filter(d => d.id !== dirId);
            renderDirecciones(clienteActual.direcciones_cliente);
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

    const { error } = await supabase.from('clientes').insert({
        telefono, nombre, notas, tags, updated_at: new Date().toISOString()
    });

    btn.textContent = 'Crear cliente';
    btn.disabled = false;

    if (error) {
        if (error.code === '23505') alert('Ya existe un cliente con ese teléfono.');
        else alert('Error al crear: ' + error.message);
        return;
    }
    cerrarModalNuevo();
    ejecutarBusqueda(1);
}

// ── GUARDAR ───────────────────────────────────────────────────────────────────
async function guardarCliente() {
    if (!clienteActual) return;
    const nombre = document.getElementById('cli-nombre').value.trim();
    const notas  = document.getElementById('cli-notas').value.trim();
    const tags   = [...document.querySelectorAll('.tag-chip.active')].map(c => c.dataset.tag);

    const btn = document.getElementById('btn-guardar-cli');
    btn.textContent = 'Guardando...';
    btn.disabled = true;

    const { error } = await supabase.from('clientes').update({
        nombre, notas, tags, updated_at: new Date().toISOString()
    }).eq('id', clienteActual.id);

    btn.textContent = 'Guardar';
    btn.disabled = false;

    if (error) { alert('Error al guardar: ' + error.message); return; }
    cerrarModal();
    document.getElementById('btn-buscar-cliente').click();
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
        document.getElementById('btn-home').onclick = () => window.location.href = './callcenter.html';
        document.getElementById('btn-logout').addEventListener('click', async () => {
            if (confirm('¿Cerrar sesión?')) {
                await supabase.auth.signOut();
                window.top.location.href = '../index.html';
            }
        });

        ocultarSkeleton('contenido-principal');
        document.body.classList.add('loaded');

        // Carga inicial: mostrar clientes recientes
        await ejecutarBusqueda();
    } catch (err) {
        console.error('Error auth clientes:', err);
        document.body.classList.add('loaded');
    }
})();

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
            `<tr><td class="inventory-management__cell" colspan="6"
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

// ── Sidebar nav ───────────────────────────────────────────────────────────────
document.getElementById('nav-todos').addEventListener('click', () => {
    _frecuentesCache.clear();
    _todosCache.clear();
    _setVistaActiva('todos');
    document.getElementById('clientes-tbody').innerHTML =
        `<tr><td class="inventory-management__cell" colspan="6" style="text-align:center;padding:30px;color:#aaa;">Cargando...</td></tr>`;
    ejecutarBusqueda(1);
});

document.getElementById('nav-frecuentes').addEventListener('click', () => {
    _frecuentesCache.clear();
    _setVistaActiva('frecuentes');
    ejecutarFrecuentes(1);
});

document.getElementById('nav-reactivacion').addEventListener('click', () => {
    _reactivacionCache.clear();
    _setVistaActiva('reactivacion');
    ejecutarReactivacion(1);
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
document.querySelectorAll('.nuevo-tag').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('active'));
});

document.querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('active'));
});

initNavButtons('clientes', { onBarrios: openBarriosModal });
if (window.parent !== window) window.parent.postMessage({ type: 'frame-ready' }, '*');
