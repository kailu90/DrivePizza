import { WS_URL } from '../Api/config.js'
import { supabase } from '../Api/supabaseConfig.js'

// ── Auth — solo admin / callcenter-admin ──────────────────────────────────────
const { data: { user } } = await supabase.auth.getUser()
if (!user) { window.top.location.href = '../index.html'; throw new Error('no auth') }
const { data: perfil } = await supabase.from('usuarios').select('rol').eq('id', user.id).single()
if (!['admin', 'callcenter-admin'].includes(perfil?.rol)) {
  window.top.location.href = '../index.html'; throw new Error('sin acceso')
}

// ── State ─────────────────────────────────────────────────────────────────────
const MAX_LOG  = 150
const sessions = new Map()   // numero → { numero, sede, status, ultima_conexion, msgs }
const logEntries = []
let _ws      = null
let _wsRetry = 0

const DR_NAMES = {
  401: 'loggedOut',
  403: 'forbidden',
  408: 'connectionLost',
  428: 'connectionClosed',
  440: 'connectionReplaced',
  500: 'badSession',
  503: 'unavailableService',
  515: 'restartRequired',
}

const STATUS_LABEL = {
  conectado:    'Conectado',
  reconectando: 'Reconectando...',
  conectando:   'Conectando...',
  esperando_qr: 'Esperando QR',
  desconectado: 'Desconectado',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return '—'
  const s = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (s < 60)   return `hace ${s}s`
  if (s < 3600) return `hace ${Math.floor(s / 60)}min`
  return `hace ${Math.floor(s / 3600)}h`
}

function nowTime() {
  return new Date().toLocaleTimeString('es-CO', { hour12: false })
}

// ── Render cards ──────────────────────────────────────────────────────────────
function renderCards() {
  const el = document.getElementById('mon-cards')
  if (!sessions.size) {
    el.innerHTML = '<div class="mon-empty">Sin sesiones registradas</div>'
    return
  }
  const order = { desconectado: 0, esperando_qr: 1, reconectando: 2, conectando: 2, conectado: 3 }
  el.innerHTML = [...sessions.values()]
    .sort((a, b) => (order[a.status] ?? 0) - (order[b.status] ?? 0) || a.sede.localeCompare(b.sede))
    .map(s => `
      <div class="mon-card mon-card--${s.status}">
        <div class="mon-card-head">
          <span class="mon-dot mon-dot--${s.status}"></span>
          <span class="mon-card-num">${s.numero}</span>
        </div>
        <div class="mon-card-sede">${s.sede}</div>
        <div class="mon-card-stat mon-card-stat--${s.status}">${STATUS_LABEL[s.status] || s.status}</div>
        <div class="mon-card-meta">
          Última actualizacion: ${timeAgo(s.ultima_conexion)}<br>
          Mensajes sesión: <b>${s.msgs}</b>
        </div>
      </div>
    `).join('')
}

// ── Render log ────────────────────────────────────────────────────────────────
function renderLog() {
  const el    = document.getElementById('mon-log')
  const count = document.getElementById('log-count')
  count.textContent = `${logEntries.length} eventos`
  if (!logEntries.length) {
    el.innerHTML = '<div class="mon-empty">Esperando eventos...</div>'
    return
  }
  const wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  el.innerHTML = logEntries.map(e => `
    <div class="mon-entry mon-entry--${e.tipo}">
      <span class="mon-entry-time">${e.time}</span>
      <span class="mon-entry-sede">${e.label}</span>
      <span class="mon-entry-msg">${e.msg}</span>
    </div>
  `).join('')
  if (wasAtBottom) el.scrollTop = el.scrollHeight
}

function addLog(tipo, label, msg) {
  logEntries.push({ tipo, label, msg, time: nowTime() })
  if (logEntries.length > MAX_LOG) logEntries.shift()
  renderLog()
}

// ── Cargar sesiones desde Supabase ────────────────────────────────────────────
async function loadSessions() {
  const { data, error } = await supabase
    .from('sesiones_wa')
    .select('numero, sede, status, ultima_conexion')
    .order('sede')
  if (error || !data) return
  for (const s of data) {
    const prev = sessions.get(s.numero)
    sessions.set(s.numero, {
      numero:          s.numero,
      sede:            s.sede,
      status:          s.status,
      ultima_conexion: s.ultima_conexion,
      msgs:            prev?.msgs ?? 0,
    })
  }
  renderCards()
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
function setDot(estado) {
  document.getElementById('ws-dot').className = `mon-ws-dot mon-ws-dot--${estado}`
}

function connectWs() {
  setDot('reconectando')
  _ws = new WebSocket(WS_URL)

  _ws.onopen = () => {
    _wsRetry = 0
    setDot('ok')
    addLog('info', 'Monitor', 'WebSocket conectado')
    loadSessions()
  }

  _ws.onmessage = e => {
    try {
      const msg  = JSON.parse(e.data)
      const s    = sessions.get(msg.numero)
      const sede = msg.sede || s?.sede || msg.numero || '?'

      // ── wa:status ──
      if (msg.tipo === 'wa:status') {
        if (s) {
          s.status          = msg.status
          s.sede            = sede
          s.ultima_conexion = new Date().toISOString()
        } else {
          sessions.set(msg.numero, { numero: msg.numero, sede, status: msg.status, ultima_conexion: new Date().toISOString(), msgs: 0 })
        }
        renderCards()

        const tipo  = { conectado: 'conectado', reconectando: 'reconectando', desconectado: 'desconectado' }[msg.status] || 'info'
        const razon = msg.codigo ? ` — ${DR_NAMES[msg.codigo] || 'desconocido'} (${msg.codigo})` : ''
        addLog(tipo, sede, `${STATUS_LABEL[msg.status] || msg.status}${razon}`)
      }

      // ── wa:qr ──
      if (msg.tipo === 'wa:qr') {
        if (s) { s.status = 'esperando_qr'; s.ultima_conexion = new Date().toISOString(); renderCards() }
        addLog('qr', sede, 'QR generado — pendiente escaneo')
      }

      // ── wa:mensaje — contar entrantes ──
      if (msg.tipo === 'wa:mensaje' && !msg.fromMe && s) {
        s.msgs++
        renderCards()
      }
    } catch {}
  }

  _ws.onclose = () => {
    setDot('desconectado')
    const delay = Math.min(1000 * Math.pow(2, _wsRetry), 30_000)
    _wsRetry++
    setTimeout(connectWs, delay)
  }

  _ws.onerror = () => setDot('desconectado')
}

// ── Reloj ─────────────────────────────────────────────────────────────────────
setInterval(() => {
  document.getElementById('mon-clock').textContent =
    new Date().toLocaleTimeString('es-CO', { hour12: false })
}, 1000)

// Refrescar timeAgo en cards cada 30s
setInterval(() => { if (sessions.size) renderCards() }, 30_000)

// ── Init ──────────────────────────────────────────────────────────────────────
document.getElementById('btn-refresh').addEventListener('click', async () => {
  await loadSessions()
  addLog('info', 'Monitor', 'Estado recargado desde Supabase')
})

document.getElementById('mon-clock').textContent = nowTime()
await loadSessions()
connectWs()
