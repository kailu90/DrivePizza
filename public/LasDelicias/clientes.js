/**
 * clientes.js — Módulo UI de clientes para Las Delicias.
 * Lazy-loaded desde pedidos.js al switchView('clientes').
 */

let _supabase = null
let _perfil   = null
let _clientes = []
let _query    = ''
let _pagina   = 1
let _total    = 0
let _inited   = false

const POR_PAGINA = 20

// ── Init ─────────────────────────────────────────────────────────────────────
export async function initClientes(supabase, perfil) {
    if (_inited) { await _cargar(); return }
    _inited   = true
    _supabase = supabase
    _perfil   = perfil

    document.getElementById('cli-search').addEventListener('input', e => {
        _query  = e.target.value.trim()
        _pagina = 1
        _cargar()
    })

    document.getElementById('cli-btn-actualizar').addEventListener('click', () => {
        _pagina = 1
        _cargar()
    })

    document.getElementById('modal-cli-cerrar').addEventListener('click', _cerrarModal)
    document.getElementById('modal-cli-bg').addEventListener('click', e => {
        if (e.target.id === 'modal-cli-bg') _cerrarModal()
    })

    await _cargar()
}

// ── Cargar desde servidor ─────────────────────────────────────────────────────
async function _cargar() {
    _setStatus('Cargando...')

    const offset  = (_pagina - 1) * POR_PAGINA
    const digitos = _query.replace(/\D/g, '')
    const esNum   = digitos.length >= 2

    let req = _supabase
        .from('clientes')
        .select('id, telefono, nombre, total_pedidos, updated_at', { count: 'exact' })
        .order('updated_at', { ascending: false })
        .range(offset, offset + POR_PAGINA - 1)

    if (_query) {
        if (esNum) req = req.ilike('telefono', `%${digitos}%`)
        else       req = req.ilike('nombre',   `%${_query}%`)
    }

    const { data, error, count } = await req

    if (error) { _setStatus('Error al cargar clientes.', true); return }

    _clientes = data || []
    _total    = count ?? 0

    _setStatus(_total ? `${_total} cliente${_total !== 1 ? 's' : ''}` : 'Sin clientes registrados.')
    _renderTabla()
    _renderPaginacion()
}

// ── Render tabla ──────────────────────────────────────────────────────────────
function _renderTabla() {
    const tbody = document.getElementById('cli-tbody')

    if (!_clientes.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="ld-cli-empty">Sin resultados</td></tr>`
        return
    }

    tbody.innerHTML = _clientes.map(c => `
        <tr data-id="${c.id}" class="ld-cli-tr">
            <td class="td-cli-nombre">${_esc(c.nombre || '—')}</td>
            <td class="td-cli-tel">${_esc(c.telefono)}</td>
            <td class="td-cli-count">${c.total_pedidos ?? 0}</td>
            <td class="td-cli-fecha">${c.updated_at ? _fmtFecha(c.updated_at) : '—'}</td>
        </tr>
    `).join('')

    tbody.querySelectorAll('tr[data-id]').forEach(tr => {
        tr.addEventListener('click', () => _abrirDetalle(Number(tr.dataset.id)))
    })
}

// ── Paginación ────────────────────────────────────────────────────────────────
function _renderPaginacion() {
    const el        = document.getElementById('cli-paginacion')
    const totalPags = Math.ceil(_total / POR_PAGINA)

    if (totalPags <= 1) { el.innerHTML = ''; return }

    el.innerHTML = `
        <button class="ld-cli-pag-btn" id="cli-pag-prev" ${_pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
        <span class="ld-cli-pag-info">Página ${_pagina} de ${totalPags}</span>
        <button class="ld-cli-pag-btn" id="cli-pag-next" ${_pagina >= totalPags ? 'disabled' : ''}>Siguiente →</button>
    `
    el.querySelector('#cli-pag-prev')?.addEventListener('click', () => { _pagina--; _cargar() })
    el.querySelector('#cli-pag-next')?.addEventListener('click', () => { _pagina++; _cargar() })
}

// ── Modal detalle ─────────────────────────────────────────────────────────────
async function _abrirDetalle(id) {
    const cliente = _clientes.find(c => c.id === id)
    if (!cliente) return

    document.getElementById('modal-cli-nombre').textContent = cliente.nombre || '—'
    document.getElementById('modal-cli-tel').textContent    = cliente.telefono
    document.getElementById('modal-cli-pedidos-list').innerHTML =
        '<p class="ld-cli-loading">Cargando...</p>'
    document.getElementById('modal-cli-dirs-list').innerHTML =
        '<p class="ld-cli-loading">Cargando...</p>'
    document.getElementById('modal-cli-bg').style.display = 'flex'

    // Cargar pedidos y direcciones en paralelo
    const [resPedidos, resDirs] = await Promise.all([
        _supabase
            .from('pedidos_callcenter')
            .select('n_pedido, fecha, estado, total, direccion, barrio')
            .eq('telefono', cliente.telefono)
            .order('fecha', { ascending: false })
            .limit(15),
        _supabase
            .from('direcciones_cliente')
            .select('direccion, barrio, predeterminada')
            .eq('cliente_id', id)
            .order('predeterminada', { ascending: false })
            .order('created_at',     { ascending: false }),
    ])

    // Pedidos
    const pedidos = resPedidos.data || []
    document.getElementById('modal-cli-pedidos-list').innerHTML = pedidos.length
        ? pedidos.map(p => `
            <div class="ld-cli-ped-row">
                <div class="ld-cli-ped-left">
                    <span class="ld-cli-ped-num">#${_esc(String(p.n_pedido || '—'))}</span>
                    <span class="ld-cli-ped-dir">${_esc(p.barrio || p.direccion || '—')}</span>
                </div>
                <div class="ld-cli-ped-right">
                    <span class="ld-cli-estado ld-cli-estado--${_estadoCls(p.estado)}">${_esc(p.estado || '—')}</span>
                    <span class="ld-cli-ped-total">$${Number(p.total || 0).toLocaleString('es-CO')}</span>
                    <span class="ld-cli-ped-fecha">${p.fecha ? _fmtFecha(p.fecha) : '—'}</span>
                </div>
            </div>
        `).join('')
        : '<p class="ld-cli-loading">Sin pedidos.</p>'

    // Direcciones
    const dirs = resDirs.data || []
    document.getElementById('modal-cli-dirs-list').innerHTML = dirs.length
        ? dirs.map(d => `
            <div class="ld-cli-dir-row">
                <span class="ld-cli-dir-txt">${_esc(d.direccion)}${d.barrio ? ` — ${_esc(d.barrio)}` : ''}</span>
                ${d.predeterminada ? '<span class="ld-cli-dir-badge">Principal</span>' : ''}
            </div>
        `).join('')
        : '<p class="ld-cli-loading">Sin direcciones guardadas.</p>'
}

function _cerrarModal() {
    document.getElementById('modal-cli-bg').style.display = 'none'
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _setStatus(msg, esError = false) {
    const el = document.getElementById('cli-status')
    if (!el) return
    el.textContent = msg
    el.style.color = esError ? '#c0392b' : ''
}

function _fmtFecha(str) {
    if (!str) return '—'
    const d = new Date(str.includes('T') ? str : str + 'T12:00:00')
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function _estadoCls(estado) {
    return (estado || '').toLowerCase().replace(/ /g, '-').replace(/[^a-z-]/g, '')
}

function _esc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
