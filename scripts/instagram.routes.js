import { randomBytes }              from 'node:crypto'
import { supabase }                 from '../../config/supabase.js'
import { redis }                    from '../../config/redis.js'
import { encryptToken, decryptToken } from './ig-crypto.js'

const IG_OAUTH_STATE_TTL = 600  // 10 min en segundos
const IG_OAUTH_SCOPES    = 'instagram_business_basic,instagram_business_manage_messages'
const IG_OAUTH_STATUSES  = new Set(['pending', 'disconnected', 'token_expired'])
const IG_GRAPH_URL       = 'https://graph.instagram.com/v21.0'

// ── Helpers HTML para popup ────────────────────────────────────────────────
function _htmlOk() {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Instagram conectado</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;
  justify-content:center;min-height:100vh;background:#fafafa}
.box{text-align:center;padding:40px 32px;background:#fff;border-radius:16px;
  box-shadow:0 2px 24px rgba(0,0,0,.09);max-width:360px;width:90%}
.check{font-size:3rem;margin-bottom:16px}
h2{color:#111;font-size:1.35rem;margin-bottom:8px}
p{color:#6b7280;font-size:.95rem;margin-bottom:24px;line-height:1.5}
button{background:linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);
  color:#fff;border:none;border-radius:8px;padding:10px 28px;font-size:1rem;
  font-weight:600;cursor:pointer}
</style></head><body>
<div class="box">
  <div class="check">&#10003;</div>
  <h2>Instagram conectado</h2>
  <p>Tu cuenta fue autorizada correctamente.<br>Puedes cerrar esta ventana.</p>
  <button onclick="window.close()">Cerrar</button>
</div>
<script>setTimeout(()=>{try{window.close()}catch{}},3000)</script>
</body></html>`
}

function _htmlError(msg) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Error de conexión</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;
  justify-content:center;min-height:100vh;background:#fafafa}
.box{text-align:center;padding:40px 32px;background:#fff;border-radius:16px;
  box-shadow:0 2px 24px rgba(0,0,0,.09);max-width:360px;width:90%}
h2{color:#dc2626;font-size:1.25rem;margin-bottom:12px}
p{color:#6b7280;font-size:.93rem;line-height:1.5}
</style></head><body>
<div class="box">
  <h2>Error de conexion</h2>
  <p>${msg}<br><br>Puedes cerrar esta ventana e intentarlo de nuevo.</p>
</div>
</body></html>`
}

// ── Broadcast a todos los clientes WS ─────────────────────────────────────
function _broadcast(wsClients, data) {
  const msg = JSON.stringify(data)
  wsClients.forEach(client => { if (client.readyState === 1) client.send(msg) })
}

// ── _buildOAuthState: valida cuenta y genera nonce ─────────────────────────
async function _buildOAuthState(accountId, fastify) {
  const { META_APP_ID, IG_OAUTH_REDIRECT_URI } = process.env
  if (!META_APP_ID || !IG_OAUTH_REDIRECT_URI)
    return { err: 503, msg: 'OAuth no configurado — faltan META_APP_ID o IG_OAUTH_REDIRECT_URI en .env' }
  if (!supabase)
    return { err: 503, msg: 'BD no disponible' }
  if (!accountId)
    return { err: 400, msg: 'accountId requerido' }

  const { data: account, error: dbErr } = await supabase
    .from('channel_accounts')
    .select('id, channel, status')
    .eq('id', accountId)
    .single()

  if (dbErr || !account)
    return { err: 404, msg: 'Cuenta no encontrada' }
  if (account.channel !== 'instagram')
    return { err: 400, msg: 'La cuenta no es de canal instagram' }
  if (!IG_OAUTH_STATUSES.has(account.status))
    return { err: 400, msg: `Estado "${account.status}" no permite iniciar OAuth` }

  const nonce = randomBytes(32).toString('hex')
  await redis.set(
    `ig:oauth:state:${nonce}`,
    JSON.stringify({ channel_account_id: account.id, created_at: new Date().toISOString() }),
    'EX',
    IG_OAUTH_STATE_TTL
  )

  const params = new URLSearchParams({
    client_id:     META_APP_ID,
    redirect_uri:  IG_OAUTH_REDIRECT_URI,
    scope:         IG_OAUTH_SCOPES,
    response_type: 'code',
    state:         nonce,
  })

  fastify.log.info({ accountId: account.id }, 'ig/oauth/start: nonce generado')
  return { url: `https://api.instagram.com/oauth/authorize?${params.toString()}` }
}

// ── Helper: encontrar o crear contacto + conversación ─────────────────────
async function _upsertContactAndConv(accountId, igsid) {
  const { data: contact, error: cErr } = await supabase
    .from('ig_contacts')
    .upsert({ account_id: accountId, igsid }, { onConflict: 'account_id,igsid' })
    .select('id')
    .single()
  if (cErr || !contact) return { err: cErr?.message || 'error creando contacto' }

  const { data: conv, error: vErr } = await supabase
    .from('ig_conversations')
    .upsert(
      { account_id: accountId, ig_contact_id: contact.id },
      { onConflict: 'account_id,ig_contact_id', ignoreDuplicates: false }
    )
    .select('id, status, assigned_agent')
    .single()
  if (vErr || !conv) return { err: vErr?.message || 'error creando conversacion' }

  return { contact, conv }
}

export async function instagramRoutes(fastify, options) {
  const { wsClients } = options

  // ── GET /ig/cuentas ──────────────────────────────────────────────────────
  // Lista cuentas Instagram. NUNCA expone access_token_enc.
  fastify.get('/ig/cuentas', async (request, reply) => {
    if (!supabase) return reply.code(503).send({ ok: false, error: 'BD no disponible' })

    const { data, error } = await supabase
      .from('channel_accounts')
      .select('id, channel, display_name, username, external_account_id, ciudad, sede_id, status, token_expires_at, created_at')
      .eq('channel', 'instagram')
      .order('display_name', { ascending: true })

    if (error) {
      fastify.log.error({ error }, 'ig/cuentas: error BD')
      return reply.code(500).send({ ok: false, error: 'Error al obtener cuentas' })
    }

    return reply.send({ ok: true, cuentas: data || [] })
  })

  // ── GET /ig/cuentas/:id ──────────────────────────────────────────────────
  // Estado de una cuenta para polling. NUNCA expone access_token_enc.
  fastify.get('/ig/cuentas/:id', async (request, reply) => {
    if (!supabase) return reply.code(503).send({ ok: false, error: 'BD no disponible' })

    const { data, error } = await supabase
      .from('channel_accounts')
      .select('id, channel, display_name, username, external_account_id, status, token_expires_at')
      .eq('id', request.params.id)
      .eq('channel', 'instagram')
      .single()

    if (error || !data)
      return reply.code(404).send({ ok: false, error: 'Cuenta no encontrada' })

    return reply.send({ ok: true, cuenta: data })
  })

  // ── GET /ig/oauth/start ──────────────────────────────────────────────────
  fastify.get('/ig/oauth/start', async (request, reply) => {
    const { accountId, mode } = request.query
    const { err, msg, url }   = await _buildOAuthState(accountId, fastify)

    if (err) {
      if (mode === 'redirect')
        return reply.type('text/html').send(_htmlError(msg))
      return reply.code(err).send({ ok: false, error: msg })
    }

    if (mode === 'redirect')
      return reply.code(302).redirect(url)

    return reply.send({ ok: true, url })
  })

  // ── GET /ig/oauth/callback ───────────────────────────────────────────────
  fastify.get('/ig/oauth/callback', async (request, reply) => {
    const { code, state, error: igError } = request.query

    if (igError) {
      fastify.log.warn({ igError }, 'ig/oauth/callback: usuario canceló o error de IG')
      return reply.type('text/html').send(_htmlError('Autorización cancelada.'))
    }

    if (!code || !state)
      return reply.type('text/html').send(_htmlError('Parámetros inválidos.'))

    const { META_APP_ID, META_APP_SECRET, IG_OAUTH_REDIRECT_URI } = process.env
    if (!META_APP_ID || !META_APP_SECRET || !IG_OAUTH_REDIRECT_URI) {
      fastify.log.error('ig/oauth/callback: vars de entorno incompletas')
      return reply.type('text/html').send(_htmlError('OAuth no configurado en el servidor.'))
    }
    if (!supabase)
      return reply.type('text/html').send(_htmlError('BD no disponible.'))

    const redisKey  = `ig:oauth:state:${state}`
    const stateJson = await redis.get(redisKey)
    if (!stateJson) {
      fastify.log.warn({ state }, 'ig/oauth/callback: state no encontrado o expirado')
      return reply.type('text/html').send(_htmlError('Sesión de autorización expirada. Inicia de nuevo.'))
    }
    await redis.del(redisKey)  // uso único

    const { channel_account_id } = JSON.parse(stateJson)

    try {
      // 1. code → token corto
      const shortRes  = await fetch('https://api.instagram.com/oauth/access_token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    new URLSearchParams({
          client_id:     META_APP_ID,
          client_secret: META_APP_SECRET,
          grant_type:    'authorization_code',
          redirect_uri:  IG_OAUTH_REDIRECT_URI,
          code,
        }).toString(),
      })
      const shortData = await shortRes.json()

      if (shortData.error_type || !shortData.access_token) {
        fastify.log.error({ shortData }, 'ig/oauth/callback: error intercambiando code')
        return reply.type('text/html').send(_htmlError('Error al obtener el token de Instagram.'))
      }

      // 2. token corto → token largo (60 días)
      const llParams = new URLSearchParams({
        grant_type:    'ig_exchange_token',
        client_secret: META_APP_SECRET,
        access_token:  shortData.access_token,
      })
      const llRes  = await fetch(`${IG_GRAPH_URL}/access_token?${llParams}`)
      const llData = await llRes.json()

      if (llData.error || !llData.access_token) {
        fastify.log.error({ llData }, 'ig/oauth/callback: error obteniendo token largo')
        return reply.type('text/html').send(_htmlError('Error al extender el token de Instagram.'))
      }

      // 3. Obtener IGID y username
      const meParams = new URLSearchParams({ fields: 'id,username', access_token: llData.access_token })
      const meRes  = await fetch(`${IG_GRAPH_URL}/me?${meParams}`)
      const meData = await meRes.json()

      if (meData.error || !meData.id) {
        fastify.log.error({ meData }, 'ig/oauth/callback: error obteniendo datos de usuario')
        return reply.type('text/html').send(_htmlError('Error al obtener datos de la cuenta.'))
      }

      // 4. Cifrar token largo
      const tokenEnc  = encryptToken(llData.access_token)
      const expiresAt = new Date(Date.now() + (llData.expires_in ?? 5_184_000) * 1000)

      // 5. Actualizar channel_accounts
      const { error: updateErr } = await supabase
        .from('channel_accounts')
        .update({
          external_account_id: meData.id,
          username:            meData.username || null,
          access_token_enc:    tokenEnc,
          token_expires_at:    expiresAt.toISOString(),
          status:              'active',
          updated_at:          new Date().toISOString(),
        })
        .eq('id', channel_account_id)

      if (updateErr) {
        fastify.log.error({ updateErr }, 'ig/oauth/callback: error actualizando channel_accounts')
        return reply.type('text/html').send(_htmlError('Error guardando la cuenta. Intenta de nuevo.'))
      }

      fastify.log.info({ channel_account_id, igid: meData.id }, 'ig/oauth/callback: cuenta conectada')
      return reply.type('text/html').send(_htmlOk())

    } catch (ex) {
      fastify.log.error({ ex: ex.message }, 'ig/oauth/callback: excepcion inesperada')
      return reply.type('text/html').send(_htmlError('Error inesperado. Intenta de nuevo.'))
    }
  })

  // ── GET /ig/conversaciones ───────────────────────────────────────────────
  // Lista conversaciones activas (waiting + assigned). Incluye datos de contacto.
  fastify.get('/ig/conversaciones', async (request, reply) => {
    if (!supabase) return reply.code(503).send({ ok: false, error: 'BD no disponible' })

    const { data, error } = await supabase
      .from('ig_conversations')
      .select('account_id, status, assigned_agent, ultimo_mensaje, last_message_at, ig_contacts(igsid, nombre, username), channel_accounts(ciudad)')
      .in('status', ['waiting', 'assigned'])
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (error) {
      fastify.log.error({ error }, 'ig/conversaciones: error BD')
      return reply.code(500).send({ ok: false, error: 'Error al obtener conversaciones' })
    }

    const normalized = (data || []).map(c => ({
      account_id:     c.account_id,
      igsid:          c.ig_contacts?.igsid || null,
      nombre:         c.ig_contacts?.nombre || c.ig_contacts?.username || null,
      username:       c.ig_contacts?.username || null,
      status:         c.status,
      assigned_agent: c.assigned_agent,
      ultimo_mensaje: c.ultimo_mensaje || '',
      ultimo_ts:      c.last_message_at
                        ? Math.floor(new Date(c.last_message_at).getTime() / 1000)
                        : 0,
      ciudad:         c.channel_accounts?.ciudad?.toLowerCase() || null,
    }))

    return reply.send(normalized)
  })

  // ── GET /ig/conversaciones/resueltas — lista paginada de chats IG resueltos
  // ?offset=0&limit=20&asesor=nombre&busqueda=texto
  fastify.get('/ig/conversaciones/resueltas', async (request, reply) => {
    if (!supabase) return reply.code(503).send({ ok: false, error: 'BD no disponible' })
    const offset   = parseInt(request.query.offset || '0', 10) || 0
    const limit    = Math.min(parseInt(request.query.limit  || '20',  10), 200)
    const asesor   = request.query.asesor   || null
    const busqueda = request.query.busqueda || null

    let q = supabase
      .from('ig_conversations')
      .select('account_id, assigned_agent, last_message_at, ig_contacts(igsid, nombre, username), channel_accounts(ciudad)')
      .eq('status', 'resolved')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1)

    if (asesor) q = q.eq('assigned_agent', asesor)

    const { data, error } = await q
    if (error) {
      fastify.log.error({ error }, 'ig/conversaciones/resueltas: error BD')
      return reply.code(500).send({ ok: false, error: 'Error al obtener resueltas IG' })
    }

    let items = (data || []).map(c => ({
      account_id: c.account_id,
      igsid:      c.ig_contacts?.igsid    || null,
      nombre:     c.ig_contacts?.nombre   || null,
      username:   c.ig_contacts?.username || null,
      ciudad:     c.channel_accounts?.ciudad?.toLowerCase() || null,
      asesor:     c.assigned_agent        || null,
      ultimo_ts:  c.last_message_at
        ? Math.floor(new Date(c.last_message_at).getTime() / 1000)
        : null,
    }))

    if (busqueda) {
      const q_low = busqueda.toLowerCase()
      items = items.filter(i =>
        (i.nombre   || '').toLowerCase().includes(q_low) ||
        (i.username || '').toLowerCase().includes(q_low) ||
        (i.igsid    || '').toLowerCase().includes(q_low)
      )
    }

    return reply.send(items)
  })

  // ── GET /ig/asignaciones ─────────────────────────────────────────────────
  fastify.get('/ig/asignaciones', async (request, reply) => {
    if (!supabase) return reply.code(503).send({ ok: false, error: 'BD no disponible' })

    const { data, error } = await supabase
      .from('ig_assignments')
      .select('account_id, igsid, asesor, estado')

    if (error) {
      fastify.log.error({ error }, 'ig/asignaciones GET: error BD')
      return reply.code(500).send({ ok: false, error: 'Error al obtener asignaciones' })
    }

    return reply.send(data || [])
  })

  // ── POST /ig/asignaciones — TOMAR chat ───────────────────────────────────
  fastify.post('/ig/asignaciones', async (request, reply) => {
    if (!supabase) return reply.code(503).send({ ok: false, error: 'BD no disponible' })
    const { accountId, igsid, asesor } = request.body || {}
    if (!accountId || !igsid || !asesor)
      return reply.code(400).send({ ok: false, error: 'accountId, igsid y asesor requeridos' })

    // Upsert ig_assignments
    const { error: aErr } = await supabase
      .from('ig_assignments')
      .upsert(
        { account_id: accountId, igsid, asesor, estado: 'asignado' },
        { onConflict: 'account_id,igsid' }
      )
    if (aErr) {
      fastify.log.error({ aErr }, 'ig/asignaciones POST: error upsert')
      return reply.code(500).send({ ok: false, error: 'Error al crear asignacion' })
    }

    // Actualizar status de la conversación
    const { data: contact } = await supabase
      .from('ig_contacts')
      .select('id')
      .eq('account_id', accountId)
      .eq('igsid', igsid)
      .single()

    if (contact) {
      await supabase
        .from('ig_conversations')
        .update({ status: 'assigned', assigned_agent: asesor })
        .eq('account_id', accountId)
        .eq('ig_contact_id', contact.id)
    }

    _broadcast(wsClients, { tipo: 'ig:asignacion', accountId, igsid, asesor })
    fastify.log.info({ accountId, igsid, asesor }, 'ig/asignaciones: chat tomado')
    return reply.send({ ok: true })
  })

  // ── PUT /ig/asignaciones/:accountId/:igsid — RESOLVER ───────────────────
  fastify.put('/ig/asignaciones/:accountId/:igsid', async (request, reply) => {
    if (!supabase) return reply.code(503).send({ ok: false, error: 'BD no disponible' })
    const { accountId, igsid } = request.params
    const { estado } = request.body || {}
    if (!estado) return reply.code(400).send({ ok: false, error: 'estado requerido' })

    const { error: aErr } = await supabase
      .from('ig_assignments')
      .update({ estado })
      .eq('account_id', accountId)
      .eq('igsid', igsid)
    if (aErr) {
      fastify.log.error({ aErr }, 'ig/asignaciones PUT: error')
      return reply.code(500).send({ ok: false, error: 'Error al actualizar asignacion' })
    }

    // Sincronizar status en conversación
    const convStatus = estado === 'resuelto' ? 'resolved' : 'assigned'
    const { data: contact } = await supabase
      .from('ig_contacts').select('id').eq('account_id', accountId).eq('igsid', igsid).single()
    if (contact) {
      await supabase
        .from('ig_conversations')
        .update({ status: convStatus })
        .eq('account_id', accountId)
        .eq('ig_contact_id', contact.id)
    }

    _broadcast(wsClients, { tipo: 'ig:estado', accountId, igsid, estado })
    return reply.send({ ok: true })
  })

  // ── DELETE /ig/asignaciones/:accountId/:igsid — LIBERAR ─────────────────
  fastify.delete('/ig/asignaciones/:accountId/:igsid', async (request, reply) => {
    if (!supabase) return reply.code(503).send({ ok: false, error: 'BD no disponible' })
    const { accountId, igsid } = request.params

    const { error: aErr } = await supabase
      .from('ig_assignments')
      .delete()
      .eq('account_id', accountId)
      .eq('igsid', igsid)
    if (aErr) {
      fastify.log.error({ aErr }, 'ig/asignaciones DELETE: error')
      return reply.code(500).send({ ok: false, error: 'Error al liberar chat' })
    }

    const { data: contact } = await supabase
      .from('ig_contacts').select('id').eq('account_id', accountId).eq('igsid', igsid).single()
    if (contact) {
      await supabase
        .from('ig_conversations')
        .update({ status: 'waiting', assigned_agent: null })
        .eq('account_id', accountId)
        .eq('ig_contact_id', contact.id)
    }

    _broadcast(wsClients, { tipo: 'ig:liberacion', accountId, igsid })
    return reply.send({ ok: true })
  })

  // ── PATCH /ig/asignaciones/:accountId/:igsid — TRANSFERIR ───────────────
  fastify.patch('/ig/asignaciones/:accountId/:igsid', async (request, reply) => {
    if (!supabase) return reply.code(503).send({ ok: false, error: 'BD no disponible' })
    const { accountId, igsid }    = request.params
    const { asesor: asesorNuevo, asesor_actual: asesorActual, nota } = request.body || {}
    if (!asesorNuevo)
      return reply.code(400).send({ ok: false, error: 'asesor requerido' })

    const update = { asesor: asesorNuevo, estado: 'asignado' }
    if (nota !== undefined) update.nota = nota

    const { error: aErr } = await supabase
      .from('ig_assignments')
      .update(update)
      .eq('account_id', accountId)
      .eq('igsid', igsid)
    if (aErr) {
      fastify.log.error({ aErr }, 'ig/asignaciones PATCH: error')
      return reply.code(500).send({ ok: false, error: 'Error al transferir chat' })
    }

    const { data: contact } = await supabase
      .from('ig_contacts').select('id').eq('account_id', accountId).eq('igsid', igsid).single()
    if (contact) {
      await supabase
        .from('ig_conversations')
        .update({ assigned_agent: asesorNuevo, status: 'assigned' })
        .eq('account_id', accountId)
        .eq('ig_contact_id', contact.id)

      // Persistir y broadcast mensaje de sistema + nota (igual que WA)
      const { data: convData } = await supabase
        .from('ig_conversations')
        .select('id')
        .eq('account_id', accountId)
        .eq('ig_contact_id', contact.id)
        .single()

      if (convData) {
        const ts       = Math.floor(Date.now() / 1000)
        const remitente = asesorActual || 'Asesor'
        const textoSis = `${remitente} transfirió la conversación a ${asesorNuevo}`

        await supabase.from('ig_messages').insert({
          ig_conversation_id: convData.id,
          direction:          'inbound',
          tipo:               'sistema',
          texto:              textoSis,
          timestamp:          ts,
        })
        _broadcast(wsClients, {
          tipo:        'ig:mensaje',
          accountId,
          igsid,
          texto:       textoSis,
          timestamp:   ts,
          igMsgId:     null,
          fromMe:      false,
          tipoMensaje: 'sistema',
          convStatus:  'assigned',
        })

        if (nota?.trim()) {
          await supabase.from('ig_messages').insert({
            ig_conversation_id: convData.id,
            direction:          'inbound',
            tipo:               'nota',
            texto:              nota.trim(),
            timestamp:          ts + 1,
            asesor:             remitente,
          })
          _broadcast(wsClients, {
            tipo:        'ig:mensaje',
            accountId,
            igsid,
            texto:       nota.trim(),
            timestamp:   ts + 1,
            igMsgId:     null,
            fromMe:      false,
            tipoMensaje: 'nota',
            asesor:      remitente,
            convStatus:  'assigned',
          })
        }
      }
    }

    _broadcast(wsClients, { tipo: 'ig:transferencia', accountId, igsid, asesor_nuevo: asesorNuevo })
    return reply.send({ ok: true })
  })

  // ── GET /ig/mensajes/:accountId/:igsid ───────────────────────────────────
  // Historial de mensajes de una conversación.
  fastify.get('/ig/mensajes/:accountId/:igsid', async (request, reply) => {
    if (!supabase) return reply.code(503).send({ ok: false, error: 'BD no disponible' })
    const { accountId, igsid } = request.params
    const limit = Math.min(parseInt(request.query.limit || '50', 10), 200)

    // Obtener ig_contact
    const { data: contact, error: cErr } = await supabase
      .from('ig_contacts')
      .select('id')
      .eq('account_id', accountId)
      .eq('igsid', igsid)
      .single()

    if (cErr || !contact)
      return reply.send([])

    // Obtener ig_conversation
    const { data: conv, error: vErr } = await supabase
      .from('ig_conversations')
      .select('id')
      .eq('account_id', accountId)
      .eq('ig_contact_id', contact.id)
      .single()

    if (vErr || !conv)
      return reply.send([])

    // Obtener mensajes ordenados
    const { data: msgs, error: mErr } = await supabase
      .from('ig_messages')
      .select('id, ig_message_id, direction, tipo, texto, timestamp, asesor')
      .eq('ig_conversation_id', conv.id)
      .order('timestamp', { ascending: false })
      .limit(limit)

    if (mErr) {
      fastify.log.error({ mErr }, 'ig/mensajes GET: error BD')
      return reply.code(500).send({ ok: false, error: 'Error al obtener mensajes' })
    }

    return reply.send(msgs || [])
  })

  // ── POST /ig/mensajes — enviar texto ─────────────────────────────────────
  fastify.post('/ig/mensajes', async (request, reply) => {
    if (!supabase) return reply.code(503).send({ ok: false, error: 'BD no disponible' })
    const { accountId, igsid, texto, asesor } = request.body || {}
    if (!accountId || !igsid || !texto)
      return reply.code(400).send({ ok: false, error: 'accountId, igsid y texto requeridos' })

    // Obtener cuenta y token
    const { data: account, error: accErr } = await supabase
      .from('channel_accounts')
      .select('id, external_account_id, access_token_enc, status')
      .eq('id', accountId)
      .eq('channel', 'instagram')
      .single()

    if (accErr || !account)
      return reply.code(404).send({ ok: false, error: 'Cuenta IG no encontrada' })
    if (account.status !== 'active' || !account.access_token_enc)
      return reply.code(403).send({ ok: false, error: 'Cuenta IG no activa o sin token' })

    let accessToken
    try {
      accessToken = decryptToken(account.access_token_enc)
    } catch (ex) {
      fastify.log.error({ ex: ex.message }, 'ig/mensajes POST: error descifrando token')
      return reply.code(500).send({ ok: false, error: 'Error interno de autenticación' })
    }

    // Enviar mensaje vía Instagram API
    const igUserId = account.external_account_id
    let sendData
    try {
      const sendRes = await fetch(`${IG_GRAPH_URL}/${igUserId}/messages`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          recipient: { id: igsid },
          message:   { text: texto },
        }),
      })
      sendData = await sendRes.json()
    } catch (ex) {
      fastify.log.error({ ex: ex.message, accountId, igsid }, 'ig/mensajes POST: error de red llamando a Meta')
      return reply.code(502).send({ ok: false, error: 'Error de conexión con la API de Instagram', detail: null })
    }

    if (sendData.error || !sendData.message_id) {
      fastify.log.error({ sendData, accountId, igsid }, 'ig/mensajes POST: error enviando a Instagram API')
      return reply.code(502).send({ ok: false, error: 'Error enviando mensaje a Instagram', detail: sendData.error })
    }

    const igMsgId = sendData.message_id
    const ts      = Math.floor(Date.now() / 1000)

    // Asegurar que existe el contacto y la conversación
    const { contact, conv, err: ucErr } = await _upsertContactAndConv(accountId, igsid)
    if (ucErr) {
      fastify.log.error({ ucErr }, 'ig/mensajes POST: error upsert contacto/conv')
      // El mensaje ya se envió — registrar como best-effort
    }

    // Insertar mensaje outbound
    if (conv) {
      const { error: mErr } = await supabase
        .from('ig_messages')
        .insert({
          ig_conversation_id: conv.id,
          ig_message_id:      igMsgId,
          direction:          'outbound',
          tipo:               'mensaje',
          texto,
          timestamp:          ts,
          asesor:             asesor || null,
        })
      if (mErr) fastify.log.error({ mErr }, 'ig/mensajes POST: error guardando mensaje outbound')

      // Actualizar conversación
      await supabase
        .from('ig_conversations')
        .update({ ultimo_mensaje: texto, last_message_at: new Date().toISOString() })
        .eq('id', conv.id)
    }

    // Broadcast
    _broadcast(wsClients, {
      tipo:      'ig:mensaje',
      accountId: Number(accountId),
      igsid,
      texto,
      timestamp: ts,
      igMsgId,
      fromMe:    true,
      asesor:    asesor || null,
    })

    fastify.log.info({ accountId, igsid, igMsgId }, 'ig/mensajes POST: mensaje enviado')
    return reply.send({ ok: true, igMsgId })
  })
}
