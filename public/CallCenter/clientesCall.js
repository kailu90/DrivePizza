import { supabase } from '../Api/supabaseConfig.js';

/** Normaliza teléfono: solo dígitos */
function normTel(t) {
    return (t || '').replace(/\D/g, '');
}

/**
 * Busca clientes cuyo teléfono empieza con el query (mínimo 4 dígitos).
 */
export async function buscarClientes(query) {
    const q = normTel(query);
    if (q.length < 4) return [];
    const { data } = await supabase
        .from('clientes')
        .select('id, telefono, nombre')
        .ilike('telefono', `${q}%`)
        .order('updated_at', { ascending: false })
        .limit(6);
    return data || [];
}

/**
 * Carga un cliente exacto con sus direcciones
 * (predeterminada primero, luego más reciente).
 */
export async function cargarCliente(telefono) {
    const { data } = await supabase
        .from('clientes')
        .select('*, direcciones_cliente(*)')
        .eq('telefono', normTel(telefono))
        .single();
    if (!data) return null;
    data.direcciones_cliente?.sort((a, b) =>
        (b.predeterminada ? 1 : 0) - (a.predeterminada ? 1 : 0) ||
        new Date(b.created_at) - new Date(a.created_at)
    );
    return data;
}

/**
 * Crea o actualiza el cliente y agrega la dirección si no existe exacta.
 * Llamar después de crear un pedido exitosamente.
 */
export async function upsertCliente({ telefono, nombre, direccion, barrio, sedeId }) {
    const tel = normTel(telefono);
    if (!tel) return;

    const { data: cliente, error } = await supabase
        .from('clientes')
        .upsert(
            { telefono: tel, nombre: nombre || '', updated_at: new Date().toISOString() },
            { onConflict: 'telefono' }
        )
        .select('id')
        .single();

    if (error || !cliente?.id || !direccion) return;

    const { count } = await supabase
        .from('direcciones_cliente')
        .select('id', { count: 'exact', head: true })
        .eq('cliente_id', cliente.id)
        .eq('direccion', direccion);

    if (count === 0) {
        await supabase.from('direcciones_cliente').insert({
            cliente_id:    cliente.id,
            direccion,
            barrio:        barrio  || null,
            sede_id:       sedeId  || null,
            predeterminada: false,
        });
    }
}
