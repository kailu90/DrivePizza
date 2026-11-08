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
let _user          = null
let _perfil        = null
let _currentView   = INITIAL_VIEW
let _barriosInited = false

const _hist = { offset: 0, done: false, loading: false, loaded: false }
let _categorias      = []
let _productos       = []        // todos los productos cargados
let _catActiva       = null
let _carrito         = []        // [{ id, name, precio, qty }]
let _tipoEntrega     = 'domicilio'
let _pago            = 'efectivo'
let _barriosCatalogo = null      // [{ nombre, valor }] — cargado lazy al abrir checkout
let _domicilioValor  = 0         // valor del barrio seleccionado
let _barrioNombre    = ''        // nombre del barrio seleccionado

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

    _initBarrioPicker()

    // Si la vista inicial es historial y ya tenemos perfil, cargar ahora
    if (_currentView === 'historial') _loadHistorial(true)

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

// ── Barrio picker ─────────────────────────────────────────────────────────────
async function _loadBarriosCatalogo() {
    if (_barriosCatalogo !== null) return
    const { data } = await supabase
        .from('barrios')
        .select('nombre, valor')
        .eq('sede_id', (_perfil.sede || '').toLowerCase())
        .eq('activo', true)
        .order('nombre')
    _barriosCatalogo = data ?? []
}

function _initBarrioPicker() {
    const input = document.getElementById('ck-barrio')
    const list  = document.getElementById('ck-barrio-list')

    input.addEventListener('input', () => {
        _barrioNombre   = ''
        _domicilioValor = 0
        _actualizarResumen()

        const q = input.value.toLowerCase().trim()
        if (!q || !_barriosCatalogo?.length) { list.style.display = 'none'; return }

        const matches = _barriosCatalogo.filter(b => b.nombre.toLowerCase().includes(q))
        if (!matches.length) {
            list.innerHTML = '<div class="ld-barrio-picker__none">Sin resultados</div>'
            list.style.display = ''
            return
        }
        list.innerHTML = matches.map(b =>
            `<div class="ld-barrio-picker__item" data-nombre="${b.nombre}" data-valor="${b.valor}">
                <span>${b.nombre}</span>
                <span class="ld-barrio-picker__val">$${Number(b.valor).toLocaleString('es-CO')}</span>
             </div>`
        ).join('')
        list.style.display = ''
    })

    list.addEventListener('click', e => {
        const item = e.target.closest('.ld-barrio-picker__item')
        if (!item) return
        _barrioNombre   = item.dataset.nombre
        _domicilioValor = Number(item.dataset.valor)
        input.value = _barrioNombre
        list.style.display = 'none'
        _actualizarResumen()
    })

    document.addEventListener('click', e => {
        if (!e.target.closest('#ck-barrio-wrap')) list.style.display = 'none'
    })
}

function _actualizarResumen() {
    const subtotal = _carrito.reduce((s, i) => s + i.precio * i.qty, 0)
    const domVal   = _tipoEntrega === 'domicilio' ? _domicilioValor : 0
    document.getElementById('modal-subtotal').textContent  = formatPrecio(subtotal)
    document.getElementById('modal-domicilio').textContent = formatPrecio(domVal)
    document.getElementById('row-domicilio').style.display = (_tipoEntrega === 'domicilio' && domVal > 0) ? '' : 'none'
    document.getElementById('modal-total').textContent     = formatPrecio(subtotal + domVal)
}

// ── Checkout ──────────────────────────────────────────────────────────────────
function setEntrega(tipo) {
    _tipoEntrega = tipo
    document.querySelectorAll('.ld-modal__entrega-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.tipo === tipo)
    )
    const camposDir = document.getElementById('campos-domicilio-modal')
    if (camposDir) camposDir.style.display = tipo === 'domicilio' ? '' : 'none'
    _actualizarResumen()
}

async function abrirCheckout() {
    await _loadBarriosCatalogo()
    document.getElementById('ck-error').style.display = 'none'
    document.getElementById('modalCheckout').classList.add('open')
    _actualizarResumen()
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
        if (!barrio) { mostrarError('Selecciona el barrio.'); return }
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
                valor:  _domicilioValor
              }
            : { tipo: 'recoger', valor: 0 }

        const productos = _carrito.map(i => ({
            id:     i.id,
            nombre: i.name,
            precio: i.precio,
            qty:    i.qty,
        }))

        const subtotal = _carrito.reduce((s, i) => s + i.precio * i.qty, 0)
        const total    = subtotal + (_tipoEntrega === 'domicilio' ? _domicilioValor : 0)

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
            fecha:     new Date().toISOString(),
        }

        const { error } = await supabase
            .from('pedidos_callcenter').insert(pedido)
        if (error) throw error

        cerrarCheckout()
        limpiarFormulario()
        vaciarCarrito()
        const sedeDisplay = (_perfil.sede || '').charAt(0).toUpperCase() + (_perfil.sede || '').slice(1).toLowerCase()
        ocultarOverlay(true, { asesor: _perfil.username, pedidoId: nPedido, sede: sedeDisplay })
        if (IS_DRAWER) setTimeout(() => window.parent.postMessage({ type: 'tomar-pedido-close' }, '*'), 3000)

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
    _barrioNombre   = ''
    _domicilioValor = 0
    document.getElementById('ck-barrio-list').style.display = 'none'
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
    cambiarCantidad(Number(btn.dataset.id), Number(btn.dataset.delta))
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
    _currentView = view
    VIEWS.forEach(v => {
        const el = document.getElementById(`view-${v}`)
        if (!el) return
        el.style.display = v === view ? (v === 'catalogo' ? '' : 'flex') : 'none'
    })
    const orden  = document.querySelector('.ld-orden')
    const layout = document.querySelector('.ld-omni-layout')
    if (orden)  orden.style.display = view === 'catalogo' ? '' : 'none'
    if (layout) layout.style.gridTemplateColumns = view === 'catalogo' ? '' : '1fr'

    if (view === 'historial' && _perfil && !_hist.loaded) _loadHistorial(true)

    if (view === 'barrios' && _perfil && !_barriosInited) {
        _barriosInited = true
        import('./barrios.js').then(m => m.initBarrios(supabase, _perfil))
    }
}

// Frame visible desde shell / switch de vista
window.addEventListener('message', e => {
    if (e.data?.type === 'frame-visible' && !IS_DRAWER) {
        window.parent.postMessage({ type: 'wa-visible', show: true }, '*')
    }
    if (e.data?.type === 'switch-view') switchView(e.data.view)
})

// ── Historial ─────────────────────────────────────────────────────────────────

function _histFiltros() {
    return {
        desde:     document.getElementById('hist-desde')?.value     || '',
        hasta:     document.getElementById('hist-hasta')?.value      || '',
        estado:    document.getElementById('hist-estado')?.value     || '',
        npedido:   document.getElementById('cf-npedido')?.value.trim()   || '',
        telefono:  document.getElementById('cf-telefono')?.value.trim()  || '',
        cliente:   document.getElementById('cf-cliente')?.value.trim()   || '',
        direccion: document.getElementById('cf-direccion')?.value.trim() || '',
        pago:      document.getElementById('cf-pago')?.value         || '',
        asesor:    document.getElementById('cf-asesor')?.value.trim()     || '',
        estadoCol: document.getElementById('cf-estado-col')?.value   || '',
    }
}

async function _loadHistorial(reset = false) {
    if (_hist.loading) return
    if (!reset && _hist.done) return

    if (reset) {
        _hist.offset = 0
        _hist.done   = false
        _hist.loaded = true
        const tbody = document.getElementById('hist-tbody')
        tbody.innerHTML = ''
        _loadResumen()
    }

    _hist.loading = true
    document.getElementById('histLoading').style.display = ''

    const f = _histFiltros()
    const estado = f.estadoCol || f.estado

    let q = supabase
        .from('pedidos_callcenter')
        .select('n_pedido, nombre, telefono, direccion, pago, estado, total, domicilio, productos, asesor, canal, fecha')
        .eq('sede', _perfil.sede)
        .order('n_pedido', { ascending: false })
        .range(_hist.offset, _hist.offset + 24)

    if (estado)      q = q.eq('estado', estado)
    if (f.desde)     q = q.gte('fecha', f.desde + 'T00:00:00-05:00')
    if (f.hasta)     q = q.lte('fecha', f.hasta + 'T23:59:59-05:00')
    if (f.npedido)   q = q.eq('n_pedido', Number(f.npedido))
    if (f.telefono)  q = q.ilike('telefono', `%${f.telefono}%`)
    if (f.cliente)   q = q.ilike('nombre', `%${f.cliente}%`)
    if (f.direccion) q = q.ilike('direccion', `%${f.direccion}%`)
    if (f.pago)      q = q.eq('pago', f.pago)
    if (f.asesor)    q = q.ilike('asesor', `%${f.asesor}%`)

    const { data } = await q
    _hist.loading = false
    document.getElementById('histLoading').style.display = 'none'

    if (!data?.length) {
        if (reset) {
            document.getElementById('hist-tbody').innerHTML =
                '<tr><td colspan="9" class="ld-hist-empty-msg">No se encontraron pedidos</td></tr>'
        }
        _hist.done = true
    } else {
        _hist.offset += data.length
        if (data.length < 25) _hist.done = true
        _renderHistItems(data)
    }

    document.getElementById('histFooter').style.display = _hist.done ? 'none' : ''
}

async function _loadResumen() {
    const f = _histFiltros()
    const PAGE = 1000
    let all = [], offset = 0, done = false

    while (!done) {
        let q = supabase
            .from('pedidos_callcenter')
            .select('estado, total')
            .eq('sede', _perfil.sede)
            .range(offset, offset + PAGE - 1)
        if (f.desde) q = q.gte('fecha', f.desde + 'T00:00:00-05:00')
        if (f.hasta) q = q.lte('fecha', f.hasta + 'T23:59:59-05:00')

        const { data } = await q
        if (!data?.length) break
        all = all.concat(data)
        if (data.length < PAGE) done = true
        else offset += PAGE
    }

    const entregados = all.filter(p => p.estado === 'entregado')
    document.getElementById('hist-res-total').textContent       = all.length
    document.getElementById('hist-res-entregados').textContent  = entregados.length
    document.getElementById('hist-res-cancelados').textContent  = all.filter(p => p.estado === 'cancelado').length
    document.getElementById('hist-res-ventas').textContent      = formatPrecio(entregados.reduce((s, p) => s + (p.total || 0), 0))
}

function _renderHistItems(items) {
    const tbody = document.getElementById('hist-tbody')
    items.forEach(p => {
        const tr = document.createElement('tr')
        tr.innerHTML = `
            <td><b>#${String(p.n_pedido).padStart(3,'0')}</b></td>
            <td>${_fmtHistDate(p.fecha)}</td>
            <td>${p.telefono}</td>
            <td>${p.nombre}</td>
            <td title="${p.direccion || ''}">${p.direccion || '—'}</td>
            <td>${_capStr(p.pago)}</td>
            <td>${p.asesor || '—'}</td>
            <td><span class="ld-hist-badge ld-hist-badge--${(p.estado||'').replace(/ /g,'-')}">${_capStr(p.estado)}</span></td>
            <td><b>${formatPrecio(p.total)}</b></td>
        `
        tr.addEventListener('click', () => _abrirDetalle(p))
        tbody.appendChild(tr)
    })
}

function _fmtHistDate(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) +
           ' · ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

function _capStr(s) {
    if (!s) return '—'
    return s.charAt(0).toUpperCase() + s.slice(1)
}

function _abrirDetalle(p) {
    // Header: número + fecha
    document.getElementById('det-titulo').innerHTML =
        `<span class="ld-det__num">#${String(p.n_pedido).padStart(3,'0')}</span>` +
        `<span class="ld-det__fecha-hdr">${_fmtHistDate(p.fecha)}</span>`

    // Dirección
    const esDomicilio = p.domicilio?.tipo !== 'recoger' && p.direccion !== 'Recoger en tienda'
    const dirTexto = esDomicilio
        ? [p.direccion, p.domicilio?.barrio].filter(Boolean).join(' · ')
        : 'Recoger en tienda'
    const pinSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`
    const dirHtml = `<div class="ld-det__dir${esDomicilio ? '' : ' ld-det__dir--recoger'}">${pinSvg}<span>${dirTexto}</span></div>`

    const canalIcon = p.canal === 'whatsapp' ? '📱' : p.canal === 'ivr' ? '📞' : ''

    // Productos
    const prods = p.productos || []
    const subtotal = prods.reduce((s, pr) => s + (pr.precio || 0) * (pr.qty || 1), 0)
    const valorDom = esDomicilio ? (p.domicilio?.valor || 0) : 0
    const prodsHtml = prods.map(pr => `
        <div class="ld-det__prod">
            <span class="ld-det__prod-qty">${pr.qty ?? 1}×</span>
            <span class="ld-det__prod-name">${pr.nombre || '—'}</span>
            <span class="ld-det__prod-price">${formatPrecio((pr.precio||0)*(pr.qty||1))}</span>
        </div>`).join('')

    const domRowHtml = esDomicilio && valorDom > 0
        ? `<div class="ld-det__tot-row"><span>Domicilio</span><span>${formatPrecio(valorDom)}</span></div>`
        : ''

    const obsHtml = p.obs
        ? `<div class="ld-det__obs">💬 ${p.obs}</div>`
        : ''

    // Timeline
    const STEPS = [
        { id: 'recibido',       label: 'Recibido',   icon: '✓'  },
        { id: 'en preparacion', label: 'Preparando', icon: '☕' },
        { id: 'despachado',     label: 'Despachado', icon: '🛵' },
        { id: 'entregado',      label: 'Entregado',  icon: '✓'  },
    ]
    const idxActual = STEPS.findIndex(s => s.id === p.estado)
    const timelineHtml = p.estado === 'cancelado'
        ? `<div class="ld-det__cancelado">❌ Pedido cancelado</div>`
        : `<div class="ld-det__timeline">${STEPS.map((s, i) => {
            const done   = i < idxActual
            const active = i === idxActual
            const cls    = done ? 'ld-tl__step--done' : active ? 'ld-tl__step--active' : ''
            return `<div class="ld-tl__step ${cls}">
                <div class="ld-tl__dot">${done || active ? s.icon : ''}</div>
                <div class="ld-tl__label">${s.label}</div>
            </div>`
        }).join('')}</div>`

    document.getElementById('det-body').innerHTML = `
        <div class="ld-det__nombre">${p.nombre || '—'}</div>
        <div class="ld-det__sub-row">
            <span>${p.telefono || '—'}</span>
            ${p.asesor ? `<span>👤 ${p.asesor}</span>` : ''}
        </div>
        <div class="ld-det__sub-row">
            <span>Pago: ${_capStr(p.pago)}</span>
            ${p.canal ? `<span>${canalIcon} ${_capStr(p.canal)}</span>` : ''}
        </div>
        ${dirHtml}
        <div class="ld-det__section-title">Productos</div>
        <div class="ld-det__prods">${prodsHtml}</div>
        <div class="ld-det__totales">
            <div class="ld-det__tot-row"><span>Productos</span><span>${formatPrecio(subtotal)}</span></div>
            ${domRowHtml}
            <div class="ld-det__tot-row ld-det__tot-row--total"><span>TOTAL</span><span>${formatPrecio(p.total || subtotal + valorDom)}</span></div>
        </div>
        ${obsHtml}
        ${timelineHtml}
    `
    document.getElementById('modalDetalle').classList.add('open')
}

// ── Listeners historial ───────────────────────────────────────────────────────
// Panel lateral
document.getElementById('hist-btn-panel').addEventListener('click', () => {
    document.getElementById('hist-panel').classList.add('open')
    document.getElementById('hist-overlay').classList.add('open')
})
const _cerrarPanel = () => {
    document.getElementById('hist-panel').classList.remove('open')
    document.getElementById('hist-overlay').classList.remove('open')
}
document.getElementById('hist-panel-cerrar').addEventListener('click', _cerrarPanel)
document.getElementById('hist-overlay').addEventListener('click', _cerrarPanel)

document.getElementById('hist-btn-filtrar').addEventListener('click', () => {
    _cerrarPanel()
    _loadHistorial(true)
})
document.getElementById('hist-btn-limpiar').addEventListener('click', () => {
    ;['hist-desde','hist-hasta','hist-estado'].forEach(id => {
        const el = document.getElementById(id)
        if (el) el.value = ''
    })
    _cerrarPanel()
    _loadHistorial(true)
})

// Botón actualizar
document.getElementById('hist-btn-actualizar').addEventListener('click', () => _loadHistorial(true))

// Cargar más
document.getElementById('histMas').addEventListener('click', () => _loadHistorial(false))

// Filtros de columna con debounce
let _histDebounce = null
const _cfIds = ['cf-npedido','cf-telefono','cf-cliente','cf-direccion','cf-asesor']
_cfIds.forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
        clearTimeout(_histDebounce)
        _histDebounce = setTimeout(() => _loadHistorial(true), 350)
    })
})
;['cf-pago','cf-estado-col'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => _loadHistorial(true))
})

// Modal detalle
document.getElementById('btnCerrarDetalle').addEventListener('click', () =>
    document.getElementById('modalDetalle').classList.remove('open')
)
document.getElementById('modalDetalle').addEventListener('click', e => {
    if (e.target === e.currentTarget)
        document.getElementById('modalDetalle').classList.remove('open')
})

// ── Arrancar ──────────────────────────────────────────────────────────────────
switchView(INITIAL_VIEW)
init()
