/* ============================================================
   Drive Pizza — Datos de menú compartidos
   Fuente única de verdad para CallCenter y PaginaWeb.
   Cualquier cambio aquí aplica en ambos módulos.
   ============================================================ */

// ── PRECIOS PIZZAS ────────────────────────────────────────────
export const preciosPizzas = {
    superEstofada:       { "Porción": 16500, "Pequeña": 49000, "Mediana": 60000, "Grande": 85000, "Jumbo": 115000 },
    estofada:            { "Porción": 15500, "Pequeña": 44000, "Mediana": 55000, "Grande": 74000, "Jumbo": 92000 },
    especial:            { "Porción": 16500, "Pequeña": 49000, "Mediana": 60000, "Grande": 85000, "Jumbo": 115000 },
    especialSinPorcion:  { "Pequeña": 49000, "Mediana": 60000, "Grande": 85000, "Jumbo": 115000 },
    clasica:             { "Porción": 13000, "Pequeña": 32000, "Mediana": 42000, "Grande": 58000, "Jumbo": 75000 },
    tipica:              { "Porción": 15500, "Pequeña": 44000, "Mediana": 55000, "Grande": 74000, "Jumbo": 92000 },
    majestuosaPequeña:   { "Pequeña": 49000 },
    premium:             { "Pizzeta": 20000 },
    majestuosaPizzeta:   { "Pizzeta": 24000 },
};

// ── PRECIOS PASTAS ────────────────────────────────────────────
export const preciosPastas = {
    spaguettiSencillo:  { "pollo": 28000, "carne": 28000, "champiñones": 28000 },
    spaguettiMixto:     { "pollo/champiñones": 28000, "pollo/carne": 28000, "carne/champiñones": 28000 },
    spaguettiRemix:     { "Unidad": 28000 },
    macaroniSencillo:   { "pollo": 28000, "carne": 28000, "champiñones": 28000 },
    macaroniMixto:      { "pollo/champiñones": 28000, "pollo/carne": 28000, "carne/champiñones": 28000 },
    macaroniRemix:      { "Unidad": 28000 },
    fetuccine:          { "Unidad": 28000 },
    fetuccineSencillo:  { "pollo": 28000, "carne": 28000, "champiñones": 28000 },
    fetuccineMixto:     { "pollo/champiñones": 28000, "pollo/carne": 28000, "carne/champiñones": 28000 },
    fetuccineRemix:     { "Unidad": 28000 },
    carbonara:          { "Unidad": 30000 },
    alfredo:            { "Unidad": 29000 },
    pestoCamaron:       { "Unidad": 29000 },
    matriziana:         { "Unidad": 28000 },
    marinera:           { "Unidad": 34000 },
};

// ── PRECIOS LASAÑAS ───────────────────────────────────────────
export const preciosLasañas = {
    lasañaSencilla:    { "pollo": 26000, "carne": 26000, "champiñones": 26000 },
    lasañaMixta:       { "pollo/champiñon": 26000, "pollo/carne": 26000, "carne/champiñones": 26000 },
    lasañaRemix:       { "Unidad": 26000 },
    lasañaVegetariana: { "Unidad": 26000 },
    lasañaDrive:       { "Unidad": 30000 },
};

// ── PRECIOS CALZONES / STROMBOLI ──────────────────────────────
export const preciosCalzones = {
    calzoneClasico:  { "Pequeño": 29000, "Grande": 45000 },
    calzoneEspecial: { "Pequeño": 32000, "Grande": 49000 },
};
export const preciosStromboli = {
    stromboliClasico:  { "unidad": 20000 },
    stromboliEspecial: { "unidad": 23000 },
};

// ── PRECIOS HAMBURGUESAS ──────────────────────────────────────
export const preciosHamburguesas = {
    hamburguesaClasica:    { "Unidad": 24000 },
    hamburguesaPollo:      { "Unidad": 24000 },
    hamburguesaMixta:      { "Unidad": 32000 },
    hamburguesaDobleCarne: { "Unidad": 35000 },
    hamburguesaEstofada:   { "Unidad": 35000 },
};

// ── PRECIOS ENSALADAS ─────────────────────────────────────────
export const preciosEnsaladas = {
    ensaladaDrive:      { "Unidad": 24000 },
    ensaladaMiCuate:    { "Unidad": 25000 },
    ensaladaPremium:    { "Unidad": 25000 },
    ensaladaCesar:      { "Unidad": 25000 },
    ensaladaBalsámica:  { "Unidad": 25000 },
};

// ── PRECIOS SANDWICHES ────────────────────────────────────────
export const preciosSandwiches = {
    sandwicheJamon: { "Unidad": 20000 },
    sandwichePollo: { "Unidad": 23000 },
    sandwicheAtun:  { "Unidad": 25000 },
};

// ── PRECIOS MAICITOS ──────────────────────────────────────────
export const preciosMaicitos = {
    maicitosGratinados: { "Unidad": 20000 },
};

// ── PRECIOS ADICIONES ─────────────────────────────────────────
export const preciosAdiciones = {
    basicas:     { "Porción": 3000,  "Pequeña": 8000,  "Mediana": 10000, "Grande": 12000, "Jumbo": 14000, "Unidad": 3000, "Pizzeta": 3000, "Hamburguesa": 3000 },
    intermedia:  { "Porción": 4000,  "Pequeña": 11000, "Mediana": 13000, "Grande": 16000, "Jumbo": 18000, "Unidad": 4000, "Pizzeta": 4000, "Hamburguesa": 4000 },
    superior:    { "Porción": 5000,  "Pequeña": 13000, "Mediana": 15000, "Grande": 18000, "Jumbo": 20000, "Unidad": 5000, "Pizzeta": 5000, "Hamburguesa": 5000 },
    gourmet:     { "Porción": 6000,  "Pequeña": 16000, "Mediana": 20000, "Grande": 28000, "Jumbo": 34000, "Unidad": 6000, "Pizzeta": 6000, "Hamburguesa": 6000 },
    salsas:      { "Salsa Drive": 4000, "Salsa Cuate": 4000, "Salsa Napolitana": 4000, "Salsa de la casa": 4000 },
    hamburguesa: { "Hamburguesa": 8000 },
};

// ── PRECIOS BORDES ────────────────────────────────────────────
// Solo aplican a pizzas NO estofadas, tamaños Pequeña → Jumbo
export const preciosBordes = {
    "Pequeña": 14000,
    "Mediana": 18000,
    "Grande":  21000,
    "Jumbo":   24000,
};

// ── PRECIOS BEBIDAS ───────────────────────────────────────────
export const preciosBebidas = {
    // Refrescos
    gaseosa400ml:        { "Pepsi": 6000, "Colombiana": 6000, "Manzana": 6000, "Piña": 6000, "Kola": 6000, "Uva": 6000, "7 up": 6000, "Naranja": 6000 },
    gaseosa1500ml:       { "Pepsi": 9000, "Colombiana": 9000, "Manzana": 9000, "Piña": 9000, "Kola": 9000, "Uva": 9000, "7 up": 9000, "Naranja": 9000 },
    jugoHit500ml:        { "Tropical": 6000, "Mora": 6000, "Naranja/Piña": 6000, "Mango": 6000 },
    agua:                { "Sin gas": 6000, "Con gas": 6000 },
    bretaña:             { "300 ml": 4000, "1.5 lts": 9000 },
    // Jugos Naturales
    jugoEnAgua:          { "Mango": 9000, "Fresa": 9000, "Mora": 9000, "Mandarina": 9000, "Naranja": 9000, "Lulo": 9000, "Guanábana": 9000, "Maracuyá": 9000 },
    jugoEnLeche:         { "Mango": 10000, "Fresa": 10000, "Mora": 10000, "Mandarina": 10000, "Naranja": 10000, "Lulo": 10000, "Guanábana": 10000, "Maracuyá": 10000 },
    granizada:           { "Limón": 9000, "Maracuyá": 9000, "Naranja": 9000, "Mora": 9000, "Lulo": 9000, "Guanábana": 9000, "Mandarina": 9000 },
    granizadaEspecial:   { "MaracuMango": 10000, "Frutos Rojos": 10000, "Fresa": 10000, "Frutos Blancos": 10000, "Frutos Amarillos": 10000 },
    // Cervezas
    cerveza3Cordilleras: { "Unidad": 10000 },
    vasoMichelado:       { "Unidad": 2200 },
    // Otros
    MrTea:               { "Limón": 6000, "Durazno": 6000 },
    H2OH:                { "Limón": 6000, "Maracuyá": 6000, "Limonata": 6000 },
    HatsuSoda:           { "Rojo": 8000, "Blanco": 8000, "Negro": 8000, "Rosado": 8000, "Verde": 8000 },
    Hatsu:               { "Rojo": 8000, "Blanco": 8000, "Negro": 8000, "Rosado": 8000, "Verde": 8000 },
};

// ── PRECIOS ENTRADAS ──────────────────────────────────────────
export const preciosEntradas = {
    panDeAjo:       { "Unidad": 3500 },
    panDulces:      { "Unidad": 3500 },
    papasFrancesa:  { "Unidad": 8000 },
    salsaTartara:   { "Unidad": 1000 },
    piñaCalada:     { "Unidad": 2000 },
};

// ── CATEGORÍAS CON ADICIONES (no pizzas) ─────────────────────
// Valor = tamanoRaw para buscar precio en preciosAdiciones
export const CATEGORIAS_ADICIONABLES = {
    "Pastas":        "Porción",
    "Lasañas":       "Porción",
    "Ensaladas":     "Porción",
    "Sandwiches":    "Unidad",
    "Hamburguesas":  "Hamburguesa",
    "Calzones":      "Unidad",
    "Stromboli":     "Unidad",
};

// ── TAMAÑOS QUE ADMITEN BORDE ─────────────────────────────────
export const TAMANOS_CON_BORDE = new Set(["Pequeña", "Mediana", "Grande", "Jumbo"]);

// ── CATEGORÍAS DE PIZZAS ──────────────────────────────────────
export const CATS_PIZZAS = [
    "Pizzas Super Estofadas",
    "Pizzas Estofadas",
    "Pizzas Especiales",
    "Pizzas Clásicas",
    "Pizzas Típicas",
    "Pizzetas Premium",
];

// ── MENÚ COMPLETO ─────────────────────────────────────────────
export const menuData = {
    "Entradas/Adición": [
        { nombre: "Pan De Ajo",            opciones: preciosEntradas.panDeAjo,      descripcion: "7 deliciosos panes de ajo." },
        { nombre: "Pan Dulces",            opciones: preciosEntradas.panDulces,     descripcion: "7 deliciosos panes dulces." },
        { nombre: "Papas a la francesa",   opciones: preciosEntradas.papasFrancesa, descripcion: "Porción de papas a la francesa." },
        { nombre: "Salsa tártara",         opciones: preciosEntradas.salsaTartara,  descripcion: "Sobre de salsa tártara adicional." },
        { nombre: "Piña Calada",           opciones: preciosEntradas.piñaCalada,    descripcion: "Copa de 1.5 Onzas de piña calada." },
    ],
    "Pastas": [
        { nombre: "Pasta Carbonara",          opciones: preciosPastas.carbonara,        descripcion: "Spaghetti en cremosa salsa carbonara con tocineta" },
        { nombre: "Pasta Alfredo",            opciones: preciosPastas.alfredo,           descripcion: "Spaghetti en salsa Alfredo con pollo y queso parmesano." },
        { nombre: "Pasta Pesto Camaron",      opciones: preciosPastas.pestoCamaron,      descripcion: "Spaghetti en salsa pesto con camarones, tomates cherry y queso parmesano." },
        { nombre: "Pasta Matriziana",         opciones: preciosPastas.matriziana,        descripcion: "Spaghetti en salsa napolitana con tocineta, tomate en julianas, pimienta roja y queso parmesano." },
        { nombre: "Pasta Marinera",           opciones: preciosPastas.marinera,          descripcion: "Spaghetti con pulpo, anillos de calamar y camarones, preparada en salsa Aurora o salsa blanca con queso parmesano." },
        { nombre: "Pasta Spaguetti Sencillo", opciones: preciosPastas.spaguettiSencillo, descripcion: "Elige 1 proteína (Carne, Pollo o champiñones) con salsa napolitana y queso gratinado." },
        { nombre: "Pasta Spaguetti Mixto",    opciones: preciosPastas.spaguettiMixto,    descripcion: "Elige 2 proteínas (pollo, carne y/o champiñones), con salsa napolitana y queso gratinado." },
        { nombre: "Pasta Spaguetti Remix",    opciones: preciosPastas.spaguettiRemix,    descripcion: "Pollo, carne y champiñones con salsa napolitana y queso gratinado" },
        { nombre: "Macaroni Sencillo",        opciones: preciosPastas.macaroniSencillo,  descripcion: "Elige 1 proteína (Carne, Pollo o champiñones) con salsa napolitana y queso gratinado." },
        { nombre: "Macaroni Mixto",           opciones: preciosPastas.macaroniMixto,     descripcion: "Elige 2 proteínas (pollo, carne y/o champiñones), con salsa napolitana y queso gratinado." },
        { nombre: "Macaroni Remix",           opciones: preciosPastas.macaroniRemix,     descripcion: "Pollo, carne y champiñones con salsa napolitana y queso gratinado" },
        { nombre: "Fetuccine Sencillo",       opciones: preciosPastas.fetuccineSencillo, descripcion: "Elige 1 proteína (Carne, Pollo o champiñones) con salsa napolitana y queso gratinado." },
        { nombre: "Fetuccine Mixto",          opciones: preciosPastas.fetuccineMixto,    descripcion: "Elige 2 proteínas (pollo, carne y/o champiñones), con salsa napolitana y queso gratinado." },
        { nombre: "Fetuccine Remix",          opciones: preciosPastas.fetuccineRemix,    descripcion: "Pollo, carne y champiñones con salsa napolitana y queso gratinado" },
    ],
    "Lasañas": [
        { nombre: "Lasaña Sencilla",     opciones: preciosLasañas.lasañaSencilla,    descripcion: "1 proteína con salsa napolitana y queso gratinado." },
        { nombre: "Lasaña Mixta",        opciones: preciosLasañas.lasañaMixta,       descripcion: "2 proteínas con salsa napolitana y queso gratinado." },
        { nombre: "Lasaña Remix",        opciones: preciosLasañas.lasañaRemix,       descripcion: "3 proteínas con salsa napolitana y queso gratinado." },
        { nombre: "Lasaña Vegetariana",  opciones: preciosLasañas.lasañaVegetariana, descripcion: "Cebolla, tomate, pimentón asado, aceitunas, champiñones y salsa napolitana." },
        { nombre: "Lasaña Drive",        opciones: preciosLasañas.lasañaDrive,       descripcion: "Pollo, maíz, tocineta y salsa de la casa." },
    ],
    "Pizzas Super Estofadas": [
        { nombre: "Pizza Super Estofada de Carnes", opciones: preciosPizzas.superEstofada, esEstofada: true, descripcion: "Doble porción de queso mozarella, queso crema, jamón, cabano, salami y pollo." },
        { nombre: "Pizza Super Estofada Hawaiana",  opciones: preciosPizzas.superEstofada, esEstofada: true, descripcion: "Doble porción de queso mozarella, queso crema, jamón y piña." },
    ],
    "Pizzas Estofadas": [
        { nombre: "Pizza Estofada de Carnes",    opciones: preciosPizzas.estofada, esEstofada: true, descripcion: "Queso mozzarella, jamón, cabano, salami, pollo y champiñones." },
        { nombre: "Pizza Estofada Hawaiana",     opciones: preciosPizzas.estofada, esEstofada: true, descripcion: "Queso mozzarella, jamón y piña." },
        { nombre: "Pizza Estofada Suprema",      opciones: preciosPizzas.estofada, esEstofada: true, descripcion: "Queso Mozzarella, jamón, cabano, salami, pimentón, cebolla y orégano." },
        { nombre: "Pizza Estofada Triple Queso", opciones: preciosPizzas.estofada, esEstofada: true, descripcion: "Triple porción de queso mozarella." },
    ],
    "Pizzas Especiales": [
        { nombre: "Pizza Drive",              opciones: preciosPizzas.especial,          descripcion: "Queso mozzarella, pollo, champiñones, maíz tierno, maduro." },
        { nombre: "Pizza Criolla",            opciones: preciosPizzas.especial,          descripcion: "Queso mozzarella, carne desmechada, maiz tierno y tocineta." },
        { nombre: "Pizza Mexicana",           opciones: preciosPizzas.especial,          descripcion: "Queso mozzarella, jamón, pico de gallo, carne boloñesa, jalapeño, tostacos." },
        { nombre: "Pizza Hawaiana Chic",      opciones: preciosPizzas.especial,          descripcion: "Queso mozarella, piña, tocineta, jamón y salsa BBQ." },
        { nombre: "Pizza Suprema Pepperoni",  opciones: preciosPizzas.especial,          descripcion: "Queso mozzarella, cabano, pepperoni, pimentón, cebolla, orégano." },
        { nombre: "Pizza Especial de Carnes", opciones: preciosPizzas.especial,          descripcion: "Queso mozzarella, jamón, cabano, salami, pollo, hampiñones." },
        { nombre: "Pizza Carnivora",          opciones: preciosPizzas.especial,          descripcion: "Queso mozzarella, jamón, cabano, salami, chorizo, tocineta." },
        { nombre: "Pizza Teriyaki",           opciones: preciosPizzas.especial,          descripcion: "Queso mozzarella, carne boloñesa, vegetales salteados en salsa teriyaki." },
        { nombre: "Pizza Paisa",              opciones: preciosPizzas.especial,          descripcion: "Queso mozzarella, jamón, maiz tierno, chorizo y tocineta." },
        { nombre: "Pizza Bolognesa",          opciones: preciosPizzas.especial,          descripcion: "Queso mozzarella carne boloñesa, tocineta, salsa napolitana." },
        { nombre: "Pizza Camarón a la Criolla", opciones: preciosPizzas.especial,        descripcion: "Queso mozzarella, cebolla, perejil, camarón." },
        { nombre: "Pizza Carbonara",          opciones: preciosPizzas.especialSinPorcion, descripcion: "Queso mozzarella, tocineta, pollo, champiñones, rúgula, parmesano, salsa carbonara." },
        { nombre: "Pizza La Majestuosa",      opciones: preciosPizzas.majestuosaPequeña, descripcion: "Queso mozzarella, stroganoff lomo de res, champiñones salteados, tomates cherry, queso brie, balsámico al brandy, cebolla crocante, albahaca." },
        { nombre: "Pizza Topetunas",          opciones: preciosPizzas.especial,          descripcion: "Queso mozzarella, tomate, pepperoni y aceitunas." },
    ],
    "Pizzas Clásicas": [
        { nombre: "Pizza Pollo",        opciones: preciosPizzas.clasica, descripcion: "Queso mozzarella y pollo." },
        { nombre: "Pizza Hawaiana",     opciones: preciosPizzas.clasica, descripcion: "Queso mozzarella, jamón y piña." },
        { nombre: "Pizza Tres Carnes",  opciones: preciosPizzas.clasica, descripcion: "Queso mozzarella, jamón, cabano y salami." },
        { nombre: "Pizza Jamón",        opciones: preciosPizzas.clasica, descripcion: "Queso mozzarella y jamón." },
        { nombre: "Pizza Margarita",    opciones: preciosPizzas.clasica, descripcion: "Queso mozzarella y orégano." },
        { nombre: "Pizza Napolitana",   opciones: preciosPizzas.clasica, descripcion: "Queso mozzarella, tomate y orégano." },
        { nombre: "Pizza Doble Queso",  opciones: preciosPizzas.clasica, descripcion: "Doble porción de queso mozzarella." },
        { nombre: "Pizza Champiñones",  opciones: preciosPizzas.clasica, descripcion: "Queso mozzarella y champiñones." },
        { nombre: "Pizza Bocadillo",    opciones: preciosPizzas.clasica, descripcion: "Queso mozzarella y bocadillo." },
    ],
    "Pizzas Típicas": [
        { nombre: "Pizza Pollo Champiñones",   opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, pollo, champiñones." },
        { nombre: "Pizza Pepperoni",           opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, pepperoni." },
        { nombre: "Pizza Maduro Tocineta",     opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, maduro, tocineta." },
        { nombre: "Pizza Toc",                 opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, tocineta, maíz tierno, queso cheddar." },
        { nombre: "Pizza Suprema",             opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, jamón, cabano, salami, pimentón, cebolla, orégano." },
        { nombre: "Pizza Suprema de Pollo",    opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, pollo, pimentón, cebolla, orégano." },
        { nombre: "Pizza Pollo Bbq",           opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, pollo aderezado con salsa BBQ." },
        { nombre: "Pizza Pollo Miel-Mostaza",  opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, pollo, salsa miel mostaza." },
        { nombre: "Pizza Vegetariana",         opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, pimentón, tomate, cebolla, champiñones, orégano." },
        { nombre: "Pizza Ciruelas y Tocineta", opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, ciruelas pasas, tocineta." },
        { nombre: "Pizza Bocadillo Tocineta",  opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, bocadillo, tocineta." },
    ],
    "Pizzetas Premium": [
        { nombre: "Pizzeta Carbonara",     opciones: preciosPizzas.premium,          descripcion: "Queso mozzarella, tocineta, pollo, champiñones, rúgula, parmesano, salsa carbonara." },
        { nombre: "Pizzeta Milan",         opciones: preciosPizzas.premium,          descripcion: "Queso mozzarella, tocineta, BBQ sailor, queso filadelfia." },
        { nombre: "Pizzeta Iberica",       opciones: preciosPizzas.premium,          descripcion: "Queso mozzarella, pepperoni, chorizo español, jamón serrano, salami, queso parmesano." },
        { nombre: "Pizzeta California",    opciones: preciosPizzas.premium,          descripcion: "Queso mozzarella, tomate cherry, champiñones, cebolla caramelizada, tocineta, queso parmesano." },
        { nombre: "Pizzeta Cuatro Quesos", opciones: preciosPizzas.premium,          descripcion: "Queso mozzarella, queso azul, queso filadelfia, queso parmesano, tomates secos, ralladura de limón." },
        { nombre: "Pizzeta del Huerto",    opciones: preciosPizzas.premium,          descripcion: "Queso mozzarella, champiñones, jamón, tomate cherry, aderezo césar, rúgula." },
        { nombre: "Pizzeta Florencia",     opciones: preciosPizzas.premium,          descripcion: "Pesto, queso mozzarella, balsámico, jamón serrano, rúgula, queso filadelfia." },
        { nombre: "Pizzeta Livorno",       opciones: preciosPizzas.premium,          descripcion: "Pesto, queso mozzarella, camarones, tomate cherry, queso parmesano." },
        { nombre: "Pizzeta Venecia",       opciones: preciosPizzas.premium,          descripcion: "Pesto, queso mozzarella, tomates confitados, queso filadelfia." },
        { nombre: "Pizzeta Salami",        opciones: preciosPizzas.premium,          descripcion: "Pesto, queso mozzarella, salami madurado, queso filadelfia." },
        { nombre: "Pizzeta Genova",        opciones: preciosPizzas.premium,          descripcion: "Pesto, queso mozzarella, queso de búfala, tomate cherry, albahaca, queso parmesano." },
        { nombre: "Pizzeta la Majestuosa", opciones: preciosPizzas.majestuosaPizzeta, descripcion: "Queso mozzarella, stroganoff lomo de res, champiñones, tomates cherry, queso brie, balsámico al brandy, cebolla crocante, albahaca." },
    ],
    "Adiciones": [
        { nombre: "Adición Tomate",         opciones: preciosAdiciones.basicas },
        { nombre: "Adición Cebolla",        opciones: preciosAdiciones.basicas },
        { nombre: "Adición Pimentón",       opciones: preciosAdiciones.basicas },
        { nombre: "Adición Maduro",         opciones: preciosAdiciones.basicas },
        { nombre: "Adición Jalapeños",      opciones: preciosAdiciones.basicas },
        { nombre: "Adición Jamón",          opciones: preciosAdiciones.intermedia },
        { nombre: "Adición Ranchera",       opciones: preciosAdiciones.intermedia },
        { nombre: "Adición Maiz",           opciones: preciosAdiciones.intermedia },
        { nombre: "Adición Piña",           opciones: preciosAdiciones.intermedia },
        { nombre: "Adición Champiñon",      opciones: preciosAdiciones.intermedia },
        { nombre: "Adición Salami",         opciones: preciosAdiciones.intermedia },
        { nombre: "Adición Tocineta",       opciones: preciosAdiciones.superior },
        { nombre: "Adición Queso",          opciones: preciosAdiciones.superior },
        { nombre: "Adición Pollo",          opciones: preciosAdiciones.superior },
        { nombre: "Adición Pepperoni",      opciones: preciosAdiciones.superior },
        { nombre: "Adición Carne",          opciones: preciosAdiciones.superior },
        { nombre: "Adición Chorizo",        opciones: preciosAdiciones.superior },
        { nombre: "Adición Camarón",        opciones: preciosAdiciones.gourmet },
        { nombre: "Adición Salsas (1 cup)", opciones: preciosAdiciones.salsas },
        { nombre: "Adición Filete de Pollo", opciones: preciosAdiciones.hamburguesa },
        { nombre: "Adición Carne de Res",   opciones: preciosAdiciones.hamburguesa },
    ],
    "Bordes": [
        { nombre: "Borde solo queso",      opciones: preciosBordes },
        { nombre: "Borde solo arequipe",   opciones: preciosBordes },
        { nombre: "Borde solo bocadillo",  opciones: preciosBordes },
        { nombre: "Borde arequipe/Queso",  opciones: preciosBordes },
        { nombre: "Borde bocadillo/Queso", opciones: preciosBordes },
    ],
    "Calzones": [
        { nombre: "Calzone Clásico (Panzerotti)",  sabores: 'clasicos', opciones: preciosCalzones.calzoneClasico,  descripcion: "Especialidad preparada con masa de pizza doblada y horneada, rellena de queso mozzarella e ingredientes clásicos seleccionados." },
        { nombre: "Calzone Especial (Panzerotti)", sabores: 'tipicosEspeciales', opciones: preciosCalzones.calzoneEspecial, descripcion: "Especialidad preparada con masa de pizza doblada y horneada, rellena de queso mozzarella e ingredientes típicos y especiales seleccionados." },
    ],
    "Stromboli": [
        { nombre: "Stromboli Clásico",  sabores: 'clasicos', opciones: preciosStromboli.stromboliClasico,  descripcion: "Especialidad preparada con masa de pizza enrollada y horneada, rellena de queso mozzarella e ingredientes clásicos seleccionados." },
        { nombre: "Stromboli Especial", sabores: 'tipicosEspeciales', opciones: preciosStromboli.stromboliEspecial, descripcion: "Especialidad preparada con masa de pizza enrollada y horneada, rellena de queso mozzarella e ingredientes típicos y especiales seleccionados." },
    ],
    "Maicitos": [
        { nombre: "Maicitos Gratinados", opciones: preciosMaicitos.maicitosGratinados, descripcion: "Queso mozzarella, queso cheddar, maíz, tocineta y queso parmesano." },
    ],
    "Hamburguesas": [
        { nombre: "Hamburguesa Clasica",     opciones: preciosHamburguesas.hamburguesaClasica,    descripcion: "Carne de res, queso mozarella, tocineta, melao de piña, vegetales, salsa de la casa." },
        { nombre: "Hamburguesa Pollo",       opciones: preciosHamburguesas.hamburguesaPollo,      descripcion: "Filete de pollo, queso mozarella, tocineta, melao de piña, vegetales, salsa de la casa." },
        { nombre: "Hamburguesa Mixta",       opciones: preciosHamburguesas.hamburguesaMixta,      descripcion: "Carne de res y filete de pollo, queso mozarella, tocineta, melao de piña, vegetales, salsa de la casa." },
        { nombre: "Hamburguesa Doble Carne", opciones: preciosHamburguesas.hamburguesaDobleCarne, descripcion: "Doble carne de res, queso mozarella, tocineta, melao de piña, vegetales, salsa de la casa." },
        { nombre: "Hamburguesa Estofada",    opciones: preciosHamburguesas.hamburguesaEstofada,   descripcion: "Pan con masa de pizza, carne o pollo, doble porción de queso mozarella, jamón, vegetales, salsa de la casa." },
    ],
    "Sandwiches": [
        { nombre: "Sandwiche Jamon", opciones: preciosSandwiches.sandwicheJamon, descripcion: "Pan italiano, jamón, queso fundido, tocineta, lechuga, tomate, cebolla y salsas." },
        { nombre: "Sandwiche Pollo", opciones: preciosSandwiches.sandwichePollo, descripcion: "Pan italiano, pollo, queso fundido, tocineta, lechuga, tomate, cebolla y salsas." },
        { nombre: "Sandwiche Atun",  opciones: preciosSandwiches.sandwicheAtun,  descripcion: "Pan italiano, atún, queso fundido, tocineta, lechuga, tomate, cebolla y salsas." },
    ],
    "Ensaladas": [
        { nombre: "Ensalada Drive",      opciones: preciosEnsaladas.ensaladaDrive,     descripcion: "Lechuga, jamón, pollo, queso mozarella, maíz, piña, tomate y salsa de la casa." },
        { nombre: "Ensalada Mi Cuate",   opciones: preciosEnsaladas.ensaladaMiCuate,   descripcion: "3 tipos de lechuga, pollo, aguacate, pico de gallo, tocineta, queso, maíz, nachos, salsa miel-mostaza y picante." },
        { nombre: "Ensalada Premium",    opciones: preciosEnsaladas.ensaladaPremium,   descripcion: "3 tipos de lechuga, pollo, queso, tomate, ajonjolí, tocineta en salsa miel-mostaza." },
        { nombre: "Ensalada Cesar",      opciones: preciosEnsaladas.ensaladaCesar,     descripcion: "3 tipos de lechuga, pollo, crutones, queso parmesano y mozarella con salsa cesar." },
        { nombre: "Ensalada Balsámica",  opciones: preciosEnsaladas.ensaladaBalsámica, descripcion: "3 tipos de lechuga, pollo, queso, tomate, maíz, mozarella, crutones, vinagre balsámico y pimienta." },
    ],
    "Refrescos": [
        { nombre: "Jugo Hit 500 ml",  opciones: preciosBebidas.jugoHit500ml,  descripcion: "Jugo hit 500 ml." },
        { nombre: "Gaseosa 400 ml",   opciones: preciosBebidas.gaseosa400ml,  descripcion: "Sabores postobón." },
        { nombre: "Gaseosa 1.5 lts",  opciones: preciosBebidas.gaseosa1500ml, descripcion: "Sabores postobón." },
        { nombre: "Agua",             opciones: preciosBebidas.agua },
        { nombre: "Bretaña",          opciones: preciosBebidas.bretaña },
    ],
    "Jugos Naturales": [
        { nombre: "Jugo en Agua",        opciones: preciosBebidas.jugoEnAgua },
        { nombre: "Jugo en Leche",       opciones: preciosBebidas.jugoEnLeche },
        { nombre: "Granizada",           opciones: preciosBebidas.granizada },
        { nombre: "Granizada Especial",  opciones: preciosBebidas.granizadaEspecial },
    ],
    "Limonadas": [
        { nombre: "Limonada Natural",      opciones: { "Unidad": 8000 } },
        { nombre: "Limonada Hierbabuena",  opciones: { "Unidad": 9000 } },
        { nombre: "Limonada Cerezada",     opciones: { "Unidad": 10000 } },
        { nombre: "Limonada Frutos Rojos", opciones: { "Unidad": 11000 } },
        { nombre: "Limonada de Coco",      opciones: { "Unidad": 11000 } },
    ],
    "Sodas": [
        { nombre: "Soda Frutos Rojos",     opciones: { "Unidad": 12000 }, descripcion: "Mezcla artesanal de mora, uva, fresa y arándanos, con el toque burbujeante de soda Bretaña." },
        { nombre: "Soda Frutos Amarillos", opciones: { "Unidad": 12000 }, descripcion: "Mezcla artesanal de maracuyá, piña y mango, con el toque burbujeante de soda Bretaña." },
        { nombre: "Soda Lychee",           opciones: { "Unidad": 12000 }, descripcion: "Delicada bebida artesanal de lychee con el toque burbujeante de soda Bretaña." },
        { nombre: "Soda Tamarindo",        opciones: { "Unidad": 12000 }, descripcion: "Tradicional bebida artesanal de tamarindo con el toque burbujeante de soda Bretaña." },
    ],
    "Cervezas": [
        { nombre: "Cerveza Club Colombia", opciones: { "Unidad": 8000 } },
        { nombre: "Cerveza Heineken",      opciones: { "Unidad": 8000 } },
        { nombre: "Cerveza Sol",           opciones: { "Unidad": 8000 } },
        { nombre: "Cerveza 3 Cordilleras", opciones: preciosBebidas.cerveza3Cordilleras },
        { nombre: "Vaso Michelado",        opciones: preciosBebidas.vasoMichelado },
    ],
    "Otros": [
        { nombre: "Mr Tea",     opciones: preciosBebidas.MrTea },
        { nombre: "H2OH",       opciones: preciosBebidas.H2OH },
        { nombre: "Hatsu Soda", opciones: preciosBebidas.HatsuSoda },
        { nombre: "Hatsu",      opciones: preciosBebidas.Hatsu },
    ],
};

export const SABORES_CLASICOS = menuData['Pizzas Clásicas'].map(p => ({
  nombre:      p.nombre.replace('Pizza ', ''),
  descripcion: p.descripcion || '',
}));

export const SABORES_TIPICOS_ESPECIALES = [
  ...menuData['Pizzas Típicas'],
  ...menuData['Pizzas Especiales'],
].map(p => ({
  nombre:      p.nombre.replace('Pizza ', ''),
  descripcion: p.descripcion || '',
}));

export const PRODUCT_IMAGES = {
  'Pizza Bocadillo':                  '../Imagenes/productos/Bocadillo.jpg',
  'Pizza Bocadillo Tocineta':         '../Imagenes/productos/BocadilloTocineta.jpg',
  'Pizza Carbonara':                  '../Imagenes/productos/Carbonara.jpg',
  'Pizza Carnivora':                  '../Imagenes/productos/Carnivora.jpg',
  'Pizza Champiñones':                '../Imagenes/productos/Champiñones.jpg',
  'Pizza Ciruelas y Tocineta':        '../Imagenes/productos/CiruelaTocineta.jpg',
  'Pizza Criolla':                    '../Imagenes/productos/Criolla.jpg',
  'Pizza Doble Queso':                '../Imagenes/productos/DobleQueso.jpg',
  'Pizza Drive':                      '../Imagenes/productos/Drive.jpg',
  'Pizza Especial de Carnes':         '../Imagenes/productos/EspecialCarnes.jpg',
  'Pizza Estofada de Carnes':         '../Imagenes/productos/EstofadaCarnes.jpg',
  'Pizza Estofada Hawaiana':          '../Imagenes/productos/EstofadaHawaiana.jpg',
  'Pizza Estofada Suprema':           '../Imagenes/productos/EstofadaSuprema.jpg',
  'Pizza Estofada Triple Queso':      '../Imagenes/productos/EstofadaTripleQueso.jpg',
  'Pizza Hawaiana':                   '../Imagenes/productos/Hawaiana.jpg',
  'Pizza Hawaiana Chic':              '../Imagenes/productos/HawaianaChic.jpg',
  'Pizza Jamón':                      '../Imagenes/productos/Jamón.jpg',
  'Pizza La Majestuosa':              '../Imagenes/productos/Majestuosa.jpeg',
  'Pizza Maduro Tocineta':            '../Imagenes/productos/MaduroTocineta.jpg',
  'Pizza Margarita':                  '../Imagenes/productos/Margarita.jpg',
  'Pizza Mexicana':                   '../Imagenes/productos/Mexicana.jpg',
  'Pizza Napolitana':                 '../Imagenes/productos/Napolitana.jpg',
  'Pizza Paisa':                      '../Imagenes/productos/Paisa.jpg',
  'Pizza Pepperoni':                  '../Imagenes/productos/Pepperoni.jpg',
  'Pizza Pollo':                      '../Imagenes/productos/Pollo.jpg',
  'Pizza Pollo Bbq':                  '../Imagenes/productos/PolloBbq.jpg',
  'Pizza Pollo Champiñones':          '../Imagenes/productos/PolloChampiñones.jpg',
  'Pizza Pollo Miel-Mostaza':         '../Imagenes/productos/PolloMielMostaza.jpg',
  'Pizza Super Estofada de Carnes':   '../Imagenes/productos/SuperEstofadaCarnes.jpg',
  'Pizza Super Estofada Hawaiana':    '../Imagenes/productos/SuperEstofadaHawaiana.jpg',
  'Pizza Suprema':                    '../Imagenes/productos/Suprema.jpg',
  'Pizza Suprema de Pollo':           '../Imagenes/productos/SupremaPollo.jpg',
  'Pizza Suprema Pepperoni':          '../Imagenes/productos/SupremaPepperoni.jpeg',
  'Pizza Teriyaki':                   '../Imagenes/productos/Teriyaki.jpg',
  'Pizza Toc':                        '../Imagenes/productos/Toc.jpg',
  'Pizza Topetunas':                  '../Imagenes/productos/Topetunas.jpg',
  'Pizza Tres Carnes':                '../Imagenes/productos/TresCarnes.jpg',
  'Pizza Vegetariana':                '../Imagenes/productos/Vegetariana.jpg',
  'Pizza Bolognesa':                  '../Imagenes/productos/Bolognesa.jpg',
  'Pizza Camarón a la Criolla':       '../Imagenes/productos/CamarónALaCriolla.jpg',
  'Pizzeta California':               '../Imagenes/productos/PizzetaCalifornia.jpg',
  'Pizzeta Carbonara':                '../Imagenes/productos/PizzetaCarbonara.jpg',
  'Pizzeta Cuatro Quesos':            '../Imagenes/productos/PizzetaCuatroQuesos.jpg',
  'Pizzeta del Huerto':               '../Imagenes/productos/PizzetaDelHuerto.jpg',
  'Pizzeta Florencia':                '../Imagenes/productos/PizzetaFlorencia.jpg',
  'Pizzeta Genova':                   '../Imagenes/productos/PizzetaGenova.jpg',
  'Pizzeta Iberica':                  '../Imagenes/productos/PizzetaIbérica.jpg',
  'Pizzeta la Majestuosa':            '../Imagenes/productos/PizzetaMajestuosa.jpeg',
  'Pizzeta Livorno':                  '../Imagenes/productos/PizzetaLivorno.jpg',
  'Pizzeta Milan':                    '../Imagenes/productos/PizzetaMilan.jpg',
  'Pizzeta Venecia':                  '../Imagenes/productos/PizzetaVenecia.jpg',
  'Lasaña Drive':                     '../Imagenes/productos/LasañaDrive.jpg',
  'Lasaña Mixta':                     '../Imagenes/productos/LasañaSencilla.jpg',
  'Lasaña Remix':                     '../Imagenes/productos/LasañaSencilla.jpg',
  'Lasaña Sencilla':                  '../Imagenes/productos/LasañaSencilla.jpg',
  'Lasaña Vegetariana':               '../Imagenes/productos/LasañaVegetariana.jpg',
  'Fetuccine Mixto':                  '../Imagenes/productos/FetuccineSencillo.jpg',
  'Fetuccine Remix':                  '../Imagenes/productos/FetuccineSencillo.jpg',
  'Fetuccine Sencillo':               '../Imagenes/productos/FetuccineSencillo.jpg',
  'Macaroni Mixto':                   '../Imagenes/productos/Macarron.jpg',
  'Macaroni Remix':                   '../Imagenes/productos/Macarron.jpg',
  'Macaroni Sencillo':                '../Imagenes/productos/Macarron.jpg',
  'Pasta Alfredo':                    '../Imagenes/productos/PastaAlfredo.jpg',
  'Pasta Carbonara':                  '../Imagenes/productos/PastaCarbonara.jpg',
  'Pasta Marinera':                   '../Imagenes/productos/PastaMarinera.jpg',
  'Pasta Matriziana':                 '../Imagenes/productos/PastaMatriziana.jpg',
  'Pasta Pesto Camaron':              '../Imagenes/productos/PastaPestoCamarón.jpg',
  'Pasta Spaguetti Mixto':            '../Imagenes/productos/SpaguettiSencillo.jpg',
  'Pasta Spaguetti Remix':            '../Imagenes/productos/SpaguettiSencillo.jpg',
  'Pasta Spaguetti Sencillo':         '../Imagenes/productos/SpaguettiSencillo.jpg',
  'Sandwiche Atun':                   '../Imagenes/productos/SandiwchAtún.jpg',
  'Sandwiche Jamon':                  '../Imagenes/productos/SandiwchJamón.jpg',
  'Sandwiche Pollo':                  '../Imagenes/productos/SandiwchPollo.jpg',
  'Hamburguesa Clasica':              '../Imagenes/productos/HamburguesaClásica.jpg',
  'Hamburguesa Estofada':             '../Imagenes/productos/HamburguesaEstofadaPollo.jpg',
  'Hamburguesa Pollo':                '../Imagenes/productos/HamburguesaPollo.jpg',
  'Ensalada Balsámica':               '../Imagenes/productos/EnsaladaBalsámica.jpg',
  'Ensalada Cesar':                   '../Imagenes/productos/EnsaladaCesar.jpg',
  'Ensalada Drive':                   '../Imagenes/productos/EnsaladaDrivwe.jpg',
  'Ensalada Mi Cuate':                '../Imagenes/productos/EnsaladaMiCuate.jpg',
  'Ensalada Premium':                 '../Imagenes/productos/EnsaladaPremium.jpg',
  'Calzone Clásico (Panceroti)':      '../Imagenes/productos/CalzoneClasico.jpg',
  'Calzone Especial (Panceroti)':     '../Imagenes/productos/CalzoneEspecial.jpg',
  'Stromboli Clásico':                '../Imagenes/productos/StromboliClasico.jpg',
  'Stromboli Especial':               '../Imagenes/productos/StromboliEspecial.jpg',
  'Maicitos Gratinados':              '../Imagenes/productos/MaicitosGratinados.jpg',
  'Agua':                             '../Imagenes/productos/Agua.jpg',
  'Cerveza 3 Cordilleras':            '../Imagenes/productos/Cerveza3Cordilleras.jpeg',
  'Cerveza Club Colombia':            '../Imagenes/productos/Cerveza.jpg',
  'Cerveza Heineken':                 '../Imagenes/productos/CervezaHeineken.jpeg',
  'Cerveza Sol':                      '../Imagenes/productos/CervezaSol.jpeg',
  'Gaseosa 1.5 lts':                  '../Imagenes/productos/Gaseosa1.5Lts.jpg',
  'Gaseosa 400 ml':                   '../Imagenes/productos/Gaseosa400ml.jpg',
  'H2OH':                             '../Imagenes/productos/H2OH.jpeg',
  'Hatsu':                            '../Imagenes/productos/Hatsu.jpg',
  'Hatsu Soda':                       '../Imagenes/productos/Hatsu.jpg',
  'Jugo en Agua':                     '../Imagenes/productos/JugosNaturalesAgua.jpg',
  'Jugo en Leche':                    '../Imagenes/productos/JugosNaturalesLeche.jpg',
  'Jugo Hit 500 ml':                  '../Imagenes/productos/JugosHit500ml.jpg',
  'Limonada Natural':                 '../Imagenes/productos/LimonadaNatural.jpg',
  'Limonada Hierbabuena':             '../Imagenes/productos/LimonadaHierbabuena.jpg',
  'Limonada Cerezada':                '../Imagenes/productos/LimonadaCerezada.jpg',
  'Limonada Frutos Rojos':            '../Imagenes/productos/LimonadaFrutosRojos.jpg',
  'Limonada de Coco':                 '../Imagenes/productos/LimonadaCoco.jpg',
  'Mr Tea':                           '../Imagenes/productos/MrTea.jpg',
  'Soda Frutos Rojos':                '../Imagenes/productos/SodasArtesanales.jpg',
  'Soda Frutos Amarillos':            '../Imagenes/productos/SodasArtesanales.jpg',
  'Soda Lychee':                      '../Imagenes/productos/SodasArtesanales.jpg',
  'Soda Tamarindo':                   '../Imagenes/productos/SodasArtesanales.jpg',
};
