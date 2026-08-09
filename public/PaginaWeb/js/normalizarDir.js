/* ============================================================
   normalizarDir.js — Normalización de direcciones colombianas
   Formato objetivo: Carrera 29 # 50 - 54
   ============================================================ */

// ── TIPOS DE VÍA ──────────────────────────────────────────────
// Orden importa: los compuestos (Av. Cra / Av. Cl) van primero
const TIPOS_VIA = [
  // Avenida Carrera / Avenida Calle (compuestos)
  { regex: /^av(?:enida)?\.?\s*cra?(?:rrera)?\.?/i,          nombre: 'Avenida Carrera' },
  { regex: /^av(?:enida)?\.?\s*c(?:ll?e?|alle?)\.?/i,        nombre: 'Avenida Calle' },
  // Simples
  { regex: /^(k(?:ra?|r?arrera?)?|carr(?:era)?)/i,            nombre: 'Carrera' },
  { regex: /^(c(?:ll?e?|alle?)?(?=[\s\d])|cal(?:le)?)/i,      nombre: 'Calle' },
  { regex: /^(av(?:d?a?|e(?:nida)?)?)/i,                      nombre: 'Avenida' },
  { regex: /^(diag(?:onal)?|dg)/i,                            nombre: 'Diagonal' },
  { regex: /^(transv(?:ersal)?|tv|trv|trans(?:v)?)/i,         nombre: 'Transversal' },
  { regex: /^(circ(?:unvalar)?|circunv)/i,                    nombre: 'Circunvalar' },
  { regex: /^(km|kil[oó]metro)/i,                             nombre: 'Kilómetro' },
  { regex: /^(manz(?:ana)?|mz)/i,                             nombre: 'Manzana' },
];

// ── PALABRAS QUE INDICAN LUGAR (no vía) ───────────────────────
const PALABRAS_LUGAR = [
  'conjunto', 'conj', 'urbanización', 'urbanizacion', 'urb',
  'barrio', 'sector', 'ciudadela', 'parque', 'residencial',
  'portal', 'villa', 'bulevar', 'boulevard', 'loma', 'vereda',
  'finca', 'hacienda', 'agrupación', 'agrupacion', 'etapa',
];

// ── COMPLEMENTOS RECONOCIDOS (al final de la dirección) ───────
// Ej: "Cra 29 # 50-54, Conjunto Bulevar" — se conservan tal cual
const REGEX_COMPLEMENTO = /[,;]\s*(conj(?:unto)?|urb(?:anización)?|sector|barrio|etapa|bloque|torre|apt?o?|casa|piso|of(?:icina)?|local|bodega|int(?:erior)?)\b.*/i;

/**
 * Normaliza un número de vía colombiano.
 * Admite: 15, 15A, 15 bis, 15A bis
 */
function normalizarNumVia(n) {
  return n.trim().replace(/\s+/g, ' ').replace(/bis/i, 'Bis');
}

/**
 * Normaliza una dirección colombiana.
 * @param {string} raw
 * @returns {{ valor: string, ok: boolean, sinVia?: true, esLugar?: true, incompleta?: true }}
 */
export function normalizarDireccion(raw) {
  const str = raw.trim();
  if (!str) return { valor: '', ok: false };

  const lower = str.toLowerCase();

  // ── ¿Parece nombre de lugar sin vía? ──────────────────────
  const primeraP = lower.split(/[\s,]/)[0];
  const esLugar  = PALABRAS_LUGAR.some(p => primeraP === p || lower.startsWith(p + ' '));
  if (esLugar) return { valor: str, ok: false, esLugar: true };

  // ── Separar complemento al final si existe ────────────────
  const mComp = str.match(REGEX_COMPLEMENTO);
  const complemento = mComp ? mComp[0] : '';
  const cuerpo = mComp ? str.slice(0, mComp.index).trim() : str;

  // ── Detectar tipo de vía ──────────────────────────────────
  let tipo  = null;
  let resto = cuerpo;
  for (const t of TIPOS_VIA) {
    const m = cuerpo.match(new RegExp('^' + t.regex.source + '\\.?\\s*', 'i'));
    if (m) { tipo = t.nombre; resto = cuerpo.slice(m[0].length).trim(); break; }
  }

  if (!tipo) return { valor: str, ok: false, sinVia: true };

  // ── Regex de número de vía (admite bis y letra) ───────────
  const N = '(\\d+[a-zA-Z]?(?:\\s*bis)?)';

  // Patrón 1: A # B - C
  const p1 = resto.match(new RegExp(`^${N}\\s*[#°]\\s*${N}\\s*[-–]\\s*${N}$`, 'i'));
  if (p1) return _ok(tipo, p1[1], p1[2], p1[3], complemento);

  // Patrón 2: A No. B - C  |  A nro B-C  |  A N° B-C
  const p2 = resto.match(new RegExp(`^${N}\\s+(?:no|nro|n)[°.]?\\s*${N}\\s*[-–]\\s*${N}$`, 'i'));
  if (p2) return _ok(tipo, p2[1], p2[2], p2[3], complemento);

  // Patrón 3: A B - C  (guión presente, sin separador #)
  const p3 = resto.match(new RegExp(`^${N}\\s+${N}\\s*[-–]\\s*${N}$`, 'i'));
  if (p3) return _ok(tipo, p3[1], p3[2], p3[3], complemento);

  // Patrón 4: A B C  (tres números solo con espacios)
  const p4 = resto.match(new RegExp(`^${N}\\s+${N}\\s+${N}$`, 'i'));
  if (p4) return _ok(tipo, p4[1], p4[2], p4[3], complemento);

  // Patrón 5: A # B  (dos números — incompleta)
  const p5 = resto.match(new RegExp(`^${N}\\s*[#°]\\s*${N}$`, 'i'));
  if (p5) return { valor: `${tipo} ${normalizarNumVia(p5[1])} # ${normalizarNumVia(p5[2])}${complemento}`, ok: false, incompleta: true };

  // Patrón 6: A B  (dos números sin separador — incompleta)
  const p6 = resto.match(new RegExp(`^${N}\\s+${N}$`, 'i'));
  if (p6) return { valor: `${tipo} ${normalizarNumVia(p6[1])} # ${normalizarNumVia(p6[2])}${complemento}`, ok: false, incompleta: true };

  // ── No se pudo estructurar ────────────────────────────────
  return { valor: `${tipo} ${resto}${complemento}`, ok: false };
}

function _ok(tipo, a, b, c, comp) {
  return {
    valor: `${tipo} ${normalizarNumVia(a)} # ${normalizarNumVia(b)} - ${normalizarNumVia(c)}${comp}`,
    ok: true,
  };
}
