import { exec } from 'child_process'
import { promisify } from 'util'
import { sendAmiAction } from '../../config/ami-events.js'
import { getIvrConnected, registrarIvrConnect, getInCallExtensions } from './pbxLogger.js'

const execAsync = promisify(exec)

const EXTENSIONS = ['8000','8001','8002','8003','8004','8005','8006','8007','8008','8009','8010','8011','8012','8013','8014','8015','8016','8017','8018','8019','8020']
const IVR_QUEUES  = ['801','802','803','804','805','806']
export const lastState = {}

// Estado de cola por extensión: 'connected' | 'disconnected'
// Se usa como fuente de verdad en los endpoints de queue
export const queueState = {}

let _onAutoDisconnect  = null
let _onStateChange     = null
let _onAutoReconnect   = null

// Guarda si el agente estaba en cola antes de caerse (para auto-reconectar al volver)
const wasConnectedBeforeDown = {}

// En el primer sync solo se registra el estado actual sin aplicar cambios de queue
// (restoreQueueState ya configuró el estado correcto en Asterisk al arrancar)
let isInitialSync = true

async function getRegisteredExtensions() {
  try {
    const { stdout } = await execAsync('kamcmd ul.dump')
    const registered = new Set()
    for (const line of stdout.split('\n')) {
      const m = line.match(/AoR:\s*(\d+)/)
      if (m) registered.add(m[1].trim())
    }
    return registered
  } catch (e) {
    console.error('[devstate] kamcmd error:', e.message)
    return null
  }
}


// Fuerza la actualizacion de TODOS los devstates en Asterisk ignorando lastState.
// Corre una sola vez despues del initial sync para corregir silent failures del
// AMI Command action (que devuelve Response:Success aunque el CLI falle internamente).
async function forceDevstates() {
  const registered = await getRegisteredExtensions()
  if (!registered) return
  console.log('[devstate] force-devstate: sincronizando todos los estados con Asterisk...')
  for (const ext of EXTENSIONS) {
    const state = registered.has(ext)
      ? (getInCallExtensions().has(ext) ? 'INUSE' : 'NOT_INUSE')
      : 'UNAVAILABLE'
    try {
      await sendAmiAction({
        Action: 'Command',
        Command: 'devstate change Custom:cc' + ext + ' ' + state,
      })
      lastState[ext] = state
      console.log('[devstate] force-devstate cc' + ext + ' -> ' + state)
    } catch (e) {
      console.error('[devstate] force-devstate error cc' + ext + ':', e.message)
    }
  }
}

async function syncDevStates() {
  const registered = await getRegisteredExtensions()
  if (registered === null) return

  for (const ext of EXTENSIONS) {
    const inCall = getInCallExtensions()
    const newState = registered.has(ext) ? (inCall.has(ext) ? 'INUSE' : 'NOT_INUSE') : 'UNAVAILABLE'
    if (lastState[ext] === newState) continue
    try {
      await sendAmiAction({
        Action: 'Command',
        Command: 'devstate change Custom:cc' + ext + ' ' + newState,
      })
      lastState[ext] = newState
      console.log('[devstate] cc' + ext + ' -> ' + newState + (isInitialSync ? ' (startup)' : ''))

      if (isInitialSync) {
        // Al arrancar: si ya es UNAVAILABLE y estaba en queue o IVR -> limpiar estado stale
        if (newState === "UNAVAILABLE" && _onAutoDisconnect) {
          if (queueState[ext] === 'connected' || getIvrConnected(ext)) _onAutoDisconnect(ext)
        }
        continue
      }

      if (_onStateChange) _onStateChange(ext, newState)

      // Al registrarse
      if (newState === 'NOT_INUSE' && queueState[ext] !== 'connected') {
        if (wasConnectedBeforeDown[ext]) {
          // Estaba en cola antes de caerse — auto-reconectar
          delete wasConnectedBeforeDown[ext]
          await sendAmiAction({
            Action: 'QueuePause',
            Interface: 'Local/' + ext + '@queue-cc/n',
            Queue: '800',
            Paused: 'false',
          }).catch(e => console.error('[devstate] QueuePause restore error cc' + ext + ':', e.message))
          queueState[ext] = 'connected'
          console.log('[devstate] cc' + ext + ' auto-reconectado al queue (volvió de caída)')
          if (_onAutoReconnect) _onAutoReconnect(ext)
        } else {
          // Primera conexión sin connect explícito — pausar
          await sendAmiAction({
            Action: 'QueuePause',
            Interface: 'Local/' + ext + '@queue-cc/n',
            Queue: '800',
            Paused: 'true',
          }).catch(e => console.error('[devstate] QueuePause error cc' + ext + ':', e.message))
          queueState[ext] = 'disconnected'
          console.log('[devstate] cc' + ext + ' pausado en queue (no conectado)')
        }
      }

      // Al desregistrarse: guardar si estaba conectado y notificar
      if (newState === 'UNAVAILABLE') {
        const wasConnected = queueState[ext] === 'connected'
        wasConnectedBeforeDown[ext] = wasConnected
        queueState[ext] = 'disconnected'
        // Notificar si estaba en queue 800 O en IVR 801-806
        if ((wasConnected || getIvrConnected(ext)) && _onAutoDisconnect) _onAutoDisconnect(ext)
      }
    } catch (e) {
      console.error('[devstate] AMI error cc' + ext + ':', e.message)
    }
  }
}

export function startDevStateSync(onAutoDisconnect, onStateChange, onAutoReconnect) {
  _onAutoDisconnect = onAutoDisconnect || null
  _onStateChange    = onStateChange    || null
  _onAutoReconnect  = onAutoReconnect  || null
  if (!process.env.ENABLE_PBX) {
    console.log('[devstate] PBX deshabilitado en entorno local (ENABLE_PBX no definido)')
    return
  }
  syncDevStates().then(() => { isInitialSync = false }).catch(e => console.error('[devstate] startup error:', e))
  setInterval(syncDevStates, 5 * 1000)
  setTimeout(async () => {
    Object.keys(lastState).forEach(k => delete lastState[k])
    console.log('[devstate] force-sync post-startup (15s): limpiando lastState y re-sincronizando...')
    await forceDevstates()
  }, 15000)
  console.log('[devstate] Sync iniciado (cada 5s)')
}
