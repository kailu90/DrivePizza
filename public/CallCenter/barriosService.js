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
let _coordsCache = null; // { barrio: { lat, lng } } — primer resultado con coords gana

export async function cargarBarriosSede(sede) {
    if (_cache[sede]) return _cache[sede];
    const { data, error } = await supabase
        .from('barrios_domicilio')
        .select('barrio, valor, lat, lng')
        .eq('sede', sede)
        .order('barrio');
    if (error) throw error;
    _cache[sede] = data ?? [];
    return _cache[sede];
}

export async function cargarTodosBarrios() {
    // Paginar de a 1000 para superar el límite de PostgREST (PGRST max_rows=1000)
    const allData = [];
    const PAGE = 1000;
    let offset = 0;
    while (true) {
        const { data, error } = await supabase
            .from('barrios_domicilio')
            .select('sede, barrio, valor, lat, lng')
            .order('barrio')
            .range(offset, offset + PAGE - 1);
        if (error) throw error;
        allData.push(...(data ?? []));
        if (!data || data.length < PAGE) break;
        offset += PAGE;
    }

    const result = {};
    const bySede = {};
    _coordsCache  = {};

    for (const { sede, barrio, valor, lat, lng } of allData) {
        if (!result[sede]) { result[sede] = {}; bySede[sede] = []; }
        result[sede][barrio] = valor;
        bySede[sede].push({ barrio, valor, lat, lng });
        if (lat != null && !_coordsCache[barrio]) {
            _coordsCache[barrio] = { lat, lng };
        }
    }

    // Poblar caché por sede al mismo tiempo
    Object.assign(_cache, bySede);
    return result;
}

/** Devuelve un mapa { barrio: { lat, lng } } con las coords geocodificadas. */
export function getBarrioCoordsMap() {
    return _coordsCache ?? {};
}

export function invalidarCacheBarrios(sede) {
    if (sede) delete _cache[sede];
    else Object.keys(_cache).forEach(k => delete _cache[k]);
    _coordsCache = null;
}

// Receptor BroadcastChannel — invalida caché en CUALQUIER página que importe este módulo
// cuando adminBarrios crea/edita/elimina un barrio.
try {
    new BroadcastChannel('barrios').onmessage = ({ data }) => {
        const sede = data?.sede;
        if (sede) delete _cache[sede];
        else { Object.keys(_cache).forEach(k => delete _cache[k]); _coordsCache = null; }
    };
} catch { /* navegadores que no soporten BroadcastChannel */ }
