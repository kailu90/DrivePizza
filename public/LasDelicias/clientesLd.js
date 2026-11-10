/**
 * clientesLd.js — Servicio de clientes para Las Delicias.
 * Equivalente a CallCenter/clientesCall.js pero sobre el schema lasdelicias.
 */
import { supabase } from './supabaseConfig.js'

/** Normaliza teléfono: extrae número colombiano de 10 dígitos */
function normTel(t) {
    const digits = (t || '').replace(/\D/g, '')
    const match  = digits.match(/3\d{9}/)
    return match ? match[0] : digits
}

/**
 * Busca clientes por teléfono (mínimo 4 dígitos) o nombre (mínimo 2 chars).
 * Retorna hasta 6 resultados.
 */
export async function buscarClientesLd(query) {
    const q       = (query || '').trim()
    const digitos = q.replace(/\D/g, '')
    const esNum   = digitos.length >= 4

    if (!esNum && q.length < 2) return []

    let req = supabase
        .from('clientes')
        .select('id, telefono, nombre')
        .order('updated_at', { ascending: false })
        .limit(6)

    if (esNum) {
        req = req.ilike('telefono', `%${digitos}%`)
    } else {
        req = req.ilike('nombre', `%${q}%`)
    }

    const { data } = await req
    return data || []
}

/**
 * Carga un cliente exacto con sus direcciones
 * (predeterminada primero, luego más reciente).
 */
export async function cargarClienteLd(telefono) {
    const { data } = await supabase
        .from('clientes')
        .select('*, direcciones_cliente(*)')
        .eq('telefono', normTel(telefono))
        .single()

    if (!data) return null
    data.direcciones_cliente?.sort((a, b) =>
        (b.predeterminada ? 1 : 0) - (a.predeterminada ? 1 : 0) ||
        new Date(b.created_at) - new Date(a.created_at)
    )
    return data
}

/**
 * Crea o actualiza el cliente y agrega la dirección si no existe ya.
 * Llamar después de crear un pedido exitosamente.
 * El trigger de BD se encarga de incrementar total_pedidos.
 */
export async function upsertClienteLd({ telefono, nombre, direccion, barrio }) {
    const tel = normTel(telefono)
    if (!tel) return

    const { data: cliente, error } = await supabase
        .from('clientes')
        .upsert(
            { telefono: tel, nombre: nombre || '', updated_at: new Date().toISOString() },
            { onConflict: 'telefono' }
        )
        .select('id')
        .single()

    if (error || !cliente?.id || !direccion) return

    // Agregar dirección solo si no existe exactamente igual
    const dirNorm = (direccion || '').trim().toLowerCase()
    const { data: existentes } = await supabase
        .from('direcciones_cliente')
        .select('id, direccion')
        .eq('cliente_id', cliente.id)

    const yaExiste = (existentes || []).some(
        d => (d.direccion || '').trim().toLowerCase() === dirNorm
    )

    if (!yaExiste) {
        await supabase.from('direcciones_cliente').insert({
            cliente_id:    cliente.id,
            direccion:     direccion.trim(),
            barrio:        barrio || null,
            predeterminada: false,
        })
    }
}
