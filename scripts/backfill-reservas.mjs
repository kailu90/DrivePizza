/**
 * backfill-reservas.mjs
 * Lee las reservas de Firebase y actualiza fecha_reserva / hora_reserva
 * en Supabase mediante PATCH por firestore_id.
 *
 * Ejecución: node scripts/backfill-reservas.mjs
 */

import admin from 'firebase-admin'
import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require   = createRequire(import.meta.url)

// ── Configuración ──────────────────────────────────────────────────────────────
const SUPABASE_URL     = 'http://65.109.225.149:8000'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.QN54GXzAfLmOs3eJQvKHIzKua7UGqnuzFdBYnxF_HiU'
const SERVICE_ACCOUNT  = JSON.parse(readFileSync(path.join(__dirname, 'serviceAccountKey.json'), 'utf8'))

// ── Firebase Admin ────────────────────────────────────────────────────────────
admin.initializeApp({ credential: admin.credential.cert(SERVICE_ACCOUNT) })
const db = admin.firestore()

// ── Supabase PATCH helper ─────────────────────────────────────────────────────
async function sbPatch(firestoreId, payload) {
    const url = `${SUPABASE_URL}/rest/v1/pedidos_callcenter?firestore_id=eq.${encodeURIComponent(firestoreId)}`
    const res = await fetch(url, {
        method:  'PATCH',
        headers: {
            'apikey':        SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type':  'application/json',
            'Prefer':        'return=minimal',
        },
        body: JSON.stringify(payload),
    })
    if (!res.ok) {
        const err = await res.text()
        throw new Error(`PATCH ${firestoreId} — HTTP ${res.status}: ${err}`)
    }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log('\n📅 Backfill reservas: fecha_reserva + hora_reserva\n')

    const snap = await db
        .collection('CallCenter')
        .doc('principal')
        .collection('PedidosCallCenter')
        .where('tipo', '==', 'reserva')
        .get()

    console.log(`  Firebase: ${snap.size} reservas encontradas`)

    let ok = 0, sin_fecha = 0, errores = 0

    for (const doc of snap.docs) {
        const data = doc.data()
        const fechaReserva = data.fechaReserva || null
        const horaReserva  = data.horaReserva  || null

        if (!fechaReserva && !horaReserva) {
            sin_fecha++
            console.log(`  ⚠️  ${doc.id} (nPedido=${data.nPedido}) — sin fechaReserva ni horaReserva en Firebase`)
            continue
        }

        try {
            await sbPatch(doc.id, {
                fecha_reserva:     fechaReserva,
                hora_reserva:      horaReserva,
                cantidad_personas: data.cantidadPersonas || null,
            })
            console.log(`  ✅ ${doc.id} (nPedido=${data.nPedido}) → ${fechaReserva} ${horaReserva ?? ''}`)
            ok++
        } catch (e) {
            console.error(`  ❌ ${doc.id}: ${e.message}`)
            errores++
        }
    }

    console.log(`\n  Resultado: ${ok} actualizados | ${sin_fecha} sin fecha en Firebase | ${errores} errores`)
}

main().catch(e => { console.error(e); process.exit(1) })
