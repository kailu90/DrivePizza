import { supabase } from './supabaseConfig.js'
import { mostrarOverlay, ocultarOverlay } from './overlay.js'

// Modo drawer: cargado desde panaderias-shell como panel lateral
const IS_DRAWER   = new URLSearchParams(location.search).has('drawer')
// Vista inicial: 'catalogo' (default) o 'historial' (vía ?view=historial)
const INITIAL_VIEW = new URLSearchParams(location.search).get('view') || 'catalogo'

// SVG icons por categoria
const _S = `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`
const CAT_SVG = {
    'panaderia': `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M5 8c0-2.21 3.13-4 7-4s7 1.79 7 4v9a2 2 0 01-2 2H7a2 2 0 01-2-2V8z"/><path d="M5 12h14"/></svg>`,
    'pasteler':  `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M4 15v5h16v-5"/><line x1="2" y1="15" x2="22" y2="15"/><path d="M6 15v-4h12v4"/><path d="M6 11a6 6 0 0112 0"/><line x1="12" y1="2" x2="12" y2="5"/></svg>`,
    'cafeter':   `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
    'cafe':      `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
    'bebida':    `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M5 7h14l-1.5 9A2 2 0 0115.51 18H8.49A2 2 0 016.5 16L5 7z"/><line x1="2" y1="7" x2="22" y2="7"/><line x1="12" y1="2" x2="12" y2="7"/></svg>`,
    'hojaldre':  `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M3 17c0-4 3.5-10 9-10s9 6 9 10a2 2 0 01-4 0c0-2-2-6-5-6s-5 4-5 6a2 2 0 01-4 0z"/></svg>`,
    'frito':     `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M6 20h12l1-10H5L6 20z"/><path d="M9 10V7M12 10V5M15 10V7"/></svg>`,
    'desayuno':  `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M17 18a5 5 0 00-10 0"/><line x1="12" y1="2" x2="12" y2="9"/><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/><line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/></svg>`,
    'torta':     `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M4 15v5h16v-5"/><line x1="2" y1="15" x2="22" y2="15"/><path d="M6 15v-4h12v4"/><path d="M6 11a6 6 0 0112 0"/><line x1="12" y1="2" x2="12" y2="5"/></svg>`,
    'ponque':    `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M4 15v5h16v-5"/><line x1="2" y1="15" x2="22" y2="15"/><path d="M6 15v-4h12v4"/><path d="M6 11a6 6 0 0112 0"/><line x1="12" y1="2" x2="12" y2="5"/></svg>`,
    'galleta':   `<svg viewBox="0 0 24 24" fill="none" ${_S}><circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="8" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.5" fill="currentColor" stroke="none"/></svg>`,
    'empanada':  `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M3 12a9 9 0 0118 0H3z"/><path d="M6 12a6 6 0 0112 0"/></svg>`,
    'arepa':     `<svg viewBox="0 0 24 24" fill="none" ${_S}><ellipse cx="12" cy="12" rx="9" ry="5"/><ellipse cx="12" cy="12" rx="6" ry="3"/></svg>`,
    'default':   `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><line x1="7" y1="2" x2="7" y2="22"/><path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3v7"/></svg>`,
}

const _TODOS_SVG = `<svg viewBox="0 0 24 24" fill="none" ${_S}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`

function catIcon(name) {
    const key = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return Object.entries(CAT_SVG).find(([k]) => key.includes(k))?.[1] ?? CAT_SVG.default
}

// ── Estado ───────────────────────────────────────────────────────────────────
let _user        = null
let _perfil      = null
let _categorias  = []
let _productos   = []        // todos los productos cargados
let _catActiva   = null
let _carrito     = []        // [{ id, name, precio, qty }]
let _tipoEntrega = 'domicilio'
let _pago        = 'efectivo'

// ── Auth ─────────────────────────────────────────────────────────────────────
async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = './index.html'; return }

    const { data: perfil } = await supabase
        .from('usuarios').select('*').eq('id', user.id).single()

    if (!perfil || !perfil.active) {
        await supabase.auth.signOut()
        window.location.href = './index.html'
        return
    }

    _user   = user
    _perfil = perfil

    if (IS_DRAWER) {
        document.body.classList.add('drawer-mode')
        document.getElementById('btn-drawer-close')?.addEventListener('click', () =>
            window.parent.postMessage({ type: 'tomar-pedido-close' }, '*')
        )
    }

    document.getElementById('contenido-principal').style.display = ''
    document.body.classList.add('loaded')
    initDragScroll(document.querySelector('.ld-tabs-wrap'))

    await Promise.all([cargarCategorias(), cargarProductos()])
    renderProductos()
    window.parent.postMessage({ type: 'frame-ready' }, '*')
}

// ── Cargar datos ─────────────────────────────────────────────────────────────
async function cargarCategorias() {
    const { data } = await supabase
        .from('categorias').select('id_category, name').order('name')
    if (!data) return
    _categorias = data
    renderCategorias()
}

async function cargarProductos() {
    const { data } = await supabase
        .from('productos')
        .select('id, name, price, id_category')
        .eq('active', true)
        .gt('price', 0)
        .order('name')
    if (!data) return
    _productos = data
}

// ── Drag-to-scroll en tabs ────────────────────────────────────────────────────
function initDragScroll(el) {
    let dragging = false, startX = 0, scrollLeft = 0, moved = false

    el.addEventListener('mousedown', e => {
        dragging   = true
        moved      = false
        startX     = e.pageX - el.offsetLeft
        scrollLeft = el.scrollLeft
        el.style.cursor = 'grabbing'
    })

    el.addEventListener('mousemove', e => {
        if (!dragging) return
        const dx = e.pageX - el.offsetLeft - startX
        if (Math.abs(dx) > 4) moved = true
        el.scrollLeft = scrollLeft - dx
    })

    const stop = () => { dragging = false; el.style.cursor = '' }
    el.addEventListener('mouseup',    stop)
    el.addEventListener('mouseleave', stop)

    // Cancelar click en el tab si fue un arrastre
    el.addEventListener('click', e => {
        if (moved) { e.stopPropagation(); e.preventDefault(); moved = false }
    }, true)
}

// ── Render categorias (tabs horizontales) ─────────────────────────────────────
function renderCategorias() {
    const tabs = document.getElementById('catTabs')
    tabs.innerHTML = ''

    const mkTab = (label, svg, id) => {
        const btn = document.createElement('button')
        btn.className = 'ld-tab' + (_catActiva === id ? ' active' : '')
        btn.innerHTML = `<span class="ld-tab__ico">${svg}</span><span class="ld-tab__label">${label}</span>`
        btn.addEventListener('click', () => seleccionarCategoria(id))
        return btn
    }

    tabs.appendChild(mkTab('Todos', _TODOS_SVG, null))
    _categorias.forEach(cat => tabs.appendChild(mkTab(cat.name, catIcon(cat.name), cat.id_category)))
}

function seleccionarCategoria(id) {
    _catActiva = id
    document.getElementById('searchInput').value = ''
    renderCategorias()
    // scroll al tab activo
    const tab = document.querySelector('#catTabs .ld-tab.active')
    tab?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    renderProductos()
}

// ── Render productos ──────────────────────────────────────────────────────────
function renderProductos(busqueda = '') {
    const grid = document.getElementById('productGrid')
    grid.innerHTML = ''

    let lista = _productos
    if (_catActiva) lista = lista.filter(p => p.id_category === _catActiva)
    if (busqueda)   lista = lista.filter(p => p.name.toLowerCase().includes(busqueda.toLowerCase()))

    if (!lista.length) {
        grid.innerHTML = '<p class="ld-empty">Sin productos</p>'
        return
    }

    lista.forEach(prod => {
        const card = document.createElement('div')
        card.className = 'ld-prod-card'
        card.innerHTML = `
            <div class="ld-prod-card__img"></div>
            <div class="ld-prod-card__body">
                <span class="ld-prod-card__name">${prod.name}</span>
                <div class="ld-prod-card__foot">
                    <span class="ld-prod-card__precio">${formatPrecio(prod.price)}</span>
                    <button class="ld-prod-card__add">+</button>
                </div>
            </div>
        `
        card.addEventListener('click', () => agregarAlCarrito(prod))
        grid.appendChild(card)
    })
}

// ── Carrito ───────────────────────────────────────────────────────────────────
function agregarAlCarrito(prod) {
    const item = _carrito.find(i => i.id === prod.id)
    if (item) {
        item.qty++
    } else {
        _carrito.push({ id: prod.id, name: prod.name, precio: prod.price, qty: 1 })
    }
    renderCarrito()
}

function cambiarCantidad(id, delta) {
    const idx = _carrito.findIndex(i => i.id === id)
    if (idx === -1) return
    _carrito[idx].qty += delta
    if (_carrito[idx].qty <= 0) _carrito.splice(idx, 1)
    renderCarrito()
}

function vaciarCarrito() {
    _carrito = []
    renderCarrito()
}

function renderCarrito() {
    const container   = document.getElementById('orderItems')
    const btnVaciar   = document.getElementById('btnVaciar')
    const btnCheckout = document.getElementById('btnCheckout')
    const totalEl     = document.getElementById('totalDisplay')

    container.innerHTML = ''

    if (!_carrito.length) {
        container.innerHTML = '<p class="ld-orden__empty">No hay productos seleccionados</p>'
        btnVaciar.style.display = 'none'
        btnCheckout.disabled    = true
        totalEl.textContent     = '$0'
        return
    }

    btnVaciar.style.display = ''
    btnCheckout.disabled    = false

    let total = 0
    _carrito.forEach(item => {
        total += item.precio * item.qty
        const el = document.createElement('div')
        el.className = 'ld-item'
        el.innerHTML = `
            <div class="ld-item__info">
                <div class="ld-item__name">${item.name}</div>
                <div class="ld-item__sub">${formatPrecio(item.precio * item.qty)}</div>
            </div>
            <div class="ld-item__ctrl">
                <button class="ld-item__btn" data-id="${item.id}" data-delta="-1">−</button>
                <span class="ld-item__qty">${item.qty}</span>
                <button class="ld-item__btn" data-id="${item.id}" data-delta="1">+</button>
            </div>
        `
        container.appendChild(el)
    })

    totalEl.textContent = formatPrecio(total)
}

// ── Checkout ──────────────────────────────────────────────────────────────────
function setEntrega(tipo) {
    _tipoEntrega = tipo
    document.querySelectorAll('.ld-modal__entrega-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.tipo === tipo)
    )
    const camposDir = document.getElementById('campos-domicilio-modal')
    if (camposDir) camposDir.style.display = tipo === 'domicilio' ? '' : 'none'
}

function abrirCheckout() {
    const total = _carrito.reduce((s, i) => s + i.precio * i.qty, 0)
    document.getElementById('modal-subtotal').textContent = formatPrecio(total)
    document.getElementById('modal-total').textContent    = formatPrecio(total)
    document.getElementById('ck-error').style.display = 'none'
    document.getElementById('modalCheckout').classList.add('open')
}

function cerrarCheckout() {
    document.getElementById('modalCheckout').classList.remove('open')
}

async function confirmarPedido() {
    const nombre   = document.getElementById('ck-nombre').value.trim()
    const telefono = document.getElementById('ck-telefono').value.trim()
    const obs      = document.getElementById('ck-obs')?.value.trim() ?? ''
    const errorEl  = document.getElementById('ck-error')

    if (!nombre) { mostrarError('Ingresa el nombre del cliente.'); return }
    if (!telefono) { mostrarError('Ingresa el teléfono.'); return }
    if (_tipoEntrega === 'domicilio') {
        const dir    = document.getElementById('ck-direccion').value.trim()
        const barrio = document.getElementById('ck-barrio').value.trim()
        if (!dir)    { mostrarError('Ingresa la dirección.'); return }
        if (!barrio) { mostrarError('Ingresa el barrio.'); return }
    }

    mostrarOverlay('Guardando pedido...')

    try {
        // Siguiente número de pedido
        const { data: cntData, error: cntErr } = await supabase
            .rpc('siguiente_n_pedido_callcenter')
        if (cntErr) throw cntErr
        const nPedido = cntData

        const domicilio = _tipoEntrega === 'domicilio'
            ? {
                barrio: document.getElementById('ck-barrio').value.trim(),
                valor:  0
              }
            : { tipo: 'recoger', valor: 0 }

        const productos = _carrito.map(i => ({
            id:     i.id,
            nombre: i.name,
            precio: i.precio,
            qty:    i.qty,
        }))

        const total = _carrito.reduce((s, i) => s + i.precio * i.qty, 0)

        const pedido = {
            n_pedido:  nPedido,
            nombre,
            telefono,
            direccion: _tipoEntrega === 'domicilio'
                ? document.getElementById('ck-direccion').value.trim()
                : 'Recoger en tienda',
            sede:      _perfil.sede || 'delicias de pinares',
            pago:      _pago,
            obs,
            productos,
            total,
            domicilio,
            asesor:    _perfil.username,
            estado:    'pendiente',
            canal:     'callcenter',
            impreso:   false,
        }

        const { error } = await supabase
            .from('pedidos_callcenter').insert(pedido)
        if (error) throw error

        ocultarOverlay(true)
        cerrarCheckout()
        limpiarFormulario()
        vaciarCarrito()
        if (IS_DRAWER) window.parent.postMessage({ type: 'tomar-pedido-close' }, '*')

    } catch (err) {
        ocultarOverlay()
        mostrarError(err.message || 'Error al guardar el pedido.')
    }
}

function limpiarFormulario() {
    ['ck-nombre','ck-telefono','ck-direccion','ck-barrio','ck-obs'].forEach(id => {
        const el = document.getElementById(id)
        if (el) el.value = ''
    })
    setEntrega('domicilio')
    _pago = 'efectivo'
    document.querySelectorAll('.ld-pago-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.pago === 'efectivo')
    )
}

function mostrarError(msg) {
    const el = document.getElementById('ck-error')
    el.textContent    = msg
    el.style.display  = 'block'
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatPrecio(n) {
    return '$' + Number(n).toLocaleString('es-CO')
}

// ── Listeners ─────────────────────────────────────────────────────────────────
// Panel derecho
document.getElementById('btnVaciar').addEventListener('click', vaciarCarrito)
document.getElementById('btnCheckout').addEventListener('click', abrirCheckout)

// Modal checkout
document.getElementById('btnConfirmar').addEventListener('click', confirmarPedido)
document.getElementById('btnCancelarCheckout').addEventListener('click', cerrarCheckout)
document.getElementById('modalCheckout').addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrarCheckout()
})

// Busqueda
document.getElementById('searchInput').addEventListener('input', e => {
    _catActiva = null
    renderCategorias()
    renderProductos(e.target.value)
})

// Carrito — delegacion para botones +/−
document.getElementById('orderItems').addEventListener('click', e => {
    const btn = e.target.closest('.ld-item__btn')
    if (!btn) return
    cambiarCantidad(btn.dataset.id, Number(btn.dataset.delta))
})

// Toggle entrega (domicilio / recoger)
document.querySelectorAll('.ld-modal__entrega-btn').forEach(b => {
    b.addEventListener('click', () => setEntrega(b.dataset.tipo))
})

// Toggle pago (en modal)
document.querySelectorAll('.ld-pago-btn').forEach(b => {
    b.addEventListener('click', () => {
        _pago = b.dataset.pago
        document.querySelectorAll('.ld-pago-btn').forEach(x =>
            x.classList.toggle('active', x === b)
        )
    })
})

// ── Vistas del panel central ──────────────────────────────────────────────────
const VIEWS = ['catalogo', 'historial', 'barrios', 'clientes']

function switchView(view) {
    VIEWS.forEach(v => {
        const el = document.getElementById(`view-${v}`)
        if (!el) return
        el.style.display = v === view ? (v === 'catalogo' ? '' : 'flex') : 'none'
    })
    const orden = document.querySelector('.ld-orden')
    if (orden) orden.style.display = view === 'catalogo' ? '' : 'none'
}

// Frame visible desde shell / switch de vista
window.addEventListener('message', e => {
    if (e.data?.type === 'frame-visible' && !IS_DRAWER) {
        window.parent.postMessage({ type: 'wa-visible', show: true }, '*')
    }
    if (e.data?.type === 'switch-view') switchView(e.data.view)
})

// ── Arrancar ──────────────────────────────────────────────────────────────────
switchView(INITIAL_VIEW)
init().then(() => renderProductos())
