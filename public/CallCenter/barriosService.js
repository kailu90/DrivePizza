/**
 * barriosService.js
 * Servicio compartido para barrios_domicilio en Supabase.
 * Caché en memoria para minimizar queries repetidas.
 *
 * Exports:
 *   cargarBarriosSede(sede)  → [{ barrio, valor }] ordenado
 *   cargarTodosBarrios()     → { sede: { barrio: valor } }  (formato window.domicilios)
 *   invalidarCacheBarrios(sede?) → limpia caché de una sede o de todas
 */

import { supabase } from '../Api/supabaseConfig.js';

const _cache = {};

export async function cargarBarriosSede(sede) {
    if (_cache[sede]) return _cache[sede];
    const { data, error } = await supabase
        .from('barrios_domicilio')
        .select('barrio, valor')
        .eq('sede', sede)
        .order('barrio');
    if (error) throw error;
    _cache[sede] = data ?? [];
    return _cache[sede];
}

export async function cargarTodosBarrios() {
    const { data, error } = await supabase
        .from('barrios_domicilio')
        .select('sede, barrio, valor')
        .order('barrio');
    if (error) throw error;

    const result  = {};
    const bySede  = {};

    for (const { sede, barrio, valor } of (data ?? [])) {
        if (!result[sede]) { result[sede] = {}; bySede[sede] = []; }
        result[sede][barrio] = valor;
        bySede[sede].push({ barrio, valor });
    }

    // Poblar caché por sede al mismo tiempo
    Object.assign(_cache, bySede);
    return result;
}

export function invalidarCacheBarrios(sede) {
    if (sede) delete _cache[sede];
    else Object.keys(_cache).forEach(k => delete _cache[k]);
}
