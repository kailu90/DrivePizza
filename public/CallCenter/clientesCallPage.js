import { supabase } from '../Api/supabaseConfig.js';
import { mostrarSkeleton, ocultarSkeleton } from '../Shared/skeleton.js';
import { initNavButtons } from './navCallCenter.js';

const SEDE_LABELS = {
    cabecera: 'Cabecera', cañaveral: 'Cañaveral', acropolis: 'Acrópolis',
    piedecuesta: 'Piedecuesta', megamall: 'Megamall', unico: 'Único',
};

let clienteActual = null; // cliente abierto en modal

const POR_PAGINA  = 20;
let   paginaActual = 1;

// ── BÚSQUEDA ──────────────────────────────────────────────────────────────────
async function buscarClientes(query = '', pagina = 1) {
    const q      = query.trim();
    const offset = (pagina - 1) * POR_PAGINA;

    const digitos = q.replace(/\D/g, '');
    const esNumero = digitos.length >= 2;

    let req = supabase
        .from('clientes')
        .select('id, telefono, nombre, notas, tags, updated_at, direcciones_cliente(direccion, barrio, predeterminada)', { count: 'exact' })
        .order('updated_at', { ascending: false })
        .range(offset, offset + POR_PAGINA - 1);

    if (q && esNumero) {
        req = req.ilike('telefono', `%${digitos}%`);
    } else if (q) {
        req = req.ilike('nombre', `%${q}%`);
    }

    const { data, error, count } = await req;
    if (error) console.error('Error búsqueda clientes:', error);
    return { data: data || [], count: count || 0 };
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

function renderTabla(clientes, total) {
    const tbody = document.getElementById('clientes-tbody');
    const count = document.getElementById('clientes-count');
    count.textContent = total ? `${total} cliente${total !== 1 ? 's' : ''}` : '';

    if (!clientes.length) {
        tbody.innerHTML = `<tr><td class="inventory-management__cell" colspan="6"
            style="text-align:center;padding:30px;color:#aaa;">
            No se encontraron clientes.</td></tr>`;
        return;
    }

    tbody.innerHTML = clientes.map(c => {
        const dirs = c.direcciones_cliente || [];
        const dirPred = dirs.find(d => d.predeterminada) || dirs[0] || null;
        const dirTexto = dirPred ? dirPred.direccion : '—';
        const tags = (c.tags || []).map(t =>
            `<span style="background:#f0e8ff;color:#6c3d8f;padding:2px 8px;border-radius:10px;font-size:1.1rem;margin:1px;">${t}</span>`
        ).join(' ');
        return `<tr class="inventory-management__row fila-cliente"
                    style="cursor:pointer;" data-id="${c.id}">
            <td class="inventory-management__cell" style="font-weight:700;">${c.telefono}</td>
            <td class="inventory-management__cell">${c.nombre || '—'}</td>
            <td class="inventory-management__cell" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                title="${dirTexto}">${dirTexto}</td>
            <td class="inventory-management__cell">${tags || '—'}</td>
            <td class="inventory-management__cell">${formatFecha(c.updated_at)}</td>
            <td class="inventory-management__cell" style="text-align:center;width:40px;">
                <button class="btn-eliminar-cli" data-id="${c.id}" data-nombre="${c.nombre || c.telefono}" title="Eliminar cliente">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                         fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                </button>
            </td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.fila-cliente').forEach(tr => {
        tr.addEventListener('click', e => {
            if (e.target.closest('.btn-eliminar-cli')) return; // no abrir modal al eliminar
            const id = tr.dataset.id;
            const cli = clientes.find(c => c.id === id);
            if (cli) abrirModal(cli);
        });
    });

    tbody.querySelectorAll('.btn-eliminar-cli').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            if (!confirm(`¿Eliminar a "${btn.dataset.nombre}"? Se borrarán también sus direcciones.`)) return;
            await supabase.from('direcciones_cliente').delete().eq('cliente_id', btn.dataset.id);
            await supabase.from('clientes').delete().eq('id', btn.dataset.id);
            ejecutarBusqueda(paginaActual);
        });
    });
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

async function ejecutarBusqueda(pagina = 1) {
    paginaActual = pagina;
    const q = searchInput.value.trim();
    btnBuscar.textContent = 'Buscando...';
    btnBuscar.disabled = true;
    const { data, count } = await buscarClientes(q, pagina);
    renderTabla(data, count);
    renderPaginacion(count, pagina);
    btnBuscar.textContent = 'Buscar';
    btnBuscar.disabled = false;
}

let debounceTimer = null;

btnBuscar.addEventListener('click', () => ejecutarBusqueda(1));
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') ejecutarBusqueda(1); });
searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => ejecutarBusqueda(1), 300);
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

initNavButtons('clientes');
if (window.parent !== window) window.parent.postMessage({ type: 'frame-ready' }, '*');
