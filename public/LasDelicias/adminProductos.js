import { supabase } from './supabaseConfig.js'

// ── Estado ────────────────────────────────────────────────────────────────────
let _categorias = []
let _productos  = []
let _catActiva  = null
let _editando   = null

const catMap = () => Object.fromEntries(_categorias.map(c => [c.id_category, c.name]))

// ── Auth + Init ───────────────────────────────────────────────────────────────
async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.location.href = './index.html'; return }

    const { data: perfil } = await supabase
        .from('usuarios').select('rol, active, username, sede').eq('id', user.id).single()

    if (!perfil?.active) { window.location.href = './index.html'; return }

    const ROLES_ADMIN = ['panaderias-admin', 'admin']
    if (!ROLES_ADMIN.includes(perfil.rol)) { window.location.href = './index.html'; return }

    document.getElementById('contenido-principal').style.display = ''
    document.body.classList.add('loaded')

    await Promise.all([_cargarCategorias(), _cargarProductos()])
    _renderTabs()
    _renderTabla()
    _actualizarStats()
}

// ── Cargar datos ──────────────────────────────────────────────────────────────
async function _cargarCategorias() {
    const { data } = await supabase
        .from('categorias').select('id_category, name').order('name')
    _categorias = data || []
}

async function _cargarProductos() {
    const { data } = await supabase
        .from('productos')
        .select('id, name, price, id_category, active, stock, subgrupo, variante_display')
        .order('name')
    _productos = data || []
}

async function _recargar() {
    await Promise.all([_cargarCategorias(), _cargarProductos()])
    _renderTabs()
    _renderTabla()
    _actualizarStats()
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function _actualizarStats() {
    const total    = _productos.length
    const activos  = _productos.filter(p => p.active).length
    const agotados = _productos.filter(p => p.stock === 0).length

    document.getElementById('stat-total').textContent    = total
    document.getElementById('stat-activos').textContent  = activos
    document.getElementById('stat-inactivos').textContent = total - activos
    document.getElementById('stat-agotados').textContent = agotados
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function _renderTabs() {
    const wrap = document.getElementById('ap-tabs')
    wrap.innerHTML = ''

    const mkTab = (label, id) => {
        const btn = document.createElement('button')
        btn.className = 'ap-tab' + (_catActiva === id ? ' active' : '')
        btn.textContent = label
        btn.addEventListener('click', () => {
            _catActiva = id
            _renderTabs()
            _renderTabla()
        })
        return btn
    }

    wrap.appendChild(mkTab('Todos', null))
    _categorias.forEach(c => wrap.appendChild(mkTab(c.name, c.id_category)))
}

// ── Tabla ─────────────────────────────────────────────────────────────────────
function _stockBadge(stock) {
    if (stock !== null && stock === 0)
        return '<span class="ap-stock ap-stock--agotado">Agotado</span>'
    return '<span class="ap-stock ap-stock--ok">Disponible</span>'
}

function _renderTabla() {
    const busqueda = document.getElementById('ap-search').value.trim().toLowerCase()

    let lista = _productos
    if (_catActiva !== null) lista = lista.filter(p => p.id_category === _catActiva)
    if (busqueda) {
        lista = lista.filter(p =>
            p.name.toLowerCase().includes(busqueda) ||
            (p.subgrupo || '').toLowerCase().includes(busqueda)
        )
    }

    const tbody = document.getElementById('ap-tbody')
    tbody.innerHTML = ''

    if (!lista.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="ap-empty-msg">Sin productos</td></tr>'
        return
    }

    const cm = catMap()
    lista.forEach(p => {
        const tr = document.createElement('tr')
        tr.className = 'ap-row' + (!p.active ? ' ap-row--inactivo' : '')
        tr.dataset.id = p.id
        tr.innerHTML = `
            <td>
                <span class="ap-nombre">${p.name}</span>
                ${p.subgrupo ? `<span class="ap-subgrupo">${p.subgrupo}</span>` : ''}
            </td>
            <td class="ap-td-cat">${cm[p.id_category] || '—'}</td>
            <td class="ap-td-precio">$${Number(p.price).toLocaleString('es-CO')}</td>
            <td class="ap-td-activo ap-toggle-cell">
                <label class="ap-toggle" title="${p.active ? 'Desactivar' : 'Activar'}">
                    <input type="checkbox" data-id="${p.id}" data-action="toggle-active"
                           ${p.active ? 'checked' : ''}>
                    <span class="ap-toggle__slider"></span>
                </label>
            </td>
            <td class="ap-td-stock">${_stockBadge(p.stock)}</td>
        `
        tbody.appendChild(tr)
    })
}

// ── Delegation ────────────────────────────────────────────────────────────────
document.getElementById('ap-tbody').addEventListener('click', e => {
    // Toggle activo inline — no abrir modal
    if (e.target.closest('[data-action="toggle-active"]')) return

    const tr = e.target.closest('.ap-row[data-id]')
    if (!tr) return
    const prod = _productos.find(p => String(p.id) === tr.dataset.id)
    if (prod) _abrirModal(prod)
})

document.getElementById('ap-tbody').addEventListener('change', async e => {
    const input = e.target.closest('input[data-action="toggle-active"]')
    if (!input) return

    const id     = Number(input.dataset.id)
    const activo = input.checked
    const tr     = input.closest('.ap-row')

    try {
        const { error } = await supabase
            .from('productos').update({ active: activo }).eq('id', id)
        if (error) throw error

        const idx = _productos.findIndex(p => p.id === id)
        if (idx !== -1) _productos[idx].active = activo

        tr?.classList.toggle('ap-row--inactivo', !activo)
        _actualizarStats()
        _mostrarToast(activo ? 'Producto activado' : 'Producto desactivado')
    } catch (err) {
        console.error('[adminProductos] toggle active:', err)
        input.checked = !activo   // revertir
        _mostrarToast('Error al guardar', true)
    }
})

// ── Modal ─────────────────────────────────────────────────────────────────────
function _abrirModal(prod) {
    _editando = { ...prod }

    document.getElementById('ap-mod-nombre').textContent    = 'Editar producto'
    document.getElementById('ap-mod-name').value            = prod.name
    document.getElementById('ap-mod-subgrupo').value        = prod.subgrupo || ''

    const catSel = document.getElementById('ap-mod-cat')
    catSel.innerHTML = _categorias.map(c =>
        `<option value="${c.id_category}"${c.id_category === prod.id_category ? ' selected' : ''}>${c.name}</option>`
    ).join('')

    document.getElementById('ap-mod-precio').value          = prod.price
    document.getElementById('ap-mod-activo').checked        = prod.active
    document.getElementById('ap-mod-agotado').checked       = prod.stock !== null && prod.stock === 0
    document.getElementById('ap-mod-error').style.display  = 'none'
    document.getElementById('ap-mod-guardar').disabled      = false
    document.getElementById('ap-mod-guardar').textContent   = 'Guardar cambios'

    document.getElementById('apModal').classList.add('open')
}

function _abrirModalNuevo() {
    _editando = {}  // sin id = modo creación

    document.getElementById('ap-mod-nombre').textContent    = 'Nuevo producto'
    document.getElementById('ap-mod-name').value            = ''
    document.getElementById('ap-mod-subgrupo').value        = ''

    const catSel = document.getElementById('ap-mod-cat')
    catSel.innerHTML = _categorias.map(c =>
        `<option value="${c.id_category}">${c.name}</option>`
    ).join('')

    document.getElementById('ap-mod-precio').value          = ''
    document.getElementById('ap-mod-activo').checked        = true
    document.getElementById('ap-mod-agotado').checked       = false
    document.getElementById('ap-mod-error').style.display  = 'none'
    document.getElementById('ap-mod-guardar').disabled      = false
    document.getElementById('ap-mod-guardar').textContent   = 'Crear producto'

    document.getElementById('apModal').classList.add('open')
}

function _cerrarModal() {
    document.getElementById('apModal').classList.remove('open')
    _editando = null
}

async function _guardarCambios() {
    if (!_editando) return

    const nombre      = document.getElementById('ap-mod-name').value.trim()
    const subgrupo    = document.getElementById('ap-mod-subgrupo').value.trim()
    const precio      = Number(document.getElementById('ap-mod-precio').value)
    const idCategoria = Number(document.getElementById('ap-mod-cat').value)
    const activo      = document.getElementById('ap-mod-activo').checked
    const agotado     = document.getElementById('ap-mod-agotado').checked

    const errorEl = document.getElementById('ap-mod-error')
    errorEl.style.display = 'none'

    if (!nombre) {
        errorEl.textContent   = 'El nombre es obligatorio.'
        errorEl.style.display = 'block'
        return
    }
    if (!precio || precio <= 0) {
        errorEl.textContent   = 'El precio debe ser mayor a 0.'
        errorEl.style.display = 'block'
        return
    }

    const stock   = agotado ? 0 : null
    const payload = { name: nombre, price: precio, id_category: idCategoria, active: activo, stock, subgrupo: subgrupo || null }

    const btnGuardar = document.getElementById('ap-mod-guardar')
    btnGuardar.disabled = true

    try {
        if (_editando.id) {
            // ── Actualizar existente ───────────────────────────
            const { data: updated, error } = await supabase
                .from('productos')
                .update(payload)
                .eq('id', _editando.id)
                .select('id, name, price, id_category, active, stock, subgrupo, variante_display')
            if (error) throw error
            if (!updated || updated.length === 0) throw new Error('Sin filas actualizadas — revisa RLS o permisos de columna.')

            const idx = _productos.findIndex(p => p.id === _editando.id)
            if (idx !== -1) _productos[idx] = updated[0]

            _cerrarModal()
            _renderTabla()
            _actualizarStats()
            _mostrarToast('Cambios guardados')
        } else {
            // ── Crear nuevo ────────────────────────────────────
            const { data: nuevo, error } = await supabase
                .from('productos')
                .insert(payload)
                .select('id, name, price, id_category, active, stock, subgrupo, variante_display')
            if (error) throw error

            _productos.push(nuevo[0])
            _cerrarModal()
            _renderTabla()
            _actualizarStats()
            _mostrarToast('Producto creado')
        }
    } catch (err) {
        console.error('[adminProductos] guardar:', err)
        errorEl.textContent   = err.message || 'Error al guardar.'
        errorEl.style.display = 'block'
        btnGuardar.disabled   = false
    }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let _toastTimer = null
function _mostrarToast(msg, esError = false) {
    const el = document.getElementById('ap-toast')
    el.textContent  = msg
    el.style.background = esError ? '#991b1b' : 'var(--ld-marron, #75473B)'
    el.classList.add('visible')
    clearTimeout(_toastTimer)
    _toastTimer = setTimeout(() => el.classList.remove('visible'), 2200)
}

// ── Listeners ─────────────────────────────────────────────────────────────────
document.getElementById('ap-search').addEventListener('input', _renderTabla)

document.getElementById('ap-btn-nuevo').addEventListener('click', _abrirModalNuevo)
document.getElementById('ap-btn-actualizar').addEventListener('click', _recargar)

document.getElementById('ap-mod-cerrar').addEventListener('click', _cerrarModal)
document.getElementById('apModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) _cerrarModal()
})
document.getElementById('ap-mod-guardar').addEventListener('click', _guardarCambios)


// ── Arrancar ──────────────────────────────────────────────────────────────────
init()
