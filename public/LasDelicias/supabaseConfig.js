import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../Api/config.js'

/**
 * Cliente Supabase para Las Delicias — schema: lasdelicias
 * Todas las queries .from() apuntan al schema lasdelicias automáticamente.
 * supabase.auth sigue usando el schema auth (no se ve afectado).
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: 'lasdelicias' }
})
