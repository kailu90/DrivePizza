// ── Servicio centralizado de productos ────────────────────────────────────────
// Todas las pantallas leen desde Hetzner/Redis
// Las escrituras siguen yendo directo a Firestore

import { HETZNER_URL } from '../Api/config.js'

let _cache = null

/**
 * Retorna todos los productos activos desde Hetzner.
 * Si ya están en memoria, no hace fetch.
 * @param {boolean} forzar - Si true, ignora caché en memoria y recarga desde Hetzner
 */
export async function getProductos(forzar = false) {
    if (!forzar && _cache) return _cache

    try {
        const response = await fetch(`${HETZNER_URL}/planta/productos`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        _cache = await response.json()
        console.log('[productosService] Productos cargados desde Hetzner:', _cache.length)
        return _cache
    } catch (err) {
        console.warn('[productosService] Error Hetzner, fallback a Firestore:', err)
        return await _cargarDesdeFirestore()
    }
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
 * Actualiza el stock de un producto en caché sin ir a Firestore ni Hetzner.
 * Usar después de una escritura exitosa en Firestore para mantener el display sincronizado.
 * @param {string} productId - ID del documento Firestore
 * @param {number} delta     - Cantidad a sumar (positivo) o restar (negativo)
 */
export function actualizarStockEnCache(productId, delta) {
    if (!_cache) return
    const p = _cache.find(p => p.id === productId)
    if (p !== undefined) p.stock = (p.stock ?? 0) + delta
}

/**
 * Fallback — solo se usa si Hetzner no responde
 */
async function _cargarDesdeFirestore() {
    const { getDocs, query, collection, orderBy } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
    const { plantaDB } = await import('../Api/firebaseConfig.js')
    const snap = await getDocs(query(
        collection(plantaDB.db, 'Planta', 'principal', 'Productos'),
        orderBy('name', 'asc')
    ))
    _cache = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    console.log('[productosService] Productos cargados desde Firestore (fallback):', _cache.length)
    return _cache
}