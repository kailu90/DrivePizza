// instagram.webhook.js — Handler webhook Meta para Instagram
// GET  /webhooks/instagram → verify challenge
// POST /webhooks/instagram → procesar DMs entrantes (mensajes de clientes)
//
// Firma: X-Hub-Signature-256: sha256=HMAC(META_APP_SECRET, rawBody)
// Verificar siempre — nunca procesar sin firma válida.

import { createHmac } from 'node:crypto'
import { supabase }   from '../../config/supabase.js'

// ── Broadcast a todos los clientes WS ─────────────────────────────────────
function _broadcast(wsClients, data) {
  const msg = JSON.stringify(data)
  wsClients.forEach(client => { if (client.readyState === 1) client.send(msg) })
}

// ── Upsert contacto + conversación ─────────────────────────────────────────
async function _upsertContactAndConv(accountId, igsid, texto, ts) {
  // ig_contacts
  const { data: contact, error: cErr } = await supabase
    .from('ig_contacts')
    .upsert({ account_id: accountId, igsid }, { onConflict: 'account_id,igsid' })
    .select('id')
    .single()
  if (cErr || !contact) return { err: cErr?.message || 'error en ig_contacts' }

  // ig_conversations — preservar status/assigned_agent existentes; actualizar last_message_at
  const { data: conv, error: vErr } = await supabase
    .from('ig_conversations')
    .upsert(
      {
        account_id:      accountId,
        ig_contact_id:   contact.id,
        ultimo_mensaje:  texto || '',
        last_message_at: new Date(ts * 1000).toISOString(),
      },
      { onConflict: 'account_id,ig_contact_id' }
    )
    .select('id, status, assigned_agent')
    .single()
  if (vErr || !conv) return { err: vErr?.message || 'error en ig_conversations' }

  return { contact, conv }
}

// ── Procesar un evento messaging ───────────────────────────────────────────
async function _processMessaging(fastify, wsClients, account, messaging) {
  const { sender, timestamp, message } = messaging

  // Ignorar echoes (mensajes enviados por la propia cuenta)
  if (!message || message.is_echo) return

  const igsid   = sender?.id
  const texto   = message.text || null
  const igMsgId = message.mid
  // Meta envía timestamp en milisegundos
  const ts      = Math.floor((timestamp || Date.now()) / 1000)

  if (!igsid) {
    fastify.log.warn({ messaging }, 'ig/webhook: messaging sin sender.id')
    return
  }

  const { contact, conv, err: ucErr } =
    await _upsertContactAndConv(account.id, igsid, texto, ts)

  if (ucErr) {
    fastify.log.error({ ucErr, accountId: account.id, igsid }, 'ig/webhook: error upsert contacto/conv')
    return
  }

  // Insertar mensaje (idempotente por ig_message_id — ignorar duplicado 23505)
  const { error: mErr } = await supabase
    .from('ig_messages')
    .insert({
      ig_conversation_id: conv.id,
      ig_message_id:      igMsgId,
      direction:          'inbound',
      tipo:               'mensaje',
      texto,
      timestamp:          ts,
      raw_payload:        messaging,
    })

  if (mErr && mErr.code !== '23505') {
    fastify.log.error({ mErr }, 'ig/webhook: error insertando mensaje')
    return
  }

  if (mErr?.code === '23505') {
    // Mensaje duplicado — ya procesado, ignorar sin error
    fastify.log.info({ igMsgId }, 'ig/webhook: mensaje duplicado ignorado')
    return
  }

  // Mensaje persistido — intentar reapertura atómica si conv estaba resuelta.
  // Un fallo aquí no provoca pérdida del mensaje (ya guardado arriba).
  if (conv.status === 'resolved') {
    const { data: reopened, error: rErr } = await supabase
      .rpc('ig_reopen_if_resolved', {
        p_account_id:    account.id,
        p_ig_contact_id: contact.id,
        p_igsid:         igsid,
      })

    if (rErr) {
      fastify.log.error({ rErr, accountId: account.id, igsid },
        'ig/webhook: RPC ig_reopen_if_resolved falló — broadcast con estado original')
      // conv.status no se muta — broadcast saldrá con 'resolved', sin estado falso
    } else {
      conv.status         = reopened.status
      conv.assigned_agent = reopened.assigned_agent ?? null
      if (reopened.reopened) {
        fastify.log.info({ accountId: account.id, igsid }, 'ig/webhook: conversacion reabierta a waiting')
      }
    }
  }

  // Broadcast ig:mensaje a todos los clientes WS conectados
  _broadcast(wsClients, {
    tipo:      'ig:mensaje',
    accountId: account.id,
    igsid,
    texto,
    timestamp: ts,
    igMsgId,
    fromMe:    false,
    convStatus: conv.status,
  })

  fastify.log.info({ accountId: account.id, igsid, igMsgId }, 'ig/webhook: mensaje procesado')
}

export async function igWebhookRoutes(fastify, options) {
  const { wsClients } = options

  // Parsear body como buffer para poder verificar HMAC con el cuerpo raw.
  // Este addContentTypeParser está scoped a este plugin — no afecta otros routes.
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    req.rawBody = body
    try {
      done(null, JSON.parse(body.toString('utf8')))
    } catch (err) {
      err.statusCode = 400
      done(err)
    }
  })

  // ── GET /webhooks/instagram — Meta verify challenge ──────────────────────
  // Meta llama a este endpoint al registrar/actualizar el webhook.
  // Responder con hub.challenge si hub.verify_token coincide.
  fastify.get('/webhooks/instagram', async (request, reply) => {
    const {
      'hub.mode':         mode,
      'hub.verify_token': verifyToken,
      'hub.challenge':    challenge,
    } = request.query

    if (mode === 'subscribe' && verifyToken === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      fastify.log.info('ig/webhook: verify challenge OK')
      return reply.send(parseInt(challenge, 10))
    }

    fastify.log.warn({ mode, verifyToken }, 'ig/webhook: verify challenge FAILED — token no coincide')
    return reply.code(403).send('Forbidden')
  })

  // ── POST /webhooks/instagram — DMs entrantes de Meta ────────────────────
  fastify.post('/webhooks/instagram', async (request, reply) => {
    // 1. Verificar firma HMAC-SHA256
    const sig = request.headers['x-hub-signature-256']
    if (!sig || !request.rawBody) {
      fastify.log.warn('ig/webhook POST: sin firma o sin rawBody')
      return reply.code(400).send('Missing signature')
    }

    const expected = 'sha256=' + createHmac('sha256', process.env.META_APP_SECRET)
      .update(request.rawBody)
      .digest('hex')

    if (sig !== expected) {
      fastify.log.warn({ sig, expected }, 'ig/webhook POST: HMAC invalido')
      return reply.code(401).send('Invalid signature')
    }

    const body = request.body
    if (!body || body.object !== 'instagram') {
      // Puede ser otro tipo de objeto (page, etc.) — responder 200 sin procesar
      return reply.send({ ok: true })
    }

    // 2. Procesar cada entry del payload
    for (const entry of body.entry || []) {
      const igid = String(entry.id)  // IGID del business account

      if (!supabase) {
        fastify.log.error('ig/webhook POST: supabase no disponible')
        continue
      }

      // Buscar channel_account activa por external_account_id (IGID)
      const { data: account, error: accErr } = await supabase
        .from('channel_accounts')
        .select('id, external_account_id, access_token_enc')
        .eq('external_account_id', igid)
        .eq('channel', 'instagram')
        .eq('status', 'active')
        .maybeSingle()

      if (accErr) {
        fastify.log.error({ accErr, igid }, 'ig/webhook POST: error buscando account')
        continue
      }
      if (!account) {
        fastify.log.warn({ igid }, 'ig/webhook POST: account no encontrada o inactiva')
        continue
      }

      for (const messaging of entry.messaging || []) {
        await _processMessaging(fastify, wsClients, account, messaging)
      }
    }

    // Meta requiere 200 rápido — siempre responder OK
    return reply.send({ ok: true })
  })
}
