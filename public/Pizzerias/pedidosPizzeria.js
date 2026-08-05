import { supabase } from '../Api/supabaseConfig.js';
import { mostrarSkeleton, ocultarSkeleton } from '../Shared/skeleton.js';
import { colFechaToUTC } from '../Shared/semanas.js';
import { initVersionBanner } from '../Shared/components.js';
initVersionBanner();
const ESTADOS_ACTIVOS = new Set(['recibido', 'en preparacion', 'despachado']);

let sedeActual = '';
let pedidosActuales = {};       // id → objeto pedido
let pedidoEnModal   = null;     // id del pedido abierto en el modal
let pedidoPendienteCancelar = null;

const MINUTOS_AUTO_PREPARACION = 5;
const timersPreparacion = new Map(); // pedidoId → timeoutId

function toDate(ts) {
    return ts ? new Date(ts) : null;
}

// ── ICONOS SVG ────────────────────────────────────────────────────
const ICON_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="3"
    stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
    </svg>`;

const STEPS = [
    {
        key: 'en preparacion',
        label: 'Preparando',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
                <line x1="6" y1="1" x2="6" y2="4"/>
                <line x1="10" y1="1" x2="10" y2="4"/>
                <line x1="14" y1="1" x2="14" y2="4"/>
               </svg>`
    },
    {
        key: 'despachado',
        label: 'Despachar',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <circle cx="5.5" cy="17.5" r="2.5"/>
                <circle cx="17.5" cy="17.5" r="2.5"/>
                <path d="M15 6h-4l-2 6H3l2-4h8"/>
                <path d="M15 6l2 6h2l1-3h-5"/>
               </svg>`
    },
    {
        key: 'entregado',
        label: 'Entregado',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
               </svg>`
    },
];

mostrarSkeleton('callcenter');

// ── AUTH ───────────────────────────────────────────────────────────
(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = '../index.html'; return; }

    const { data, error } = await supabase.from('usuarios').select('username, sede, rol, active').eq('id', user.id).single();
    if (error || !data?.active || !['pizzeria', 'planta', 'admin'].includes(data.rol)) {
        window.location.href = '../index.html';
        return;
    }

    const { username = '', sede = '' } = data;

    document.getElementById('username').textContent   = `Hola ${username}`;
    document.getElementById('sede-label').textContent = sede.toUpperCase();

    ocultarSkeleton('contenido-principal');
    iniciarListener(sede);
})();

// ── LOGOUT ────────────────────────────────────────────────────────
document.getElementById('btn-logout').addEventListener('click', async () => {
    if (confirm('¿Cerrar sesión?')) {
        await supabase.auth.signOut();
        window.location.href = '../index.html';
    }
});

document.getElementById('btn-home').addEventListener('click', () => {
    window.location.href = '../Pizzerias/pizzerias.html';
});

// ── CARGA DESDE SUPABASE ──────────────────────────────────────────
async function cargarPedidosActivos() {
    const hoy = new Date().toISOString().split('T')[0];
    try {
        const estadosStr = [...ESTADOS_ACTIVOS].join(',');
        const { data: rawPedidos, error } = await supabase
            .from('pedidos_callcenter')
            .select('id, n_pedido, nombre, telefono, direccion, productos, total, domicilio, estado, ts_recibido, tipo, fecha_reserva, hora_reserva, cantidad_personas, obs, acompanamientos')
            .eq('sede', sedeActual)
            .in('estado', [...ESTADOS_ACTIVOS])
            .or(`and(fecha.gte.${colFechaToUTC(hoy, 'inicio')},fecha.lte.${colFechaToUTC(hoy, 'fin')}),tipo.eq.reserva`);

        if (error) throw error;

        pedidosActuales = {};
        (rawPedidos || []).forEach(r => {
            const id = String(r.id);
            pedidosActuales[id] = {
                id:               id,
                nPedido:          r.n_pedido,
                nombre:           r.nombre,
                telefono:         r.telefono,
                direccion:        r.direccion,
                productos:        r.productos,
                total:            r.total,
                domicilio:        r.domicilio,
                estado:           r.estado,
                tsRecibido:       r.ts_recibido,
                obs:              r.obs,
                acompanamientos:  r.acompanamientos,
                tipo:             r.tipo,
                fechaReserva:     r.fecha_reserva,
                horaReserva:      r.hora_reserva,
                cantidadPersonas: r.cantidad_personas,
            };
        });

        gestionarAutoPreparacion(Object.values(pedidosActuales));
        renderLista(Object.values(pedidosActuales));

        if (pedidoEnModal) {
            const actualizado = pedidosActuales[pedidoEnModal];
            if (actualizado) poblarModal(actualizado);
            else cerrarModalPedido();
        }
    } catch (err) {
        console.error('Error cargando pedidos:', err);
    }
}

function iniciarListener(sede) {
    sedeActual = sede;
    cargarPedidosActivos();

    supabase.channel('pizzeria-pedidos')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_callcenter' }, () => {
            cargarPedidosActivos();
        })
        .subscribe();
}

// ── AUTO-AVANCE RECIBIDO → EN PREPARACIÓN ─────────────────────────
function gestionarAutoPreparacion(pedidos) {
    const recibidos = pedidos.filter(p => p.estado === 'recibido');

    // Limpiar timers de pedidos que ya no están en 'recibido'
    timersPreparacion.forEach((_, id) => {
        if (!recibidos.find(p => p.id === id)) {
            clearTimeout(timersPreparacion.get(id));
            timersPreparacion.delete(id);
        }
    });

    recibidos.forEach(p => {
        if (timersPreparacion.has(p.id)) return; // ya tiene timer activo

        const tsRecibido = toDate(p.tsRecibido);
        const transcurrido = tsRecibido ? Date.now() - tsRecibido.getTime() : 0;
        const restante = Math.max(0, MINUTOS_AUTO_PREPARACION * 60 * 1000 - transcurrido);

        const timerId = setTimeout(async () => {
            timersPreparacion.delete(p.id);
            try {
                await supabase
                    .from('pedidos_callcenter')
                    .update({ estado: 'en preparacion', ts_preparacion: new Date().toISOString() })
                    .eq('id', p.id);
            } catch (e) {
                console.error('Error auto-preparación:', e);
            }
        }, restante);

        timersPreparacion.set(p.id, timerId);
    });
}

// ── LISTA PRINCIPAL ───────────────────────────────────────────────
function renderLista(pedidos) {
    const recibidos   = pedidos.filter(p => p.estado === 'recibido');
    const preparacion = pedidos.filter(p => p.estado === 'en preparacion');
    const despachado  = pedidos.filter(p => p.estado === 'despachado');

    document.getElementById('count-preparacion').textContent =
        `${preparacion.length} preparando`;
    document.getElementById('count-despachado').textContent =
        `${despachado.length} despachado${despachado.length !== 1 ? 's' : ''}`;

    const ordenados = [...recibidos, ...preparacion, ...despachado];
    const list      = document.getElementById('orders-list');
    const empty     = document.getElementById('empty-state');

    if (ordenados.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';
    list.innerHTML = ordenados.map(renderFila).join('');
}

function renderFila(p) {
    const estadoClass  = p.estado === 'recibido' ? 'estado-recibido'
                       : p.estado === 'en preparacion' ? 'estado-preparacion' : 'estado-despachado';
    const badgeClass   = p.estado === 'recibido' ? 'badge-recibido'
                       : p.estado === 'en preparacion' ? 'badge-preparacion'  : 'badge-despachado';
    const badgeLabel   = p.estado === 'recibido' ? '⏳ Recibido'
                       : p.estado === 'en preparacion' ? 'Preparando'         : 'Despachado';

    const esReserva   = p.tipo === 'reserva';
    const esDomicilio = !esReserva && p.domicilio?.tipo !== 'recoger';
    const sublinea    = esReserva
        ? infoReserva(p)
        : esDomicilio
            ? `📍 ${p.domicilio?.barrio || p.direccion || ''}`
            : `🏪 Recoge en tienda`;

    return `
        <div class="order-row ${estadoClass}" onclick="abrirModalPedido('${p.id}')">
            <div class="order-row-info">
                <div class="order-row-top">
                    <span class="order-npedido">#${p.nPedido}</span>
                    <span class="order-cliente">${p.nombre}</span>
                    <span class="order-estado-badge ${badgeClass}">${badgeLabel}</span>
                </div>
                <div class="order-row-sub">${sublinea}</div>
            </div>
            <span class="order-row-chevron">›</span>
        </div>`;
}

// ── MODAL DETALLE ─────────────────────────────────────────────────
window.abrirModalPedido = (id) => {
    const p = pedidosActuales[id];
    if (!p) return;
    pedidoEnModal = id;
    poblarModal(p);
    document.getElementById('modal-pedido').style.display = 'flex';
};

function infoReserva(p) {
    if (p.fechaReserva || p.horaReserva) {
        const partes = [`📅 Reserva: ${p.fechaReserva || ''} ${p.horaReserva || ''}`.trim()];
        if (p.cantidadPersonas) partes.push(`${p.cantidadPersonas} personas`);
        return partes.join(' · ');
    }
    return p.obs ? `📅 Reserva · ${p.obs}` : '📅 Reserva (sin fecha registrada)';
}

function poblarModal(p) {
    const esReserva   = p.tipo === 'reserva';
    const esDomicilio = !esReserva && p.domicilio?.tipo !== 'recoger';

    document.getElementById('mp-npedido').textContent  = `#${p.nPedido}`;
    document.getElementById('mp-cliente').textContent  = p.nombre;
    document.getElementById('mp-tel').textContent      = `📞 ${p.telefono}`;
    document.getElementById('mp-entrega').textContent  = esReserva
        ? infoReserva(p)
        : esDomicilio
            ? `📍 ${p.direccion || ''}${p.domicilio?.barrio ? ` · ${p.domicilio.barrio}` : ''}`
            : `🏪 Recoge en tienda`;

    document.getElementById('mp-productos').innerHTML =
        (p.productos || [])
        .slice().sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }))
        .map(prod => `<li><strong>${prod.qty || 1}×</strong> ${prod.nombre}</li>`)
        .join('');

    document.getElementById('mp-total').textContent = `$${(p.total || 0).toLocaleString()}`;
    document.getElementById('mp-domicilio').textContent =
        esDomicilio && p.domicilio?.valor ? `+ Dom $${p.domicilio.valor.toLocaleString()}` : '';

    document.getElementById('mp-obs').innerHTML =
        (p.acompanamientos ? `<div class="mpedido-obs">🥗 <strong>Acompañamientos:</strong> ${p.acompanamientos}</div>` : '') +
        (p.obs ? `<div class="mpedido-obs">💬 ${p.obs}</div>` : '');

    document.getElementById('mp-stepper').innerHTML     = renderStepper(p);
    document.getElementById('mp-cancel-area').innerHTML = p.estado === 'en preparacion'
        ? `<button class="btn-cancelar-pedido" onclick="abrirModalCancelar('${p.id}', '${p.nPedido}')">✕ Cancelar pedido</button>`
        : '';
}

function cerrarModalPedido() {
    pedidoEnModal = null;
    document.getElementById('modal-pedido').style.display = 'none';
}

document.getElementById('btn-cerrar-pedido').addEventListener('click', cerrarModalPedido);

document.getElementById('modal-pedido').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-pedido')) cerrarModalPedido();
});

// ── STEPPER ───────────────────────────────────────────────────────
function renderStepper(p) {
    const currentIdx = STEPS.findIndex(s => s.key === p.estado);
    let html = '<div class="stepper">';

    STEPS.forEach((step, i) => {
        let cls = '', onclick = '', icon = step.icon;

        if (i < currentIdx) {
            cls  = 'step-done';
            icon = ICON_CHECK;
        } else if (i === currentIdx) {
            cls = 'step-active';
        } else if (i === currentIdx + 1) {
            cls    = 'step-next';
            onclick = `onclick="cambiarEstado('${p.id}', '${step.key}')"`;
        } else {
            cls = 'step-locked';
        }

        html += `<div class="step ${cls}" ${onclick}>
            <div class="step-circle">${icon}</div>
            <span class="step-label">${step.label}</span>
        </div>`;

        if (i < STEPS.length - 1) {
            html += `<div class="step-connector ${i < currentIdx ? 'active' : ''}"></div>`;
        }
    });

    html += '</div>';
    return html;
}

// ── CAMBIAR ESTADO ────────────────────────────────────────────────
const TS_MAP = {
    'en preparacion': 'ts_preparacion',
    'despachado':     'ts_despachado',
    'entregado':      'ts_entregado',
};

window.cambiarEstado = async (pedidoId, nuevoEstado) => {
    try {
        const campos = { estado: nuevoEstado };
        if (TS_MAP[nuevoEstado]) campos[TS_MAP[nuevoEstado]] = new Date().toISOString();

        const { error } = await supabase
            .from('pedidos_callcenter')
            .update(campos)
            .eq('id', pedidoId);

        if (error) throw error;
    } catch (e) {
        alert('Error al actualizar el estado. Intenta de nuevo.');
        console.error(e);
    }
};

// ── CANCELAR ──────────────────────────────────────────────────────
window.abrirModalCancelar = (pedidoId, nPedido) => {
    pedidoPendienteCancelar = pedidoId;
    document.getElementById('cancelar-descripcion').textContent = `¿Cancelar el pedido #${nPedido}?`;
    document.getElementById('cancelar-motivo').value = '';
    document.getElementById('modal-cancelar').style.display = 'flex';
    setTimeout(() => document.getElementById('cancelar-motivo').focus(), 100);
};

function cerrarModalCancelar() {
    pedidoPendienteCancelar = null;
    document.getElementById('modal-cancelar').style.display = 'none';
}

document.getElementById('btn-cerrar-cancelar').addEventListener('click', cerrarModalCancelar);

window.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-cancelar')) cerrarModalCancelar();
});

document.getElementById('btn-confirmar-cancelar').addEventListener('click', async () => {
    if (!pedidoPendienteCancelar) return;
    const motivo = document.getElementById('cancelar-motivo').value.trim();

    try {
        const { error } = await supabase
            .from('pedidos_callcenter')
            .update({ estado: 'cancelado', motivo_cancelacion: motivo || null })
            .eq('id', pedidoPendienteCancelar);
        if (error) throw error;
        cerrarModalCancelar();
        cerrarModalPedido();
    } catch (e) {
        alert('Error al cancelar. Intenta de nuevo.');
        console.error(e);
    }
});
