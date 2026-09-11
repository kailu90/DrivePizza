import {
  makeWASocket,
  Browsers,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  extractMessageContent,
  downloadMediaMessage,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys'
import QRCode from 'qrcode'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync, rmSync, writeFileSync, readFileSync, unlinkSync } from 'fs'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import { supabase } from '../../config/supabase.js'
import { redis } from '../../config/redis.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SESSIONS_DIR = path.join(__dirname, '../../../../sessions')

mkdirSync(SESSIONS_DIR, { recursive: true })

const logger = {
  level: 'silent',
  trace: () => {}, debug: () => {}, info: () => {},
  warn:  () => {}, error: () => {}, fatal: () => {},
  child: function() { return this },
}

// ── Helpers JID ────────────────────────────────────────────────────────────
function _jidValido(jid) {
  if (!jid) return false
  // Whitelist: solo chats 1:1 (@s.whatsapp.net) y linked-device IDs (@lid)
  const suffix = jid.split('@')[1] || ''
  return suffix === 's.whatsapp.net' || suffix === 'lid'
}

function _phoneDesdeJid(jid) {
  // @s.whatsapp.net → número normal
  // @lid            → nuevo formato WA, el número antes del @ sigue siendo válido
  return jid.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '')
}

// Map: numero → { socket, status, qr, sede, contactos }
const sesiones = new Map()
const _sentMsgIds = new Set()
const _pendingAcks  = new Map() // msgId → timer watchdog
const _pendingLidResolutions = new Map() // lid → [resolveFn, ...]
const _pendingMsgToPhone = new Map() // msgId → teléfono real (para detectar lid en eco)
// RC-1: ACK que llega antes de que exista la fila en DB.
// applyMsgStatus bufferiza aquí; _guardarMensaje lo consume al insertar.
// TTL 30s para limpiar entries huérfanas (mensajes que nunca se guardaron).
const _earlyAcks = new Map() // msgId → { numero, status, sinAck, _ts }
const _cooldowns          = new Map()   // numero → timestamp hasta el que está en cooldown post-401
const _msgQueues          = new Map()   // '{numero}:{phone}' → Promise activa; ausente = sin cola
// Gap mínimo entre mensajes consecutivos al mismo contacto/sesión.
// Aumentar si WA empieza a limitar; reducir para más velocidad.
const _MSG_GAP_MS = parseInt(process.env.WA_MSG_GAP_MS ?? '500', 10)
const _reconnectAttempts  = new Map()   // numero → intentos acumulados (persiste entre reconexiones)
const _badSessionAttempts = new Map()   // numero → intentos consecutivos de badSession (500)

// ── Signal per-peer health tracking ──────────────────────────────────────────
// Detecta fallos de descifrado por contacto (Bad MAC / MessageCounterError)
// y ejecuta recovery quirúrgico sin tocar auth ni otras sesiones.
//
// Fuente de evidencia:
//   messages.upsert con msg.message === null → fallo de descifrado confirmado por Baileys.
//   Solo se actúa tras SIGNAL_DEGRADE_THRESHOLD fallos en SIGNAL_DEGRADE_WINDOW_MS.
//
// Recovery: keyStore.set({ sessions: { [jid]: null } }) borra solo la sesión Signal
// de ese peer. El siguiente mensaje activa un nuevo PreKeyMessage (renegociación automática).
// Cooldown de 15 min entre intentos para evitar reset loops.
const _signalPeerErrors = new Map()  // numero → Map(jid → estado)

const SIGNAL_DEGRADE_THRESHOLD   = 3            // fallos confirmados en ventana → degraded
const SIGNAL_DEGRADE_WINDOW_MS   = 5 * 60_000   // ventana: 5 min
const SIGNAL_RESET_COOLDOWN_MS   = 15 * 60_000  // cooldown entre resets por peer
const SIGNAL_RESET_CONFIRM_MS    = 3 * 60_000   // tiempo para confirmar RECOVERED

function _signalPeer(numero, jid) {
  if (!_signalPeerErrors.has(numero)) _signalPeerErrors.set(numero, new Map())
  const peers = _signalPeerErrors.get(numero)
  if (!peers.has(jid)) {
    peers.set(jid, { count: 0, firstSeen: 0, lastSeen: 0,
                     state: 'ok', lastReset: 0, _confirmTimer: null })
  }
  return peers.get(jid)
}

// Llamado desde messages.upsert cuando msg.message === null para un mensaje entrante.
// Solo evidencia directa — no atribuir desde stderr sin JID confirmado.
function _onSignalDecryptFail(numero, jid) {
  if (!jid || !numero) return
  const peer = _signalPeer(numero, jid)
  const now  = Date.now()

  // Resetear contador si la ventana expiró
  if (peer.firstSeen && now - peer.firstSeen > SIGNAL_DEGRADE_WINDOW_MS) {
    peer.count = 0; peer.firstSeen = 0
  }
  if (!peer.firstSeen) peer.firstSeen = now
  peer.lastSeen = now
  peer.count++

  _waLog('SIGNAL_DECRYPT_FAIL', { numero, jid, count: peer.count, threshold: SIGNAL_DEGRADE_THRESHOLD })

  if (peer.state === 'ok' && peer.count >= SIGNAL_DEGRADE_THRESHOLD) {
    peer.state = 'degraded'
    _waLog('SIGNAL_DEGRADED', {
      numero, jid,
      count: peer.count,
      windowSec: Math.round((now - peer.firstSeen) / 1000),
    })
    _resetSignalPeer(numero, jid).catch(() => {})
  }
}

async function _resetSignalPeer(numero, jid) {
  const peer = _signalPeer(numero, jid)
  const now  = Date.now()

  // Cooldown: no resetear si hubo uno reciente para este peer
  if (peer.lastReset && now - peer.lastReset < SIGNAL_RESET_COOLDOWN_MS) {
    _waLog('SIGNAL_RESET_PEER', {
      numero, jid, action: 'skipped_cooldown',
      nextInSec: Math.round((SIGNAL_RESET_COOLDOWN_MS - (now - peer.lastReset)) / 1000),
    })
    return
  }

  const entrada = sesiones.get(numero)
  if (!entrada || entrada.status !== 'conectado' || !entrada.keyStore || !entrada.saveCreds) {
    _waLog('SIGNAL_RESET_PEER', { numero, jid, action: 'skipped_session_not_ready' })
    return
  }

  peer.state    = 'recovering'
  peer.lastReset = now

  try {
    // Normalizar JID: quitar device suffix (:N) — sesión Signal se indexa por JID base
    const baseJid = jid.includes(':') ? jid.replace(/:[0-9]+@/, '@') : jid

    // Borrar SOLO la sesión Signal de este peer. No toca creds ni otras sesiones.
    await entrada.keyStore.set({ 'sessions': { [baseJid]: null } })
    await entrada.saveCreds()

    _waLog('SIGNAL_RESET_PEER', { numero, jid: baseJid, action: 'session_cleared', count: peer.count })

    // Esperar confirmación: si en SIGNAL_RESET_CONFIRM_MS no llega un mensaje OK → FAILED
    clearTimeout(peer._confirmTimer)
    peer._confirmTimer = setTimeout(() => {
      if (peer.state === 'recovering') {
        peer.state = 'degraded'
        _waLog('SIGNAL_RESET_FAILED', { numero, jid, reason: 'no_success_message_in_3min' })
      }
    }, SIGNAL_RESET_CONFIRM_MS)

  } catch (e) {
    peer.state = 'degraded'
    _waLog('SIGNAL_RESET_FAILED', { numero, jid, error: e.message })
  }
}

// Llamado cuando llega un mensaje entrante descifrable de un peer en state=recovering
function _onSignalRecovered(numero, jid) {
  if (!jid || !numero) return
  const peer = _signalPeerErrors.get(numero)?.get(jid)
  if (!peer || peer.state !== 'recovering') return
  clearTimeout(peer._confirmTimer)
  peer.state = 'ok'
  peer.count = 0; peer.firstSeen = 0
  _waLog('SIGNAL_RECOVERED', { numero, jid })
}

// ── Caché versión Baileys ────────────────────────────────────────────────────
// fetchLatestBaileysVersion() llama a GitHub en cada reconexión → cachear 24h
let _baileysVersionCache  = null
let _baileysVersionCacheTs = 0
const BAILEYS_VERSION_TTL = 24 * 60 * 60 * 1000 // 24h en ms
async function _getVersion() {
  if (_baileysVersionCache && (Date.now() - _baileysVersionCacheTs) < BAILEYS_VERSION_TTL) {
    return _baileysVersionCache
  }
  const { version } = await fetchLatestBaileysVersion()
  _baileysVersionCache  = version
  _baileysVersionCacheTs = Date.now()
  return version
}

// ── Rate-limit Bad MAC en stderr ─────────────────────────────────────────────
// Baileys emite "Session error: Bad MAC" y "Closing open session in favor of incoming prekey bundle"
// a process.stderr en oleadas de cientos/segundo — llenaba el disco (205MB en una noche).
// Permitimos 1 log cada 60s por tipo para mantener visibilidad sin el ruido.
const _stderrRateLimits = {}
const _origStderrWrite  = process.stderr.write.bind(process.stderr)
process.stderr.write = function(chunk, encoding, callback) {
  const msg = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
  const isBadMac  = msg.includes('Bad MAC')
  const isPrekey  = msg.includes('incoming prekey bundle')
  if (isBadMac || isPrekey) {
    const key = isBadMac ? 'badmac' : 'prekey'
    const now = Date.now()
    if (now - (_stderrRateLimits[key] || 0) < 60_000) {
      if (typeof encoding === 'function') encoding() // encoding puede ser callback
      else if (typeof callback === 'function') callback()
      return true
    }
    _stderrRateLimits[key] = now
    // Loguear 1 línea resumida en lugar del mensaje completo
    return _origStderrWrite(`[WA] ${key === 'badmac' ? 'Bad MAC' : 'Prekey re-negociación'} (rate-limited 1/min — ver logs Baileys)\n`, encoding, callback)
  }
  return _origStderrWrite(chunk, encoding, callback)
}

// Encola un envío por clave '{sessionId}:{destinatario}'.
// - Primer mensaje: sin espera (0 ms de latencia percibida).
// - Mensajes consecutivos al mismo contacto/sesión: espera _MSG_GAP_MS antes de enviar.
// - Se limpia automáticamente del mapa cuando no hay más mensajes en cola.
function _enqueue(key, fn) {
  const prev   = _msgQueues.get(key)
  const next   = prev
    ? prev.then(() => new Promise(r => setTimeout(r, _MSG_GAP_MS))).then(fn)
    : Promise.resolve().then(fn)
  const queued = next.catch(() => {})
  _msgQueues.set(key, queued)
  queued.then(() => {
    if (_msgQueues.get(key) === queued) _msgQueues.delete(key)
  })
  return next
}
// ── Circuit breaker ──────────────────────────────────────────────────────────
// Si una sesión se desconecta CB_MAX_DISCONNECTS veces en CB_WINDOW_MS, se pausa CB_PAUSE_MS.
const _recentDisconnects = new Map()   // numero → [timestamp, ...]
const CB_WINDOW_MS       = 10 * 60_000 // ventana: 10 minutos
const CB_MAX_DISCONNECTS = 4           // desconexiones máximas en la ventana
const CB_PAUSE_MS        = 2 * 60_000  // pausa si se activa: 2 minutos

function _circuitBreakerCheck(numero) {
  const now = Date.now()
  const ts  = (_recentDisconnects.get(numero) || []).filter(t => now - t < CB_WINDOW_MS)
  ts.push(now)
  _recentDisconnects.set(numero, ts)
  if (ts.length >= CB_MAX_DISCONNECTS) {
    _recentDisconnects.delete(numero)
    return true // activado
  }
  return false
}

// ── Session lock (Redis) ─────────────────────────────────────────────────────
// Garantiza un único socket activo por número incluso con pm2 reload o reinicios.
const LOCK_TTL_SEC = 30
const LOCK_HB_MS   = 10_000

async function _acquireLock(numero) {
  try {
    const key   = `wa_session_lock:${numero}`
    const owner = `${process.pid}:${Date.now()}`
    const ok    = await redis.set(key, owner, 'EX', LOCK_TTL_SEC, 'NX')
    if (ok !== 'OK') {
      const current = await redis.get(key)
      _waLog('LOCK', { numero, evento: 'ocupado', owner_actual: current })
      return null
    }
    _waLog('LOCK', { numero, evento: 'adquirido', owner })
    return owner
  } catch (e) {
    _waLog('LOCK', { numero, evento: 'redis_no_disponible', error: e.message })
    return 'no-redis'
  }
}

function _startHeartbeat(numero, owner) {
  if (owner === 'no-redis') return null
  const key = `wa_session_lock:${numero}`
  let renewals = 0
  return setInterval(async () => {
    try {
      const current = await redis.get(key)
      if (current === owner) {
        // Caso normal: renovar TTL
        await redis.expire(key, LOCK_TTL_SEC)
      } else if (current === null) {
        // Key expirada — re-adquirir sin tocar el socket
        await redis.set(key, owner, 'EX', LOCK_TTL_SEC, 'NX')
        _waLog('LOCK', { numero, evento: 'lock_reacquired', owner })
      }
      // Si otro proceso tiene el lock: solo logueamos, NO matamos el socket.
      // El SIGTERM handler garantiza que el proceso viejo libera locks antes de morir.
      else {
        _waLog('LOCK', { numero, evento: 'lock_otro_proceso', owner_actual: current })
      }
      renewals++
      if (renewals % 6 === 0) _waLog('LOCK', { numero, evento: 'heartbeat_ok', renovaciones: renewals })
    } catch {}
  }, LOCK_HB_MS)
}

async function _releaseLock(numero, owner) {
  if (!owner || owner === 'no-redis') return
  try {
    const key     = `wa_session_lock:${numero}`
    const current = await redis.get(key)
    if (current === owner) await redis.del(key)
  } catch {}
}

// ── Logging estructurado ─────────────────────────────────────────────────────
const DR_NAMES = {
  401: 'loggedOut',
  403: 'forbidden',
  408: 'connectionLost',
  411: 'multideviceMismatch',
  428: 'connectionClosed',
  440: 'connectionReplaced',
  500: 'badSession',
  503: 'unavailableService',
  515: 'restartRequired',
}

function _waLog(tag, datos = {}) {
  const ts  = new Date().toISOString()
  const out = typeof datos === 'string' ? { msg: datos } : datos
  console.log(`[WA:${tag}] ${ts}`, JSON.stringify(out))
}

// ── Identity collision guard ──────────────────────────────────────────────────
// Verifica si realPhone ya tiene mensajes propios antes de migrar un LID.
// Retorna true si hay colisión (abortar migración), false si es seguro proceder.
// En colisión: loguea IDENTITY_CONFLICT y emite wa:identity_conflict al frontend.
// En éxito:    loguea IDENTITY_LINKED.
async function _checkIdentityConflict(numero, sede, lidPhone, realPhone) {
  if (!supabase) return false
  try {
    // ── Nivel A: mismo contact_id en wa_contact_jids ─────────────────────────
    // Si ambos JIDs ya comparten contact_id, son el mismo cliente — no es conflicto
    const [{ data: rowLid }, { data: rowPhone }] = await Promise.all([
      supabase.from('wa_contact_jids').select('contact_id').eq('numero_sesion', numero).eq('jid', lidPhone).maybeSingle(),
      supabase.from('wa_contact_jids').select('contact_id').eq('numero_sesion', numero).eq('jid', realPhone).maybeSingle(),
    ])
    if (rowLid?.contact_id && rowPhone?.contact_id && rowLid.contact_id === rowPhone.contact_id) {
      _waLog('IDENTITY_ALREADY_UNIFIED', { numero, lidPhone, realPhone, contact_id: rowLid.contact_id })
      return false
    }

    // ── Nivel B: par lid↔phone registrado en wa_identidades ──────────────────
    // Si el LID ya tiene una entrada explícita apuntando a este mismo phone,
    // el par es conocido y verificado — no es conflicto aunque el phone tenga mensajes
    const { data: ident } = await supabase.from('wa_identidades')
      .select('telefono').eq('lid', lidPhone).maybeSingle()
    if (ident?.telefono) {
      const storedPhone = ident.telefono.length === 10 ? '57' + ident.telefono : ident.telefono
      if (storedPhone === realPhone) {
        _waLog('IDENTITY_KNOWN', { numero, lidPhone, realPhone })
        return false // par explícitamente registrado — no es conflicto
      }
    }

    // ── Nivel C: verificación de conflicto real ───────────────────────────────
    const { count } = await supabase.from('mensajes_wa')
      .select('id', { count: 'exact', head: true })
      .eq('numero', numero).eq('contacto', realPhone)
    if (count > 0) {
      _waLog('IDENTITY_CONFLICT', { numero, lidPhone, realPhone, existing: count })
      broadcast({ tipo: 'wa:identity_conflict', numero, sede, lidPhone, realPhone, existing: count })
      return true
    }
    _waLog('IDENTITY_LINKED', { numero, lidPhone, realPhone })
    return false
  } catch (e) {
    _waLog('IDENTITY_CONFLICT_ERR', { numero, lidPhone, realPhone, error: e.message })
    return false // si falla la verificación, permitir migración (comportamiento previo)
  }
}

// ── Tracking de eventos de conexión por sesión ────────────────────────────────
// _connectedAt : numero → timestamp (ms) de la última conexión exitosa
// _incidents   : numero → { incidentId, closedAt } — vigente mientras offline
// _msgCounters : numero → { sent, recv } — contadores desde el último OPEN
const _connectedAt = new Map()
const _incidents   = new Map()
const _msgCounters = new Map()

// Persiste un evento WA_CONN_* en Supabase (fire-and-forget) y emite _waLog.
// No bloquea el flujo de reconexión. Fallos de inserción solo loguean a stderr.
function _logConnEvent(eventType, data) {
  _waLog(eventType, data)
  if (!supabase) return
  const inc = _incidents.get(data.numero)
  supabase.from('wa_connection_events').insert({
    event_type:    eventType,
    incident_id:   data.incidentId ?? inc?.incidentId ?? null,
    session_id:    data.numero,
    numero:        data.numero,
    sede:          data.sede ?? null,
    status_code:   data.statusCode ?? null,
    reason:        data.reason ?? null,
    error_message: data.errorMessage ?? null,
    retry_attempt: data.retryAttempt ?? null,
    scheduled_delay_ms:              data.scheduledDelayMs ?? null,
    downtime_ms:                     data.downtimeMs ?? null,
    connected_duration_ms:           data.connectedDurationMs ?? null,
    process_pid:                     process.pid,
    process_uptime_seconds:          Math.round(process.uptime()),
    messages_sent_since_connect:     data.msgSent ?? 0,
    messages_received_since_connect: data.msgRecv ?? 0,
    metadata: data.metadata ?? {},
  })
  .then(({ error }) => { if (error) console.error('[WA] CONN_EVENT_ERR:', error.message) })
  .catch(e => console.error('[WA] CONN_EVENT_ERR:', e.message))
}

let _wsClients = null

// Resuelve un @lid a número real con 3 niveles (fuente de verdad: wa_identidades).
// 1. lidToPhone en memoria  — caché instantáneo por sesión
// 2. wa_identidades          — fuente de verdad lid↔teléfono, persiste entre reinicios
// 3. contacts.upsert         — fetchStatus dispara contacts.upsert, espera hasta timeoutMs
// Retorna número real (57XXXXXXXXXX) o el lid original como fallback.
async function _resolverLid(entrada, lid, timeoutMs = 1500) {
  // 1. Memoria
  const cached = entrada?.lidToPhone?.get(lid)
  if (cached) return cached

  // 2. wa_identidades — fuente de verdad principal para mapeo lid↔teléfono
  if (supabase) {
    try {
      const { data: ident } = await supabase.from('wa_identidades')
        .select('telefono').eq('lid', lid).maybeSingle()
      if (ident?.telefono) {
        const phone = ident.telefono.length === 10 ? '57' + ident.telefono : ident.telefono
        entrada?.lidToPhone?.set(lid, phone)
        if (entrada?.phoneToLid) entrada.phoneToLid.set(phone, lid)
        console.log('[WA] @lid resuelto desde wa_identidades:', lid, '→', phone)
        return phone
      }
    } catch(e) {
      console.error('[WA] Error buscando lid en wa_identidades:', e.message)
    }
  }

  // 2.5. wa_contact_jids — resultado de unificaciones manuales (phone/LID mismo contact_id)
  const _numSesion = entrada?.numero_sesion
  if (supabase && _numSesion) {
    try {
      const { data: jidRow } = await supabase.from('wa_contact_jids')
        .select('contact_id').eq('numero_sesion', _numSesion).eq('jid', lid).maybeSingle()
      if (jidRow?.contact_id) {
        const { data: phoneRow } = await supabase.from('wa_contact_jids')
          .select('jid').eq('numero_sesion', _numSesion)
          .eq('contact_id', jidRow.contact_id).eq('jid_type', 'phone').maybeSingle()
        if (phoneRow?.jid) {
          const phone = phoneRow.jid
          entrada.lidToPhone.set(lid, phone)
          if (entrada.phoneToLid) entrada.phoneToLid.set(phone, lid)
          // Sincronizar wa_identidades para que la próxima vez sea nivel 2
          supabase.from('wa_identidades')
            .upsert({ lid, telefono: phone, numero_sesion: _numSesion }, { onConflict: 'lid' })
            .catch(() => {})
          console.log('[WA] @lid resuelto desde wa_contact_jids:', lid, '→', phone)
          return phone
        }
      }
    } catch(e) {
      console.error('[WA] Error buscando lid en wa_contact_jids:', e.message)
    }
  }

  // 3. Esperar contacts.upsert via fetchStatus
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      const arr = _pendingLidResolutions.get(lid)
      if (arr) {
        const idx = arr.indexOf(resolver)
        if (idx >= 0) arr.splice(idx, 1)
        if (!arr.length) _pendingLidResolutions.delete(lid)
      }
      resolve(lid) // timeout — usar lid como fallback
    }, timeoutMs)
    const resolver = (phone) => { clearTimeout(timer); resolve(phone) }
    if (!_pendingLidResolutions.has(lid)) _pendingLidResolutions.set(lid, [])
    _pendingLidResolutions.get(lid).push(resolver)
    entrada?.socket?.fetchStatus(lid + '@lid').catch(() => {})
  })
}

// ── contact_id live resolution ────────────────────────────────────────────────
// Busca el contact_id para un JID (phone o lid) en una sesión.
// Para LIDs no encontrados: busca en wa_identidades → phone → wa_contact_jids.
// Dual-write: si el LID tiene contact_id vía phone, crea la entrada lid en wa_contact_jids.
// Retorna contact_id (bigint) o null si no es posible resolver.
// Fire-and-forget: los errores se loguean pero no bloquean el flujo.
async function _liveResolveContactId(numero, jid) {
  if (!supabase) return null
  try {
    // 1. Lookup directo: ya existe entrada en wa_contact_jids para este JID
    const { data: jidRow } = await supabase
      .from('wa_contact_jids')
      .select('contact_id')
      .eq('numero_sesion', numero)
      .eq('jid', jid)
      .maybeSingle()
    if (jidRow) return jidRow.contact_id

    // 2. Para LIDs: buscar vía wa_identidades → phone → wa_contact_jids
    //    Un JID es LID si tiene más de 12 dígitos (teléfonos CO son 12: 57+10)
    const isLid = /^\d{13,}$/.test(jid)
    if (!isLid) return null

    const { data: ident } = await supabase
      .from('wa_identidades')
      .select('telefono')
      .eq('lid', jid)
      .maybeSingle()
    if (!ident?.telefono) return null

    const phone = ident.telefono.length === 10 ? '57' + ident.telefono : ident.telefono
    const { data: phoneRow } = await supabase
      .from('wa_contact_jids')
      .select('id, contact_id')
      .eq('numero_sesion', numero)
      .eq('jid', phone)
      .maybeSingle()
    if (!phoneRow) return null

    // Dual-write: crear entrada para el LID en wa_contact_jids vinculada al mismo contact_id
    const { error: dwErr } = await supabase.from('wa_contact_jids').upsert(
      { contact_id: phoneRow.contact_id, numero_sesion: numero, jid,
        jid_type: 'lid', trust_level: 'inferred', source: 'messages_upsert' },
      { onConflict: 'numero_sesion,jid', ignoreDuplicates: true }
    )
    if (!dwErr) {
      _waLog('CONTACT_ID_LINKED', { numero, lid: jid, phone, contact_id: phoneRow.contact_id })
    }
    return phoneRow.contact_id
  } catch (e) {
    console.error('[WA] _liveResolveContactId error:', e.message)
    return null
  }
}

export function initWsClients(wsClients) {
  _wsClients = wsClients
}

export function broadcast(data) {
  if (!_wsClients) return
  const msg = JSON.stringify(data)
  _wsClients.forEach(client => {
    if (client.readyState === 1) client.send(msg)
  })
}

// ── Media helpers ──────────────────────────────────────────────────────────
function _extFromMime(mime, tipo) {
  const base = (mime || '').split(';')[0].trim()
  const map = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov',
    'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac',
    'application/pdf': 'pdf',
  }
  return map[base] || (tipo === 'sticker' ? 'webp' : 'bin')
}

async function _subirMedia(socket, msg, tipo, msgId, numero) {
  try {
    const m = extractMessageContent(msg.message) || msg.message || {}
    const mediaMsg = m.imageMessage || m.videoMessage || m.audioMessage || m.documentMessage || m.stickerMessage
    if (!mediaMsg) return null
    const buffer = await downloadMediaMessage(
      msg, 'buffer', {},
      { logger, reuploadRequest: socket?.updateMediaMessage }
    )
    if (!buffer || !buffer.length) return null
    const mimeType = mediaMsg.mimetype || 'application/octet-stream'
    const ext  = _extFromMime(mimeType, tipo)
    const folder = tipo === 'video' ? 'videos' : tipo === 'audio' || tipo === 'voz' ? 'audios'
                 : tipo === 'imagen' ? 'imagenes' : tipo === 'sticker' ? 'stickers' : 'documentos'
    const storagePath = `${folder}/${numero}/${msgId}.${ext}`
    const { error } = await supabase.storage.from('wa-media').upload(storagePath, buffer, { contentType: mimeType, upsert: true })
    if (error) { console.error('[WA] Error upload media:', error.message); return null }
    const { data: urlData } = supabase.storage.from('wa-media').getPublicUrl(storagePath)
    const rawUrl = urlData?.publicUrl || null
    return rawUrl ? rawUrl.replace('http://localhost:8000', 'https://supabase.everest-central.com') : null
  } catch (e) {
    console.error('[WA] Error descargando/subiendo media:', e.message)
    return null
  }
}

async function _limpiarVideosViejos() {
  if (!supabase) return
  const hace30dias = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60)
  try {
    const { data: videos } = await supabase
      .from('mensajes_wa').select('msg_id, media_url')
      .eq('tipo', 'video').lt('timestamp', hace30dias).not('media_url', 'is', null)
    if (!videos?.length) { console.log('[WA] Limpieza videos: ninguno por eliminar'); return }
    const paths = videos.map(v => { const m = v.media_url.match(/wa-media\/(.+)$/); return m ? m[1] : null }).filter(Boolean)
    if (paths.length) await supabase.storage.from('wa-media').remove(paths)
    await supabase.from('mensajes_wa').update({ media_url: null })
      .eq('tipo', 'video').lt('timestamp', hace30dias).not('media_url', 'is', null)
    console.log(`[WA] Limpieza videos: ${videos.length} archivos eliminados de Storage`)
  } catch (e) {
    console.error('[WA] Error limpieza videos:', e.message)
  }
}
// Limpiar videos viejos al arrancar (tras 1 min) y luego cada 24h
setTimeout(_limpiarVideosViejos, 60 * 1000)
setInterval(_limpiarVideosViejos, 24 * 60 * 60 * 1000)

// ── Supabase helpers ────────────────────────────────────────────────────────
async function _guardarMensaje({ numero, contacto, nombre, texto, timestamp, saliente, msgId, desdeTelefono, tipo, mediaUrl, quotedMsgId, quotedTexto, quotedFromMe, status, asesor, contact_id }) {
  if (!supabase) return true
  try {
    const _row = { numero, contacto, nombre: nombre || null, texto, timestamp, saliente, desde_telefono: desdeTelefono || false, tipo: tipo || 'mensaje' }
    if (msgId) _row.msg_id = msgId
    if (status !== undefined) _row.status = status
    if (asesor) _row.asesor = asesor
    if (mediaUrl) _row.media_url = mediaUrl
    if (contact_id != null) _row.contact_id = contact_id
    if (quotedMsgId) { _row.quoted_msg_id = quotedMsgId; _row.quoted_texto = quotedTexto || null; _row.quoted_from_me = quotedFromMe ?? null }
    const { data } = await supabase.from('mensajes_wa').upsert(
      _row,
      { onConflict: 'msg_id', ignoreDuplicates: true }
    ).select('id')
    // Si no hay data es porque msg_id ya existía (ignoreDuplicates lo descartó) → duplicado
    const inserted = !msgId || (Array.isArray(data) && data.length > 0)

    // RC-1: consumir early ack si existe, tanto si se insertó como si ya existía.
    // Caso "ya existía" (inserted=false): el row viene de una sesión anterior con status=1.
    // El early ack lleva el status=2+ real que llegó tras el reinicio → aplicar igualmente.
    if (msgId) {
      const early = _earlyAcks.get(msgId)
      if (early) {
        _earlyAcks.delete(msgId)
        _waLog('RC1_APPLIED', { msgId, numero: early.numero, status: early.status, inserted })
        applyMsgStatus(msgId, early.numero, early.status, { sinAck: early.sinAck, source: 'rc1_recovery' })
      }
    }

    return inserted
  } catch (e) {
    console.error('[WA] Error guardando mensaje en Supabase:', e.message)
    return true
  }
}

// ── Limpieza de _earlyAcks huérfanos (TTL 30s) ───────────────────────────────
function _cleanEarlyAcks() {
  if (_earlyAcks.size === 0) return
  const cutoff = Date.now() - 30_000
  for (const [k, v] of _earlyAcks) {
    if (v._ts < cutoff) {
      _earlyAcks.delete(k)
      _waLog('RC1_EXPIRED', { msgId: k, numero: v.numero, status: v.status })
    }
  }
}

// ── Transición de estado central ─────────────────────────────────────────────
// Única función que persiste y emite cambios de estado de mensajes salientes.
// Garantías:
//   - Nunca degrada status real: el UPDATE solo ejecuta si el nuevo status supera al actual en DB.
//   - sinAck es ortogonal al status (delivery_unknown no pisa un accepted/delivered/read).
//   - Cancela el watchdog si llega ACK real (status ≥ 2).
//   - Emite WS siempre que se llame (el frontend tiene su propio guard de no-degradación).
//   - RC-1: si el UPDATE toca 0 filas (fila no existe aún), bufferiza en _earlyAcks.
//     _guardarMensaje lo consumirá al insertar la fila.
async function applyMsgStatus(msgId, numero, status, {
  sinAck = false, source = 'unknown',
  receiptType = null, receiptAt = null,
  deliveryUnknown = false
} = {}) {
  if (!msgId || !numero) return

  // Cancelar watchdog si llega confirmación real de WA servers
  if (!sinAck && status >= 2 && _pendingAcks.has(msgId)) {
    clearTimeout(_pendingAcks.get(msgId))
    _pendingAcks.delete(msgId)
  }

  if (supabase) {
    const now       = new Date().toISOString()
    const dbUpdate  = sinAck      ? { sin_ack: true }
                    : deliveryUnknown ? { delivery_unknown: true }
                    : { status, sin_ack: false, delivery_unknown: false }
    if (!sinAck && !deliveryUnknown && status === 3) dbUpdate.delivered_at = now
    if (!sinAck && !deliveryUnknown && status >= 4)  dbUpdate.read_at      = now
    // Persistir campos de receipt si vienen informados
    if (receiptType && !sinAck && !deliveryUnknown) {
      dbUpdate.last_receipt_type = receiptType
      dbUpdate.last_receipt_at   = receiptAt || now
      dbUpdate.receipt_source    = source
    }

    let q = supabase.from('mensajes_wa').update(dbUpdate)
      .eq('msg_id', msgId)
      .eq('numero', numero)
    // Prevenir degradación en DB: ejecutar solo si el nuevo status supera al actual.
    // No aplicar a deliveryUnknown: dbUpdate solo contiene { delivery_unknown: true },
    // no cambia status → el guard bloquearía la columna incorrectamente.
    if (!sinAck && !deliveryUnknown && status >= 2) q = q.lt('status', status)

    // RC-1 guard: detectar si el UPDATE tocó alguna fila.
    // Solo aplica cuando se cambia el status real (no para sinAck ni deliveryUnknown).
    if (!sinAck && !deliveryUnknown && status >= 2) {
      q = q.select('id')
      q.then(({ data, error }) => {
        if (error) { _waLog('STATUS_ERR', { msgId, status, source, error: error.message }); return }
        if (data && data.length > 0) return // UPDATE exitoso — nada más que hacer
        // 0 filas: verificar si la fila existe con status mayor (no-downgrade) o no existe (RC-1)
        supabase.from('mensajes_wa')
          .select('status')
          .eq('msg_id', msgId)
          .eq('numero', numero)
          .maybeSingle()
          .then(({ data: row }) => {
            if (row) {
              // Fila existe con status >= nuevo → no-downgrade legítimo, no es RC-1
              _waLog('STATUS_SKIPPED_NODEGR', { msgId, numero, newStatus: status, currentStatus: row.status, source })
            } else {
              // Fila genuinamente no existe → RC-1: bufferizar ACK
              _cleanEarlyAcks()
              const prev = _earlyAcks.get(msgId)
              if (!prev || status > prev.status) {
                _earlyAcks.set(msgId, { numero, status, sinAck, _ts: Date.now() })
                _waLog('RC1_BUFFERED', { msgId, numero, status, source })
              }
            }
          }, e => _waLog('STATUS_ERR', { msgId, status, source, error: e?.message }))
      }, e => _waLog('STATUS_ERR', { msgId, status, source, error: e?.message }))
    } else {
      q.then(() => {}, e => _waLog('STATUS_ERR', { msgId, status, sinAck, source, error: e?.message }))
    }
  }

  _waLog('STATUS', { msgId, status, sinAck, deliveryUnknown, source })
  broadcast({
    tipo: 'wa:msg_status', numero, msgId, status,
    ...(sinAck         && { sinAck: true }),
    ...(deliveryUnknown && { deliveryUnknown: true }),
  })
}

// ── Fase 4: Reconciliación de mensajes stale ─────────────────────────────────
// Consulta mensajes salientes recientes con status=1 o sin_ack=true y los corrige.
// Casos que detecta:
//   A) sin_ack=true + status>=2  → inconsistencia DB: limpiar sin_ack, broadcast RECONCILE_FIXED
//   B) status=1 + sin_ack=false + age>120s → watchdog perdido en restart: marcar sin_ack, broadcast RECONCILE_FIXED
//   C) sin_ack=true + status=1   → ya marcado correctamente, RECONCILE_SKIPPED
// Reglas:
//   - Nunca degrada status
//   - Emite WS solo si hubo cambio
//   - No reenvía mensajes
const RECONCILE_WINDOW_SEC       = 30 * 60  // últimos 30 minutos
const RECONCILE_INTERVAL_MS      = 90_000   // cada 90 segundos por sesión
const RECONCILE_WATCHDOG_AGE     = 120      // segundos antes de considerar watchdog perdido
const DELIVERY_UNKNOWN_AGE_SEC   = 15 * 60  // 15 min sin receipt de dispositivo → delivery_unknown

async function _reconciliarSesion(numero, { source = 'periodic' } = {}) {
  if (!supabase) return
  const entrada = sesiones.get(numero)
  if (!entrada || entrada.status !== 'conectado') return

  const desde = Math.floor(Date.now() / 1000) - RECONCILE_WINDOW_SEC
  const { data: stale, error } = await supabase.from('mensajes_wa')
    .select('msg_id, contacto, status, sin_ack, delivery_unknown, last_receipt_at, timestamp')
    .eq('numero', numero)
    .eq('saliente', true)
    .or('sin_ack.eq.true,status.lte.2,delivery_unknown.eq.true')
    .gte('timestamp', desde)

  if (error) { _waLog('RECONCILE_ERR', { numero, source, error: error.message }); return }
  if (!stale?.length) return

  _waLog('RECONCILE_SCAN', { numero, count: stale.length, source })

  for (const msg of stale) {
    const currentStatus     = msg.status || 0
    const hasSinAck         = !!msg.sin_ack
    const hasDelivUnknown   = !!msg.delivery_unknown
    const hasReceipt        = !!msg.last_receipt_at
    const ageSeconds        = Math.floor(Date.now() / 1000) - (msg.timestamp || 0)

    // Caso A: sin_ack=true pero WA ya confirmó (status>=2) → inconsistencia, limpiar sin_ack
    if (hasSinAck && currentStatus >= 2) {
      supabase.from('mensajes_wa')
        .update({ sin_ack: false })
        .eq('msg_id', msg.msg_id)
        .eq('numero', numero)
        .then(() => {
          broadcast({ tipo: 'wa:msg_status', numero, msgId: msg.msg_id, status: currentStatus })
          _waLog('RECONCILE_FIXED', { numero, msgId: msg.msg_id, reason: 'sin_ack_inconsistency', status: currentStatus, source })
        }, e => _waLog('RECONCILE_ERR', { numero, msgId: msg.msg_id, error: e?.message }))
      continue
    }

    // Caso B: status<=1, sin_ack=false, age>120s → watchdog perdido en restart
    if (currentStatus <= 1 && !hasSinAck && ageSeconds > RECONCILE_WATCHDOG_AGE) {
      applyMsgStatus(msg.msg_id, numero, 1, { sinAck: true, source: 'reconcile_stale' })
      _waLog('RECONCILE_FIXED', { numero, msgId: msg.msg_id, reason: 'watchdog_lost', ageSeconds, source })
      continue
    }

    // Caso C: delivery_unknown=true pero ya llegó receipt real (status>=3) → limpiar
    if (hasDelivUnknown && currentStatus >= 3) {
      supabase.from('mensajes_wa')
        .update({ delivery_unknown: false })
        .eq('msg_id', msg.msg_id)
        .eq('numero', numero)
        .then(() => {
          broadcast({ tipo: 'wa:msg_status', numero, msgId: msg.msg_id, status: currentStatus })
          _waLog('RECONCILE_FIXED', { numero, msgId: msg.msg_id, reason: 'delivery_unknown_cleared', status: currentStatus, source })
        }, e => _waLog('RECONCILE_ERR', { numero, msgId: msg.msg_id, error: e?.message }))
      continue
    }

    // Caso D: status<=2, sin receipt de dispositivo tras 15 min → delivery_unknown
    // No aplica si ya tiene sin_ack (es una condición diferente) ni si ya está marcado
    if (!hasSinAck && !hasDelivUnknown && !hasReceipt
        && currentStatus <= 2 && ageSeconds > DELIVERY_UNKNOWN_AGE_SEC) {
      applyMsgStatus(msg.msg_id, numero, currentStatus, {
        deliveryUnknown: true, source: 'reconcile_stale'
      })
      _waLog('RECONCILE_FIXED', { numero, msgId: msg.msg_id, reason: 'delivery_unknown_timeout', ageSeconds, source })
      continue
    }

    // Caso E: ya está correctamente marcado
    _waLog('RECONCILE_SKIPPED', { numero, msgId: msg.msg_id, status: currentStatus, sin_ack: hasSinAck, delivery_unknown: hasDelivUnknown, ageSeconds, source })
  }
}

// Exportada para llamar desde index.js al conectar un WS client
export async function reconciliarTodasSesiones({ source = 'ws_connect' } = {}) {
  for (const [numero, entrada] of sesiones) {
    if (entrada.status === 'conectado') {
      _reconciliarSesion(numero, { source }).catch(() => {})
    }
  }
}

async function _upsertSesion(numero, sede, status) {
  if (!supabase) return
  try {
    await supabase.from('sesiones_wa').upsert(
      { numero, sede, status, ultima_conexion: new Date().toISOString() },
      { onConflict: 'numero' }
    )
  } catch (e) {
    console.error('[WA] Error actualizando sesion_wa:', e.message)
  }
}

// ── Iniciar sesión ──────────────────────────────────────────────────────────
export async function iniciarSesion(numero, sede) {
  if (sesiones.has(numero)) {
    console.log(`[WA] Sesión ${numero} ya activa`)
    return
  }

  // Cooldown post-401: evitar spam de reconexiones con sesión inválida
  const _cooldownUntil = _cooldowns.get(numero)
  if (_cooldownUntil && Date.now() < _cooldownUntil) {
    const secsLeft = Math.ceil((_cooldownUntil - Date.now()) / 1000)
    console.log(`[WA] ⏳ Cooldown activo para ${numero} — ${secsLeft}s restantes`)
    throw new Error(`Espera ${secsLeft}s antes de reconectar ${numero}`)
  }
  _cooldowns.delete(numero)

  // Adquirir lock Redis — garantiza un solo socket activo por número entre procesos.
  // Si el lock está ocupado (pm2 reload: proceso viejo aún vivo), programa un reintento
  // para cuando el lock expire y el proceso viejo haya muerto.
  const lockOwner = await _acquireLock(numero)
  if (lockOwner === null) {
    const retryMs = (LOCK_TTL_SEC + 5) * 1000
    _waLog('LOCK', { numero, evento: 'reintento_programado', en_seg: LOCK_TTL_SEC + 5 })
    setTimeout(() => iniciarSesion(numero, sede), retryMs)
    return
  }

  const sessionPath = path.join(SESSIONS_DIR, numero)
  mkdirSync(sessionPath, { recursive: true })

  // Verificar integridad de archivos de sesión antes de usarlos
  try {
    const { readdirSync, statSync } = await import('fs')
    const sessionFiles = readdirSync(sessionPath).filter(f => f.endsWith('.json'))
    for (const file of sessionFiles) {
      const fp = path.join(sessionPath, file)
      if (statSync(fp).size === 0) throw new Error(`archivo vacío: ${file}`)
      try { JSON.parse(readFileSync(fp, 'utf8')) } catch { throw new Error(`JSON inválido: ${file}`) }
    }
  } catch (integrityErr) {
    console.log(`[WA] ⚠️  Archivos de sesión corruptos para ${numero} — limpiando: ${integrityErr.message}`)
    try { rmSync(sessionPath, { recursive: true, force: true }) } catch {}
    mkdirSync(sessionPath, { recursive: true })
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
  const version = await _getVersion() // cacheada 24h — evita llamada a GitHub en cada reconexión

  _waLog('INIT', { numero, sede, baileys: version.join('.'), pid: process.pid })
  // Limpiar colas atascadas de sesión anterior (claves con prefijo 'numero:')
  for (const k of _msgQueues.keys()) {
    if (k.startsWith(numero + ':')) _msgQueues.delete(k)
  }

  // ── Instrumentación Signal: detectar creación/reemplazo de sesiones por peer ──
  // Baileys llama a keys.set({ sessions: { [jid]: <data> } }) cuando:
  //   - SIGNAL_SESSION_CREATED: primer PreKeyMessage de un peer nuevo
  //   - SIGNAL_SESSION_REPLACED: "Closing open session in favor of incoming prekey bundle"
  // La distinción se hace leyendo la sesión existente ANTES de escribir.
  // SIGNAL_RESET_PEER (null) ya tiene su propio log — aquí se omite.
  const _rawKeys = state.keys
  const _instrumentedKeys = {
    get: (...args) => _rawKeys.get(...args),
    set: async (data) => {
      if (data.sessions) {
        for (const [jid, session] of Object.entries(data.sessions)) {
          if (session === null) { _rawKeys.set(data); continue }
          try {
            const prev = await _rawKeys.get('sessions', [jid])
            const existed = prev?.[jid] != null
            _waLog(existed ? 'SIGNAL_SESSION_REPLACED' : 'SIGNAL_SESSION_CREATED', { numero, jid })
          } catch {}
        }
      }
      return _rawKeys.set(data)
    },
  }
  if (_rawKeys.clear) _instrumentedKeys.clear = (...args) => _rawKeys.clear(...args)

  sesiones.set(numero, { numero_sesion: numero, socket: null, status: 'conectando', qr: null, sede, contactos: new Map(), lidToPhone: new Map(), phoneToLid: new Map(), reconnectAttempts: 0, lockOwner, heartbeatInterval: null, reconcileInterval: null, keyStore: _instrumentedKeys, saveCreds })

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(_instrumentedKeys, logger),
    },
    logger,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    keepAliveIntervalMs: 20_000,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: undefined,
    retryRequestDelayMs: 250,
    maxMsgRetryCount: 5,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    // Necesario para que Baileys pueda descifrar ediciones y retransmisiones.
    // Sin esto, los mensajes editados de contactos @lid llegan como conversación nueva.
    getMessage: async (key) => {
      // Primero buscar en el store en memoria (síncrono-compatible, más rápido)
      const storeMsg = store?.getMessageFromStore ? store.getMessageFromStore(key.remoteJid, key.id) : null
      if (storeMsg?.message) return storeMsg.message
      // Fallback: buscar en Supabase
      if (!supabase) return undefined
      try {
        const { data } = await supabase
          .from('mensajes_wa')
          .select('texto')
          .eq('msg_id', key.id)
          .eq('numero', numero)
          .maybeSingle()
        if (data?.texto) return { conversation: data.texto }
      } catch {}
      return undefined
    },
  })

  // Cache mínima en Map (makeInMemoryStore eliminado en Baileys 6.7.x)
  const store = null

  sesiones.get(numero).socket = sock

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    const entrada = sesiones.get(numero)
    if (!entrada) return

    if (qr) {
      entrada.qr     = qr
      entrada.status = 'esperando_qr'
      try {
        const qrPng = await QRCode.toDataURL(qr)
        broadcast({ tipo: 'wa:qr', numero, sede, qr: qrPng })
      } catch {
        broadcast({ tipo: 'wa:qr', numero, sede, qr })
      }
      console.log(`[WA] QR generado para ${numero} (${sede})`)
    }

    if (connection === 'connecting') {
      broadcast({ tipo: 'wa:status', numero, sede, status: 'conectando' })
      console.log('[WA] QR escaneado, conectando: ' + numero)
    }

    if (connection === 'open') {
      entrada.status = 'conectado'
      entrada.qr     = null
      _reconnectAttempts.delete(numero)
      _badSessionAttempts.delete(numero)
      broadcast({ tipo: 'wa:status', numero, sede, status: 'conectado' })
      // ── WA_CONN_OPEN ──────────────────────────────────────────────────────
      const _inc      = _incidents.get(numero)
      const _downtime = _inc ? Date.now() - _inc.closedAt : null
      _logConnEvent('WA_CONN_OPEN', {
        numero, sede,
        incidentId: _inc?.incidentId ?? null,
        downtimeMs: _downtime,
        metadata: { source: _inc ? 'reconnect' : 'initial' },
      })
      _incidents.delete(numero)
      _connectedAt.set(numero, Date.now())
      _msgCounters.set(numero, { sent: 0, recv: 0 })
      // ─────────────────────────────────────────────────────────────────────
      _waLog('CONN', { numero, sede, evento: 'conectado' })
      await _upsertSesion(numero, sede, 'conectado')
      // Arrancar heartbeat del lock Redis
      if (entrada.lockOwner && !entrada.heartbeatInterval) {
        entrada.heartbeatInterval = _startHeartbeat(numero, entrada.lockOwner)
      }
      // Precargar mapeo lid→phone desde wa_identidades + wa_contact_jids (persiste entre reinicios)
      if (supabase) {
        try {
          const { data: rows } = await supabase
            .from('wa_identidades').select('lid, telefono')
          for (const r of rows || []) {
            const ph = r.telefono.length === 10 ? '57' + r.telefono : r.telefono
            entrada.lidToPhone.set(r.lid, ph)
            entrada.phoneToLid.set(ph, r.lid)
          }
          if (rows?.length) console.log(`[WA] ${rows.length} identidad(es) lid↔phone precargadas desde wa_identidades para ${numero}`)
        } catch(e) {
          console.error('[WA] Error precargando wa_identidades:', e.message)
        }
        // También cargar desde wa_contact_jids (unificaciones manuales que no están en wa_identidades)
        try {
          const { data: jidRows } = await supabase.from('wa_contact_jids')
            .select('jid, jid_type, contact_id').eq('numero_sesion', numero)
          if (jidRows?.length) {
            const byContact = new Map()
            for (const r of jidRows) {
              if (!byContact.has(r.contact_id)) byContact.set(r.contact_id, {})
              if (r.jid_type === 'phone') byContact.get(r.contact_id).phone = r.jid
              else if (r.jid_type === 'lid') byContact.get(r.contact_id).lid = r.jid
            }
            let added = 0
            for (const [, pair] of byContact) {
              if (pair.phone && pair.lid && !entrada.lidToPhone.has(pair.lid)) {
                entrada.lidToPhone.set(pair.lid, pair.phone)
                entrada.phoneToLid.set(pair.phone, pair.lid)
                added++
              }
            }
            if (added) console.log(`[WA] ${added} mapeo(s) lid↔phone adicionales precargados desde wa_contact_jids para ${numero}`)
          }
        } catch(e) {
          console.error('[WA] Error precargando wa_contact_jids:', e.message)
        }
      }
      // Reconciliación al reconectar: espera 10s para que Baileys entregue
      // primero los messages.update pendientes de la reconexión.
      setTimeout(() => _reconciliarSesion(numero, { source: 'reconnect' }).catch(() => {}), 10_000)
      // Intervalo periódico por sesión — se cancela al desconectar
      if (entrada.reconcileInterval) clearInterval(entrada.reconcileInterval)
      entrada.reconcileInterval = setInterval(
        () => _reconciliarSesion(numero, { source: 'periodic' }).catch(() => {}),
        RECONCILE_INTERVAL_MS
      )
    }

    if (connection === 'close') {
      const codigo    = lastDisconnect?.error?.output?.statusCode
      const motivo    = lastDisconnect?.error?.message || 'sin detalle'
      const razon     = DR_NAMES[codigo] || `desconocido_${codigo}`
      const lockOwner = entrada.lockOwner

      // Detener heartbeat y reconciliación
      if (entrada.heartbeatInterval) {
        clearInterval(entrada.heartbeatInterval)
        entrada.heartbeatInterval = null
      }
      if (entrada.reconcileInterval) {
        clearInterval(entrada.reconcileInterval)
        entrada.reconcileInterval = null
      }

      // ── WA_CONN_CLOSED ────────────────────────────────────────────────────
      const _incId     = randomUUID()
      const _closedAt  = Date.now()
      const _prevConn  = _connectedAt.get(numero)
      const _connDurMs = _prevConn ? _closedAt - _prevConn : null
      const _ctrs      = _msgCounters.get(numero) ?? { sent: 0, recv: 0 }
      _incidents.set(numero, { incidentId: _incId, closedAt: _closedAt })
      _logConnEvent('WA_CONN_CLOSED', {
        numero, sede,
        incidentId: _incId,
        statusCode: codigo,
        reason: razon,
        errorMessage: motivo,
        connectedDurationMs: _connDurMs,
        msgSent: _ctrs.sent,
        msgRecv: _ctrs.recv,
        metadata: { motivo },
      })
      // ─────────────────────────────────────────────────────────────────────
      _waLog('CONN', { numero, sede, evento: 'cerrado', codigo, razon, motivo })

      // ── 1a. badSession (500): reintentar hasta 2 veces antes de exigir QR ──
      if (codigo === 500) {
        const intentosBad = (_badSessionAttempts.get(numero) || 0) + 1
        _badSessionAttempts.set(numero, intentosBad)
        const MAX_BAD_SESSION = 2
        if (intentosBad <= MAX_BAD_SESSION) {
          // Delay 10s base + jitter 0-5s por sesión — reduce downtime (antes 30s fijo)
          // y desincroniza oleadas cuando múltiples sesiones caen simultáneamente
          const delay = 10_000 + Math.floor(Math.random() * 5_000)
          _waLog('CONN', { numero, evento: 'bad_session_reintento', intento: intentosBad, max: MAX_BAD_SESSION, accion: `reconectar_${Math.round(delay/1000)}s` })
          _logConnEvent('WA_CONN_RECONNECTING', {
            numero, sede,
            statusCode: codigo, reason: razon,
            retryAttempt: intentosBad, scheduledDelayMs: delay,
            metadata: { path: 'bad_session' },
          })
          _cooldowns.set(numero, Date.now() + delay)
          entrada.status = 'reconectando'
          broadcast({ tipo: 'wa:status', numero, sede, status: 'reconectando' })
          sesiones.delete(numero)
          await _releaseLock(numero, lockOwner)
          setTimeout(() => iniciarSesion(numero, sede), delay)
          return
        }
        // Superó los reintentos → archivos genuinamente corruptos, pedir QR
        _badSessionAttempts.delete(numero)
        const sessionPath = path.join(SESSIONS_DIR, numero)
        try { rmSync(sessionPath, { recursive: true, force: true }) } catch {}
        _waLog('CONN', { numero, evento: 'sesion_invalidada', codigo, razon, accion: 'escanear_qr_nuevo' })
        _cooldowns.set(numero, Date.now() + 60_000)
        _reconnectAttempts.delete(numero)
        entrada.status = 'desconectado'
        broadcast({ tipo: 'wa:status', numero, sede, status: 'desconectado', codigo })
        await _upsertSesion(numero, sede, 'desconectado')
        sesiones.delete(numero)
        await _releaseLock(numero, lockOwner)
        return
      }

      // ── 1b. Códigos que invalidan la sesión definitivamente: exigir QR nuevo ──
      // 401 por "conflict" NO invalida creds — solo reconectar sin borrar archivos
      // 440 (connectionReplaced) tampoco — ya cae al backoff por no estar en requiereQR
      const esConflict  = codigo === DisconnectReason.loggedOut && motivo.includes('conflict')
      const requiereQR  = !esConflict && (
                            codigo === DisconnectReason.loggedOut   // 401 — sesión revocada
                         || codigo === DisconnectReason.forbidden   // 403 — cuenta bloqueada
                         )

      if (requiereQR) {
        const sessionPath = path.join(SESSIONS_DIR, numero)
        try { rmSync(sessionPath, { recursive: true, force: true }) } catch {}
        _waLog('CONN', { numero, evento: 'sesion_invalidada', codigo, razon, accion: 'escanear_qr_nuevo' })
        _cooldowns.set(numero, Date.now() + 60_000)
        _reconnectAttempts.delete(numero)
        entrada.status = 'desconectado'
        broadcast({ tipo: 'wa:status', numero, sede, status: 'desconectado', codigo })
        await _upsertSesion(numero, sede, 'desconectado')
        sesiones.delete(numero)
        await _releaseLock(numero, lockOwner)
        return
      }

      // ── 2. restartRequired (515): recrear socket inmediatamente, creds intactas ──
      if (codigo === DisconnectReason.restartRequired) {
        _waLog('CONN', { numero, evento: 'restart_required', accion: 'recrear_socket_500ms' })
        _logConnEvent('WA_CONN_RECONNECTING', {
          numero, sede,
          statusCode: codigo, reason: razon,
          retryAttempt: 1, scheduledDelayMs: 500,
          metadata: { path: 'restart_required' },
        })
        sesiones.delete(numero)
        await _releaseLock(numero, lockOwner)
        setTimeout(() => iniciarSesion(numero, sede), 500)
        return
      }

      // ── 3. Contador de intentos persistente entre reconexiones ──
      const MAX_RECONEXIONES = 5
      const intentos = (_reconnectAttempts.get(numero) || 0) + 1
      _reconnectAttempts.set(numero, intentos)

      // ── 4. Circuit breaker — demasiadas desconexiones en ventana de tiempo ──
      const cbActivado = _circuitBreakerCheck(numero)
      if (cbActivado) {
        _waLog('CB', { numero, evento: 'activado', desconexiones: CB_MAX_DISCONNECTS, ventana_min: CB_WINDOW_MS / 60000, pausa_min: CB_PAUSE_MS / 60000 })
        _cooldowns.set(numero, Date.now() + CB_PAUSE_MS)
        _reconnectAttempts.delete(numero)
        entrada.status = 'desconectado'
        broadcast({ tipo: 'wa:status', numero, sede, status: 'desconectado', codigo })
        await _upsertSesion(numero, sede, 'desconectado')
        sesiones.delete(numero)
        await _releaseLock(numero, lockOwner)
        return
      }

      // ── 5. Máximo de intentos: pausar sin borrar archivos ──
      const agotar = intentos > MAX_RECONEXIONES
      if (agotar) {
        _waLog('CONN', { numero, evento: 'max_reconexiones', intentos, max: MAX_RECONEXIONES, accion: 'pausado_reconectar_desde_panel' })
        _cooldowns.set(numero, Date.now() + 120_000)
        _reconnectAttempts.delete(numero)
        entrada.status = 'desconectado'
        broadcast({ tipo: 'wa:status', numero, sede, status: 'desconectado', codigo })
        await _upsertSesion(numero, sede, 'desconectado')
        sesiones.delete(numero)
        await _releaseLock(numero, lockOwner)
        return
      }

      // ── 6. Reconexión con backoff exponencial + jitter ±20% ──
      const jitter = 0.8 + Math.random() * 0.4
      const delay  = Math.round(Math.min(3000 * Math.pow(2, intentos - 1), 60_000) * jitter)
      _waLog('RECONN', { numero, sede, codigo, razon, intento: intentos, max: MAX_RECONEXIONES, delay_seg: (delay / 1000).toFixed(1) })
      _logConnEvent('WA_CONN_RECONNECTING', {
        numero, sede,
        statusCode: codigo, reason: razon,
        retryAttempt: intentos, scheduledDelayMs: delay,
        metadata: { path: 'backoff' },
      })

      entrada.status = 'reconectando'
      broadcast({ tipo: 'wa:status', numero, sede, status: 'reconectando', codigo })
      await _upsertSesion(numero, sede, 'reconectando')
      sesiones.delete(numero)
      await _releaseLock(numero, lockOwner)
      setTimeout(() => iniciarSesion(numero, sede), delay)
    }
  })

  async function _registrarLidMapping(entrada, c) {
    if (!c.id || !c.id.endsWith('@s.whatsapp.net') || !c.lid) return
    const phone = _phoneDesdeJid(c.id)
    const lid   = _phoneDesdeJid(c.lid)
    if (!phone || !lid) return
    entrada.lidToPhone.set(lid, phone)
    // Notificar a mensajes que estaban esperando resolución de este lid
    if (_pendingLidResolutions.has(lid)) {
      for (const resolve of _pendingLidResolutions.get(lid)) resolve(phone)
      _pendingLidResolutions.delete(lid)
    }
    if (supabase) {
      try {
        // Persistir en wa_identidades — fuente de verdad lid↔teléfono, sin depender del esquema de clientes
        await supabase.from('wa_identidades')
          .upsert({ lid, telefono: phone, numero_sesion: numero }, { onConflict: 'lid' })

        // Migrar mensajes y asignaciones que llegaron bajo el lid antes de resolverlo
        const { count } = await supabase.from('mensajes_wa')
          .select('id', { count: 'exact', head: true })
          .eq('numero', numero).eq('contacto', lid)
        if (count) {
          // Guard: si phone ya tiene mensajes de otro contacto, no fusionar automáticamente
          if (await _checkIdentityConflict(numero, sede, lid, phone)) return
          // Rescatar asignación activa del lid ANTES de desactivarla para transferirla al número real
          const { data: asigLid } = await supabase.from('asignaciones_wa')
            .select('asesor, estado')
            .eq('numero', numero).eq('contacto', lid).eq('activo', true)
            .maybeSingle()
          await supabase.from('mensajes_wa').update({ contacto: phone }).eq('numero', numero).eq('contacto', lid)
          await supabase.from('asignaciones_wa').update({ activo: false }).eq('numero', numero).eq('contacto', lid)
          if (asigLid?.asesor) {
            await supabase.from('asignaciones_wa').upsert(
              { numero, contacto: phone, asesor: asigLid.asesor, estado: asigLid.estado || 'asignado', activo: true },
              { onConflict: 'numero,contacto' }
            )
          }
          broadcast({ tipo: 'wa:merge', numero, sede, lidPhone: lid, realPhone: phone })
          console.log('[WA] IDENTITY_LINKED ' + count + ' mensajes de ' + lid + ' → ' + phone)
        }
      } catch(e) {
        console.error('[WA] Error procesando lid:', e.message)
      }
    }
  }

  sock.ev.on('contacts.upsert', async (contacts) => {
    const entrada = sesiones.get(numero)
    if (!entrada) return
    for (const c of contacts) {
      await _registrarLidMapping(entrada, c)
      if (!_jidValido(c.id)) continue
      const phone = _phoneDesdeJid(c.id)
      const name  = c.name || c.notify || null
      if (!name) continue
      entrada.contactos.set(phone, name)
      broadcast({ tipo: 'wa:contacto', numero, sede, phone, name })
    }
  })

  sock.ev.on('contacts.update', async (updates) => {
    const entrada = sesiones.get(numero)
    if (!entrada) return
    for (const c of updates) {
      await _registrarLidMapping(entrada, c)
      if (!_jidValido(c.id)) continue
      const phone = _phoneDesdeJid(c.id)
      const name  = c.name || c.notify || null
      if (!name) continue
      entrada.contactos.set(phone, name)
      broadcast({ tipo: 'wa:contacto', numero, sede, phone, name })
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      try {
      const remitente = msg.key.remoteJid
      if (!_jidValido(remitente)) continue

      const fromMe  = !!msg.key.fromMe

      // ── Detección de fallo de descifrado Signal (per-peer) ─────────────
      // msg.message === null indica que Baileys no pudo descifrar el mensaje.
      // Solo evidencia directa — sin atribución heurística desde stderr.
      if (!fromMe) {
        if (msg.message == null) {
          _onSignalDecryptFail(numero, remitente)
          continue
        }
        // Mensaje descifrado correctamente → confirmar recovery si aplica
        _onSignalRecovered(numero, remitente)
        // Contabilizar mensajes entrantes para estadísticas de conexión
        const _mcr = _msgCounters.get(numero); if (_mcr) _mcr.recv++
      }

      // ── Reacciones ─────────────────────────────────────────────────────
      const reaccion = msg.message?.reactionMessage
      if (reaccion) {
        const targetMsgId = reaccion.key?.id
        const emoji       = reaccion.text || ''  // '' = quitar reacción
        const reactor     = fromMe ? 'asesor' : 'cliente'
        const phone       = _phoneDesdeJid(remitente)
        if (targetMsgId && supabase) {
          try {
            const { data: row } = await supabase.from('mensajes_wa')
              .select('id, reactions').eq('msg_id', targetMsgId).single()
            if (row) {
              const newReactions = { ...(row.reactions || {}) }
              if (emoji) newReactions[reactor] = emoji
              else delete newReactions[reactor]
              await supabase.from('mensajes_wa').update({ reactions: newReactions }).eq('id', row.id)
              broadcast({ tipo: 'wa:reaccion', numero, contacto: phone, targetMsgId, reactor, emoji })
            }
          } catch (e) {
            console.error('[WA] Error guardando reacción:', e.message)
          }
        }
        continue  // no procesar como mensaje normal
      }
      // ── Mensajes editados ─────────────────────────────────────────────
      // Formato 1: editedMessage wrapper (cliente edita desde app WA)
      // msg.message = { editedMessage: { message: { protocolMessage: { type:14, key:{id}, editedMessage:{conversation} } } } }
      if (msg.message?.editedMessage) {
        const ew = msg.message.editedMessage
        const innerProto = ew.message?.protocolMessage
        const originalMsgId = innerProto?.key?.id || null
        const innerM = extractMessageContent(innerProto?.editedMessage) || innerProto?.editedMessage || ew.message || {}
        const textoEditado = innerM.conversation || innerM.extendedTextMessage?.text || null
        const _peRaw = _phoneDesdeJid(remitente)
        const _peEntrada = sesiones.get(numero)
        const phoneEdit = (remitente.endsWith('@lid') && _peEntrada?.lidToPhone?.get(_peRaw)) || _peRaw
        if (originalMsgId && textoEditado && supabase) {
          try {
            await supabase.from('mensajes_wa').update({ texto: textoEditado, editado: true }).eq('msg_id', originalMsgId)
            broadcast({ tipo: 'wa:msg_edit', numero, contacto: phoneEdit, msgId: originalMsgId, textoNuevo: textoEditado })
          } catch (e) { console.error('[WA] Error guardando edicion wrapper:', e.message) }
        }
        continue
      }

      // Formato 2: protocolMessage.type === 14 directo en upsert (asesor edita desde celular, fromMe:true)
      const protoMsg = msg.message?.protocolMessage
      // Saltar protocolMessages que no son ediciones (type 17 sync, etc.)
      if (protoMsg && !(protoMsg.type === 14 && protoMsg.editedMessage)) continue
      if (protoMsg?.type === 14 && protoMsg?.editedMessage) {
        const originalMsgId = protoMsg.key?.id
        const editM = extractMessageContent(protoMsg.editedMessage) || protoMsg.editedMessage || {}
        const textoEditado = editM.conversation || editM.extendedTextMessage?.text || null
        const _pe2Raw = _phoneDesdeJid(remitente)
        const _pe2Entrada = sesiones.get(numero)
        const phoneEdit = (remitente.endsWith('@lid') && _pe2Entrada?.lidToPhone?.get(_pe2Raw)) || _pe2Raw
        if (originalMsgId && textoEditado && supabase) {
          try {
            await supabase.from('mensajes_wa')
              .update({ texto: textoEditado, editado: true })
              .eq('msg_id', originalMsgId)
            broadcast({ tipo: 'wa:msg_edit', numero, contacto: phoneEdit, msgId: originalMsgId, textoNuevo: textoEditado })
          } catch (e) { console.error('[WA] Error guardando edicion:', e.message) }
        }
        continue  // no procesar como mensaje normal
      }
      // ───────────────────────────────────────────────────────────────────

      // Saltar mensajes internos de WA que acompañan ediciones del cliente
      if (msg.message?.secretEncryptedMessage) continue

      // extractMessageContent desenvuelve wrappers de Baileys (viewOnce, ephemeral, edited, etc.)
      // evitando que mensajes de texto lleguen como '[multimedia]' por estar anidados
      const m = extractMessageContent(msg.message) || msg.message || {}
      // Si el mensaje no tiene contenido real (solo messageContextInfo/secretEncryptedMessage), saltar.
      // - messageContextInfo: metadata interna de WA
      // - secretEncryptedMessage: mensaje cifrado que WA envía junto a ediciones del cliente
      const _SKIP_KEYS = new Set(['messageContextInfo', 'secretEncryptedMessage'])
      if (!Object.keys(m).some(k => !_SKIP_KEYS.has(k))) continue
      // Catch-all: si extractMessageContent devolvio un protocolMessage type 14, es una edicion
      // (puede ocurrir si el edit llego envuelto en viewOnce u otro wrapper no anticipado)
      if (m.protocolMessage?.type === 14 && m.protocolMessage?.editedMessage) {
        const innerProto = m.protocolMessage
        const originalMsgId = innerProto.key?.id || null
        const innerM = extractMessageContent(innerProto.editedMessage) || innerProto.editedMessage || {}
        const textoEditado = innerM.conversation || innerM.extendedTextMessage?.text || null
        const _pe3Raw = _phoneDesdeJid(remitente)
        const _pe3Entrada = sesiones.get(numero)
        const phoneEdit = (remitente.endsWith('@lid') && _pe3Entrada?.lidToPhone?.get(_pe3Raw)) || _pe3Raw
        if (originalMsgId && textoEditado && supabase) {
          try {
            await supabase.from('mensajes_wa').update({ texto: textoEditado, editado: true }).eq('msg_id', originalMsgId)
            broadcast({ tipo: 'wa:msg_edit', numero, contacto: phoneEdit, msgId: originalMsgId, textoNuevo: textoEditado })
          } catch (e) { console.error('[WA] Error guardando edicion catch-all:', e.message) }
        }
        continue
      }
      const tipoMsg = m.imageMessage    ? 'imagen'
                  : m.videoMessage    ? 'video'
                  : m.audioMessage    ? (m.audioMessage.ptt ? 'voz' : 'audio')
                  : m.documentMessage ? 'documento'
                  : m.stickerMessage  ? 'sticker'
                  : 'mensaje'
      const texto = m.conversation
        || m.extendedTextMessage?.text
        || (m.imageMessage      ? '📷 Imagen'    + (m.imageMessage.caption      ? ': ' + m.imageMessage.caption      : '') : null)
        || (m.videoMessage      ? '🎥 Video'     + (m.videoMessage.caption      ? ': ' + m.videoMessage.caption      : '') : null)
        || (m.audioMessage      ? (m.audioMessage.ptt ? '🎤 Nota de voz' : '🎵 Audio') : null)
        || (m.documentMessage   ? '📄 ' + (m.documentMessage.fileName || 'Documento') : null)
        || (m.stickerMessage    ? '🎭 Sticker'   : null)
        || (m.locationMessage   ? '📍 Ubicacion' : null)
        || (m.contactMessage    ? '👤 Contacto'  : null)
        || '[multimedia]'
      // Extraer mensaje citado (reply)
      const _ctx = m.extendedTextMessage?.contextInfo
      const quotedMsgId  = _ctx?.stanzaId || null
      const quotedTexto  = quotedMsgId ? (_ctx.quotedMessage?.conversation || _ctx.quotedMessage?.extendedTextMessage?.text || '[Multimedia]') : null
      const quotedFromMe = quotedMsgId ? _sentMsgIds.has(quotedMsgId) : null

      const entrada2  = sesiones.get(numero)
      const lidPhone  = remitente.endsWith('@lid') ? _phoneDesdeJid(remitente) : null
      let phone
      if (lidPhone) {
        // Caso especial: eco de mensaje enviado desde Everest que regresó como @lid
        // → WA normalizó al JID de privacidad del contacto; usamos el mapeo msgId→phone
        // guardado en _pendingMsgToPhone para establecer lid→realPhone sin contacts.upsert
        const msgIdEco = msg.key.id
        if (fromMe && _pendingMsgToPhone.has(msgIdEco)) {
          const realPhone = _pendingMsgToPhone.get(msgIdEco)
          _pendingMsgToPhone.delete(msgIdEco)
          if (realPhone && realPhone !== lidPhone) {
            console.log('[WA] lid detectado por eco propio:', lidPhone, '→', realPhone)
            await _registrarLidMapping(entrada2, {
              id:  realPhone + '@s.whatsapp.net',
              lid: lidPhone  + '@lid',
            })
          }
          phone = realPhone || lidPhone
        } else {
          phone = await _resolverLid(entrada2, lidPhone, 1500)
          if (phone !== lidPhone) {
            console.log('[WA] @lid resuelto: ' + lidPhone + ' → ' + phone)
            // Migrar mensajes y asignación activa de lid → número real en Supabase.
            // Esto garantiza que _loadAsignaciones() cargue el contacto correcto (número real)
            // y no sobreescriba la transferencia local que hace _onMerge en el frontend.
            // Guard: si phone ya tiene mensajes de otro contacto, mantener el mensaje bajo el lid
            if (await _checkIdentityConflict(numero, sede, lidPhone, phone)) {
              phone = lidPhone
            } else if (supabase) {
              try {
                const { data: asigLid } = await supabase.from('asignaciones_wa')
                  .select('asesor, estado')
                  .eq('numero', numero).eq('contacto', lidPhone).eq('activo', true)
                  .maybeSingle()
                // Migrar mensajes previos almacenados bajo el lid
                await supabase.from('mensajes_wa')
                  .update({ contacto: phone })
                  .eq('numero', numero).eq('contacto', lidPhone)
                if (asigLid) {
                  // Migrar asignación activa del lid al número real
                  await supabase.from('asignaciones_wa')
                    .update({ activo: false })
                    .eq('numero', numero).eq('contacto', lidPhone)
                  await supabase.from('asignaciones_wa').upsert(
                    { numero, contacto: phone, asesor: asigLid.asesor, estado: asigLid.estado || 'asignado', activo: true },
                    { onConflict: 'numero,contacto' }
                  )
                  console.log('[WA] Asignacion migrada lid→real: ' + lidPhone + ' → ' + phone + ' (asesor: ' + asigLid.asesor + ')')
                }
              } catch(e) {
                console.error('[WA] Error migrando lid→real en incoming:', e.message)
              }
              // Emitir wa:merge para limpiar conversación @lid residual en el frontend.
              // _onMerge en el frontend es idempotente: si la conv lid ya fue fusionada, no hace nada.
              broadcast({ tipo: 'wa:merge', numero, sede, lidPhone, realPhone: phone })
            }
          } else {
            console.log('[WA] @lid sin resolver: ' + lidPhone + ' — usando lid como contacto')
          }
        }
      } else {
        phone = _phoneDesdeJid(remitente)
      }
      const pushName = msg.pushName || entrada2?.contactos?.get(phone) || null
      const ts       = typeof msg.messageTimestamp === 'number'
        ? msg.messageTimestamp
        : Number(msg.messageTimestamp)

      const enviadoDesdeEverest = fromMe && msg.key.id && _sentMsgIds.has(msg.key.id)
      const desdeTelefono = fromMe && !enviadoDesdeEverest

      console.log(`[WA] ${fromMe ? `${numero} →` : `${remitente} →`} ${fromMe ? remitente : numero} (${sede})${desdeTelefono ? ' [celular]' : ''}: ${texto}`)

      if (enviadoDesdeEverest) {
        _sentMsgIds.delete(msg.key.id)
        // NO cancelar watchdog aquí — messages.upsert es el eco LOCAL de Baileys,
        // se dispara aunque la red esté caída y el mensaje nunca llegue a WA servers.
        // El watchdog se cancela en messages.update cuando WA servers confirman (status≥2).
      }

      // Descargar y subir media si aplica
      let mediaUrl = null
      const esMedia = tipoMsg !== 'mensaje'
      if (esMedia && supabase) {
        mediaUrl = await _subirMedia(entrada2.socket, msg, tipoMsg, msg.key.id, numero)
      }

      // contact_id live resolution — vincula mensajes a wa_contacts (dual-write LID si aplica)
      const _incomingContactId = await _liveResolveContactId(numero, phone).catch(() => null)

      const esNuevo = await _guardarMensaje({
        numero,
        contacto:    phone,
        nombre:      fromMe ? null : pushName,
        texto,
        timestamp:   ts,
        saliente:    fromMe,
        msgId:       msg.key.id,
        desdeTelefono: desdeTelefono,
        tipo:        tipoMsg,
        mediaUrl,
        quotedMsgId,
        quotedTexto,
        quotedFromMe,
        contact_id:  _incomingContactId,
      })

      // Duplicado (replay de Baileys al reconectar) — no hacer broadcast ni efectos secundarios
      if (!esNuevo) continue

      if (!enviadoDesdeEverest) {
        // Si era @lid: usar número real (@s.whatsapp.net) si se resolvió, o @lid si no
        const remitenteResuelto = lidPhone
          ? phone + (phone === lidPhone ? '@lid' : '@s.whatsapp.net')
          : remitente
        broadcast({ tipo: 'wa:mensaje', numero, sede, remitente: remitenteResuelto, fromMe, pushName, texto, timestamp: ts, msgId: msg.key.id, desdeTelefono: desdeTelefono || false, tipoMensaje: tipoMsg, mediaUrl, quotedMsgId, quotedTexto, quotedFromMe })
      }

      // Mensajes entrantes Y mensajes desde celular reactivan asignacion resuelta
      // Auto-respuesta: solo cuando el chat venía de 'resuelto' y es mensaje entrante puro
      if ((!fromMe || desdeTelefono) && supabase) {
        try {
          // Buscar por JID exacto primero; si no, buscar por contact_id (cubre LID↔phone mismo cliente)
          let asig = null
          const { data: asigDirect } = await supabase
            .from('asignaciones_wa')
            .select('id, estado')
            .eq('numero', numero)
            .eq('contacto', phone)
            .eq('activo', true)
            .eq('estado', 'resuelto')
            .maybeSingle()
          asig = asigDirect
          if (!asig && _incomingContactId) {
            const { data: asigByContact } = await supabase
              .from('asignaciones_wa')
              .select('id, estado, contacto')
              .eq('numero', numero)
              .eq('contact_id', _incomingContactId)
              .eq('activo', true)
              .eq('estado', 'resuelto')
              .maybeSingle()
            asig = asigByContact
          }
          if (asig) {
            await supabase.from('asignaciones_wa').update({ activo: false }).eq('id', asig.id)
            broadcast({ tipo: 'wa:liberacion', numero, contacto: phone })
            console.log('[WA] Chat ' + phone + ' reactivado como en_espera (era resuelto, asig.contacto=' + (asig.contacto ?? phone) + ')')
            if (!fromMe && !desdeTelefono) {
              // Pasar si era un @lid sin resolver al momento del mensaje
              const esLidSinResolver = !!lidPhone && !entrada2?.lidToPhone?.get(lidPhone)
              _enviarRespuestaInicial(numero, phone, sede, esLidSinResolver).catch(() => {})
            }
          }
        } catch(e) {
          console.error('[WA] Error reactivando asignacion:', e.message)
        }
      }
      } catch (err) {
        console.error('[WA] Error procesando mensaje:', err.message, msg?.key?.id)
      }
    }
  })

  // messages.update — ticks de estado (enviado, entregado, leído)
  sock.ev.on('messages.update', async updates => {
    for (const { key, update } of updates) {
      // ── Mensajes editados por el cliente (fromMe: false) ─────────────
      if (!key.fromMe) {
        const editedWrapper = update.message?.editedMessage
        const protoEdit = update.message?.protocolMessage
        let originalMsgId = null
        let textoEditado = null
        if (editedWrapper) {
          // Baileys 6.7.x: key.id ya es el ID del mensaje original; editedWrapper.message es el contenido nuevo
          originalMsgId = key.id
          const editedMsg = editedWrapper.message || {}
          const inner = extractMessageContent(editedMsg) || editedMsg
          textoEditado = inner.conversation || inner.extendedTextMessage?.text || null
        } else if (protoEdit?.type === 14 && protoEdit?.editedMessage) {
          originalMsgId = protoEdit.key?.id
          const inner = extractMessageContent(protoEdit.editedMessage) || protoEdit.editedMessage || {}
          textoEditado = inner.conversation || inner.extendedTextMessage?.text || null
        }
        if (originalMsgId && textoEditado && supabase) {
          const _updRaw = _phoneDesdeJid(key.remoteJid)
          const _updEntrada = sesiones.get(numero)
          const phoneEdit = (key.remoteJid.endsWith('@lid') && _updEntrada?.lidToPhone?.get(_updRaw)) || _updRaw
          try {
            await supabase.from('mensajes_wa').update({ texto: textoEditado, editado: true }).eq('msg_id', originalMsgId)
            broadcast({ tipo: 'wa:msg_edit', numero, contacto: phoneEdit, msgId: originalMsgId, textoNuevo: textoEditado })
          } catch (e) { console.error('[WA] Error guardando edicion cliente:', e.message) }
        }
        continue
      }
      // solo ACKs de nuestros mensajes salientes
      if (!update.status || update.status < 2) continue
      const msgId  = key.id
      if (!msgId) continue
      const status = update.status // 2=sent 3=delivered 4=read 5=played
      applyMsgStatus(msgId, numero, status, { source: 'messages_update' })
    }
  })

  // message-receipt.update — receipts de entrega/lectura individuales.
  // Complementa messages.update: llega por la vía de receipt protocol (Signal) y es más
  // fiable para confirmar entrega al dispositivo (status=3) y lectura (status=4/5).
  sock.ev.on('message-receipt.update', updates => {
    for (const { key, receipt } of updates) {
      if (!key.fromMe || !key.id) continue
      const msgId = key.id

      // Determinar status y tipo de receipt
      let status      = 3
      let receiptType = 'delivered'
      let receiptAt   = null

      if (receipt.readTimestamp || receipt.type === 'read') {
        status      = 4
        receiptType = 'read'
        receiptAt   = receipt.readTimestamp
          ? new Date(receipt.readTimestamp * 1000).toISOString() : null
      } else if (receipt.type === 'played') {
        status      = 5
        receiptType = 'played'
        receiptAt   = receipt.receiptTimestamp
          ? new Date(receipt.receiptTimestamp * 1000).toISOString() : null
      } else {
        // delivered (default) — deliveredTimestamp o sin type específico
        receiptAt = receipt.deliveredTimestamp
          ? new Date(receipt.deliveredTimestamp * 1000).toISOString() : null
      }

      receiptAt = receiptAt || new Date().toISOString()
      _waLog('RECEIPT', { msgId, numero, receiptType, status, userJid: receipt.userJid })
      applyMsgStatus(msgId, numero, status, {
        source: 'message_receipt_update',
        receiptType,
        receiptAt,
      })
    }
  })

  // messages.reaction — reacciones entrantes y salientes (Baileys 6.x las extrae del upsert)
  sock.ev.on('messages.reaction', async (reactions) => {
    for (const { reaction, key: originalKey } of reactions) {
      try {
        const targetMsgId = originalKey?.id
        if (!targetMsgId) continue
        const emoji    = reaction.text || ''  // '' = quitar reacción
        const remJid   = reaction.key?.remoteJid || originalKey?.remoteJid
        if (!remJid || !_jidValido(remJid)) continue
        const fromMe   = !!reaction.key?.fromMe
        const reactor  = fromMe ? 'asesor' : 'cliente'
        const _rRaw    = _phoneDesdeJid(remJid)
        const _rEntrada = sesiones.get(numero)
        const phone    = (remJid.endsWith('@lid') && _rEntrada?.lidToPhone?.get(_rRaw)) || _rRaw
        if (supabase) {
          const { data: row } = await supabase.from('mensajes_wa')
            .select('id, reactions').eq('msg_id', targetMsgId).single()
          if (row) {
            const newReactions = { ...(row.reactions || {}) }
            if (emoji) newReactions[reactor] = emoji
            else delete newReactions[reactor]
            await supabase.from('mensajes_wa').update({ reactions: newReactions }).eq('id', row.id)
            broadcast({ tipo: 'wa:reaccion', numero, contacto: phone, targetMsgId, reactor, emoji })
          }
        }
      } catch (e) {
        console.error('[WA] Error guardando reaccion:', e.message)
      }
    }
  })
}

async function _enviarRespuestaInicial(numero, contacto, sede, esLidSinResolver = false) {
  if (!supabase) return
  try {
    // Buscar respuesta configurada para esta conexión
    const { data: cfg } = await supabase
      .from('config_conexiones_wa')
      .select('respuesta_inicial, activo')
      .eq('numero', numero)
      .maybeSingle()
    if (!cfg?.activo || !cfg?.respuesta_inicial?.trim()) {
      console.log(`[WA] Auto-respuesta omitida: config inactiva o sin texto (activo=${cfg?.activo})`)
      return
    }

    // Esperar 1.5s para que parezca natural
    await new Promise(r => setTimeout(r, 1500))

    const entrada = sesiones.get(numero)
    if (!entrada || entrada.status !== 'conectado') return

    // Resolver lid → teléfono real si aplica (el mapeo suele completarse durante el delay de 1.5s)
    const resolvedPhone = entrada.lidToPhone?.get(contacto) ?? contacto
    // Si era un @lid sin resolver y sigue sin resolver tras el delay, no enviar (JID inválido)
    if (esLidSinResolver && resolvedPhone === contacto) {
      console.log('[WA] Auto-respuesta omitida: @lid sin resolver tras delay:', contacto)
      return
    }
    // Usar LID si phoneToLid lo tiene — mismo comportamiento que sendMensaje.
    // Evita "Esperando mensaje" cuando el dispositivo opera con LID pero se envía a @s.whatsapp.net.
    const knownLid = entrada.phoneToLid?.get(resolvedPhone)
    const jid      = knownLid ? (knownLid + '@lid') : (resolvedPhone + '@s.whatsapp.net')
    const texto = cfg.respuesta_inicial.trim()
    const sent  = await entrada.socket.sendMessage(jid, { text: texto })
    const ts    = Math.floor(Date.now() / 1000)
    const msgId = sent?.key?.id || null
    if (msgId) _sentMsgIds.add(msgId)

    broadcast({ tipo: 'wa:mensaje', numero, sede, remitente: jid, fromMe: true,
                pushName: null, texto, timestamp: ts, msgId, asesor: null })
    await supabase.from('mensajes_wa').insert({
      numero, contacto, nombre: null, texto, timestamp: ts,
      saliente: true, desde_telefono: false, tipo: 'mensaje',
      ...(msgId ? { msg_id: msgId } : {}),
    })
    console.log('[WA] Respuesta inicial enviada a', resolvedPhone, '(contacto:', contacto, ') en sesion', numero)
  } catch(e) {
    console.error('[WA] Error enviando respuesta inicial:', e.message)
  }
}

export async function cerrarSesion(numero) {
  const sessionPath = path.join(SESSIONS_DIR, numero)
  try { rmSync(sessionPath, { recursive: true, force: true }) } catch {}
  console.log("[WA] Archivos de sesion eliminados:", sessionPath)
  const entrada = sesiones.get(numero)
  if (!entrada) {
    broadcast({ tipo: "wa:status", numero, status: "desconectado" })
    return
  }
  if (entrada.heartbeatInterval) {
    clearInterval(entrada.heartbeatInterval)
    entrada.heartbeatInterval = null
  }
  if (entrada.reconcileInterval) {
    clearInterval(entrada.reconcileInterval)
    entrada.reconcileInterval = null
  }
  try { await entrada.socket?.logout() } catch {}
  await _upsertSesion(numero, entrada.sede, "desconectado")
  sesiones.delete(numero)
  await _releaseLock(numero, entrada.lockOwner)
  broadcast({ tipo: "wa:status", numero, status: "desconectado" })
  console.log("[WA] Sesion ", numero, "cerrada manualmente")
}

// Migra mensajes/asignaciones de un @lid al número real en Supabase.
// Fire-and-forget: no bloquea el envío si falla.
function _migrarLid(numero, entrada, lidPhone, realPhone) {
  if (!supabase) return
  ;(async () => {
    try {
      const { count } = await supabase.from('mensajes_wa')
        .select('id', { count: 'exact', head: true })
        .eq('numero', numero).eq('contacto', lidPhone)
      if (!count) return
      // Guard: si realPhone ya tiene mensajes de otro contacto, no fusionar automáticamente
      if (await _checkIdentityConflict(numero, entrada.sede, lidPhone, realPhone)) return
      const { data: asigLid } = await supabase.from('asignaciones_wa')
        .select('asesor, estado')
        .eq('numero', numero).eq('contacto', lidPhone).eq('activo', true)
        .maybeSingle()
      await supabase.from('mensajes_wa').update({ contacto: realPhone }).eq('numero', numero).eq('contacto', lidPhone)
      await supabase.from('asignaciones_wa').update({ activo: false }).eq('numero', numero).eq('contacto', lidPhone)
      if (asigLid?.asesor) {
        await supabase.from('asignaciones_wa').upsert(
          { numero, contacto: realPhone, asesor: asigLid.asesor, estado: asigLid.estado || 'asignado', activo: true },
          { onConflict: 'numero,contacto' }
        )
      }
      _waLog('LID_MIGRATE', { numero, lidPhone, realPhone, count })
      broadcast({ tipo: 'wa:merge', numero, sede: entrada.sede, lidPhone, realPhone })
    } catch (e) {
      _waLog('LID_MIGRATE_ERR', { numero, lidPhone, realPhone, error: e.message })
    }
  })()
}

export async function enviarMensaje(numero, destinatario, texto, asesor, quotedData) {
  const entrada = sesiones.get(numero)
  if (!entrada || entrada.status !== 'conectado') {
    throw new Error(`Sesión ${numero} no disponible (estado: ${entrada?.status ?? 'no existe'})`)
  }

  // Normalizar: quitar sufijo @... si viene con él
  const destRaw = destinatario.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '')

  // Detectar si es un @lid: está en el mapa de lids o tiene más de 12 dígitos
  // (teléfonos colombianos son siempre 12 dígitos: 57 + 10)
  const esLid = entrada.lidToPhone?.has(destRaw) || destRaw.length > 12

  const tFnStart = Date.now()
  let destFinal = destRaw

  if (esLid) {
    const tLidStart = Date.now()
    destFinal = await _resolverLid(entrada, destRaw, 3000)
    const resolverLidMs = Date.now() - tLidStart
    // Si el lid se resolvió al número real → migrar conversación en Supabase (fire-and-forget)
    if (destFinal !== destRaw) {
      _migrarLid(numero, entrada, destRaw, destFinal)
    }
    _waLog('SEND_LID', { numero, destRaw, destFinal, resolverLidMs })
  }

  // JID final: número real → @s.whatsapp.net / lid sin resolver → @lid
  const jid = esLid && destFinal === destRaw
    ? destRaw + '@lid'
    : destFinal + '@s.whatsapp.net'
  // sendJid: si el telefono tiene un @lid conocido, WA requiere ese JID para entregar el mensaje
  const _knownLid = !esLid && entrada.phoneToLid?.get(destRaw)
  const sendJid = _knownLid ? (_knownLid + '@lid') : jid

  // ── Sondeo de sesión Signal previa al envío ─────────────────────────────────
  // Determina si Baileys tiene una sesión Signal activa para sendJid.
  // Si _sessionPreSend=false → Baileys hará un PreKey fetch y creará sesión nueva.
  //   → esto se verá como SIGNAL_SESSION_CREATED en los logs.
  //   → el cliente recibirá un PreKeyMessage; si hay race con sesión vieja → "Esperando mensaje"
  // Si _sessionPreSend=true  → ratchet existente, no hay re-key.
  let _sessionPreSend = null
  try {
    const _ss = await entrada.keyStore.get('sessions', [sendJid])
    _sessionPreSend = _ss?.[sendJid] != null
  } catch {}

  const phone = destFinal !== destRaw ? destFinal : destRaw
  const textoWA = asesor ? `*${asesor}:*\n${texto}` : texto
  const quotedObj = quotedData?.msgId ? { key: { remoteJid: sendJid, id: quotedData.msgId, fromMe: !!quotedData.fromMe }, message: { conversation: quotedData.texto || '' } } : undefined

  const queueKey    = `${numero}:${phone}`
  const tBeforeQueue = Date.now()
  const tQueueStart  = _msgQueues.has(queueKey) ? tBeforeQueue : null  // null = sin espera
  const tSendStart   = { value: 0 }
  const sent = await _enqueue(queueKey, () => {
    tSendStart.value = Date.now()
    return entrada.socket.sendMessage(sendJid, { text: textoWA }, quotedObj ? { quoted: quotedObj } : {})
  })
  const msgId = sent?.key?.id || null
  const ts    = Math.floor(Date.now() / 1000)
  if (msgId) _sentMsgIds.add(msgId)
  // Si enviamos a número real, guardar msgId→phone para detectar si el eco regresa como @lid
  // (WA puede normalizar al JID de privacidad del contacto en el eco)
  if (msgId && !esLid) _pendingMsgToPhone.set(msgId, phone)
  // Watchdog: si WA servers no confirman en 90s, solo loguea — NO reinicia el socket.
  // Reiniciar el socket causaba cascadas de reconexiones en hora pico: múltiples timers
  // maduran simultáneamente, cada uno mata el socket recién reconectado, activando el
  // circuit breaker y dejando la sesión offline con QR requerido.
  // El usuario ve la burbuja roja con botón "Reintentar" si el mensaje no llegó.
  // Se cancela en messages.update (status≥2 = confirmación real del servidor WA).
  if (msgId) {
    const _watchdogTimer = setTimeout(() => {
      if (!_pendingAcks.has(msgId)) return
      _pendingAcks.delete(msgId)
      applyMsgStatus(msgId, numero, 1, { sinAck: true, source: 'watchdog' })
    }, 90000)
    _pendingAcks.set(msgId, _watchdogTimer)
  }
  // Pre-poblar mapping lid→phone: al enviar a número real, WA responde con info del contacto
  // incluyendo su lid → contacts.upsert dispara → lidToPhone se llena antes de que el contacto responda
  if (!esLid) entrada.socket.fetchStatus(sendJid).catch(() => {})
  // Guardar en Supabase ANTES de broadcast para evitar race condition:
  // el ACK status=2 de WA llega en ms y hace UPDATE WHERE msg_id=X — si aún no existe la fila, el status se pierde
  const tPersistStart = Date.now()
  await _guardarMensaje({
    numero,
    contacto:  phone,
    nombre:    null,
    texto,
    timestamp: ts,
    saliente:  true,
    msgId,
    status:    1, // status=1 hasta que WA servers confirmen con ACK real (messages.update status≥2)
    asesor:    asesor || null,
    quotedMsgId: quotedData?.msgId || null,
    quotedTexto: quotedData?.texto || null,
    quotedFromMe: quotedData?.fromMe ?? null,
  })
  const tEnd = Date.now()
  _waLog('SEND_TIMING', {
    numero,
    phone,
    msgId,
    sendJid,
    knownLid:      _knownLid || null,
    sessionPreSend: _sessionPreSend,
    queueWaitMs:   tQueueStart !== null ? (tSendStart.value - tQueueStart) : 0,
    sendMessageMs: tSendStart.value ? (tPersistStart - tSendStart.value) : null,
    persistMs:     tEnd - tPersistStart,
    totalMs:       tEnd - tFnStart,
  })
  broadcast({ tipo: 'wa:mensaje', numero, sede: entrada.sede, remitente: jid, fromMe: true, pushName: null, texto, timestamp: ts, msgId, asesor: asesor || null, quotedMsgId: quotedData?.msgId || null, quotedTexto: quotedData?.texto || null, quotedFromMe: quotedData?.fromMe ?? null })
  const _mcs = _msgCounters.get(numero); if (_mcs) _mcs.sent++
  return { msgId }
}

export function getSesiones() {
  return [...sesiones.entries()].map(([numero, { status, qr, sede }]) => ({
    numero,
    sede,
    status,
    tieneQr: !!qr,
  }))
}

export function getContactos() {
  const result = {}
  for (const [numero, { contactos }] of sesiones.entries()) {
    result[numero] = Object.fromEntries(contactos)
  }
  return result
}

// Vincula manualmente un @lid a un número real en la sesión en memoria.
// Llamado desde el endpoint vincular para que futuros mensajes del lid
// se enruten correctamente sin esperar contacts.upsert.
export function registrarLidManual(numero, lid, realPhone) {
  const entrada = sesiones.get(numero)
  if (!entrada) return
  entrada.lidToPhone.set(lid, realPhone)
  if (!entrada.phoneToLid) entrada.phoneToLid = new Map()
  entrada.phoneToLid.set(realPhone, lid)
  if (_pendingLidResolutions.has(lid)) {
    for (const resolve of _pendingLidResolutions.get(lid)) resolve(realPhone)
    _pendingLidResolutions.delete(lid)
  }
  console.log('[WA] Lid vinculado manualmente:', lid, '→', realPhone)
}

// ── Enviar media (imagen, audio, video, documento) ─────────────────────────
// Convierte cualquier audio a OGG/Opus mono 48kHz — único formato que WA acepta como nota de voz.
// inputExt: extensión del archivo de entrada (webm, ogg, mp3, m4a, aac…)
async function _convertToOgg(buffer, inputExt = 'webm') {
  const uid    = Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  const tmpIn  = '/tmp/wa_audio_in_'  + uid + '.' + inputExt
  const tmpOut = '/tmp/wa_audio_out_' + uid + '.ogg'
  writeFileSync(tmpIn, buffer)
  await new Promise((resolve, reject) => {
    const ff = spawn('/usr/bin/ffmpeg', [
      '-y', '-i', tmpIn,
      '-vn',                 // sin video
      '-c:a', 'libopus',    // codec Opus
      '-ac', '1',           // mono — WA voice notes siempre mono; estéreo puede causar "audio no disponible"
      '-ar', '48000',       // 48 kHz — tasa nativa de Opus
      '-b:a', '64k',        // bitrate adecuado para voz
      tmpOut,
    ])
    ff.stderr.on('data', () => {})
    ff.on('error', reject)
    ff.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code)))
  })
  const result = readFileSync(tmpOut)
  try { unlinkSync(tmpIn) } catch {}
  try { unlinkSync(tmpOut) } catch {}
  _waLog('AUDIO_CONV', { inputExt, inputBytes: buffer.length, outputBytes: result.length })
  return result
}

export async function enviarMedia(numero, destinatario, buffer, mimetype, fileName, caption, asesor) {
  const entrada = sesiones.get(numero)
  if (!entrada || entrada.status !== 'conectado')
    throw new Error('Sesion ' + numero + ' no disponible')

  const destRaw  = destinatario.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '')
  const esLid    = entrada.lidToPhone?.has(destRaw) || destRaw.length > 12
  let destFinal  = destRaw
  if (esLid) destFinal = await _resolverLid(entrada, destRaw, 3000)
  const jid      = (esLid && destFinal === destRaw) ? destRaw + '@lid' : destFinal + '@s.whatsapp.net'
  const _knownLidM = !esLid && entrada.phoneToLid?.get(destRaw)
  const sendJid  = _knownLidM ? (_knownLidM + '@lid') : jid
  const phone    = destFinal !== destRaw ? destFinal : destRaw

  const base = mimetype.split(';')[0].trim()
  // uploadBuffer/uploadMime: lo que se guarda en Storage (puede diferir del input si se convierte)
  let uploadBuffer = buffer
  let uploadMime   = mimetype
  let content
  if (base.startsWith('image/')) {
    content = { image: buffer, mimetype: base, caption: caption || undefined }
  } else if (base.startsWith('video/')) {
    content = { video: buffer, mimetype: base, caption: caption || undefined }
  } else if (base.startsWith('audio/')) {
    // Siempre convertir a OGG/Opus mono — normalización garantizada independiente del formato de origen.
    // Esto cubre: audio/webm (Chrome), audio/ogg (Firefox), audio/mp4, audio/mpeg, audio/aac, etc.
    // Sin try/catch: si ffmpeg falla → 503 al frontend → muestra ✗ (preferible a silencio + "audio no disponible")
    const inputExt = base === 'audio/webm' ? 'webm'
                   : base === 'audio/ogg'  ? 'ogg'
                   : base === 'audio/mp4'  ? 'm4a'
                   : base === 'audio/mpeg' ? 'mp3'
                   : base === 'audio/aac'  ? 'aac'
                   : 'bin'
    const audioBuffer = await _convertToOgg(buffer, inputExt)
    const audioMime   = 'audio/ogg; codecs=opus'
    content      = { audio: audioBuffer, mimetype: audioMime, ptt: true }
    uploadBuffer = audioBuffer  // guardar el ogg convertido, no el original
    uploadMime   = audioMime
  } else {
    content = { document: buffer, mimetype: base, fileName: fileName || 'archivo' }
  }

  const ts  = Math.floor(Date.now() / 1000)
  const sent = await _enqueue(`${numero}:${phone}`, () => entrada.socket.sendMessage(sendJid, content))
  const msgId = sent?.key?.id || null
  if (msgId) _sentMsgIds.add(msgId)
  // Igual que en enviarMensaje: guardar msgId→phone por si el eco regresa como @lid
  if (msgId && !esLid) _pendingMsgToPhone.set(msgId, phone)
  // Pre-poblar mapping lid→phone (mismo principio que en enviarMensaje)
  if (!esLid) entrada.socket.fetchStatus(sendJid).catch(() => {})

  // Texto descriptivo para guardar en BD
  const textoDesc = base.startsWith('image/') ? ('Imagen' + (caption ? ': ' + caption : ''))
                  : base.startsWith('video/') ? ('Video' + (caption ? ': ' + caption : ''))
                  : base.startsWith('audio/') ? 'Nota de voz'
                  : fileName || 'Archivo'

  const tipoDesc = base.startsWith('image/') ? 'imagen'
                 : base.startsWith('video/') ? 'video'
                 : base.startsWith('audio/') ? 'voz'
                 : 'documento'

  // Log auditoría de media — permite verificar que WA aceptó el upload (directPath ≠ null)
  // sinDirectPath:true → WA no procesó el archivo → cliente verá "audio no disponible"
  if (tipoDesc === 'voz') {
    const am = sent?.message?.audioMessage
    _waLog('AUDIO_SENT', {
      numero, phone, msgId,
      mimeOrigen: mimetype,
      mimeFinal:  'audio/ogg; codecs=opus',
      ptt:        am?.ptt ?? null,
      fileLength: am?.fileLength ?? null,
      directPath: am?.directPath ? am.directPath.slice(0, 80) : null,
      url:        am?.url ? am.url.slice(0, 80) : null,
      sinDirectPath: !am?.directPath,
    })
  }

  // Subir a Storage (uploadBuffer/uploadMime: buffer final enviado a WA, ej. ogg convertido)
  let mediaUrl = null
  if (supabase && msgId) mediaUrl = await _subirMediaBuffer(uploadBuffer, uploadMime, tipoDesc, msgId, numero)

  await _guardarMensaje({ numero, contacto: phone, nombre: null, texto: textoDesc, timestamp: ts,
    saliente: true, msgId, desdeTelefono: false, tipo: tipoDesc, mediaUrl, asesor: asesor || null })

  broadcast({ tipo: 'wa:mensaje', numero, sede: entrada.sede, remitente: phone + '@s.whatsapp.net',
    fromMe: true, pushName: null, texto: textoDesc, timestamp: ts, msgId, desdeTelefono: false,
    tipoMensaje: tipoDesc, mediaUrl, asesor: asesor || null })
  const _mcm = _msgCounters.get(numero); if (_mcm) _mcm.sent++
  return { ok: true, msgId }
}

async function _subirMediaBuffer(buffer, mimetype, tipo, msgId, numero) {
  try {
    const base = mimetype.split(';')[0].trim()
    const ext  = _extFromMime(mimetype, tipo)
    const folder = tipo === 'video' ? 'videos' : tipo === 'voz' || tipo === 'audio' ? 'audios'
                 : tipo === 'imagen' ? 'imagenes' : 'documentos'
    const storagePath = folder + '/' + numero + '/' + msgId + '.' + ext
    const { error } = await supabase.storage.from('wa-media').upload(storagePath, buffer, { contentType: base, upsert: true })
    if (error) { console.error('[WA] Error upload outgoing media:', error.message); return null }
    const { data: urlData } = supabase.storage.from('wa-media').getPublicUrl(storagePath)
    const raw = urlData?.publicUrl || null
    return raw ? raw.replace('http://localhost:8000', 'https://supabase.everest-central.com') : null
  } catch(e) { console.error('[WA] Error subiendo media saliente:', e.message); return null }
}

// ── Auto-arranque al iniciar el backend ────────────────────────────────────
// Lee sesiones_wa con status 'conectado' o 'reconectando' y las reinicia sin pedir QR nuevo
export async function autoReconectarSesiones() {
  if (!supabase) {
    console.log('[WA] Auto-arranque omitido — Supabase no disponible')
    return
  }
  const { data, error } = await supabase
    .from('sesiones_wa')
    .select('numero, sede')
    .in('status', ['conectado', 'reconectando'])

  if (error) {
    console.error('[WA] Error leyendo sesiones_wa para auto-arranque:', error.message)
    return
  }
  if (!data || data.length === 0) {
    console.log('[WA] Auto-arranque: no hay sesiones previas que reconectar')
    return
  }
  console.log(`[WA] Auto-arranque: reconectando ${data.length} sesión(es) escalonadas cada 3s...`)
  for (let i = 0; i < data.length; i++) {
    const { numero, sede } = data[i]
    setTimeout(() => {
      console.log(`[WA] Auto-arranque → ${numero} (${sede})`)
      iniciarSesion(numero, sede).catch(e =>
        console.error(`[WA] Error auto-arrancando ${numero}:`, e.message)
      )
    }, i * 3000)
  }
}

export async function eliminarMensaje(numero, msgId, contacto) {
  const entrada = sesiones.get(numero)
  if (!entrada?.socket || entrada.status !== 'conectado') {
    throw new Error(`Sesión ${numero} no disponible`)
  }

  const destRaw  = contacto.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '')
  const esLid    = entrada.lidToPhone?.has(destRaw) || destRaw.length > 12
  const jid      = esLid ? destRaw + '@lid' : destRaw + '@s.whatsapp.net'

  await entrada.socket.sendMessage(jid, {
    delete: { remoteJid: jid, id: msgId, fromMe: true, participant: undefined }
  })

  if (supabase) {
    await supabase.from('mensajes_wa').delete().eq('msg_id', msgId)
  }
}

export async function editarMensaje(numero, msgId, contacto, texto, asesor) {
  const entrada = sesiones.get(numero)
  if (!entrada?.socket || entrada.status !== 'conectado') {
    throw new Error(`Sesión ${numero} no disponible`)
  }
  const destRaw = contacto.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '')
  const esLid   = entrada.lidToPhone?.has(destRaw) || destRaw.length > 12
  const jid     = esLid ? destRaw + '@lid' : destRaw + '@s.whatsapp.net'
  const textoWA = asesor ? `*${asesor}:*\n${texto}` : texto

  await entrada.socket.sendMessage(jid, {
    edit: { remoteJid: jid, id: msgId, fromMe: true, participant: undefined },
    text: textoWA,
  })
  if (supabase) {
    await supabase.from('mensajes_wa').update({ texto, editado: true }).eq('msg_id', msgId)
  }
}

// ── SIGTERM: liberar locks antes de que PM2 mate el proceso ─────────────────
// Crítico para pm2 reload: el proceso viejo debe soltar los locks para que
// el proceso nuevo pueda adquirirlos y reconectar las sesiones.
process.once('SIGTERM', async () => {
  _waLog('PROC', { evento: 'SIGTERM_recibido', sesiones_activas: sesiones.size })
  const releases = []
  for (const [num, entrada] of sesiones.entries()) {
    if (entrada.heartbeatInterval) {
      clearInterval(entrada.heartbeatInterval)
      entrada.heartbeatInterval = null
    }
    if (entrada.reconcileInterval) {
      clearInterval(entrada.reconcileInterval)
      entrada.reconcileInterval = null
    }
    if (entrada.lockOwner) releases.push(_releaseLock(num, entrada.lockOwner))
  }
  await Promise.allSettled(releases)
  _waLog('PROC', { evento: 'locks_liberados', count: releases.length })
  // Breve pausa para que el log se escriba antes de salir
  setTimeout(() => process.exit(0), 300)
})
