// LasDelicias/app.js — Configuración del catálogo (independiente de DrivePizza)

// ── Iconos de categoría ───────────────────────────────────────────────────────
const _S = `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`

const CAT_SVG = {
    'panaderia': `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M5 8c0-2.21 3.13-4 7-4s7 1.79 7 4v9a2 2 0 01-2 2H7a2 2 0 01-2-2V8z"/><path d="M5 12h14"/></svg>`,
    'pasteler':  `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M4 15v5h16v-5"/><line x1="2" y1="15" x2="22" y2="15"/><path d="M6 15v-4h12v4"/><path d="M6 11a6 6 0 0112 0"/><line x1="12" y1="2" x2="12" y2="5"/></svg>`,
    'cafeter':   `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
    'cafe':      `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
    'bebida':    `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M5 7h14l-1.5 9A2 2 0 0115.51 18H8.49A2 2 0 016.5 16L5 7z"/><line x1="2" y1="7" x2="22" y2="7"/><line x1="12" y1="2" x2="12" y2="7"/></svg>`,
    'hojaldre':  `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M3 17c0-4 3.5-10 9-10s9 6 9 10a2 2 0 01-4 0c0-2-2-6-5-6s-5 4-5 6a2 2 0 01-4 0z"/></svg>`,
    'frito':     `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M6 20h12l1-10H5L6 20z"/><path d="M9 10V7M12 10V5M15 10V7"/></svg>`,
    'desayuno':  `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M17 18a5 5 0 00-10 0"/><line x1="12" y1="2" x2="12" y2="9"/><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/><line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/></svg>`,
    'torta':     `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M4 15v5h16v-5"/><line x1="2" y1="15" x2="22" y2="15"/><path d="M6 15v-4h12v4"/><path d="M6 11a6 6 0 0112 0"/><line x1="12" y1="2" x2="12" y2="5"/></svg>`,
    'ponque':    `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M4 15v5h16v-5"/><line x1="2" y1="15" x2="22" y2="15"/><path d="M6 15v-4h12v4"/><path d="M6 11a6 6 0 0112 0"/><line x1="12" y1="2" x2="12" y2="5"/></svg>`,
    'galleta':   `<svg viewBox="0 0 24 24" fill="none" ${_S}><circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="8" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.5" fill="currentColor" stroke="none"/></svg>`,
    'empanada':  `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M3 12a9 9 0 0118 0H3z"/><path d="M6 12a6 6 0 0112 0"/></svg>`,
    'arepa':     `<svg viewBox="0 0 24 24" fill="none" ${_S}><ellipse cx="12" cy="12" rx="9" ry="5"/><ellipse cx="12" cy="12" rx="6" ry="3"/></svg>`,
    'default':   `<svg viewBox="0 0 24 24" fill="none" ${_S}><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><line x1="7" y1="2" x2="7" y2="22"/><path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3v7"/></svg>`,
}

export const TODOS_SVG = `<svg viewBox="0 0 24 24" fill="none" ${_S}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`

export function catIcon(name) {
    const key = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return Object.entries(CAT_SVG).find(([k]) => key.includes(k))?.[1] ?? CAT_SVG.default
}

// ── Descripciones de productos ────────────────────────────────────────────────

const SUFIJO_DESAYUNO = ', arepa con queso, bebida de tu elección de 8 Oz'

const DESAYUNO_DESC = [
    { key: 'revuelto',  label: 'Huevos revueltos'   },
    { key: 'perico',    label: 'Huevos pericos'      },
    { key: 'ranchero',  label: 'Huevos rancheros'    },
    { key: 'cacerola',  label: 'Huevos en cacerola'  },
    { key: 'calentado', label: 'Calentado especial'  },
    { key: 'especial',  label: 'Calentado especial'  },
]

export function getDescripcion(nombre) {
    const norm = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const match = DESAYUNO_DESC.find(d => norm.includes(d.key))
    return match ? match.label + SUFIJO_DESAYUNO : ''
}

// ── Selector Desayunos — opciones ─────────────────────────────────────────────
export const DESAYUNO_HUEVOS = [
    { nombre: 'Huevos revueltos',    desc: '',                   delta: 0    },
    { nombre: 'Huevos pericos',      desc: 'Tomate y cebolla',   delta: 0    },
    { nombre: 'Huevos rancheros',    desc: 'Salchicha ranchera', delta: 0    },
    { nombre: 'Huevos en cacerola',  desc: '',                   delta: 0    },
    { nombre: 'Especial (Calentado)',desc: '',                   delta: 1000 },
]

export const DESAYUNO_BEBIDAS = [
    { nombre: 'Café en agua',           delta: 0    },
    { nombre: 'Café en leche',          delta: 0    },
    { nombre: 'Chocolate en agua',      delta: 0    },
    { nombre: 'Chocolate en leche',     delta: 0    },
    { nombre: 'Milo caliente en leche', delta: 1000 },
]

export function esDesayuno(nombre) {
    const norm = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return norm.includes('desayun')
}

// ── Selector Migao — opciones ─────────────────────────────────────────────────
export const MIGAO_QUESOS   = ['Buñuelo', 'Arepa', 'Pandequeso', 'Almojábana', 'Pandebono']
export const MIGAO_GALLETAS = ['Ducales', 'Saltinas']
export const MIGAO_BEBIDAS  = ['Café en agua', 'Café en leche', 'Chocolate en agua', 'Chocolate en leche']

export function esMigao(nombre) {
    const norm = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return norm.includes('migao')
}

// ── Bebidas — grupos con variantes explícitas (patrón DrivePizza) ─────────────
// variantes: { 'NombreDisplay': 'NOMBRE_EXACTO_EN_DB' }
// En renderProductos() se resuelven a productos reales de Supabase.
export const LD_BEBIDAS_GRUPOS = [
    {
        nombre: 'Gaseosa 400 ML',
        variantes: {
            'Colombiana': 'COLOMBIANA 400 ML POSTOBON',
            'Manzana':    'MANZANA 400 ML POSTOBON',
            'Naranja':    'NARANJA 400 ML POSTOBON',
            'Pepsi':      'PEPSI 400 ML POSTOBON',
            'Uva':        'UVA 400 ML POSTOBON',
        },
    },
    {
        nombre: 'Gaseosa 1.5 Lts',
        variantes: {
            'Colombiana': 'COLOMBIANA 1.5 LTS',
            'Manzana':    'MANZANA 1.5 LTS',
            'Naranja':    'NARANJA POSTOBON 1.5 LT',
            'Pepsi':      'PEPSI 1.5 LTS',
            'Tamarindo':  'TAMARINDO 1.5 LTS',
            'Uva':        'UVA 1.5 LTS',
        },
    },
    {
        nombre: 'Gaseosa 2.5 Lts',
        variantes: {
            'Colombiana': 'COLOMBIANA 2.5 LTS POSTOBON',
            'Manzana':    'MANZANA 2.5 LTS POSTOBON',
            'Pepsi':      'PEPSI 2.5 LTS POSTOBON',
            'Uva':        'UVA POSTOBON 2.5 LTS',
        },
    },
    {
        nombre: 'Gaseosa 3.1 Lts',
        variantes: {
            'Colombiana': 'COLOMBIANA 3.1 LTS',
            'Manzana':    'MANZANA 3.1 LTS',
            'Pepsi':      'PEPSI 3.1 LTS',
            'Uva':        'UVA 3.1 LTS',
        },
    },
    {
        nombre: 'HIT 500 ML',
        variantes: {
            'Lulo':              'HIT 500 ML LULO',
            'Mora':              'HIT 500 ML MORA',
            'Mango':             'HIT 500 ML MANGO',
            'Naranja Piña':      'HIT 500 ML NARANJA PIÑA',
            'Frutas Tropicales': 'HIT 500 ML FRUTAS TROPICALES',
        },
    },
    {
        nombre: 'Gatorade 500 ML',
        variantes: {
            'Fruta Tropical': 'GATORADE 500 ML FRUTA TROPICAL',
            'Mandarina':      'GATORADE 500 ML MANDARINA',
            'Maracuyá':       'GATORADE 500 ML MARACUYÁ',
        },
    },
    {
        nombre: 'H2O 600 ML',
        variantes: {
            'Maracuyá':   'H2O 600 ML MARACUYÁ',
            'Lima Limón': 'H2O LIMA LIMON 600 ML',
        },
    },
    {
        nombre: 'Mr Tea 500 ML',
        variantes: {
            'Durazno': 'MR TEA 500 ML DURAZNO',
            'Limón':   'MR TEA LIMON 500 ML',
        },
    },
]

// Helpers internos para formatear nombres en las tarjetas individuales (resto)
const _nb      = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const _tc      = s => s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
const _tamanio = n => { const m = n.match(/(\d+[.,]?\d*)\s*(ML|LTS?|LT)\b/i); return m ? `${m[1]} ${m[2].toUpperCase()}` : '' }
const _esGas   = n => /^(COLOMBIANA|MANZANA|NARANJA|PEPSI|TAMARINDO|UVA|SEVEN UP|BRETANA)/.test(_nb(n))
const _saborG  = n => { const m = n.match(/^(PEPSI CERO|COLOMBIANA|MANZANA|NARANJA|PEPSI|TAMARINDO|UVA|SEVEN UP|BRETA[NÑ]A)/); return _tc(m?.[1] ?? n.split(' ')[0]) }
const _saborH  = n => {
    if (n.includes('LULO'))     return 'Lulo'
    if (n.includes('MORA'))     return 'Mora'
    if (n.includes('MANGO'))    return 'Mango'
    if (n.includes('NARANJA'))  return 'Naranja Piña'
    if (n.includes('TROPICAL')) return 'Frutas Tropicales'
    return n.replace(/^HIT\s+[\d.]+\s*(ML|LTS?)\s*/i, '').trim() || n
}

// Formatea nombres para productos individuales que no entran en ningún grupo
// "COLOMBIANA 350 ML POSTOBON" → "Gaseosa 350 ML - Colombiana"
export function formatNombreBebida(nombre) {
    if (_esGas(nombre)) {
        const t = _tamanio(nombre); return t ? `Gaseosa ${t} - ${_saborG(nombre)}` : nombre
    }
    if (/^HIT\b/.test(nombre)) {
        const t = _tamanio(nombre); return t ? `HIT ${t} - ${_saborH(nombre)}` : nombre
    }
    return nombre
}

export const BEBIDAS_GRUPOS = [
    {
        nombre: 'Aguas',
        detectar: n => /^AGUA (CRISTAL|HATSU)/.test(n),
    },
    {
        nombre: 'Energizantes',
        detectar: n => /^(RED BULL|SPEED MAX)\b/.test(n),
    },
    {
        nombre: 'Maltas',
        detectar: n => /^NATUMALTA\b/.test(n),
    },
    {
        nombre: 'Cervezas y Refajos',
        detectar: n => /^(CERVEZA|REFAJO)\b/.test(n),
    },
]
