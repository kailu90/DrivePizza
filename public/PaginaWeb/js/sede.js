/* ============================================================
   Drive Pizza — Lógica de sedes
   Carga desde Supabase + validación de horario (UTC-5 Colombia)
   ============================================================ */

import { supabase } from '../../Api/supabaseConfig.js';

const SEDE_KEY = 'dp_sede';

// ── SUPABASE ───────────────────────────────────────────────────

/** Carga todas las sedes activas para web. */
export async function cargarSedes() {
  const { data, error } = await supabase
    .from('sedes')
    .select('id, name, nombre_display, ciudad, direccion, telefono, linea_ivr, horario_apertura, horario_cierre, dias_activos, activa_web')
    .eq('activa_web', true)
    .order('nombre_display');
  if (error) throw error;
  return data || [];
}

/** Carga una sede por su slug (name). */
export async function cargarSede(slug) {
  const { data, error } = await supabase
    .from('sedes')
    .select('id, name, nombre_display, ciudad, direccion, telefono, linea_ivr, horario_apertura, horario_cierre, dias_activos, activa_web')
    .eq('name', slug)
    .single();
  if (error) throw error;
  return data;
}

// ── HORARIO ────────────────────────────────────────────────────

/** Retorna hora, minutos y día actual en Colombia (UTC-5). */
function ahoraCol() {
  const now = new Date();
  const col = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  return {
    h:   col.getUTCHours(),
    m:   col.getUTCMinutes(),
    dia: col.getUTCDay(), // 0=Domingo … 6=Sábado
  };
}

/** Convierte "HH:MM" a minutos totales desde medianoche. */
function toMin(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/** Devuelve true si la sede está abierta en este momento. */
export function estaAbierta(sede) {
  const { h, m, dia } = ahoraCol();
  const ahoraMin    = h * 60 + m;
  const diasActivos = sede.dias_activos || [0, 1, 2, 3, 4, 5, 6];
  if (!diasActivos.includes(dia)) return false;
  const apertura = toMin(sede.horario_apertura || '11:00');
  const cierre   = toMin(sede.horario_cierre   || '22:00');
  return ahoraMin >= apertura && ahoraMin < cierre;
}

/** Devuelve el horario formateado: "3:15 pm – 11:00 pm" */
export function formatHorario(sede) {
  const fmt = t => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12  = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  };
  return `${fmt(sede.horario_apertura)} – ${fmt(sede.horario_cierre)}`;
}

// ── SEDE ACTIVA (localStorage) ─────────────────────────────────

/** Guarda la sede seleccionada en localStorage. */
export function setSedeActual(sede) {
  localStorage.setItem(SEDE_KEY, JSON.stringify(sede));
}

/** Recupera la sede seleccionada desde localStorage. */
export function getSedeActual() {
  try { return JSON.parse(localStorage.getItem(SEDE_KEY)); }
  catch { return null; }
}

/** Elimina la sede guardada (para cambiar de sede). */
export function limpiarSede() {
  localStorage.removeItem(SEDE_KEY);
}

// ── UTILS ──────────────────────────────────────────────────────

/** Devuelve el nombre de display de la sede con prefijo "Sede". */
export function displayNombre(sede) {
  const nombre = sede?.nombre_display || sede?.name || '';
  return nombre ? `Sede ${nombre}` : '';
}
