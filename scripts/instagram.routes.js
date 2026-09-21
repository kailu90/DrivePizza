import { supabase } from '../../config/supabase.js'

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
}
