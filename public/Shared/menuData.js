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
    spaguettiMixto:     { "pollo/champiñon": 28000, "pollo/carne": 28000, "carne/champiñones": 28000 },
    spaguettiRemix:     { "Unidad": 28000 },
    macaroniSencillo:   { "pollo": 28000, "carne": 28000, "champiñones": 28000 },
    macaroniMixto:      { "pollo/champiñon": 28000, "pollo/carne": 28000, "carne/champiñones": 28000 },
    macaroniRemix:      { "Unidad": 28000 },
    fetuccine:          { "Unidad": 28000 },
    fetuccineSencillo:  { "pollo": 28000, "carne": 28000, "champiñones": 28000 },
    fetuccineMixto:     { "pollo/champiñon": 28000, "pollo/carne": 28000, "carne/champiñones": 28000 },
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
    calzoneClasico:  { "pequeño": 29000, "Grande": 45000 },
    calzoneEspecial: { "pequeño": 32000, "Grande": 49000 },
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
    jugoHit500ml:        { "Unidad": 4500 },
    gaseosa400ml:        { "Unidad": 3000 },
    gaseosa1500ml:       { "Unidad": 7000 },
    agua:                { "Unidad": 2500 },
    bretaña:             { "Unidad": 4000 },
    jugoEnAgua:          { "Unidad": 8000 },
    jugoEnLeche:         { "Unidad": 9000 },
    granizada:           { "Unidad": 8000 },
    granizadaEspecial:   { "Unidad": 10000 },
    limonada:            { "Unidad": 8000 },
    sodas:               { "Unidad": 8000 },
    cervezaNacional:     { "Unidad": 5000 },
    cerveza3Cordilleras: { "Unidad": 9000 },
    vasoMichelado:       { "Unidad": 6000 },
    MrTea:               { "Unidad": 4500 },
    H2OH:                { "Unidad": 4500 },
    HatsuSoda:           { "Unidad": 5000 },
    Hatsu:               { "Unidad": 5500 },
    bretaña300ml:        { "Unidad": 5000 },
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
        { nombre: "Pasta Carbonara",          opciones: preciosPastas.carbonara,        descripcion: "Spaguetti en salsa carbonara con tocineta." },
        { nombre: "Pasta Alfredo",            opciones: preciosPastas.alfredo,           descripcion: "Salsa alfredo y pollo." },
        { nombre: "Pasta Pesto Camaron",      opciones: preciosPastas.pestoCamaron,      descripcion: "Salsa pesto, camarones, tomates cherry y queso parmesano." },
        { nombre: "Pasta Matriziana",         opciones: preciosPastas.matriziana,        descripcion: "Salsa napolitana, tocineta, tomate en julianas, pimienta roja y queso parmesano." },
        { nombre: "Pasta Marinera",           opciones: preciosPastas.marinera,          descripcion: "Pulpo, anillos de calamar y camarones en salsa aurora o salsa blanca y queso parmesano." },
        { nombre: "Pasta Spaguetti Sencillo", opciones: preciosPastas.spaguettiSencillo, descripcion: "1 proteína (Carne, Pollo o champiñones) con salsa napolitana y queso gratinado." },
        { nombre: "Pasta Spaguetti Mixto",    opciones: preciosPastas.spaguettiMixto,    descripcion: "2 proteínas con salsa napolitana y queso gratinado." },
        { nombre: "Pasta Spaguetti Remix",    opciones: preciosPastas.spaguettiRemix,    descripcion: "3 proteínas con salsa napolitana y queso gratinado." },
        { nombre: "Macaroni Sencillo",        opciones: preciosPastas.macaroniSencillo,  descripcion: "1 proteína con salsa napolitana y queso gratinado." },
        { nombre: "Macaroni Mixto",           opciones: preciosPastas.macaroniMixto,     descripcion: "2 proteínas con salsa napolitana y queso gratinado." },
        { nombre: "Macaroni Remix",           opciones: preciosPastas.macaroniRemix,     descripcion: "3 proteínas con salsa napolitana y queso gratinado." },
        { nombre: "Fetuccine Sencillo",       opciones: preciosPastas.fetuccineSencillo, descripcion: "1 proteína con salsa napolitana y queso gratinado." },
        { nombre: "Fetuccine Mixto",          opciones: preciosPastas.fetuccineMixto,    descripcion: "2 proteínas con salsa napolitana y queso gratinado." },
        { nombre: "Fetuccine Remix",          opciones: preciosPastas.fetuccineRemix,    descripcion: "3 proteínas con salsa napolitana y queso gratinado." },
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
        { nombre: "Pizza Estofada de Carnes",    opciones: preciosPizzas.estofada, esEstofada: true, descripcion: "Jamón, salchicha, salami, pollo, champiñón, queso y salsa napolitana." },
        { nombre: "Pizza Estofada Hawaiana",     opciones: preciosPizzas.estofada, esEstofada: true, descripcion: "Jamón, piña, queso y salsa napolitana." },
        { nombre: "Pizza Estofada Suprema",      opciones: preciosPizzas.estofada, esEstofada: true, descripcion: "Jamón, salchicha, salami, cebolla, pimentón asado, queso y salsa napolitana." },
        { nombre: "Pizza Estofada Triple Queso", opciones: preciosPizzas.estofada, esEstofada: true, descripcion: "Triple porción de queso mozarella." },
    ],
    "Pizzas Especiales": [
        { nombre: "Pizza Drive",              opciones: preciosPizzas.especial,          descripcion: "Queso mozzarella, pollo, champiñones, maíz tierno y maduro." },
        { nombre: "Pizza Criolla",            opciones: preciosPizzas.especial,          descripcion: "Carne deshilachada, tocineta y maíz tierno." },
        { nombre: "Pizza Mexicana",           opciones: preciosPizzas.especial,          descripcion: "Carne a la bolognesa, jamón, tomate, cilantro, jalapeño y tostacos." },
        { nombre: "Pizza Hawaiana Chic",      opciones: preciosPizzas.especial,          descripcion: "Queso mozarella, piña, tocineta, jamón y salsa BBQ." },
        { nombre: "Pizza Suprema Pepperoni",  opciones: preciosPizzas.especial,          descripcion: "Queso mozzarella, jamón, ranchera, pepperoni, pimentón, cebolla y orégano." },
        { nombre: "Pizza Especial de Carnes", opciones: preciosPizzas.especial,          descripcion: "Queso mozzarella, jamón, cabano, salami, pollo y champiñones." },
        { nombre: "Pizza Carnivora",          opciones: preciosPizzas.especial,          descripcion: "Jamón, salchicha, salami, chorizo de ternera y tocineta." },
        { nombre: "Pizza Teriyaki",           opciones: preciosPizzas.especial,          descripcion: "Carne a la bolognesa o pollo, vegetales al wok en salsa teriyaki." },
        { nombre: "Pizza Paisa",              opciones: preciosPizzas.especial,          descripcion: "Tocineta, chorizo de ternera, jamón y maíz tierno." },
        { nombre: "Pizza Bolognesa",          opciones: preciosPizzas.especial,          descripcion: "Carne a la bolognesa y tocineta." },
        { nombre: "Pizza Camarón a la Criolla", opciones: preciosPizzas.especial,        descripcion: "Queso mozzarella, cebolla, perejil y camarón." },
        { nombre: "Pizza Carbonara",          opciones: preciosPizzas.especialSinPorcion, descripcion: "Queso mozzarella, tocineta, pollo, champiñones, rúgula, parmesano y salsa carbonara." },
        { nombre: "Pizza La Majestuosa",      opciones: preciosPizzas.majestuosaPequeña, descripcion: "Stroganoff lomo de res, champiñones, tomates cherry, queso brie, balsámico al brandy, cebolla crocante y albahaca." },
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
        { nombre: "Pizza Pollo Champiñones",   opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, pollo y champiñones." },
        { nombre: "Pizza Pepperoni",           opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella y pepperoni." },
        { nombre: "Pizza Maduro Tocineta",     opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, maduro y tocineta." },
        { nombre: "Pizza Toc",                 opciones: preciosPizzas.tipica, descripcion: "Maíz tierno, queso cheddar y tocineta." },
        { nombre: "Pizza Suprema",             opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, jamón, cabano, salami, pimentón, cebolla y orégano." },
        { nombre: "Pizza Suprema de Pollo",    opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, pollo, pimentón, cebolla y orégano." },
        { nombre: "Pizza Pollo Bbq",           opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, pollo aderezado con salsa BBQ." },
        { nombre: "Pizza Pollo Miel-Mostaza",  opciones: preciosPizzas.tipica, descripcion: "Pollo y salsa miel mostaza." },
        { nombre: "Pizza Vegetariana",         opciones: preciosPizzas.tipica, descripcion: "Cebolla, tomate, pimentón asado, aceitunas, champiñones y orégano." },
        { nombre: "Pizza Ciruelas y Tocineta", opciones: preciosPizzas.tipica, descripcion: "Ciruelas pasas y tocineta." },
        { nombre: "Pizza Bocadillo Tocineta",  opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, tocineta y bocadillo." },
    ],
    "Pizzetas Premium": [
        { nombre: "Pizzeta Carbonara",     opciones: preciosPizzas.premium,          descripcion: "Queso mozzarella, tocineta, pollo, champiñones, rúgula, parmesano y salsa carbonara." },
        { nombre: "Pizzeta Milan",         opciones: preciosPizzas.premium,          descripcion: "Queso mozzarella, tocineta, BBQ sailor y queso filadelfia." },
        { nombre: "Pizzeta Iberica",       opciones: preciosPizzas.premium,          descripcion: "Queso mozzarella, pepperoni, chorizo español, jamón serrano, salami y queso parmesano." },
        { nombre: "Pizzeta California",    opciones: preciosPizzas.premium,          descripcion: "Queso mozzarella, tomate cherry, champiñones, cebolla caramelizada, tocineta y queso parmesano." },
        { nombre: "Pizzeta Cuatro Quesos", opciones: preciosPizzas.premium,          descripcion: "Queso mozzarella, azul, filadelfia, parmesano, tomates secos y ralladura de limón." },
        { nombre: "Pizzeta del Huerto",    opciones: preciosPizzas.premium,          descripcion: "Queso mozzarella, champiñones, jamón, tomate cherry, aderezo césar y rúgula." },
        { nombre: "Pizzeta Florencia",     opciones: preciosPizzas.premium,          descripcion: "Pesto, mozzarella, balsámico, jamón serrano, rúgula y queso filadelfia." },
        { nombre: "Pizzeta Livorno",       opciones: preciosPizzas.premium,          descripcion: "Pesto, queso mozzarella, camarones, tomate cherry y queso parmesano." },
        { nombre: "Pizzeta Venecia",       opciones: preciosPizzas.premium,          descripcion: "Pesto, queso mozzarella, tomates confitados y queso filadelfia." },
        { nombre: "Pizzeta Salami",        opciones: preciosPizzas.premium,          descripcion: "Pesto, queso mozzarella, salami madurado y queso filadelfia." },
        { nombre: "Pizzeta Genova",        opciones: preciosPizzas.premium,          descripcion: "Pesto, queso mozzarella, queso de búfala, tomate cherry, albahaca y queso parmesano." },
        { nombre: "Pizzeta la Majestuosa", opciones: preciosPizzas.majestuosaPizzeta, descripcion: "Stroganoff lomo de res, champiñones, tomates cherry, queso brie, balsámico al brandy, cebolla crocante y albahaca." },
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
        { nombre: "Calzone Clásico",  opciones: preciosCalzones.calzoneClasico },
        { nombre: "Calzone Especial", opciones: preciosCalzones.calzoneEspecial },
    ],
    "Stromboli": [
        { nombre: "Stromboli Clásico",  opciones: preciosStromboli.stromboliClasico },
        { nombre: "Stromboli Especial", opciones: preciosStromboli.stromboliEspecial },
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
        { nombre: "Limonada", opciones: preciosBebidas.limonada },
    ],
    "Sodas": [
        { nombre: "Sodas", opciones: preciosBebidas.sodas },
    ],
    "Cervezas": [
        { nombre: "Cerveza Nacional",      opciones: preciosBebidas.cervezaNacional },
        { nombre: "Cerveza 3 Cordilleras", opciones: preciosBebidas.cerveza3Cordilleras },
        { nombre: "Vaso Michelado",        opciones: preciosBebidas.vasoMichelado },
    ],
    "Otros": [
        { nombre: "Mr Tea",                  opciones: preciosBebidas.MrTea },
        { nombre: "H2OH",                    opciones: preciosBebidas.H2OH },
        { nombre: "Hatsu Soda",              opciones: preciosBebidas.HatsuSoda },
        { nombre: "Hatsu",                   opciones: preciosBebidas.Hatsu },
        { nombre: "Soda Bretaña 300 ml",     opciones: preciosBebidas.bretaña300ml },
    ],
};
