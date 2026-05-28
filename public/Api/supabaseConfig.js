import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js'

/**
 * Cliente Supabase para uso en el browser (ESM).
 *
 * Importar en cualquier módulo:
 *   import { supabase } from '../Api/supabaseConfig.js'
 *
 * URL activa:
 *   Dev  → http://65.109.225.149:8000  (Kong directo, Live Server)
 *   Prod → https://supabase.everest-central.com  (Caddy + HTTPS)
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
