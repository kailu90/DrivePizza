import { randomBytes }  from 'node:crypto'
import { supabase }     from '../../config/supabase.js'
import { redis }        from '../../config/redis.js'

const IG_OAUTH_STATE_TTL   = 600   // 10 min en segundos
const IG_OAUTH_SCOPES      = 'instagram_business_basic,instagram_business_manage_messages'
const IG_OAUTH_STATUSES    = new Set(['pending', 'disconnected', 'token_expired'])

export async function instagramRoutes(fastify, options) {

  // ── GET /ig/cuentas ───────────────────────────────────────────────────────
  // Devuelve todas las cuentas Instagram registradas.
  // NUNCA expone: access_token_enc ni ningún secreto de tokens.
  fastify.get('/ig/cuentas', async (request, reply) => {
    if (!supabase) return reply.code(503).send({ ok: false, error: 'BD no disponible' })

    const { data, error } = await supabase
      .from('channel_accounts')
      .select('id, channel, display_name, username, external_account_id, ciudad, sede_id, status, token_expires_at, created_at')
      .eq('channel', 'instagram')
      .order('display_name', { ascending: true })

    if (error) {
      fastify.log.error({ error }, 'ig/cuentas: error consultando channel_accounts')
      return reply.code(500).send({ ok: false, error: 'Error al obtener cuentas' })
    }

    return reply.send({ ok: true, cuentas: data || [] })
  })

  // ── GET /ig/oauth/start ───────────────────────────────────────────────────
  // Genera state/nonce, lo guarda en Redis (TTL 10 min) y devuelve la URL
  // oficial de Instagram Login para que el frontend redirija al usuario.
  // NUNCA genera tokens ni accede a la API de Meta en este endpoint.
  fastify.get('/ig/oauth/start', async (request, reply) => {
    const { META_APP_ID, IG_OAUTH_REDIRECT_URI } = process.env

    if (!META_APP_ID || !IG_OAUTH_REDIRECT_URI) {
      fastify.log.warn('ig/oauth/start: META_APP_ID o IG_OAUTH_REDIRECT_URI no configurados')
      return reply.code(503).send({ ok: false, error: 'OAuth no configurado — faltan META_APP_ID o IG_OAUTH_REDIRECT_URI en .env' })
    }

    if (!supabase) return reply.code(503).send({ ok: false, error: 'BD no disponible' })

    const { accountId } = request.query
    if (!accountId) return reply.code(400).send({ ok: false, error: 'accountId requerido' })

    // Validar que la cuenta exista y sea Instagram en estado conectable
    const { data: account, error: dbErr } = await supabase
      .from('channel_accounts')
      .select('id, channel, status')
      .eq('id', accountId)
      .single()

    if (dbErr || !account) {
      return reply.code(404).send({ ok: false, error: 'Cuenta no encontrada' })
    }
    if (account.channel !== 'instagram') {
      return reply.code(400).send({ ok: false, error: 'La cuenta no es de canal instagram' })
    }
    if (!IG_OAUTH_STATUSES.has(account.status)) {
      return reply.code(400).send({ ok: false, error: `Estado "${account.status}" no permite iniciar OAuth` })
    }

    // Generar nonce criptográficamente seguro (64 hex chars = 256 bits de entropía)
    const nonce = randomBytes(32).toString('hex')

    // Persistir en Redis con TTL — asocia el nonce a la cuenta que inició OAuth
    await redis.set(
      `ig:oauth:state:${nonce}`,
      JSON.stringify({ channel_account_id: account.id, created_at: new Date().toISOString() }),
      'EX',
      IG_OAUTH_STATE_TTL
    )

    // Construir URL de autorización Instagram Login
    const params = new URLSearchParams({
      client_id:     META_APP_ID,
      redirect_uri:  IG_OAUTH_REDIRECT_URI,
      scope:         IG_OAUTH_SCOPES,
      response_type: 'code',
      state:         nonce,
    })

    const authUrl = `https://api.instagram.com/oauth/authorize?${params.toString()}`

    fastify.log.info({ accountId: account.id }, 'ig/oauth/start: nonce generado y URL construida')
    return reply.send({ ok: true, url: authUrl })
  })

}
