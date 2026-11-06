import { supabase } from './supabaseConfig.js'
import { mostrarOverlay, ocultarOverlay } from './overlay.js'
import { mountHeader, setHeaderUser } from './Shared/ldHeader.js'

// Icono por nombre de categoria (fallback al primero que coincida parcialmente)
const CAT_ICONS = {
    'panaderia': '🫓', 'panderia': '🫓',
    'pasteleria': '🧁', 'pasteles': '🧁',
    'cafeteria': '☕', 'cafe': '☕', 'bebidas': '🥤',
    'hojaldres': '🥐', 'hojaldre': '🥐',
    'fritos': '🍟', 'frito': '🍟',
    'desayunos': '🍳', 'desayuno': '🍳',
    'tortas': '🎂', 'ponques': '🧁', 'galletas': '🍪',
    'empanadas': '🥟', 'arepas': '🫔',
    'default': '🍽️',
}

function catIcon(name) {
    const key = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return Object.entries(CAT_ICONS).find(([k]) => key.includes(k))?.[1] ?? CAT_ICONS.default
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

    mountHeader({
        navLabel: 'Pedidos',
        navItems: [
            { label: 'Panaderias', href: './panaderias.html' },
            { label: 'Historial',  href: './historial.html'  },
        ],
        onLogout: async () => {
            await supabase.auth.signOut()
            window.parent.postMessage({ type: 'logout' }, '*')
            window.location.href = './index.html'
        },
    })
    setHeaderUser({ username: perfil.username, sede: perfil.sede || '' })

    document.getElementById('contenido-principal').style.display = ''
    document.body.classList.add('loaded')

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

// ── Render categorias (tabs horizontales) ─────────────────────────────────────
function renderCategorias() {
    const tabs = document.getElementById('catTabs')
    tabs.innerHTML = ''

    const mkTab = (label, ico, id) => {
        const btn = document.createElement('button')
        btn.className = 'ld-tab' + (_catActiva === id ? ' active' : '')
        btn.innerHTML = `<span class="ld-tab__ico">${ico}</span><span class="ld-tab__label">${label}</span>`
        btn.addEventListener('click', () => seleccionarCategoria(id))
        return btn
    }

    tabs.appendChild(mkTab('Todos', '🍽️', null))
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
    const countEl     = document.getElementById('orderCount')

    container.innerHTML = ''

    if (!_carrito.length) {
        container.innerHTML = '<p class="ld-orden__empty">Sin productos</p>'
        btnVaciar.style.display = 'none'
        btnCheckout.disabled    = true
        totalEl.textContent     = '$0'
        if (countEl) countEl.textContent = ''
        return
    }

    btnVaciar.style.display = ''
    btnCheckout.disabled    = false
    if (countEl) countEl.textContent = `(${_carrito.length})`

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
function abrirCheckout() {
    document.getElementById('modalCheckout').classList.add('open')
    document.getElementById('ck-error').style.display = 'none'
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

        // Actualizar panel con info del cliente confirmado
        const displayCliente = document.getElementById('display-cliente')
        const displayDir     = document.getElementById('display-dir')
        if (displayCliente) displayCliente.textContent = `${nombre} · ${telefono}`
        if (displayDir && _tipoEntrega === 'domicilio') {
            const barrio = document.getElementById('ck-barrio')?.value.trim()
            const dir    = document.getElementById('ck-direccion')?.value.trim()
            displayDir.textContent = [barrio, dir].filter(Boolean).join(', ')
        }

        ocultarOverlay(true)
        cerrarCheckout()
        limpiarFormulario()
        vaciarCarrito()

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
    const displayCliente = document.getElementById('display-cliente')
    const displayDir     = document.getElementById('display-dir')
    if (displayCliente) displayCliente.textContent = '—'
    if (displayDir)     displayDir.textContent     = '—'
    setEntrega('domicilio')
    setPago('efectivo')
}

function mostrarError(msg) {
    const el = document.getElementById('ck-error')
    el.textContent    = msg
    el.style.display  = 'block'
}

function setEntrega(tipo) {
    _tipoEntrega = tipo
    document.querySelectorAll('.ld-entrega-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tipo === tipo)
    })
    const show = tipo === 'domicilio'
    const panelDir = document.getElementById('campos-domicilio')
    if (panelDir) panelDir.style.display = show ? '' : 'none'
    const modalDir = document.getElementById('campos-domicilio-modal')
    if (modalDir) modalDir.style.display = show ? '' : 'none'
}

function setPago(pago) {
    _pago = pago
    document.querySelectorAll('.ld-pago-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.pago === pago)
    })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatPrecio(n) {
    return '$' + Number(n).toLocaleString('es-CO')
}

// ── Listeners ─────────────────────────────────────────────────────────────────
// Panel derecho — botones principales
document.getElementById('btnVaciar').addEventListener('click', vaciarCarrito)
document.getElementById('btnCheckout').addEventListener('click', abrirCheckout)
// Rows clickeables de cliente/direccion abren el mismo modal
document.getElementById('btn-cliente')?.addEventListener('click', abrirCheckout)
document.getElementById('btn-dir')?.addEventListener('click', abrirCheckout)

// Toggle de entrega en el panel principal
document.querySelectorAll('.ld-entrega-btn').forEach(btn => {
    btn.addEventListener('click', () => setEntrega(btn.dataset.tipo))
})

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

// Toggles entrega y pago
document.querySelectorAll('.ld-entrega-btn').forEach(b => {
    b.addEventListener('click', () => setEntrega(b.dataset.tipo))
})
document.querySelectorAll('.ld-pago-btn').forEach(b => {
    b.addEventListener('click', () => setPago(b.dataset.pago))
})

// Frame visible desde shell
window.addEventListener('message', e => {
    if (e.data?.type === 'frame-visible') {
        window.parent.postMessage({ type: 'wa-visible', show: true }, '*')
    }
})

// ── Arrancar ──────────────────────────────────────────────────────────────────
init().then(() => renderProductos())
