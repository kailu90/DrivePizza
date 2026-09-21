import { randomBytes, createCipheriv } from 'node:crypto'
import { supabase } from '../../config/supabase.js'
import { redis }    from '../../config/redis.js'

const IG_OAUTH_STATE_TTL = 600  // 10 min en segundos
const IG_OAUTH_SCOPES    = 'instagram_business_basic,instagram_business_manage_messages'
const IG_OAUTH_STATUSES  = new Set(['pending', 'disconnected', 'token_expired'])

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

// ── Cifrado AES-256-GCM ────────────────────────────────────────────────────
// Formato: base64(nonce[12] || authTag[16] || ciphertext)
function _encryptToken(plaintext) {
  const keyHex = process.env.IG_TOKEN_ENCRYPTION_KEY
  if (!keyHex || keyHex.length !== 64)
    throw new Error('IG_TOKEN_ENCRYPTION_KEY no configurada o invalida (requiere 64 hex chars)')
  const key    = Buffer.from(keyHex, 'hex')
  const nonce  = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const ct     = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return Buffer.concat([nonce, tag, ct]).toString('base64')
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

export async function instagramRoutes(fastify, options) {

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
  // mode=redirect (popup): valida, genera nonce, hace 302 → Instagram.
  // mode=json (default):   devuelve { ok, url } para uso programático.
  // NUNCA accede a la API de Meta aquí — solo construye la URL de autorización.
  fastify.get('/ig/oauth/start', async (request, reply) => {
    const { accountId, mode } = request.query
    const { err, msg, url }   = await _buildOAuthState(accountId, fastify)

    if (err) {
      if (mode === 'redirect')
        return reply.type('text/html').send(_htmlError(msg))
      return reply.code(err).send({ ok: false, error: msg })
    }

    if (mode === 'redirect')
      return reply.redirect(302, url)

    return reply.send({ ok: true, url })
  })

  // ── GET /ig/oauth/callback ───────────────────────────────────────────────
  // Instagram redirige aquí después de que el usuario autoriza.
  // Pasos: validar state → intercambiar code → obtener token largo → cifrar →
  //        actualizar channel_accounts → servir HTML de confirmación.
  fastify.get('/ig/oauth/callback', async (request, reply) => {
    const { code, state, error: igError } = request.query

    // Instagram puede devolver error si el usuario canceló
    if (igError) {
      fastify.log.warn({ igError }, 'ig/oauth/callback: usuario canceló o error de IG')
      return reply.type('text/html').send(_htmlError('Autorización cancelada.'))
    }

    if (!code || !state)
      return reply.type('text/html').send(_htmlError('Parámetros inválidos.'))

    // Validar env vars necesarias para el intercambio de tokens
    const { META_APP_ID, META_APP_SECRET, IG_OAUTH_REDIRECT_URI } = process.env
    if (!META_APP_ID || !META_APP_SECRET || !IG_OAUTH_REDIRECT_URI) {
      fastify.log.error('ig/oauth/callback: META_APP_ID/META_APP_SECRET/IG_OAUTH_REDIRECT_URI no configurados')
      return reply.type('text/html').send(_htmlError('OAuth no configurado en el servidor.'))
    }
    if (!supabase)
      return reply.type('text/html').send(_htmlError('BD no disponible.'))

    // Recuperar y consumir el nonce de Redis (uso único)
    const redisKey  = `ig:oauth:state:${state}`
    const stateJson = await redis.get(redisKey)
    if (!stateJson) {
      fastify.log.warn({ state }, 'ig/oauth/callback: state no encontrado o expirado')
      return reply.type('text/html').send(_htmlError('Sesión de autorización expirada. Inicia de nuevo.'))
    }
    await redis.del(redisKey)  // un solo uso

    const { channel_account_id } = JSON.parse(stateJson)

    try {
      // 1. code → token de corta duración
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
      const llRes  = await fetch(`https://graph.instagram.com/access_token?${llParams}`)
      const llData = await llRes.json()

      if (llData.error || !llData.access_token) {
        fastify.log.error({ llData }, 'ig/oauth/callback: error obteniendo token largo')
        return reply.type('text/html').send(_htmlError('Error al extender el token de Instagram.'))
      }

      // 3. Obtener IGID y username
      const meParams = new URLSearchParams({ fields: 'id,username', access_token: llData.access_token })
      const meRes  = await fetch(`https://graph.instagram.com/me?${meParams}`)
      const meData = await meRes.json()

      if (meData.error || !meData.id) {
        fastify.log.error({ meData }, 'ig/oauth/callback: error obteniendo datos de usuario')
        return reply.type('text/html').send(_htmlError('Error al obtener datos de la cuenta.'))
      }

      // 4. Cifrar token largo con AES-256-GCM
      const tokenEnc = _encryptToken(llData.access_token)

      // expires_in devuelto por IG es en segundos; calcular fecha absoluta
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

      fastify.log.info({ channel_account_id, igid: meData.id }, 'ig/oauth/callback: cuenta conectada correctamente')
      return reply.type('text/html').send(_htmlOk())

    } catch (ex) {
      fastify.log.error({ ex: ex.message }, 'ig/oauth/callback: excepcion inesperada')
      return reply.type('text/html').send(_htmlError('Error inesperado. Intenta de nuevo.'))
    }
  })

}
