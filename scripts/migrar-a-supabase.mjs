/**
 * migrar-a-supabase.mjs
 * Lee datos de Firestore (firebase-admin) y los inserta en Supabase PostgreSQL.
 *
 * Orden: Sedes → Categorias → Proveedores → Productos
 *
 * Ejecución: node scripts/migrar-a-supabase.mjs
 * Es idempotente — se puede correr varias veces sin duplicar datos (upsert).
 */

import admin from 'firebase-admin'
import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require   = createRequire(import.meta.url)

// ── Configuración ──────────────────────────────────────────────────────────────
const SUPABASE_URL      = 'http://65.109.225.149:8000'
const SERVICE_ROLE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.QN54GXzAfLmOs3eJQvKHIzKua7UGqnuzFdBYnxF_HiU'
const SERVICE_ACCOUNT   = JSON.parse(readFileSync(path.join(__dirname, 'serviceAccountKey.json'), 'utf8'))

// ── Firebase Admin ────────────────────────────────────────────────────────────
admin.initializeApp({ credential: admin.credential.cert(SERVICE_ACCOUNT) })
const db = admin.firestore()

// ── Supabase REST helper ───────────────────────────────────────────────────────
async function sbUpsert(table, rows, onConflict = 'id') {
    if (!rows.length) { console.log(`  ⚠️  ${table}: sin filas`); return }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
        method:  'POST',
        headers: {
            'apikey':        SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type':  'application/json',
            'Prefer':        `resolution=merge-duplicates,return=minimal`,
        },
        body: JSON.stringify(rows),
    })
    if (!res.ok) {
        const err = await res.text()
        throw new Error(`${table} — HTTP ${res.status}: ${err}`)
    }
    console.log(`  ✅ ${table}: ${rows.length} filas insertadas/actualizadas`)
}

// ── 1. Sedes ──────────────────────────────────────────────────────────────────
async function migrarSedes() {
    console.log('\n📍 Migrando Sedes...')
    const snap = await db.collection('Sedes').get()
    const rows = snap.docs.map(d => {
        const data = d.data()
        return {
            id:      d.id,
            name:    data.name || d.id,
            id_user: data.idUser || null,
        }
    })
    await sbUpsert('sedes', rows, 'id')
}

// ── 2. Categorías ─────────────────────────────────────────────────────────────
async function migrarCategorias() {
    console.log('\n🏷️  Migrando Categorías...')
    const snap = await db.collection('Planta').doc('principal').collection('Categorias').get()
    const rows = snap.docs.map(d => {
        const data = d.data()
        return {
            id_category: data.idCategory,
            name:        data.name,
        }
    })
    await sbUpsert('categorias', rows, 'id_category')
}

// ── 3. Proveedores ────────────────────────────────────────────────────────────
async function migrarProveedores() {
    console.log('\n🏭 Migrando Proveedores...')
    const snap = await db.collection('Planta').doc('principal').collection('Proveedores').get()
    const rows = snap.docs.map(d => {
        const data = d.data()
        return {
            nombre:       data.name || data.nombre || '',
            telefono:     data.phone || data.telefono || null,
            asesor:       data.asesor || null,
            descripcion:  data.descripcion || null,
            active:       data.active !== false,
            firestore_id: d.id,
        }
    })
    await sbUpsert('proveedores', rows, 'firestore_id')
}

// ── 4. Productos ──────────────────────────────────────────────────────────────
async function migrarProductos() {
    console.log('\n📦 Migrando Productos...')

    // Necesitamos el mapa firestore_id → id de proveedores para el FK
    const provRes  = await fetch(`${SUPABASE_URL}/rest/v1/proveedores?select=id,firestore_id`, {
        headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` }
    })
    const provList = await provRes.json()
    const provMap  = Object.fromEntries(provList.map(p => [p.firestore_id, p.id]))

    const snap = await db.collection('Planta').doc('principal').collection('Productos').get()
    const rows = snap.docs.map(d => {
        const data = d.data()
        return {
            firestore_id:     d.id,
            name:             data.name || '',
            price:            data.price ?? 0,
            stock:            data.stock ?? 0,
            unidad:           data.unidad || null,
            measurement_unit: data.measurementUnit || null,
            active:           data.active !== false,
            sin_limite_stock: data.sinLimiteStock || false,
            presentaciones:   data.presentaciones || [],
            quantities:       data.quantities || null,
            id_category:      data.idCategory || null,
            rotacion:         data.rotacion || null,
            proveedor_id:     data.proveedorId ? (provMap[data.proveedorId] || null) : null,
            proveedor_nombre: data.proveedorNombre || null,
            updated_at:       data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        }
    })

    // Insertar en lotes de 50 para no sobrecargar
    const LOTE = 50
    for (let i = 0; i < rows.length; i += LOTE) {
        const lote = rows.slice(i, i + LOTE)
        await sbUpsert('productos', lote, 'firestore_id')
    }
}

// ── 5. Usuarios ───────────────────────────────────────────────────────────────
const TEMP_PASSWORD = 'EverestTemp2026!'

async function crearUsuarioAuth(email) {
    // Crea usuario en Supabase Auth via Admin API
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
            'apikey':        SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type':  'application/json',
        },
        body: JSON.stringify({
            email,
            password:       TEMP_PASSWORD,
            email_confirm:  true,   // marcar email como confirmado directamente
        }),
    })
    const json = await res.json()
    if (!res.ok) {
        // Si ya existe el usuario, obtener su id
        if (json.msg?.includes('already been registered') || json.code === 'email_exists') {
            const listRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
                headers: { 'apikey': SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` }
            })
            const listJson = await listRes.json()
            const existing = listJson.users?.find(u => u.email === email)
            if (existing) return existing.id
        }
        throw new Error(`Auth create failed for ${email}: ${JSON.stringify(json)}`)
    }
    return json.id
}

async function migrarUsuarios() {
    console.log('\n👤 Migrando Usuarios...')
    const snap = await db.collection('Usuarios').get()

    let creados = 0, omitidos = 0, errores = 0

    for (const d of snap.docs) {
        const data = d.data()
        if (!data.email) { console.log(`  ⚠️  Sin email: ${data.username}`); omitidos++; continue }

        try {
            // 1. Crear en Supabase Auth (o recuperar id si ya existe)
            const supabaseUid = await crearUsuarioAuth(data.email)

            // 2. Upsert perfil en public.usuarios
            await sbUpsert('usuarios', [{
                id:           supabaseUid,
                username:     data.username     || '',
                email:        data.email,
                sede:         data.sede          || null,
                rol:          data.rol           || 'pending',
                active:       data.active        !== false,
                status:       data.status        || 'approved',
                firestore_uid: d.id,
            }], 'email')

            console.log(`  ✅ ${data.username} (${data.email}) — ${data.rol}`)
            creados++
        } catch (e) {
            console.error(`  ❌ ${data.username}: ${e.message}`)
            errores++
        }
    }

    console.log(`\n  → Creados/actualizados: ${creados} | Omitidos: ${omitidos} | Errores: ${errores}`)
    console.log(`  → Contraseña temporal asignada: "${TEMP_PASSWORD}"`)
}

// ── 7. PedidosPlanta ──────────────────────────────────────────────────────────
async function migrarPedidosPlanta() {
    console.log('\n📋 Migrando PedidosPlanta...')
    const snap = await db.collection('Planta').doc('principal').collection('PedidosPlanta').get()
    const rows = snap.docs.map(d => {
        const data = d.data()
        return {
            firestore_id:  d.id,
            id_pedido:     data.idPedido     || null,
            user_sede:     data.user          || null,
            delivery_date: data.deliveryDate  || null,
            products:      data.products      || [],
            net_cost:      data.netCost       ?? 0,
            total:         data.total         ?? 0,
            recargo:       data.recargo       ?? 0,
            order_notes:   data.orderNotes    || null,
            id_user:       data.idUser        || null,
            status:        data.status        || 'pendiente',
            order_date:    typeof data.orderDate === 'string' ? data.orderDate : (data.orderDate?.toDate?.()?.toISOString() || null),
            updated_at:    data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            eliminado:     data.eliminado     ?? false,
        }
    })

    const LOTE = 50
    for (let i = 0; i < rows.length; i += LOTE) {
        await sbUpsert('pedidos_planta', rows.slice(i, i + LOTE), 'firestore_id')
    }
    console.log(`  → Total: ${rows.length} pedidos de planta`)
}

// ── 8. PedidosCallCenter ──────────────────────────────────────────────────────
async function migrarPedidosCallCenter() {
    console.log('\n📞 Migrando PedidosCallCenter...')
    const snap = await db.collection('CallCenter').doc('principal').collection('PedidosCallCenter').get()

    function toISO(val) {
        if (!val) return null
        if (val?.toDate) return val.toDate().toISOString()
        if (typeof val === 'string') return val
        return null
    }

    const rows = snap.docs.map(d => {
        const data = d.data()
        return {
            firestore_id:      d.id,
            n_pedido:          Number.isInteger(data.nPedido) ? data.nPedido : (parseInt(data.nPedido) || null),
            nombre:            data.nombre            || null,
            telefono:          data.telefono          || null,
            direccion:         data.direccion         || null,
            sede:              data.sede              || null,
            pago:              data.pago              || null,
            obs:               data.obs               || null,
            productos:         data.productos         || [],
            total:             data.total             ?? 0,
            impreso:           data.impreso           ?? false,
            asesor:            data.asesor            || null,
            fecha:             toISO(data.fecha),
            estado:            data.estado            || 'pendiente',
            canal:             data.canal             || null,
            domicilio:         data.domicilio         || null,
            motivo_cancelacion: data.motivoCancelacion    || null,
            tipo:               data.tipo                 || null,
            cantidad_personas:  data.cantidadPersonas     || null,
            ts_recibido:       toISO(data.tsRecibido),
            ts_preparacion:    toISO(data.tsPreparacion),
            ts_despachado:     toISO(data.tsDespachado),
        }
    })

    const LOTE = 50
    for (let i = 0; i < rows.length; i += LOTE) {
        await sbUpsert('pedidos_callcenter', rows.slice(i, i + LOTE), 'firestore_id')
    }
    console.log(`  → Total: ${rows.length} pedidos de call center`)
}

// ── 9. Movimientos ────────────────────────────────────────────────────────────
async function migrarMovimientos() {
    console.log('\n📊 Migrando Movimientos...')
    const snap = await db.collection('Planta').doc('principal').collection('Movimientos').get()

    function toISO(val) {
        if (!val) return null
        if (val?.toDate) return val.toDate().toISOString()
        if (typeof val === 'string') return val
        return null
    }

    function toInt(val) {
        if (val == null) return null
        const n = parseInt(val)
        return isNaN(n) ? null : n
    }

    function toNum(val) {
        if (val == null) return null
        const n = parseFloat(val)
        return isNaN(n) ? null : n
    }

    const rows = snap.docs.map(d => {
        const data = d.data()
        return {
            firestore_id:     d.id,
            movimiento_id:    data.movimientoId   || null,
            fecha:            toISO(data.fecha),
            tipo:             data.tipo            || 'DESCONOCIDO',
            entidad:          data.entidad         || null,
            producto_id:      toInt(data.productoId),
            producto_nombre:  data.productoNombre  || null,
            cantidad:         toNum(data.cantidad),
            usuario:          data.usuario         || null,
            referencia_id:    data.referenciaId    || null,
            pedido_numero:    toInt(data.pedidoNumero),
            motivo:           data.motivo          || null,
            notas:            data.notas           || null,
            subtipo:          data.subtipo         || null,
            precio:           toNum(data.precio),
            valor_total:      toNum(data.valorTotal),
            sede:             data.sede            || null,
            // MODIFICACION
            campo:            data.campo           || null,
            valor_anterior:   data.valorAnterior   != null ? String(data.valorAnterior) : null,
            valor_nuevo:      data.valorNuevo      != null ? String(data.valorNuevo)    : null,
            cambios:          data.cambios         || null,
            // ENTRADA/SALIDA/ELIMINACION/CREACION con array
            productos:        data.productos       || null,
            proveedor_id:     data.proveedorId     || null,
            proveedor_nombre: data.proveedorNombre || null,
            unidad_medida:    data.unidadMedida    || null,
            // AJUSTE
            stock_anterior:   toNum(data.stockAnterior),
            stock_nuevo:      toNum(data.stockNuevo),
            diferencia:       toNum(data.diferencia),
            // PRODUCCION
            materiales:       data.materiales      || null,
            producto_salida:  data.productoSalida  || null,
            orden_numero:     toInt(data.ordenNumero),
        }
    })

    const LOTE = 100
    for (let i = 0; i < rows.length; i += LOTE) {
        await sbUpsert('movimientos', rows.slice(i, i + LOTE), 'firestore_id')
    }
    console.log(`  → Total: ${rows.length} movimientos`)
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    const args = process.argv.slice(2)

    console.log('🚀 Iniciando migración Firestore → Supabase')
    console.log(`   Proyecto Firebase: ${SERVICE_ACCOUNT.project_id}`)
    console.log(`   Supabase:          ${SUPABASE_URL}\n`)

    try {
        if (args.includes('--solo-pedidos')) {
            await migrarPedidosPlanta()
            await migrarPedidosCallCenter()
        } else if (args.includes('--solo-movimientos')) {
            await migrarMovimientos()
        } else if (args.includes('--solo-usuarios')) {
            await migrarUsuarios()
        } else if (args.includes('--solo-productos')) {
            await migrarProductos()
        } else if (args.includes('--solo-proveedores')) {
            await migrarProveedores()
        } else {
            await migrarSedes()
            await migrarCategorias()
            await migrarProveedores()
            await migrarProductos()
            await migrarUsuarios()
            await migrarPedidosPlanta()
            await migrarPedidosCallCenter()
            await migrarMovimientos()
        }
        console.log('\n✅ Migración completada exitosamente.')
    } catch (e) {
        console.error('\n❌ Error durante la migración:', e.message)
        process.exit(1)
    } finally {
        process.exit(0)
    }
}

main()
