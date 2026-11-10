/**
 * LasDelicias/waPanel.js
 * Panel WA omnicanal slim — Las Delicias
 * Uso: import { initWaPanel } from './waPanel.js'
 *      initWaPanel({ asesor: 'nombre', authToken: '...' })
 *
 * Monta la lista en #waList (dentro de #wa-panel → .wa-panel__left → #wa-body).
 * Inyecta #ldwap-chat-col como segundo hijo flex de #wa-panel.
 */
import { HETZNER_URL, WS_URL } from '../Api/config.js'

// ── Colores por sesión ────────────────────────────────────────────────────────
const SESSION_COLORS = [
    '#15803d', '#16a34a', '#25D366', '#4ade80',
    '#1d4ed8', '#3b82f6', '#0088cc', '#06b6d4',
    '#7c3aed', '#8b5cf6', '#be123c', '#ef4444',
    '#c2410c', '#f97316', '#0d9488', '#14b8a6',
]

// ── Estado ────────────────────────────────────────────────────────────────────
const _state = {
    sesiones:      [],   // [{ numero, sede, status, color }]
    conv:          {},   // { [numero]: { [phone]: { msgs, unread, lastMsg, lastTs, nombre } } }
    asignaciones:  {},   // { 'numero:phone': { asesor, estado } }
    activeNum:     null,
    activeContact: null,
    filtroChip:    'todos',  // 'todos' | 'pendientes'
}

let _asesorActual = ''
let _authToken    = ''
let _ws           = null
let _wsRetry      = 0
let _wsEverConn   = false
let _chatCol      = null    // div #ldwap-chat-col inyectado una sola vez

const LS_CONV = 'ldwap_conv_v1'
const LS_SES  = 'ldwap_ses_v1'
const LS_ASIG = 'ldwap_asig_v1'

// ── Helpers de estado ─────────────────────────────────────────────────────────
function _getAsig(num, phone) {
    return _state.asignaciones[`${num}:${phone}`]
}
function _getEstado(num, phone) {
    const a = _getAsig(num, phone)
    return a ? (a.estado || 'asignado') : 'en_espera'
}
function _esMio(num, phone) {
    return _getAsig(num, phone)?.asesor === _asesorActual
}

// ── Helpers de formato ────────────────────────────────────────────────────────
function _fmtPhone(raw) {
    const n = String(raw || '').replace(/\D/g, '')
    if (n.startsWith('57') && n.length === 12) return `+57 ${n.slice(2, 5)} ${n.slice(5, 8)} ${n.slice(8)}`
    if (n.length === 10) return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`
    return raw
}

function _initials(nameOrPhone) {
    const s = String(nameOrPhone || '').trim()
    if (/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(s)) {
        return s.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
    }
    return s.replace(/\D/g, '').slice(-2) || '??'
}

function _fmtTs(ts) {
    const ms  = typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts
    const d   = new Date(ms)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })
}

function _dateLabelChat(ts) {
    const ms  = typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts
    const d   = new Date(ms)
    const now = new Date()
    const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(+today - 86400000)
    const itemDay   = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    if (+itemDay === +today)     return 'Hoy'
    if (+itemDay === +yesterday) return 'Ayer'
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })
}

function _esc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function _getColor(numero) {
    const s = _state.sesiones.find(x => x.numero === numero)
    if (s?.color) return s.color
    const hash = [...String(numero)].reduce((acc, c) => acc + c.charCodeAt(0), 0)
    return SESSION_COLORS[hash % SESSION_COLORS.length]
}

function _textContrast(hex) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#1f2937' : '#ffffff'
}

// ── Cache localStorage ────────────────────────────────────────────────────────
function _saveConv() {
    try { localStorage.setItem(LS_CONV, JSON.stringify(_state.conv)) } catch {}
}
function _loadConvCache() {
    try { const r = localStorage.getItem(LS_CONV); if (r) _state.conv = JSON.parse(r) } catch {}
}
function _saveAsig() {
    try { localStorage.setItem(LS_ASIG, JSON.stringify(_state.asignaciones)) } catch {}
}

// ── Cargar datos desde backend ────────────────────────────────────────────────
async function _loadSessions() {
    try {
        const r = await fetch(`${HETZNER_URL}/ld/wa/sesiones`)
        if (!r.ok) return
        const data = await r.json()
        _state.sesiones = data
        try { localStorage.setItem(LS_SES, JSON.stringify(data)) } catch {}
        _renderList()
    } catch {}
}

async function _loadConversaciones() {
    try {
        const r = await fetch(`${HETZNER_URL}/ld/wa/conversaciones`)
        if (!r.ok) return
        const convs = await r.json()
        if (!Array.isArray(convs)) return

        const newConv = {}
        for (const c of convs) {
            const { numero, contacto, nombre, ultimo_mensaje, ultimo_ts } = c
            if (!numero || !contacto) continue
            if (contacto.includes('@')) continue
            if (!ultimo_mensaje && !ultimo_ts) continue

            if (!newConv[numero]) newConv[numero] = {}
            const prev = _state.conv[numero]?.[contacto] || {}
            newConv[numero][contacto] = {
                msgs:    prev.msgs?.length ? prev.msgs : [],
                unread:  prev.unread || 0,
                nombre:  nombre || prev.nombre || null,
                lastMsg: ultimo_mensaje || prev.lastMsg || '',
                lastTs:  ultimo_ts      || prev.lastTs  || 0,
            }
        }

        // Preservar convs recientes no confirmadas aún en BD (race condition WS ~2 min)
        for (const [num, contactos] of Object.entries(_state.conv)) {
            for (const [phone, data] of Object.entries(contactos)) {
                if (!newConv[num]?.[phone] && data.lastTs > (Date.now() / 1000 - 120)) {
                    if (_state.asignaciones[`${num}:${phone}`]?.estado === 'resuelto') continue
                    if (!newConv[num]) newConv[num] = {}
                    newConv[num][phone] = data
                }
            }
        }

        _state.conv = newConv
        _saveConv()
        _renderList()
    } catch {}
}

async function _loadAsignaciones() {
    try {
        const r = await fetch(`${HETZNER_URL}/ld/wa/asignaciones`)
        if (!r.ok) return
        const data = await r.json()
        _state.asignaciones = {}
        for (const a of data) {
            _state.asignaciones[`${a.numero}:${a.contacto}`] = {
                asesor: a.asesor,
                estado: a.estado || 'asignado',
            }
        }
        _saveAsig()
        _renderList()
    } catch {}
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
function _connectWs() {
    _ws = new WebSocket(WS_URL)

    _ws.onopen = () => {
        _wsRetry = 0
        if (_wsEverConn) {
            Promise.all([_loadConversaciones(), _loadAsignaciones()])
                .then(() => _renderList())
        }
        _wsEverConn = true
    }

    _ws.onmessage = e => {
        try {
            const msg = JSON.parse(e.data)
            // Evento global sin tenant
            if (msg.tipo === 'nueva-version') {
                const s = msg.scope
                if (!s || s === 'all' || s === 'lasdelicias') {
                    document.getElementById('banner-nueva-version').style.display = 'block'
                }
                return
            }
            // Solo eventos etiquetados explícitamente para Las Delicias
            if (msg.tenant !== 'lasdelicias') return
            if (msg.tipo === 'wa:mensaje')    _onMensaje(msg)
            if (msg.tipo === 'wa:status')     _onStatus(msg)
            if (msg.tipo === 'wa:qr')         _onQr(msg)
            if (msg.tipo === 'wa:asignacion') _onAsignacion(msg)
            if (msg.tipo === 'wa:liberacion') _onLiberacion(msg)
            if (msg.tipo === 'wa:estado')     _onEstado(msg)
        } catch (err) { console.error('[ldwap WS]', err, e.data) }
    }

    _ws.onclose = () => {
        const delay = Math.min(1000 * 2 ** _wsRetry, 30_000)
        _wsRetry++
        setTimeout(_connectWs, delay)
    }
    _ws.onerror = () => {}
}

// ── WS Event Handlers ─────────────────────────────────────────────────────────
function _onMensaje({ numero, remitente, fromMe, pushName, texto, timestamp, asesor, tipoMensaje, msgId }) {
    if (!remitente) return
    const suffix = remitente.split('@')[1] || ''
    if (suffix !== 's.whatsapp.net' && suffix !== 'lid') return

    const phone = remitente.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '')
    if (!phone) return

    if (!_state.conv[numero]) _state.conv[numero] = {}
    if (!_state.conv[numero][phone]) {
        _state.conv[numero][phone] = { msgs: [], unread: 0, lastMsg: '', lastTs: 0, nombre: null }
    }

    const c   = _state.conv[numero][phone]
    const out = !!fromMe
    if (pushName && !out && !c.nombre) c.nombre = pushName

    // Dedup / confirmar mensajes salientes
    if (out && msgId) {
        // Si ya existe un mensaje con ese msgId, solo re-renderizar
        const byId = c.msgs.find(m => m.msgId === msgId)
        if (byId) {
            _saveConv()
            if (_state.activeContact === phone && _state.activeNum === numero) _renderMsgs()
            return
        }
        // Si hay un optimista pendiente con el mismo texto, confirmarlo en vez de duplicar
        const pendingIdx = c.msgs.findIndex(m => m.pending && m.out && m.text === texto)
        if (pendingIdx !== -1) {
            c.msgs[pendingIdx].msgId   = msgId
            c.msgs[pendingIdx].pending = false
            c.msgs[pendingIdx].ts      = timestamp || c.msgs[pendingIdx].ts
            _saveConv()
            if (_state.activeContact === phone && _state.activeNum === numero) _renderMsgs()
            return
        }
    }

    c.msgs.push({
        text:  texto,
        ts:    timestamp || Math.floor(Date.now() / 1000),
        out,
        asesor: asesor || null,
        tipo:   tipoMensaje || 'mensaje',
        msgId:  msgId || null,
    })
    c.lastMsg = texto
    c.lastTs  = timestamp || Math.floor(Date.now() / 1000)

    const isActive = _state.activeContact === phone && _state.activeNum === numero
    if (!isActive && !out) c.unread++

    _saveConv()
    _renderList()
    if (isActive) _renderMsgs()

    // Audio solo para mensajes entrantes
    if (!out) {
        try {
            const notif = new Audio('../Audio/notificacion-wa.mp3')
            notif.volume = 0.6
            notif.play().catch(() => {})
        } catch {}
    }
}

function _onStatus({ numero, sede, status }) {
    const idx = _state.sesiones.findIndex(s => s.numero === numero)
    if (idx === -1) {
        if (status !== 'desconectado') _state.sesiones.push({ numero, sede: sede || '', status })
    } else {
        _state.sesiones[idx].status = status
    }
    // Cerrar modal QR cuando la sesión se conecta
    if (status === 'conectado') {
        const modal = document.getElementById('ldwap-qr-modal')
        if (modal) modal.style.display = 'none'
    }
    _renderList()
}

function _onAsignacion({ numero, contacto, asesor }) {
    _state.asignaciones[`${numero}:${contacto}`] = { asesor, estado: 'asignado' }
    _saveAsig()
    _renderList()
    if (_state.activeContact === contacto && _state.activeNum === numero) _renderChatActions()
}

function _onLiberacion({ numero, contacto }) {
    delete _state.asignaciones[`${numero}:${contacto}`]
    _saveAsig()
    _renderList()
    if (_state.activeContact === contacto && _state.activeNum === numero) _renderChatActions()
}

function _onEstado({ numero, contacto, estado, asesor }) {
    const key = `${numero}:${contacto}`
    if (_state.asignaciones[key]) {
        _state.asignaciones[key].estado = estado
        if (asesor) _state.asignaciones[key].asesor = asesor
    } else if (estado !== 'en_espera') {
        _state.asignaciones[key] = { asesor: asesor || '', estado }
    }
    _saveAsig()
    _renderList()
    if (_state.activeContact === contacto && _state.activeNum === numero) _renderChatActions()
}

// ── Render lista de conversaciones ────────────────────────────────────────────
function _renderList() {
    const el = document.getElementById('waList')
    if (!el) return

    const sesActivas = new Set(_state.sesiones.map(s => s.numero))
    const all = []
    for (const [num, convs] of Object.entries(_state.conv)) {
        if (sesActivas.size > 0 && !sesActivas.has(num)) continue
        for (const [phone, data] of Object.entries(convs)) {
            if (phone === num) continue
            all.push({ num, phone, data })
        }
    }

    const filtered = all
        .filter(({ num, phone }) => {
            const estado = _getEstado(num, phone)
            const asig   = _getAsig(num, phone)
            if (_state.filtroChip === 'pendientes') return estado === 'en_espera'
            // Todos: en espera + los míos + resueltos míos
            if (estado === 'en_espera') return true
            if (asig?.asesor === _asesorActual) return true
            return false
        })
        .sort((a, b) => b.data.lastTs - a.data.lastTs)

    // Badge global de no leídos
    const totalUnread = filtered.reduce((s, { data }) => s + (data.unread || 0), 0)
    _updateBadge(totalUnread)

    if (!filtered.length) {
        const noSes = _state.sesiones.length === 0
        el.innerHTML = `<div class="ldwap-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span>${noSes ? 'Sin sesiones activas' : 'Sin conversaciones'}</span>
            ${noSes ? `<button class="ldwap-conectar-btn" id="ldwap-conectar">Conectar WhatsApp</button>` : ''}
        </div>`
        if (noSes) {
            document.getElementById('ldwap-conectar')?.addEventListener('click', _conectarSesion)
        }
        return
    }

    el.innerHTML = filtered.map(({ num, phone, data }) => {
        const color    = _getColor(num)
        const display  = data.nombre || _fmtPhone(phone)
        const ini      = _initials(display)
        const estado   = _getEstado(num, phone)
        const asig     = _getAsig(num, phone)
        const isActive = _state.activeNum === num && _state.activeContact === phone
        const activeCls = isActive ? ' ldwap-row--active' : ''
        const unreadBadge = data.unread ? `<span class="ldwap-unread">${data.unread}</span>` : ''
        const ts = data.lastTs ? _fmtTs(data.lastTs) : ''
        const estadoTag = estado === 'en_espera'
            ? `<span class="ldwap-tag ldwap-tag--espera">Espera</span>`
            : estado === 'resuelto'
                ? `<span class="ldwap-tag ldwap-tag--resuelto">Resuelto</span>`
                : asig ? `<span class="ldwap-tag ldwap-tag--asig">${_esc(asig.asesor)}</span>` : ''

        return `<div class="ldwap-row${activeCls}" data-num="${_esc(num)}" data-phone="${_esc(phone)}">
            <div class="ldwap-avatar" style="background:${color};color:${_textContrast(color)}">${ini}</div>
            <div class="ldwap-row-body">
                <div class="ldwap-row-top">
                    <span class="ldwap-row-name">${_esc(display)}</span>
                    <span class="ldwap-row-ts">${ts}</span>
                </div>
                <div class="ldwap-row-bot">
                    <span class="ldwap-row-last">${_esc((data.lastMsg || '').slice(0, 42))}</span>
                    ${unreadBadge}
                </div>
                <div class="ldwap-row-tags">${estadoTag}</div>
            </div>
        </div>`
    }).join('')

    // Event delegation sobre la lista
    el.querySelectorAll('.ldwap-row').forEach(row => {
        row.addEventListener('click', () => _openChat(row.dataset.num, row.dataset.phone))
    })
}

// ── QR modal ──────────────────────────────────────────────────────────────────
function _onQr({ numero, qr }) {
    // Crear modal si no existe
    let modal = document.getElementById('ldwap-qr-modal')
    if (!modal) {
        modal = document.createElement('div')
        modal.id = 'ldwap-qr-modal'
        modal.innerHTML = `
            <div class="ldwap-qr-box">
                <div class="ldwap-qr-hdr">
                    <span>Escanea con WhatsApp</span>
                    <button id="ldwap-qr-close">✕</button>
                </div>
                <p class="ldwap-qr-hint">Abre WhatsApp → ⋮ → Dispositivos vinculados → Vincular dispositivo</p>
                <img id="ldwap-qr-img" src="" alt="QR Code">
                <p class="ldwap-qr-num" id="ldwap-qr-num"></p>
            </div>
        `
        document.body.appendChild(modal)
        document.getElementById('ldwap-qr-close').addEventListener('click', () => {
            modal.style.display = 'none'
        })
        modal.addEventListener('click', e => {
            if (e.target === modal) modal.style.display = 'none'
        })
    }
    document.getElementById('ldwap-qr-img').src = qr
    document.getElementById('ldwap-qr-num').textContent = `Número: ${numero}`
    modal.style.display = 'flex'
}

async function _conectarSesion() {
    const numero = prompt('Número WhatsApp (con código de país, sin +):\nEjemplo: 573001234567')
    if (!numero?.trim()) return
    const sede   = prompt('Sede (ej: delicias de pinares):') || ''
    try {
        const r = await fetch(`${HETZNER_URL}/ld/wa/sesiones`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ numero: numero.trim(), sede }),
        })
        if (!r.ok) { alert('Error al iniciar sesión'); return }
        alert('Sesión iniciando — el QR aparecerá en segundos')
    } catch {
        alert('Error de conexión con el backend')
    }
}

function _updateBadge(count) {
    const el = document.getElementById('wa-badge')
    if (!el) return
    if (count > 0) {
        el.textContent = count > 99 ? '99+' : count
        el.classList.add('visible')
    } else {
        el.classList.remove('visible')
    }
}

// ── Chat col ──────────────────────────────────────────────────────────────────
function _ensureChatCol() {
    if (_chatCol) return

    _chatCol = document.createElement('div')
    _chatCol.id = 'ldwap-chat-col'
    _chatCol.innerHTML = `
        <div class="ldwap-chat-hdr">
            <button class="ldwap-chat-back" id="ldwap-chat-back" title="Cerrar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 12H5M12 5l-7 7 7 7"/>
                </svg>
            </button>
            <div class="ldwap-chat-hdr-info">
                <span class="ldwap-chat-name" id="ldwap-chat-name"></span>
                <span class="ldwap-chat-num"  id="ldwap-chat-num"></span>
            </div>
        </div>
        <div class="ldwap-chat-actions" id="ldwap-chat-actions"></div>
        <div class="ldwap-chat-msgs" id="ldwap-chat-msgs"></div>
        <div class="ldwap-chat-footer">
            <textarea class="ldwap-chat-input" id="ldwap-chat-input" placeholder="Escribe un mensaje..." rows="1"></textarea>
            <button class="ldwap-chat-send" id="ldwap-chat-send" title="Enviar">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
        </div>
    `

    // Insertar dentro de #wa-panel (sibling de .wa-panel__left)
    const panel = document.getElementById('wa-panel')
    panel?.appendChild(_chatCol)

    // Listeners
    document.getElementById('ldwap-chat-back').addEventListener('click', _closeChat)

    document.getElementById('ldwap-chat-send').addEventListener('click', () => {
        const inp = document.getElementById('ldwap-chat-input')
        const txt = inp.value.trim()
        if (!txt) return
        inp.value = ''
        inp.style.height = ''
        _sendMsg(txt)
    })

    document.getElementById('ldwap-chat-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            document.getElementById('ldwap-chat-send').click()
        }
    })

    document.getElementById('ldwap-chat-input').addEventListener('input', e => {
        e.target.style.height = ''
        e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'
    })
}

function _openChat(num, phone) {
    _ensureChatCol()
    _state.activeNum     = num
    _state.activeContact = phone

    // Marcar leídas
    const c = _state.conv[num]?.[phone]
    if (c) { c.unread = 0; _saveConv() }

    // Actualizar header del chat
    const display = c?.nombre || _fmtPhone(phone)
    document.getElementById('ldwap-chat-name').textContent = display
    document.getElementById('ldwap-chat-num').textContent  = _fmtPhone(num)

    _chatCol.classList.add('open')
    document.getElementById('wa-panel')?.classList.add('expanded', 'has-chat')
    document.getElementById('pan-wrap')?.classList.add('wa-expanded', 'has-chat')

    _renderChatActions()
    _renderMsgs()
    _renderList()
    _loadMsgsIfNeeded(num, phone)
}

function _closeChat() {
    _state.activeContact = null
    _state.activeNum     = null
    if (_chatCol) _chatCol.classList.remove('open')
    document.getElementById('wa-panel')?.classList.remove('has-chat')
    document.getElementById('pan-wrap')?.classList.remove('has-chat')
    _renderList()
}

function _renderMsgs() {
    const el = document.getElementById('ldwap-chat-msgs')
    if (!el) { console.warn('[ldwap] _renderMsgs: #ldwap-chat-msgs no encontrado'); return }
    const { activeNum: num, activeContact: phone } = _state
    if (!num || !phone) { console.warn('[ldwap] _renderMsgs: activeNum/activeContact nulos'); return }

    const msgs = _state.conv[num]?.[phone]?.msgs || []
    console.log('[ldwap] _renderMsgs', { num, phone, msgCount: msgs.length })

    if (!msgs.length) {
        el.innerHTML = '<div class="ldwap-msgs-empty">Sin mensajes aún</div>'
        return
    }

    let lastDay = null
    const html  = msgs.map(m => {
        const ms  = typeof m.ts === 'number' && m.ts < 1e12 ? m.ts * 1000 : m.ts
        const day = new Date(ms).toDateString()
        const sep = day !== lastDay
            ? `<div class="ldwap-day-sep"><span>${_dateLabelChat(m.ts)}</span></div>`
            : ''
        lastDay = day

        const side  = m.out ? 'ldwap-msg--out' : 'ldwap-msg--in'
        const tsHr  = new Date(ms).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
        const aLabel = m.out && m.asesor
            ? `<span class="ldwap-msg-asesor">${_esc(m.asesor)}</span>`
            : ''
        const pend  = m.pending ? ' ldwap-msg--pending' : ''

        return `${sep}<div class="ldwap-msg ${side}${pend}">
            ${aLabel}
            <div class="ldwap-msg-bubble">${_esc(m.text || '')}</div>
            <span class="ldwap-msg-ts">${tsHr}</span>
        </div>`
    }).join('')

    el.innerHTML = html
    el.scrollTop = el.scrollHeight
}

function _renderChatActions() {
    const el = document.getElementById('ldwap-chat-actions')
    if (!el) return
    const { activeNum: num, activeContact: phone } = _state
    if (!num || !phone) return

    const estado = _getEstado(num, phone)
    const asig   = _getAsig(num, phone)

    let html = ''
    if (estado === 'en_espera') {
        html = `<button class="ldwap-act-btn ldwap-act-btn--tomar" data-action="tomar">Tomar chat</button>`
    } else if (estado === 'asignado' && _esMio(num, phone)) {
        html = `<button class="ldwap-act-btn ldwap-act-btn--resolver" data-action="resolver">Resolver</button>`
    } else if (estado === 'asignado') {
        html = `<span class="ldwap-act-info">Atendido por <b>${_esc(asig?.asesor || '')}</b></span>`
    } else if (estado === 'resuelto') {
        html = `<span class="ldwap-act-info ldwap-act-info--resuelto">Resuelto</span>`
    }

    el.innerHTML = html
    el.querySelector('[data-action="tomar"]')?.addEventListener('click',    () => _tomarChat(num, phone))
    el.querySelector('[data-action="resolver"]')?.addEventListener('click', () => _resolverChat(num, phone))
}

async function _loadMsgsIfNeeded(num, phone) {
    const c = _state.conv[num]?.[phone]
    if (!c || c.msgs.length > 0) return

    try {
        const r = await fetch(
            `${HETZNER_URL}/ld/wa/mensajes?numero=${encodeURIComponent(num)}&contacto=${encodeURIComponent(phone)}&limit=50`
        )
        if (!r.ok) return
        const data = await r.json()
        if (!Array.isArray(data)) return

        c.msgs = data.map(m => ({
            text:  m.texto,
            ts:    m.timestamp || Math.floor(new Date(m.created_at).getTime() / 1000),
            out:   m.saliente,
            asesor: m.asesor || null,
            tipo:  m.tipo || 'mensaje',
            msgId: m.msg_id || null,
        }))
        _saveConv()
        if (_state.activeContact === phone && _state.activeNum === num) _renderMsgs()
    } catch {}
}

// ── Acciones ──────────────────────────────────────────────────────────────────
const _headers = (extra = {}) => ({
    'Content-Type': 'application/json',
    ...(_authToken ? { Authorization: `Bearer ${_authToken}` } : {}),
    ...extra,
})

async function _tomarChat(num, phone) {
    if (!_asesorActual) return
    try {
        const r = await fetch(`${HETZNER_URL}/ld/wa/asignaciones`, {
            method:  'POST',
            headers: _headers(),
            body:    JSON.stringify({ numero: num, contacto: phone, asesor: _asesorActual }),
        })
        if (!r.ok) return
        _state.asignaciones[`${num}:${phone}`] = { asesor: _asesorActual, estado: 'asignado' }
        _saveAsig()
        _renderChatActions()
        _renderList()
    } catch {}
}

async function _resolverChat(num, phone) {
    try {
        const r = await fetch(
            `${HETZNER_URL}/ld/wa/asignaciones/${encodeURIComponent(num)}/${encodeURIComponent(phone)}`,
            {
                method:  'PUT',
                headers: _headers(),
                body:    JSON.stringify({ estado: 'resuelto' }),
            }
        )
        if (!r.ok) return
        const key = `${num}:${phone}`
        if (_state.asignaciones[key]) _state.asignaciones[key].estado = 'resuelto'
        _saveAsig()
        _renderChatActions()
        _renderList()
    } catch {}
}

async function _sendMsg(texto) {
    const { activeNum: num, activeContact: phone } = _state
    console.log('[ldwap] _sendMsg', { num, phone, texto })
    if (!num || !phone || !texto) { console.warn('[ldwap] _sendMsg abortado: num/phone/texto vacío'); return }

    // Garantizar que la entrada de conv existe (puede no existir si es chat nuevo)
    if (!_state.conv[num]) _state.conv[num] = {}
    if (!_state.conv[num][phone]) {
        _state.conv[num][phone] = { msgs: [], unread: 0, lastMsg: '', lastTs: 0, nombre: null }
    }
    const c = _state.conv[num][phone]
    console.log('[ldwap] c.msgs antes push:', c.msgs.length)

    // Insertar optimista
    const ts = Math.floor(Date.now() / 1000)
    c.msgs.push({ text: texto, ts, out: true, asesor: _asesorActual, tipo: 'mensaje', pending: true })
    c.lastMsg = texto
    c.lastTs  = ts
    console.log('[ldwap] c.msgs después push:', c.msgs.length)
    _renderMsgs()
    _renderList()

    try {
        const r = await fetch(`${HETZNER_URL}/ld/wa/mensaje`, {
            method:  'POST',
            headers: _headers(),
            body:    JSON.stringify({ numero: num, contacto: phone, texto, asesor: _asesorActual }),
        })
        if (!r.ok) {
            const err = await r.json().catch(() => ({ error: r.statusText }))
            console.error('[ldwap] Error enviando mensaje:', r.status, err)
            // Marcar el mensaje optimista como fallido
            const c = _state.conv[num]?.[phone]
            if (c) {
                const last = c.msgs.findLast(m => m.pending && m.text === texto)
                if (last) { last.failed = true; last.pending = false }
                _renderMsgs()
            }
        }
    } catch (err) {
        console.error('[ldwap] Error de red al enviar:', err)
    }
}

// ── CSS inyectado ─────────────────────────────────────────────────────────────
function _injectStyles() {
    if (document.getElementById('ldwap-css')) return
    const s = document.createElement('style')
    s.id = 'ldwap-css'
    s.textContent = `
/* ── Rows de conversación ── */
.ldwap-row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; cursor: pointer;
    border-bottom: 1px solid rgba(117,71,59,0.08);
    transition: background .15s;
}
.ldwap-row:hover, .ldwap-row--active {
    background: rgba(117,71,59,0.1);
}
.ldwap-avatar {
    width: 38px; height: 38px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 1.3rem; flex-shrink: 0;
    font-family: 'Montserrat', sans-serif;
}
.ldwap-row-body { flex: 1; min-width: 0; }
.ldwap-row-top { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; }
.ldwap-row-name {
    font-weight: 600; font-size: 1.3rem; color: #3a2010;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
}
.ldwap-row-ts { font-size: 1rem; color: #a07060; flex-shrink: 0; }
.ldwap-row-bot {
    display: flex; align-items: center; gap: 4px; margin-top: 1px;
}
.ldwap-row-last {
    font-size: 1.1rem; color: #7a5540;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
}
.ldwap-unread {
    background: #ef4444; color: #fff; border-radius: 10px;
    min-width: 18px; height: 18px; padding: 0 4px;
    font-size: 1rem; font-weight: 700;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ldwap-row-tags { margin-top: 2px; }
.ldwap-tag {
    font-size: 1rem; padding: 2px 6px; border-radius: 8px; font-weight: 600;
    font-family: 'Montserrat', sans-serif;
}
.ldwap-tag--espera  { background: #fef9c3; color: #854d0e; }
.ldwap-tag--asig    { background: #dbeafe; color: #1e40af; }
.ldwap-tag--resuelto { background: #d1fae5; color: #065f46; }

/* Placeholder vacío */
.ldwap-placeholder {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 8px; height: 140px;
    color: rgba(117,71,59,0.45);
    font-size: 1.2rem; font-weight: 500;
    font-family: 'Montserrat', sans-serif;
}
.ldwap-placeholder svg { width: 32px; height: 32px; opacity: .35; }

/* ── Chat col ── */
#ldwap-chat-col {
    width: 0; overflow: hidden;
    display: flex; flex-direction: column;
    background: #fff;
    border-right: 1px solid rgba(117,71,59,0.15);
    transition: width .2s ease;
    flex-shrink: 0;
}
#ldwap-chat-col.open { width: 300px; overflow: visible; overflow: hidden; }

.ldwap-chat-hdr {
    display: flex; align-items: center; gap: 8px;
    padding: 0 12px; height: 60px;
    background: var(--ld-marron, #75473B);
    flex-shrink: 0;
}
.ldwap-chat-back {
    width: 32px; height: 32px; border-radius: 8px;
    border: none; background: rgba(255,255,255,0.12);
    color: #fff; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: background .15s;
}
.ldwap-chat-back:hover { background: rgba(255,255,255,0.22); }
.ldwap-chat-back svg { width: 16px; height: 16px; }
.ldwap-chat-hdr-info { flex: 1; min-width: 0; }
.ldwap-chat-name {
    display: block; font-weight: 700; font-size: 1.3rem; color: #fff;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-family: 'Montserrat', sans-serif;
}
.ldwap-chat-num { display: block; font-size: 1rem; color: rgba(255,255,255,0.6); }

.ldwap-chat-actions {
    padding: 6px 10px;
    background: var(--ld-beige, #F6EBE0);
    border-bottom: 1px solid rgba(117,71,59,0.1);
    display: flex; align-items: center; justify-content: flex-end; gap: 6px;
    flex-shrink: 0; min-height: 36px;
}
.ldwap-act-btn {
    padding: 5px 12px; border-radius: 20px; border: none;
    font-size: 1.1rem; font-weight: 600; cursor: pointer;
    font-family: 'Montserrat', sans-serif; transition: opacity .15s;
}
.ldwap-act-btn:hover { opacity: .85; }
.ldwap-act-btn--tomar   { background: var(--ld-marron, #75473B); color: var(--ld-beige, #F6EBE0); }
.ldwap-act-btn--resolver { background: #16a34a; color: #fff; }
.ldwap-act-info { font-size: 1.1rem; color: #7a5540; font-family: 'Montserrat', sans-serif; }
.ldwap-act-info--resuelto { color: #065f46; font-weight: 600; }

.ldwap-chat-msgs {
    flex: 1; overflow-y: auto; padding: 10px;
    display: flex; flex-direction: column; gap: 4px;
    background: #faf6f2;
}
.ldwap-chat-msgs::-webkit-scrollbar { width: 4px; }
.ldwap-chat-msgs::-webkit-scrollbar-thumb { background: rgba(117,71,59,.2); border-radius: 4px; }

.ldwap-day-sep { text-align: center; margin: 8px 0; }
.ldwap-day-sep span {
    background: #e5d5c5; color: #7a5540;
    font-size: 1rem; padding: 2px 10px; border-radius: 20px;
    font-family: 'Montserrat', sans-serif;
}

.ldwap-msg { display: flex; flex-direction: column; max-width: 86%; }
.ldwap-msg--in  { align-self: flex-start; }
.ldwap-msg--out { align-self: flex-end; align-items: flex-end; }
.ldwap-msg--pending { opacity: .65; }
.ldwap-msg-asesor {
    font-size: .95rem; color: #7a5540; margin-bottom: 1px;
    font-family: 'Montserrat', sans-serif;
}
.ldwap-msg-bubble {
    padding: 7px 10px; border-radius: 12px;
    font-size: 1.2rem; line-height: 1.45;
    word-break: break-word; white-space: pre-wrap;
    font-family: 'Montserrat', sans-serif;
}
.ldwap-msg--in  .ldwap-msg-bubble { background: #fff; border-radius: 0 12px 12px 12px; color: #1f2937; }
.ldwap-msg--out .ldwap-msg-bubble { background: var(--ld-marron, #75473B); color: #fff; border-radius: 12px 12px 0 12px; }
.ldwap-msg-ts {
    font-size: .95rem; color: #a07060; margin-top: 2px; padding: 0 2px;
    font-family: 'Montserrat', sans-serif;
}
.ldwap-msgs-empty {
    text-align: center; color: #a07060;
    font-size: 1.2rem; padding: 40px 0;
    font-family: 'Montserrat', sans-serif;
}

.ldwap-chat-footer {
    display: flex; align-items: flex-end; gap: 8px;
    padding: 8px 10px;
    border-top: 1px solid rgba(117,71,59,.12);
    background: #fff; flex-shrink: 0;
}
.ldwap-chat-input {
    flex: 1; border: 1.5px solid rgba(117,71,59,.25); border-radius: 16px;
    padding: 8px 12px; font-size: 1.2rem;
    font-family: 'Montserrat', sans-serif;
    resize: none; outline: none; max-height: 100px;
    color: #3a2010; background: #faf6f2; line-height: 1.4;
}
.ldwap-chat-input:focus { border-color: var(--ld-marron, #75473B); }
.ldwap-chat-send {
    width: 36px; height: 36px; border-radius: 50%;
    border: none; background: var(--ld-marron, #75473B);
    color: #fff; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: background .15s;
}
.ldwap-chat-send:hover { background: var(--ld-marron-oscuro, #4e2e24); }
.ldwap-chat-send svg { width: 16px; height: 16px; }

/* ── Botón Conectar ── */
.ldwap-conectar-btn {
    margin-top: 4px; padding: 7px 16px;
    border-radius: 20px; border: none;
    background: var(--ld-marron, #75473B);
    color: var(--ld-beige, #F6EBE0);
    font-size: 1.2rem; font-weight: 600;
    font-family: 'Montserrat', sans-serif;
    cursor: pointer; transition: opacity .15s;
}
.ldwap-conectar-btn:hover { opacity: .85; }

/* ── Modal QR ── */
#ldwap-qr-modal {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.5); z-index: 9999;
    align-items: center; justify-content: center;
}
.ldwap-qr-box {
    background: #fff; border-radius: 16px;
    padding: 20px; width: 280px;
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.25);
}
.ldwap-qr-hdr {
    width: 100%; display: flex;
    align-items: center; justify-content: space-between;
    font-weight: 700; font-size: 1.3rem; color: #3a2010;
    font-family: 'Montserrat', sans-serif;
}
.ldwap-qr-hdr button {
    background: none; border: none; font-size: 1.4rem;
    cursor: pointer; color: #7a5540; line-height: 1;
}
.ldwap-qr-hint {
    font-size: 1.1rem; color: #7a5540; text-align: center;
    font-family: 'Montserrat', sans-serif; margin: 0;
}
#ldwap-qr-img {
    width: 220px; height: 220px;
    border: 2px solid rgba(117,71,59,0.15); border-radius: 8px;
}
.ldwap-qr-num {
    font-size: 1rem; color: #a07060;
    font-family: 'Montserrat', sans-serif; margin: 0;
}
`
    document.head.appendChild(s)
}

// ── Entry point ───────────────────────────────────────────────────────────────
export function initWaPanel({ asesor = '', authToken = '' } = {}) {
    _asesorActual = asesor
    _authToken    = authToken

    _injectStyles()
    _loadConvCache()

    // Restaurar caché de sesiones y asignaciones para render instantáneo
    try { const r = localStorage.getItem(LS_SES);  if (r) _state.sesiones      = JSON.parse(r) } catch {}
    try { const r = localStorage.getItem(LS_ASIG); if (r) _state.asignaciones  = JSON.parse(r) } catch {}

    _renderList()

    // Cargar desde backend en paralelo
    Promise.all([_loadSessions(), _loadAsignaciones(), _loadConversaciones()])
        .then(() => _renderList())

    _connectWs()

    // Re-sync cada 60s
    setInterval(() => {
        Promise.all([_loadConversaciones(), _loadAsignaciones()])
            .then(() => _renderList())
    }, 60_000)

    // Chips de filtro (reemplaza los placeholder listeners del shell)
    document.querySelectorAll('.ld-wa__chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.ld-wa__chip').forEach(c => c.classList.remove('active'))
            chip.classList.add('active')
            _state.filtroChip = chip.dataset.filtro || 'todos'
            _renderList()
        })
    })
}
