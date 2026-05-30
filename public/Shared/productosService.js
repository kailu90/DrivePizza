// ── Servicio centralizado de productos ────────────────────────────────────────
// Lee directamente desde Supabase.

import { supabase } from '../Api/supabaseConfig.js'

let _cache = null

// Normaliza una fila de Supabase al formato que usa toda la app
function _normalizar(row) {
    return {
        id:              String(row.id),
        firestore_id:    row.firestore_id,
        name:            row.name,
        idCategory:      row.id_category,
        measurementUnit: row.measurement_unit || row.unidad || null,
        price:           parseFloat(row.price) || 0,
        stock:           parseFloat(row.stock) ?? 0,
        active:          row.active,
        sinLimiteStock:  row.sin_limite_stock,
        quantities:      row.quantities || null,
        presentaciones:  row.presentaciones || [],
        rotacion:        row.rotacion || null,
        proveedorId:     row.proveedor_id ? String(row.proveedor_id) : null,
        proveedorNombre: row.proveedor_nombre || null,
        soloProduccion:  row.solo_produccion ?? false,
        updated_at:      row.updated_at,
    }
}

/**
 * Retorna todos los productos desde Supabase.
 * Si ya están en memoria, no hace fetch.
 * @param {boolean} forzar - Si true, ignora caché en memoria y recarga
 */
export async function getProductos(forzar = false) {
    if (!forzar && _cache) return _cache

    const { data, error } = await supabase
        .from('productos')
        .select('*')
        .order('name', { ascending: true })

    if (error) throw error
    _cache = data.map(_normalizar)
    console.log('[productosService] Productos cargados desde Supabase:', _cache.length)
    return _cache
}

/**
 * Invalida el caché en memoria.
 * Llamar después de crear, editar o desactivar un producto.
 */
export function invalidarProductos() {
    _cache = null
    console.log('[productosService] Caché invalidado')
}

/**
 * Actualiza el stock de un producto en caché sin ir a Supabase.
 * @param {string} productId - ID del producto (Supabase id como string)
 * @param {number} delta     - Cantidad a sumar (positivo) o restar (negativo)
 */
export function actualizarStockEnCache(productId, delta) {
    if (!_cache) return
    const p = _cache.find(p => p.id === productId || p.firestore_id === productId)
    if (p !== undefined) p.stock = (p.stock ?? 0) + delta
}

