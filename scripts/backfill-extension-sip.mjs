/**
 * backfill-extension-sip.mjs
 *
 * Lee extension + sipPassword desde Firebase /Usuarios
 * y actualiza los registros correspondientes en Supabase public.usuarios.
 *
 * Ejecución:
 *   node scripts/backfill-extension-sip.mjs
 *
 * Requiere:
 *   - scripts/serviceAccountKey.json  (Firebase Admin)
 *   - Las columnas extension y sip_password ya creadas en Supabase:
 *       ALTER TABLE usuarios ADD COLUMN extension TEXT;
 *       ALTER TABLE usuarios ADD COLUMN sip_password TEXT;
 */

import admin from 'firebase-admin'
import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname  = path.dirname(fileURLToPath(import.meta.url))
const require    = createRequire(import.meta.url)

const SUPABASE_URL     = 'http://65.109.225.149:8000'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.QN54GXzAfLmOs3eJQvKHIzKua7UGqnuzFdBYnxF_HiU'
const SERVICE_ACCOUNT  = JSON.parse(readFileSync(path.join(__dirname, 'serviceAccountKey.json'), 'utf8'))

// ── Firebase Admin ─────────────────────────────────────────────────────────
admin.initializeApp({ credential: admin.credential.cert(SERVICE_ACCOUNT) })
const db = admin.firestore()

// ── Supabase helper ────────────────────────────────────────────────────────
async function sbPatch(table, matchField, matchValue, fields) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?${matchField}=eq.${encodeURIComponent(matchValue)}`
    const res = await fetch(url, {
        method: 'PATCH',
        headers: {
            'apikey':        SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type':  'application/json',
            'Prefer':        'return=minimal',
        },
        body: JSON.stringify(fields),
    })
    if (!res.ok) {
        const err = await res.text()
        throw new Error(`PATCH ${table} (${matchField}=${matchValue}) — HTTP ${res.status}: ${err}`)
    }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
    console.log('Leyendo /Usuarios desde Firebase...\n')
    const snap = await db.collection('Usuarios').get()

    let actualizados = 0
    let sinExtension = 0
    let errores      = 0

    for (const doc of snap.docs) {
        const data = doc.data()

        if (!data.extension) {
            sinExtension++
            continue
        }

        const username    = data.username || data.email || doc.id
        const extension   = data.extension
        const sipPassword = data.sipPassword || null

        try {
            // Buscar por firestore_uid — es la columna que guarda el doc ID original
            await sbPatch('usuarios', 'firestore_uid', doc.id, {
                extension,
                sip_password: sipPassword,
            })

            console.log(`  OK  ${username.padEnd(20)} ext=${extension}  sip_password=${sipPassword ? '***' : 'null'}`)
            actualizados++
        } catch (e) {
            console.error(`  ERR ${username}: ${e.message}`)
            errores++
        }
    }

    console.log(`
Resumen
-------
Con extension:    ${actualizados + errores}
Actualizados:     ${actualizados}
Sin extension:    ${sinExtension}
Errores:          ${errores}
`)
}

main()
    .catch(e => { console.error('Error fatal:', e.message); process.exit(1) })
    .finally(() => process.exit(0))
