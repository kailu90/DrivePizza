// instagram.refresh.js — Auto-refresh de tokens de Instagram
// Meta long-lived tokens duran 60 días — se refrescan cuando quedan ≤10 días
// API: GET https://graph.instagram.com/v21.0/refresh_access_token?grant_type=ig_refresh_token&access_token=TOKEN

import { supabase }                   from '../../config/supabase.js'
import { encryptToken, decryptToken } from './ig-crypto.js'

const IG_GRAPH_URL         = 'https://graph.instagram.com/v21.0'
const REFRESH_THRESHOLD_MS = 10 * 24 * 60 * 60 * 1000  // refrescar cuando queden ≤10 días
const CHECK_INTERVAL_MS    =      24 * 60 * 60 * 1000  // revisar cada 24 horas

async function _refreshOne(account, log) {
  let plainToken
  try {
    plainToken = decryptToken(account.access_token_enc)
  } catch (ex) {
    log.error({ accountId: account.id, err: ex.message }, '[ig:refresh] Error descifrando token')
    return
  }

  const params = new URLSearchParams({
    grant_type:   'ig_refresh_token',
    access_token: plainToken,
  })

  let data
  try {
    const res = await fetch(`${IG_GRAPH_URL}/refresh_access_token?${params}`)
    data = await res.json()
  } catch (ex) {
    log.error({ accountId: account.id, err: ex.message }, '[ig:refresh] Error de red llamando a Meta')
    return
  }

  if (data.error || !data.access_token) {
    // Error 190 = token inválido/expirado; 102 = sesión expirada
    const code = data.error?.code
    if (code === 190 || code === 102) {
      await supabase
        .from('channel_accounts')
        .update({ status: 'token_expired', updated_at: new Date().toISOString() })
        .eq('id', account.id)
      log.warn({ accountId: account.id, code }, '[ig:refresh] Token expirado — marcado como token_expired')
    } else {
      log.error({ accountId: account.id, error: data.error }, '[ig:refresh] Meta retornó error inesperado')
    }
    return
  }

  const newTokenEnc  = encryptToken(data.access_token)
  const newExpiresAt = new Date(Date.now() + (data.expires_in ?? 5_184_000) * 1000)

  const { error: updateErr } = await supabase
    .from('channel_accounts')
    .update({
      access_token_enc: newTokenEnc,
      token_expires_at: newExpiresAt.toISOString(),
      updated_at:       new Date().toISOString(),
    })
    .eq('id', account.id)

  if (updateErr) {
    log.error({ accountId: account.id, updateErr }, '[ig:refresh] Error guardando token renovado en BD')
    return
  }

  log.info({ accountId: account.id, display_name: account.display_name, expiresAt: newExpiresAt.toISOString() }, '[ig:refresh] Token renovado OK')
}

async function _checkAndRefresh(log) {
  if (!supabase) return

  const now    = new Date()
  const cutoff = new Date(now.getTime() + REFRESH_THRESHOLD_MS).toISOString()

  // Buscar cuentas activas cuyo token vence en los próximos 10 días (o ya venció)
  const { data: accounts, error } = await supabase
    .from('channel_accounts')
    .select('id, display_name, access_token_enc, token_expires_at')
    .eq('channel', 'instagram')
    .eq('status', 'active')
    .lt('token_expires_at', cutoff)

  if (error) {
    log.error({ error }, '[ig:refresh] Error consultando cuentas IG')
    return
  }

  if (!accounts?.length) {
    log.info('[ig:refresh] Sin tokens que renovar')
    return
  }

  log.info({ count: accounts.length }, '[ig:refresh] Renovando tokens IG')
  for (const account of accounts) {
    await _refreshOne(account, log)
  }
}

export function startIgTokenRefreshCron(log) {
  // Primer check 30s después del arranque (el servidor ya está listo)
  setTimeout(() => _checkAndRefresh(log).catch(err => log.error({ err: err.message }, '[ig:refresh] Error inesperado')), 30_000)

  // Luego cada 24 horas
  setInterval(() => _checkAndRefresh(log).catch(err => log.error({ err: err.message }, '[ig:refresh] Error inesperado')), CHECK_INTERVAL_MS)

  log.info('[ig:refresh] Cron iniciado — revisará tokens cada 24h')
}
