/**
 * barrios.js — Módulo CRUD de barrios de domicilio para Las Delicias.
 * Inicializado lazily desde pedidos.js cuando el usuario navega a la vista 'barrios'.
 * Tabla: lasdelicias.barrios  (id, nombre, sede_id text, valor, activo, created_at)
 */

let _supabase    = null
let _perfil      = null
let _isEditor    = false
let _sede        = ''        // sede_id activo (name.toLowerCase())
let _barrios     = []
let _query       = ''
let _toastTimer  = null
let _detId       = null      // id del barrio en modal-detalle

export async function initBarrios(supabase, perfil) {
    _supabase = supabase
    _perfil   = perfil
    _isEditor = ['admin', 'panaderias-admin'].includes(perfil.rol)

    // Sede del usuario
    _sede = (perfil.sede || '').toLowerCase()
    document.getElementById('barrios-titulo').textContent = _cap(perfil.sede || _sede)

    // Ocultar botón agregar si no es editor
    document.getElementById('btn-agregar-barrio').style.display = _isEditor ? '' : 'none'

    // ── Búsqueda ─────────────────────────────────────────────────────────
    document.getElementById('barrios-search').addEventListener('input', e => {
        _query = e.target.value.toLowerCase().trim()
        _renderTabla()
    })

    // ── Modal agregar ─────────────────────────────────────────────────────
    document.getElementById('btn-agregar-barrio').addEventListener('click', _abrirModalAgregar)
    document.getElementById('btn-cerrar-modal-barrio').addEventListener('click', _cerrarModalAgregar)
    document.getElementById('btn-cancelar-modal-barrio').addEventListener('click', _cerrarModalAgregar)
    document.getElementById('modal-agregar-barrio').addEventListener('click', e => {
        if (e.target.id === 'modal-agregar-barrio') _cerrarModalAgregar()
    })
    document.getElementById('btn-guardar-modal-barrio').addEventListener('click', _guardarNuevo)
    document.getElementById('modal-barrio-nombre').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('modal-barrio-valor').focus()
    })
    document.getElementById('modal-barrio-valor').addEventListener('keydown', e => {
        if (e.key === 'Enter') _guardarNuevo()
    })

    // ── Modal detalle ─────────────────────────────────────────────────────
    document.getElementById('btn-cerrar-modal-detalle').addEventListener('click', _cerrarModalDetalle)
    document.getElementById('modal-det-cancelar').addEventListener('click', _cerrarModalDetalle)
    document.getElementById('modal-det-guardar').addEventListener('click', _guardarDetalle)
    document.getElementById('modal-detalle-barrio').addEventListener('click', e => {
        if (e.target.id === 'modal-detalle-barrio') _cerrarModalDetalle()
    })
    document.getElementById('modal-det-eliminar').addEventListener('click', async () => {
        const item = _barrios.find(b => b.id === _detId)
        if (!item || !confirm(`¿Eliminar "${item.nombre}"?`)) return
        _cerrarModalDetalle()
        await _eliminar(_detId)
    })
    document.getElementById('modal-det-barrio').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('modal-det-valor').focus()
    })
    document.getElementById('modal-det-valor').addEventListener('keydown', e => {
        if (e.key === 'Enter') _guardarDetalle()
    })

    _cargarSede(_sede)
}

// ── Cargar barrios de una sede ──────────────────────────────────────────────────
async function _cargarSede(sede) {
    _setStatus('Cargando...', '')
    const { data, error } = await _supabase
        .from('barrios')
        .select('id, nombre, valor, activo')
        .eq('sede_id', sede)
        .order('nombre')

    if (error) { _setStatus('Error al cargar barrios.', 'error'); return }
    _barrios = data ?? []
    _setStatus(_barrios.length ? `${_barrios.length} barrio${_barrios.length !== 1 ? 's' : ''}` : 'Sin barrios registrados.', '')
    _renderTabla()
}

// ── Render tabla ────────────────────────────────────────────────────────────────
function _renderTabla() {
    const tbody = document.getElementById('barrios-tbody')
    const filtrados = _barrios.filter(b =>
        !_query || b.nombre.toLowerCase().includes(_query)
    )

    if (!filtrados.length) {
        tbody.innerHTML = `<tr><td colspan="3" class="ld-barrios-empty">Sin resultados</td></tr>`
        return
    }

    tbody.innerHTML = filtrados.map(b => `
        <tr data-id="${b.id}" class="ld-barrios-tr">
            <td class="td-nom">${_esc(b.nombre)}</td>
            <td class="td-val">$${Number(b.valor).toLocaleString('es-CO')}</td>
            <td class="td-act">
                <span class="ld-barrios-badge${b.activo ? ' ld-barrios-badge--on' : ''}">${b.activo ? 'Activo' : 'Inactivo'}</span>
            </td>
        </tr>
    `).join('')

    tbody.querySelectorAll('tr[data-id]').forEach(tr => {
        tr.addEventListener('click', () => _abrirModalDetalle(Number(tr.dataset.id)))
    })
}

// ── Modal agregar ───────────────────────────────────────────────────────────────
function _abrirModalAgregar() {
    document.getElementById('modal-barrio-nombre').value = ''
    document.getElementById('modal-barrio-valor').value  = ''
    document.getElementById('modal-barrio-sede-label').textContent = document.getElementById('barrios-titulo').textContent
    document.getElementById('modal-agregar-barrio').style.display = 'flex'
    document.getElementById('modal-barrio-nombre').focus()
}

function _cerrarModalAgregar() {
    document.getElementById('modal-agregar-barrio').style.display = 'none'
}

async function _guardarNuevo() {
    const nombre = document.getElementById('modal-barrio-nombre').value.trim()
    const valor  = parseInt(document.getElementById('modal-barrio-valor').value, 10)

    if (!nombre)                      { alert('El nombre del barrio no puede estar vacío.'); return }
    if (isNaN(valor) || valor < 0)    { alert('Ingresa un valor de domicilio válido.'); return }
    if (valor > 100000)               { alert('Valor de domicilio muy alto, verifica.'); return }

    const btn = document.getElementById('btn-guardar-modal-barrio')
    btn.disabled = true

    const { data, error } = await _supabase
        .from('barrios')
        .insert({ sede_id: _sede, nombre, valor, activo: true })
        .select('id, nombre, valor, activo')
        .single()

    btn.disabled = false

    if (error) {
        const msg = error.code === '23505' ? 'Ya existe ese barrio en esta sede.' : 'Error al guardar.'
        _setStatus(msg, 'error')
        return
    }

    _cerrarModalAgregar()
    _barrios.push(data)
    _barrios.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    _setStatus('Barrio agregado.', 'ok')
    _toast(`"${nombre}" agregado correctamente`)
    _renderTabla()
}

// ── Modal detalle / edición ─────────────────────────────────────────────────────
function _abrirModalDetalle(id) {
    const item = _barrios.find(b => b.id === id)
    if (!item) return
    _detId = id

    document.getElementById('modal-det-sede').textContent    = _cap(_sede)
    document.getElementById('modal-det-barrio').value        = item.nombre
    document.getElementById('modal-det-valor').value         = item.valor
    document.getElementById('modal-det-activo').checked      = item.activo

    // Controles de escritura solo para editores
    const writeEls = ['modal-det-eliminar', 'modal-det-guardar', 'modal-det-cancelar']
    writeEls.forEach(elId => {
        const el = document.getElementById(elId)
        if (el) el.style.display = _isEditor ? '' : 'none'
    })
    ;['modal-det-barrio', 'modal-det-valor', 'modal-det-activo'].forEach(elId => {
        const el = document.getElementById(elId)
        if (el) el.disabled = !_isEditor
    })

    document.getElementById('modal-detalle-barrio').style.display = 'flex'
    if (_isEditor) document.getElementById('modal-det-barrio').focus()
}

function _cerrarModalDetalle() {
    document.getElementById('modal-detalle-barrio').style.display = 'none'
    _detId = null
}

async function _guardarDetalle() {
    const id     = _detId
    const nombre = document.getElementById('modal-det-barrio').value.trim()
    const valor  = parseInt(document.getElementById('modal-det-valor').value, 10)
    const activo = document.getElementById('modal-det-activo').checked

    if (!nombre)                   { alert('El nombre del barrio no puede estar vacío.'); return }
    if (isNaN(valor) || valor < 0) { alert('Ingresa un valor de domicilio válido.'); return }
    if (valor > 100000)            { alert('Valor de domicilio muy alto, verifica.'); return }

    _setStatus('Guardando...', '')
    const { error } = await _supabase
        .from('barrios')
        .update({ nombre, valor, activo })
        .eq('id', id)

    if (error) { _setStatus('Error al guardar.', 'error'); return }

    const idx = _barrios.findIndex(b => b.id === id)
    if (idx >= 0) _barrios[idx] = { ..._barrios[idx], nombre, valor, activo }
    _barrios.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

    _cerrarModalDetalle()
    _setStatus('Guardado.', 'ok')
    _toast(`"${nombre}" actualizado`)
    _renderTabla()
}

// ── Eliminar ─────────────────────────────────────────────────────────────────────
async function _eliminar(id) {
    const item = _barrios.find(b => b.id === id)
    if (!item) return

    const { error } = await _supabase.from('barrios').delete().eq('id', id)
    if (error) { _setStatus('Error al eliminar.', 'error'); return }

    _barrios = _barrios.filter(b => b.id !== id)
    _setStatus('Eliminado.', 'ok')
    _toast(`"${item.nombre}" eliminado`)
    _renderTabla()
}

// ── Helpers ───────────────────────────────────────────────────────────────────────
function _setStatus(msg, cls) {
    const el = document.getElementById('barrios-status')
    if (!el) return
    el.textContent = msg
    el.className   = 'ld-barrios-status' + (cls ? ` ld-barrios-status--${cls}` : '')
}

function _toast(msg) {
    const el = document.getElementById('barrios-toast')
    if (!el) return
    el.textContent = msg
    el.classList.add('visible')
    clearTimeout(_toastTimer)
    _toastTimer = setTimeout(() => el.classList.remove('visible'), 3000)
}

function _cap(str) {
    if (!str) return ''
    return str.charAt(0).toUpperCase() + str.slice(1)
}

function _esc(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}
