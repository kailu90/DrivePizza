import { supabase } from '../Api/supabaseConfig.js';
import { mostrarSkeleton, ocultarSkeleton } from '../Shared/skeleton.js';

const SEDE_LABELS = {
    cabecera: 'Cabecera', cañaveral: 'Cañaveral', acropolis: 'Acrópolis',
    piedecuesta: 'Piedecuesta', megamall: 'Megamall', unico: 'Único',
};

let clienteActual = null; // cliente abierto en modal

// ── BÚSQUEDA ──────────────────────────────────────────────────────────────────
async function buscarClientes(query = '') {
    const q = query.trim();

    const digitos = q.replace(/\D/g, '');
    const esNumero = digitos.length >= 2;

    let req = supabase
        .from('clientes')
        .select('id, telefono, nombre, notas, tags, updated_at, direcciones_cliente(direccion, barrio, predeterminada)')
        .order('updated_at', { ascending: false })
        .limit(100);

    if (q && esNumero) {
        req = req.ilike('telefono', `%${digitos}%`);
    } else if (q) {
        req = req.ilike('nombre', `%${q}%`);
    }

    const { data, error } = await req;
    if (error) console.error('Error búsqueda clientes:', error);
    return data || [];
}

function formatFecha(iso) {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('es-CO', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(new Date(iso));
}

function renderTabla(clientes) {
    const tbody = document.getElementById('clientes-tbody');
    const count = document.getElementById('clientes-count');
    count.textContent = clientes.length ? `${clientes.length} resultado${clientes.length !== 1 ? 's' : ''}` : '';

    if (!clientes.length) {
        tbody.innerHTML = `<tr><td class="inventory-management__cell" colspan="5"
            style="text-align:center;padding:30px;color:#aaa;">
            No se encontraron clientes.</td></tr>`;
        return;
    }

    tbody.innerHTML = clientes.map(c => {
        const dirs = c.direcciones_cliente || [];
        const dirPred = dirs.find(d => d.predeterminada) || dirs[0] || null;
        const dirTexto = dirPred
            ? (dirPred.barrio ? `${dirPred.direccion} · ${dirPred.barrio}` : dirPred.direccion)
            : '—';
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
        </tr>`;
    }).join('');

    tbody.querySelectorAll('.fila-cliente').forEach(tr => {
        tr.addEventListener('click', () => {
            const id = tr.dataset.id;
            const cli = clientes.find(c => c.id === id);
            if (cli) abrirModal(cli);
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
                    ${d.barrio ? d.barrio + ' · ' : ''}${SEDE_LABELS[d.sede_id] || d.sede_id || ''}
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
        if (!usuario?.rol) { window.top.location.href = '../index.html'; return; }

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

async function ejecutarBusqueda() {
    const q = searchInput.value.trim();
    btnBuscar.textContent = 'Buscando...';
    btnBuscar.disabled = true;
    const resultados = await buscarClientes(q);
    renderTabla(resultados);
    btnBuscar.textContent = 'Buscar';
    btnBuscar.disabled = false;
}

let debounceTimer = null;

btnBuscar.addEventListener('click', ejecutarBusqueda);
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') ejecutarBusqueda(); });
searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(ejecutarBusqueda, 300);
});

document.getElementById('cerrar-modal-cli').addEventListener('click', cerrarModal);
document.getElementById('btn-guardar-cli').addEventListener('click', guardarCliente);
document.getElementById('modal-cliente-detalle').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-cliente-detalle')) cerrarModal();
});

document.querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', () => chip.classList.toggle('active'));
});

if (window.parent !== window) window.parent.postMessage({ type: 'frame-ready' }, '*');
