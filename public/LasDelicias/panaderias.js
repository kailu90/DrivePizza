import { supabase } from './supabaseConfig.js'
import { mostrarOverlay, ocultarOverlay } from './overlay.js'
import { mountHeader, setHeaderUser } from './Shared/ldHeader.js'

// ── Estado ────────────────────────────────────────────────────────────────────
let _perfil   = null
let _pedidos  = []          // pedidos activos de hoy
let _modalPedido = null     // pedido abierto en modal
let _canal    = null        // realtime channel

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtCOP = v => '$' + Number(v).toLocaleString('es-CO')

function rangoHoy() {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
    return {
        inicio: hoy + 'T05:00:00.000Z',
        fin:    new Date(new Date(hoy + 'T05:00:00.000Z').getTime() + 86400000 - 1).toISOString(),
    }
}

function minutosDesde(ts) {
    if (!ts) return null
    return Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
}

function formatTimer(min) {
    if (min === null) return ''
    return min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${min % 60}m`
}

// ── Auth + Init ───────────────────────────────────────────────────────────────
async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = './index.html'; return }

    const { data: perfil } = await supabase
        .from('usuarios').select('*').eq('id', user.id).single()

    if (!perfil || !perfil.active) {
        await supabase.auth.signOut()
        window.top.location.href = './index.html'
        return
    }

    _perfil = perfil

    mountHeader({
        navLabel: 'Panaderias',
        onHome: () => window.parent.postMessage({ type: 'nav-switch', page: 'home' }, '*'),
        navSections: [
            { label: 'Panaderias', active: true, description: 'Panaderia y pasteleria' },
            { label: 'Ghema',                    description: 'Proximamente' },
            { label: 'Figuettos',                description: 'Proximamente' },
        ],
        navActions: [
            { icon: 'search',  label: 'Barrios',        onClick: () => window.parent.postMessage({ type: 'nav-switch', page: 'barrios' }, '*') },
            { icon: 'leaf',    label: 'Historial',      onClick: () => window.parent.postMessage({ type: 'nav-switch', page: 'historial' }, '*') },
            { icon: 'pencil',  label: 'Tomar pedido',   onClick: () => window.parent.postMessage({ type: 'tomar-pedido-open' }, '*') },
            { icon: 'users',   label: 'Clientes',       onClick: () => window.parent.postMessage({ type: 'nav-switch', page: 'clientes' }, '*') },
        ],
        onLogout: async () => {
            await supabase.auth.signOut()
            window.parent.postMessage({ type: 'logout' }, '*')
        },
    })
    setHeaderUser({ username: perfil.username, sede: perfil.sede || '' })

    document.getElementById('contenido-principal').style.display = ''
    document.body.classList.add('loaded')

    await cargarPedidos()
    suscribirRealtime()

    // Refrescar timers cada minuto
    setInterval(() => { if (_pedidos.length) renderKanban() }, 60_000)
}

// ── Cargar pedidos de hoy ─────────────────────────────────────────────────────
async function cargarPedidos() {
    const { inicio, fin } = rangoHoy()
    const sede = _perfil.sede

    const { data, error } = await supabase
        .from('pedidos_callcenter')
        .select('*')
        .eq('sede', sede)
        .gte('fecha', inicio)
        .lte('fecha', fin)
        .order('fecha', { ascending: true })

    if (error) { console.error('[panaderias]', error); return }

    _pedidos = (data || []).filter(p => p.tipo !== 'reserva')
    renderKanban()
    actualizarKPIs()
}

// ── KPIs ──────────────────────────────────────────────────────────────────────
function actualizarKPIs() {
    const noCancel  = _pedidos.filter(p => p.estado !== 'cancelado')
    document.getElementById('kpi-total').textContent      = noCancel.length
    document.getElementById('kpi-entregados').textContent = _pedidos.filter(p => p.estado === 'entregado').length
    document.getElementById('kpi-cancelados').textContent = _pedidos.filter(p => p.estado === 'cancelado').length
}

// ── Kanban ────────────────────────────────────────────────────────────────────
const COLS = [
    { id: 'recibido',       elItems: 'col-recibido',    elCount: 'cnt-recibido'    },
    { id: 'en preparacion', elItems: 'col-preparacion', elCount: 'cnt-preparacion' },
    { id: 'despachado',     elItems: 'col-despachado',  elCount: 'cnt-despachado'  },
]

function renderKanban() {
    COLS.forEach(({ id, elItems, elCount }) => {
        const pedidos = _pedidos.filter(p => p.estado === id)
        const el  = document.getElementById(elItems)
        const cnt = document.getElementById(elCount)
        if (cnt) cnt.textContent = pedidos.length
        if (!el) return

        if (!pedidos.length) {
            el.innerHTML = '<div class="pan-col__empty">Sin pedidos</div>'
            return
        }

        el.innerHTML = pedidos.map(p => {
            const min      = minutosDesde(p.fecha)
            const timer    = formatTimer(min)
            const timerCls = min === null ? '' : min < 20 ? 'pan-card__timer--green' : min < 40 ? 'pan-card__timer--orange' : 'pan-card__timer--red'
            const prods    = p.productos || []
            const resumen  = prods.length
                ? prods[0].nombre + (prods.length > 1 ? ` +${prods.length - 1}` : '')
                : '—'
            return `
                <div class="pan-card" data-id="${p.id}">
                    <div class="pan-card__top">
                        <span class="pan-card__num">#${p.n_pedido ?? '—'}</span>
                        ${timer ? `<span class="pan-card__timer ${timerCls}">${timer}</span>` : ''}
                    </div>
                    <div class="pan-card__nombre">${p.nombre || '—'}</div>
                    <div class="pan-card__bottom">
                        <span class="pan-card__resumen">${resumen}</span>
                        <span class="pan-card__total">${p.total ? fmtCOP(p.total) : '—'}</span>
                    </div>
                </div>
            `
        }).join('')
    })
}

// ── Realtime ──────────────────────────────────────────────────────────────────
function suscribirRealtime() {
    if (_canal) supabase.removeChannel(_canal)
    const sede = _perfil.sede

    _canal = supabase
        .channel(`pan-${sede}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'lasdelicias',
            table: 'pedidos_callcenter',
            filter: `sede=eq.${sede}`,
        }, ({ eventType, new: nuevo, old: viejo }) => {
            const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

            if (eventType === 'INSERT') {
                const fechaPedido = nuevo.fecha
                    ? new Date(nuevo.fecha).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
                    : null
                if (fechaPedido === hoy && nuevo.tipo !== 'reserva') {
                    _pedidos.push(nuevo)
                }
            } else if (eventType === 'UPDATE') {
                const idx = _pedidos.findIndex(p => p.id === nuevo.id)
                if (idx !== -1) {
                    _pedidos[idx] = nuevo
                    // Si el modal está abierto para este pedido, actualizar badge
                    if (_modalPedido?.id === nuevo.id) actualizarBadgeModal(nuevo.estado)
                }
            } else if (eventType === 'DELETE') {
                const idx = _pedidos.findIndex(p => p.id === viejo.id)
                if (idx !== -1) _pedidos.splice(idx, 1)
            }

            renderKanban()
            actualizarKPIs()
        })
        .subscribe()
}

// ── Modal ─────────────────────────────────────────────────────────────────────
const ESTADO_LABEL = {
    'pendiente':       'Pendiente',
    'recibido':        'Recibido',
    'en preparacion':  'En preparación',
    'despachado':      'Despachado',
    'entregado':       'Entregado',
    'cancelado':       'Cancelado',
}

const ESTADO_BADGE_CSS = {
    'pendiente':       'background:#fef9c3;color:#854d0e',
    'recibido':        'background:#dbeafe;color:#1e40af',
    'en preparacion':  'background:#fef9c3;color:#854d0e',
    'despachado':      'background:#dcfce7;color:#166534',
    'entregado':       'background:#d1fae5;color:#065f46',
    'cancelado':       'background:#fee2e2;color:#991b1b',
}

const SIGUIENTE_ESTADO = {
    'recibido':       { texto: 'Iniciar preparación', siguiente: 'en preparacion' },
    'en preparacion': { texto: 'Despachar',           siguiente: 'despachado'     },
    'despachado':     { texto: 'Marcar entregado',    siguiente: 'entregado'      },
}

function abrirModal(pedido) {
    _modalPedido = pedido
    document.getElementById('mod-num').textContent = `Pedido #${pedido.n_pedido ?? '—'}`
    actualizarBadgeModal(pedido.estado)
    document.getElementById('mod-nombre').textContent    = pedido.nombre || '—'
    document.getElementById('mod-pago').textContent      = pedido.pago   || '—'

    // Dirección
    const esDomicilio = pedido.direccion && pedido.direccion !== 'Recoger en tienda'
    const dirWrap = document.getElementById('mod-dir-wrap')
    if (esDomicilio) {
        const barrio = pedido.domicilio?.barrio ? ` — ${pedido.domicilio.barrio}` : ''
        document.getElementById('mod-direccion').textContent = pedido.direccion + barrio
        dirWrap.style.display = ''
    } else {
        dirWrap.style.display = 'none'
    }

    // Productos
    const prodsEl = document.getElementById('mod-prods')
    const prods   = pedido.productos || []
    prodsEl.innerHTML = prods.map(p => `
        <li class="pan-modal__prod">
            <span class="pan-modal__prod-name">${p.nombre || '—'}</span>
            <span class="pan-modal__prod-qty">x${p.qty ?? 1} — ${fmtCOP((p.precio || 0) * (p.qty || 1))}</span>
        </li>
    `).join('')

    document.getElementById('mod-total').textContent = fmtCOP(pedido.total || 0)

    // Observaciones
    const obsEl = document.getElementById('mod-obs')
    if (pedido.obs) {
        obsEl.textContent    = `Obs: ${pedido.obs}`
        obsEl.style.display  = ''
    } else {
        obsEl.style.display  = 'none'
    }

    // Botón acción
    const btnAction = document.getElementById('mod-action')
    const siguiente = SIGUIENTE_ESTADO[pedido.estado]
    if (siguiente) {
        btnAction.textContent    = siguiente.texto
        btnAction.dataset.sig    = siguiente.siguiente
        btnAction.style.display  = ''
        btnAction.disabled       = false
    } else {
        btnAction.style.display  = 'none'
    }

    document.getElementById('panModal').classList.add('open')
}

function actualizarBadgeModal(estado) {
    const badge = document.getElementById('mod-badge')
    badge.textContent   = ESTADO_LABEL[estado] || estado
    badge.style.cssText = `display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;${ESTADO_BADGE_CSS[estado] || ''}`

    // Actualizar botón acción si está visible
    const btnAction = document.getElementById('mod-action')
    const siguiente = SIGUIENTE_ESTADO[estado]
    if (siguiente) {
        btnAction.textContent   = siguiente.texto
        btnAction.dataset.sig   = siguiente.siguiente
        btnAction.style.display = ''
        btnAction.disabled      = false
    } else {
        btnAction.style.display = 'none'
    }
}

function cerrarModal() {
    document.getElementById('panModal').classList.remove('open')
    _modalPedido = null
}

async function avanzarEstado() {
    if (!_modalPedido) return
    const btnAction  = document.getElementById('mod-action')
    const siguiente  = btnAction.dataset.sig
    if (!siguiente) return

    btnAction.disabled = true
    mostrarOverlay('Actualizando...')
    try {
        const { error } = await supabase
            .from('pedidos_callcenter')
            .update({ estado: siguiente })
            .eq('id', _modalPedido.id)
        if (error) throw error
        ocultarOverlay(true)
        cerrarModal()
    } catch (err) {
        ocultarOverlay()
        console.error('[panaderias] avanzar estado:', err)
        btnAction.disabled = false
    }
}

// ── Listeners ─────────────────────────────────────────────────────────────────
// Kanban — click delegar
document.addEventListener('click', e => {
    const card = e.target.closest('.pan-card[data-id]')
    if (!card) return
    const pedido = _pedidos.find(p => String(p.id) === card.dataset.id)
    if (pedido) abrirModal(pedido)
})

document.getElementById('mod-close').addEventListener('click', cerrarModal)
document.getElementById('panModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrarModal()
})
document.getElementById('mod-action').addEventListener('click', avanzarEstado)

// Logout ahora en el dropdown del header compartido

// ── Arrancar ──────────────────────────────────────────────────────────────────
init()
