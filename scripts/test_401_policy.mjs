/**
 * test_401_policy.mjs — Validación de política 401 granular
 *
 * Replica exacta de la lógica de clasificación de whatsapp.service.js.
 * No importa el servicio para evitar dependencias de Redis/Supabase/Baileys.
 *
 * Ejecutar: node scripts/test_401_policy.mjs
 */

// ── Réplica de constantes del servicio ────────────────────────────────────────
const DisconnectReason = {
  loggedOut:           401,
  forbidden:           403,
  connectionLost:      408,
  connectionClosed:    428,
  connectionReplaced:  440,
  badSession:          500,
  restartRequired:     515,
}

const TERMINALES_401 = new Set([
  'conflict',
  'connection_failure',
  'intentional_logout',
])

// ── Réplica de la lógica de clasificación ────────────────────────────────────
function classify(codigo, motivo) {
  let clasificacion = null

  if (codigo === DisconnectReason.loggedOut) {
    const ml = (motivo ?? '').toLowerCase()
    if      (ml.includes('conflict'))           clasificacion = 'conflict'
    else if (ml.includes('connection failure')) clasificacion = 'connection_failure'
    else if (ml.includes('intentional logout')) clasificacion = 'intentional_logout'
    else                                        clasificacion = 'unknown'
  }

  const requiereQR = (
       codigo === DisconnectReason.forbidden
    || (codigo === DisconnectReason.loggedOut && TERMINALES_401.has(clasificacion))
  )

  return { clasificacion, requiereQR }
}

// ── Casos de prueba ───────────────────────────────────────────────────────────
// [descripcion, codigo, motivo, esperado_requiereQR, esperado_clasificacion]
const CASOS = [
  [
    '401 conflict → terminal, sin RECONN',
    DisconnectReason.loggedOut,
    'Stream Errored (conflict)',
    true,
    'conflict',
  ],
  [
    '401 Connection Failure → terminal, sin RECONN',
    DisconnectReason.loggedOut,
    'Connection Failure',
    true,
    'connection_failure',
  ],
  [
    '401 Intentional Logout → terminal, sin RECONN',
    DisconnectReason.loggedOut,
    'Intentional Logout',
    true,
    'intentional_logout',
  ],
  [
    '401 motivo desconocido → backoff conservador, no terminal',
    DisconnectReason.loggedOut,
    'Stream Errored (unknown_future_reason)',
    false,
    'unknown',
  ],
  [
    '403 forbidden → terminal (sin cambio de comportamiento)',
    DisconnectReason.forbidden,
    'Forbidden',
    true,
    null,  // clasificacion no aplica para 403
  ],
  [
    '428 connectionClosed → no terminal, backoff automático',
    DisconnectReason.connectionClosed,
    'Connection Closed',
    false,
    null,
  ],
  [
    '500 badSession → no terminal, recovery propio (2 reintentos)',
    DisconnectReason.badSession,
    'Stream Errored (ack)',
    false,
    null,
  ],
]

// ── Runner ────────────────────────────────────────────────────────────────────
let passed = 0
let failed = 0

console.log('Política 401 granular — validación\n')

for (const [desc, codigo, motivo, esperadoQR, esperadoClasif] of CASOS) {
  const { clasificacion, requiereQR } = classify(codigo, motivo)

  const qrOk     = requiereQR === esperadoQR
  const clasifOk = esperadoClasif === null ? true : clasificacion === esperadoClasif

  if (qrOk && clasifOk) {
    console.log(`  PASS  ${desc}`)
    passed++
  } else {
    console.log(`  FAIL  ${desc}`)
    if (!qrOk)
      console.log(`        requiereQR:    esperado=${esperadoQR}     obtenido=${requiereQR}`)
    if (!clasifOk)
      console.log(`        clasificacion: esperado=${esperadoClasif}  obtenido=${clasificacion}`)
    failed++
  }
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
