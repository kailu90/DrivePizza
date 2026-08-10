import { supabase } from '../Api/supabaseConfig.js';

const CACHE_KEY = 'planta_sedes_sup';
const CACHE_TTL = 60 * 60 * 1000; // 60 min

export async function getSedes() {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (raw) {
            const { t, data } = JSON.parse(raw);
            if (Date.now() - t < CACHE_TTL) return data;
            sessionStorage.removeItem(CACHE_KEY);
        }
        const { data: rows, error } = await supabase
            .from('sedes')
            .select('*')
            .order('name');
        if (error) throw error;
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), data: rows }));
        return rows;
    } catch (e) {
        console.error('Error al obtener sedes:', e);
        return [];
    }
}
