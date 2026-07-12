/* ============================================================
   Drive Pizza — Catálogo de productos y precios
   Fuente: products.js (CallCenter) — adaptado para PaginaWeb
   ============================================================ */

// ── PRECIOS POR CATEGORÍA DE PIZZA ────────────────────────────
const preciosPizzas = {
  superEstofada:      { "Porción": 16500, "Pequeña": 49000, "Mediana": 60000, "Grande": 85000, "Jumbo": 115000 },
  estofada:           { "Porción": 15500, "Pequeña": 44000, "Mediana": 55000, "Grande": 74000, "Jumbo": 92000 },
  especial:           { "Porción": 16500, "Pequeña": 49000, "Mediana": 60000, "Grande": 85000, "Jumbo": 115000 },
  especialSinPorcion: {                   "Pequeña": 49000, "Mediana": 60000, "Grande": 85000, "Jumbo": 115000 },
  clasica:            { "Porción": 13000, "Pequeña": 32000, "Mediana": 42000, "Grande": 58000, "Jumbo": 75000 },
  tipica:             { "Porción": 15500, "Pequeña": 44000, "Mediana": 55000, "Grande": 74000, "Jumbo": 92000 },
  majestuosaPequena:  {                   "Pequeña": 49000 },
  premium:            { "Pizzeta": 20000 },
  majestuosaPizzeta:  { "Pizzeta": 24000 },
};

const preciosBordes = {
  "Pequeña": 14000, "Mediana": 18000, "Grande": 21000, "Jumbo": 24000
};

// ── PRECIOS PASTAS ─────────────────────────────────────────────
const preciosPastas = {
  carbonara:    { "Unidad": 30000 },
  alfredo:      { "Unidad": 29000 },
  pestoCamaron: { "Unidad": 29000 },
  matriziana:   { "Unidad": 28000 },
  marinera:     { "Unidad": 34000 },
  sencillo:     { "Pollo": 28000, "Carne": 28000, "Champiñones": 28000 },
  mixto:        { "Pollo/Champiñón": 28000, "Pollo/Carne": 28000, "Carne/Champiñones": 28000 },
  remix:        { "Unidad": 28000 },
};

// ── PRECIOS LASAÑAS ────────────────────────────────────────────
const preciosLasanas = {
  sencilla:    { "Pollo": 26000, "Carne": 26000, "Champiñones": 26000 },
  mixta:       { "Pollo/Champiñón": 26000, "Pollo/Carne": 26000, "Carne/Champiñones": 26000 },
  remix:       { "Unidad": 26000 },
  vegetariana: { "Unidad": 26000 },
  drive:       { "Unidad": 30000 },
};

// ── PRECIOS OTROS ──────────────────────────────────────────────
const preciosCalzones = {
  clasico:  { "Pequeño": 29000, "Grande": 45000 },
  especial: { "Pequeño": 32000, "Grande": 49000 },
};
const preciosStromboli = {
  clasico:  { "Unidad": 20000 },
  especial: { "Unidad": 23000 },
};
const preciosHamburguesas = {
  clasica:    { "Unidad": 24000 },
  pollo:      { "Unidad": 24000 },
  mixta:      { "Unidad": 32000 },
  dobleCarne: { "Unidad": 35000 },
  estofada:   { "Res": 28000, "Pollo": 28000, "Mixta": 35000 },
};
const preciosEnsaladas = { todas: { "Unidad": 28000 } };
const preciosSandwiches = {
  jamon: { "Unidad": 20000 },
  pollo: { "Unidad": 23000 },
  atun:  { "Unidad": 25000 },
};
const preciosEntradas = {
  panDeAjo:     { "Unidad": 3500 },
  panDulces:    { "Unidad": 3500 },
  papas:        { "Unidad": 8000 },
  salsaTartara: { "Unidad": 1000 },
  pinaCalada:   { "Unidad": 2000 },
};
const preciosAdiciones = {
  basica:     { "Porción": 3000,  "Pequeña": 8000,  "Mediana": 10000, "Grande": 12000, "Jumbo": 14000 },
  intermedia: { "Porción": 4000,  "Pequeña": 11000, "Mediana": 13000, "Grande": 16000, "Jumbo": 18000 },
  superior:   { "Porción": 5000,  "Pequeña": 13000, "Mediana": 15000, "Grande": 18000, "Jumbo": 20000 },
  gourmet:    { "Porción": 6000,  "Pequeña": 16000, "Mediana": 20000, "Grande": 28000, "Jumbo": 34000 },
  salsas:     { "Salsa Drive": 4000, "Salsa Cuate": 4000, "Salsa Napolitana": 4000, "Salsa de la casa": 4000 },
  proteina:   { "Unidad": 8000 },
};

// ── PRECIOS BEBIDAS ────────────────────────────────────────────
const preciosBebidas = {
  gaseosa400:        { "Pepsi": 6000, "Colombiana": 6000, "Manzana": 6000, "Piña": 6000, "Kola": 6000, "Uva": 6000, "7up": 6000, "Naranja": 6000 },
  gaseosa1500:       { "Pepsi": 9000, "Colombiana": 9000, "Manzana": 9000, "Piña": 9000, "Kola": 9000, "Uva": 9000, "7up": 9000, "Naranja": 9000 },
  jugoHit:           { "Tropical": 6000, "Mora": 6000, "Naranja/Piña": 6000, "Mango": 6000 },
  agua:              { "Sin gas": 6000, "Con gas": 6000 },
  jugoAgua:          { "Mango": 9000, "Fresa": 9000, "Mora": 9000, "Mandarina": 9000, "Naranja": 9000, "Lulo": 9000, "Guanábana": 9000, "Maracuyá": 9000 },
  jugoLeche:         { "Mango": 10000, "Fresa": 10000, "Mora": 10000, "Mandarina": 10000, "Naranja": 10000, "Lulo": 10000, "Guanábana": 10000, "Maracuyá": 10000 },
  granizada:         { "Limón": 9000, "Maracuyá": 9000, "Naranja": 9000, "Mora": 9000, "Lulo": 9000, "Guanábana": 9000, "Mandarina": 9000 },
  granizadaEspecial: { "MaracuMango": 10000, "Frutos Rojos": 10000, "Fresa": 10000, "Frutos Amarillos": 10000 },
  limonada:          { "Natural": 8000, "Cerezada": 10000, "Coco": 11000, "Hierbabuena": 9000, "Frutos Rojos": 11000 },
  sodas:             { "Frutos Rojos": 12000, "Frutos Amarillos": 12000, "Lychee": 12000, "Tamarindo": 12000 },
  cervezaNacional:   { "Club Colombia": 8000, "Heineken": 8000, "Sol": 8000 },
  cerveza3Cord:      { "Unidad": 10000 },
  mrTea:             { "Limón": 6000, "Durazno": 6000 },
  h2oh:              { "Limón": 6000, "Maracuyá": 6000, "Limonata": 6000 },
  hatsuSoda:         { "Rojo": 8000, "Blanco": 8000, "Negro": 8000, "Rosado": 8000, "Verde": 8000 },
  hatsu:             { "Rojo": 8000, "Blanco": 8000, "Negro": 8000, "Rosado": 8000, "Verde": 8000 },
  bretana:           { "300 ml": 4000, "1.5 lts": 9000 },
};

// ── CATÁLOGO COMPLETO ──────────────────────────────────────────
export const menuData = {

  "Pizzas Super Estofadas": [
    { nombre: "Super Estofada de Carnes", opciones: preciosPizzas.superEstofada, descripcion: "Doble porción de queso mozzarella, queso crema, jamón, cabano, salami y pollo." },
    { nombre: "Super Estofada Hawaiana",  opciones: preciosPizzas.superEstofada, descripcion: "Doble porción de queso mozzarella, queso crema, jamón y piña." },
  ],

  "Pizzas Estofadas": [
    { nombre: "Estofada de Carnes",    opciones: preciosPizzas.estofada, descripcion: "Jamón, salchicha, salami, pollo, champiñón, queso y salsa napolitana." },
    { nombre: "Estofada Hawaiana",     opciones: preciosPizzas.estofada, descripcion: "Jamón, piña, queso y salsa napolitana." },
    { nombre: "Estofada Suprema",      opciones: preciosPizzas.estofada, descripcion: "Jamón, salchicha, salami, cebolla, pimentón asado, queso y salsa napolitana." },
    { nombre: "Estofada Triple Queso", opciones: preciosPizzas.estofada, descripcion: "Triple porción de queso mozzarella." },
  ],

  "Pizzas Especiales": [
    { nombre: "Drive",               opciones: preciosPizzas.especial,           descripcion: "Queso mozzarella, pollo, champiñones, maíz tierno y maduro." },
    { nombre: "Criolla",             opciones: preciosPizzas.especial,           descripcion: "Carne deshilachada, tocineta y maíz tierno." },
    { nombre: "Mexicana",            opciones: preciosPizzas.especial,           descripcion: "Carne a la bolognesa, jamón, tomate, cilantro, jalapeño y tostacos." },
    { nombre: "Hawaiana Chic",       opciones: preciosPizzas.especial,           descripcion: "Queso mozzarella, piña, tocineta, jamón y salsa BBQ." },
    { nombre: "Suprema Pepperoni",   opciones: preciosPizzas.especial,           descripcion: "Queso mozzarella, jamón, ranchera, pepperoni, pimentón, cebolla y orégano." },
    { nombre: "Especial de Carnes",  opciones: preciosPizzas.especial,           descripcion: "Queso mozzarella, jamón, cabano, salami, pollo y champiñones." },
    { nombre: "Carnívora",           opciones: preciosPizzas.especial,           descripcion: "Jamón, salchicha, salami, chorizo de ternera y tocineta." },
    { nombre: "Teriyaki",            opciones: preciosPizzas.especial,           descripcion: "Carne a la bolognesa o pollo desmechado, vegetales al wok en salsa teriyaki." },
    { nombre: "Paisa",               opciones: preciosPizzas.especial,           descripcion: "Tocineta, chorizo de ternera, jamón y maíz tierno." },
    { nombre: "Bolognesa",           opciones: preciosPizzas.especial,           descripcion: "Carne a la bolognesa y tocineta." },
    { nombre: "Camarón a la Criolla",opciones: preciosPizzas.especial,           descripcion: "Queso mozzarella, cebolla, perejil y camarón." },
    { nombre: "Topetunas",           opciones: preciosPizzas.especial,           descripcion: "Queso mozzarella, tomate, pepperoni y aceitunas." },
    { nombre: "Carbonara",           opciones: preciosPizzas.especialSinPorcion, descripcion: "Queso mozzarella, tocineta, pollo, champiñones, rúgula, parmesano y salsa carbonara." },
    { nombre: "La Majestuosa",       opciones: preciosPizzas.majestuosaPequena,  descripcion: "Queso mozzarella, stroganoff lomo de res, champiñones salteados, tomates cherry, queso brie, vinagre balsámico al brandy, cebolla crocante y albahaca." },
  ],

  "Pizzas Clásicas": [
    { nombre: "Pollo",       opciones: preciosPizzas.clasica, descripcion: "Queso mozzarella y pollo." },
    { nombre: "Hawaiana",    opciones: preciosPizzas.clasica, descripcion: "Queso mozzarella, jamón y piña." },
    { nombre: "Tres Carnes", opciones: preciosPizzas.clasica, descripcion: "Queso mozzarella, jamón, cabano y salami." },
    { nombre: "Jamón",       opciones: preciosPizzas.clasica, descripcion: "Queso mozzarella y jamón." },
    { nombre: "Margarita",   opciones: preciosPizzas.clasica, descripcion: "Queso mozzarella y orégano." },
    { nombre: "Napolitana",  opciones: preciosPizzas.clasica, descripcion: "Queso mozzarella, tomate y orégano." },
    { nombre: "Doble Queso", opciones: preciosPizzas.clasica, descripcion: "Doble porción de queso mozzarella." },
    { nombre: "Champiñones", opciones: preciosPizzas.clasica, descripcion: "Queso mozzarella y champiñones." },
    { nombre: "Bocadillo",   opciones: preciosPizzas.clasica, descripcion: "Queso mozzarella y bocadillo." },
  ],

  "Pizzas Típicas": [
    { nombre: "Pollo Champiñones",    opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, pollo y champiñones." },
    { nombre: "Pepperoni",            opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella y pepperoni." },
    { nombre: "Maduro y Tocineta",    opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, maduro y tocineta." },
    { nombre: "Toc",                  opciones: preciosPizzas.tipica, descripcion: "Maíz tierno, queso cheddar y tocineta." },
    { nombre: "Suprema",              opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, jamón, cabano, salami, pimentón, cebolla y orégano." },
    { nombre: "Suprema de Pollo",     opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, pollo, pimentón, cebolla y orégano." },
    { nombre: "Pollo BBQ",            opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, pollo aderezado con salsa BBQ." },
    { nombre: "Pollo Miel Mostaza",   opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, pollo aderezado con salsa miel mostaza." },
    { nombre: "Vegetariana",          opciones: preciosPizzas.tipica, descripcion: "Cebolla, tomate, pimentón asado, aceitunas, champiñones y orégano." },
    { nombre: "Ciruelas y Tocineta",  opciones: preciosPizzas.tipica, descripcion: "Ciruelas pasas y tocineta." },
    { nombre: "Bocadillo y Tocineta", opciones: preciosPizzas.tipica, descripcion: "Queso mozzarella, bocadillo y tocineta." },
  ],

  "Pizzetas Premium": [
    { nombre: "Pizzeta Carbonara",     opciones: preciosPizzas.premium,           descripcion: "Queso mozzarella, tocineta, pollo, champiñones, rúgula, parmesano y salsa carbonara." },
    { nombre: "Pizzeta Milán",         opciones: preciosPizzas.premium,           descripcion: "Queso mozzarella, tocineta, BBQ sailor y queso filadelfia." },
    { nombre: "Pizzeta Ibérica",       opciones: preciosPizzas.premium,           descripcion: "Queso mozzarella, pepperoni, chorizo español, jamón serrano, salami y queso parmesano." },
    { nombre: "Pizzeta California",    opciones: preciosPizzas.premium,           descripcion: "Queso mozzarella, tomate cherry, champiñones, cebolla caramelizada, tocineta y queso parmesano." },
    { nombre: "Pizzeta Cuatro Quesos", opciones: preciosPizzas.premium,           descripcion: "Queso mozzarella, queso azul, queso filadelfia, queso parmesano, tomates secos y ralladura de limón." },
    { nombre: "Pizzeta del Huerto",    opciones: preciosPizzas.premium,           descripcion: "Queso mozzarella, champiñones, jamón, tomate cherry, aderezo césar y rúgula." },
    { nombre: "Pizzeta Florencia",     opciones: preciosPizzas.premium,           descripcion: "Pesto, queso mozzarella, balsámico, jamón serrano, rúgula y queso filadelfia." },
    { nombre: "Pizzeta Livorno",       opciones: preciosPizzas.premium,           descripcion: "Pesto, queso mozzarella, camarones, tomate cherry y queso parmesano." },
    { nombre: "Pizzeta Venecia",       opciones: preciosPizzas.premium,           descripcion: "Pesto, queso mozzarella, tomates confitados y queso filadelfia." },
    { nombre: "Pizzeta Salami",        opciones: preciosPizzas.premium,           descripcion: "Pesto, queso mozzarella, salami madurado y queso filadelfia." },
    { nombre: "Pizzeta Génova",        opciones: preciosPizzas.premium,           descripcion: "Pesto, queso mozzarella, queso de búfala, tomate cherry, albahaca y queso parmesano." },
    { nombre: "Pizzeta La Majestuosa", opciones: preciosPizzas.majestuosaPizzeta, descripcion: "Queso mozzarella, stroganoff lomo de res, champiñones salteados, tomates cherry, queso brie, vinagre balsámico al brandy, cebolla crocante y albahaca." },
  ],

  "Bordes Rellenos": [
    { nombre: "Borde Solo Queso",        opciones: preciosBordes, descripcion: "Borde relleno de queso mozzarella. No disponible en porción, pizzeta, estofada ni super estofada." },
    { nombre: "Borde Arequipe y Queso",  opciones: preciosBordes, descripcion: "Borde relleno de arequipe y queso. No disponible en porción, pizzeta, estofada ni super estofada." },
    { nombre: "Borde Bocadillo y Queso", opciones: preciosBordes, descripcion: "Borde relleno de bocadillo y queso. No disponible en porción, pizzeta, estofada ni super estofada." },
  ],

  "Calzones": [
    { nombre: "Calzone Clásico",  opciones: preciosCalzones.clasico,  descripcion: "Preparado con salsa napolitana y queso mozzarella." },
    { nombre: "Calzone Especial", opciones: preciosCalzones.especial, descripcion: "Preparado con salsa napolitana, queso mozzarella y ingredientes especiales." },
  ],

  "Stromboli": [
    { nombre: "Stromboli Clásico",  opciones: preciosStromboli.clasico,  descripcion: "Preparado con salsa napolitana y queso mozzarella." },
    { nombre: "Stromboli Especial", opciones: preciosStromboli.especial, descripcion: "Preparado con salsa napolitana, queso mozzarella y sabores especiales." },
  ],

  "Pastas Premium": [
    { nombre: "Pasta Carbonara",     opciones: preciosPastas.carbonara,    descripcion: "Spaghetti en salsa carbonara con tocineta." },
    { nombre: "Pasta Alfredo",       opciones: preciosPastas.alfredo,      descripcion: "Salsa alfredo y pollo." },
    { nombre: "Pasta Pesto Camarón", opciones: preciosPastas.pestoCamaron, descripcion: "Salsa pesto, camarones, tomates cherry y queso parmesano." },
    { nombre: "Pasta Matriziana",    opciones: preciosPastas.matriziana,   descripcion: "Salsa napolitana, tocineta, tomate en julianas, pimienta roja y queso parmesano." },
    { nombre: "Pasta Marinera",      opciones: preciosPastas.marinera,     descripcion: "Pulpo, anillos de calamar y camarones en salsa aurora o blanca con queso parmesano." },
  ],

  "Pastas": [
    { nombre: "Spaghetti Sencillo",  opciones: preciosPastas.sencillo, descripcion: "1 proteína (pollo, carne o champiñones) con salsa napolitana y queso gratinado." },
    { nombre: "Spaghetti Mixto",     opciones: preciosPastas.mixto,    descripcion: "2 proteínas con salsa napolitana y queso gratinado." },
    { nombre: "Spaghetti Remix",     opciones: preciosPastas.remix,    descripcion: "3 proteínas con salsa napolitana y queso gratinado." },
    { nombre: "Macaroni Sencillo",   opciones: preciosPastas.sencillo, descripcion: "1 proteína (pollo, carne o champiñones) con salsa napolitana y queso gratinado." },
    { nombre: "Macaroni Mixto",      opciones: preciosPastas.mixto,    descripcion: "2 proteínas con salsa napolitana y queso gratinado." },
    { nombre: "Macaroni Remix",      opciones: preciosPastas.remix,    descripcion: "3 proteínas con salsa napolitana y queso gratinado." },
    { nombre: "Fettuccine Sencillo", opciones: preciosPastas.sencillo, descripcion: "1 proteína (pollo, carne o champiñones) con salsa napolitana y queso gratinado." },
    { nombre: "Fettuccine Mixto",    opciones: preciosPastas.mixto,    descripcion: "2 proteínas con salsa napolitana y queso gratinado." },
    { nombre: "Fettuccine Remix",    opciones: preciosPastas.remix,    descripcion: "3 proteínas con salsa napolitana y queso gratinado." },
  ],

  "Lasañas": [
    { nombre: "Lasaña Sencilla",    opciones: preciosLasanas.sencilla,    descripcion: "1 proteína (pollo, carne o champiñones) con salsa napolitana y queso gratinado." },
    { nombre: "Lasaña Mixta",       opciones: preciosLasanas.mixta,       descripcion: "2 proteínas con salsa napolitana y queso gratinado." },
    { nombre: "Lasaña Remix",       opciones: preciosLasanas.remix,       descripcion: "3 proteínas con salsa napolitana y queso gratinado." },
    { nombre: "Lasaña Vegetariana", opciones: preciosLasanas.vegetariana, descripcion: "Cebolla, tomate, pimentón asado, aceitunas, champiñones y salsa napolitana." },
    { nombre: "Lasaña Drive",       opciones: preciosLasanas.drive,       descripcion: "Pollo, maíz, tocineta y salsa de la casa." },
  ],

  "Hamburguesas": [
    { nombre: "Hamburguesa Clásica",     opciones: preciosHamburguesas.clasica,    descripcion: "Carne de res, queso mozzarella, tocineta, melao de piña, vegetales y salsa de la casa." },
    { nombre: "Hamburguesa Pollo",       opciones: preciosHamburguesas.pollo,      descripcion: "Filete de pollo, queso mozzarella, tocineta, melao de piña, vegetales y salsa de la casa." },
    { nombre: "Hamburguesa Mixta",       opciones: preciosHamburguesas.mixta,      descripcion: "Carne de res y filete de pollo, queso mozzarella, tocineta, melao de piña, vegetales y salsa de la casa." },
    { nombre: "Hamburguesa Doble Carne", opciones: preciosHamburguesas.dobleCarne, descripcion: "Doble carne de res, queso mozzarella, tocineta, melao de piña, vegetales y salsa de la casa." },
    { nombre: "Hamburguesa Estofada",    opciones: preciosHamburguesas.estofada,   descripcion: "Pan con masa de pizza, carne de res o pollo, doble porción de queso mozzarella, jamón, vegetales y salsa de la casa." },
  ],

  "Ensaladas": [
    { nombre: "Ensalada Drive",     opciones: preciosEnsaladas.todas, descripcion: "Lechuga, jamón, pollo, queso mozzarella, maíz, piña, tomate y salsa de la casa." },
    { nombre: "Ensalada Mi Cuate",  opciones: preciosEnsaladas.todas, descripcion: "3 tipos de lechuga, pollo, aguacate, pico de gallo, tocineta, queso, maíz tierno, nachos, salsa miel mostaza y salsa picante." },
    { nombre: "Ensalada Premium",   opciones: preciosEnsaladas.todas, descripcion: "3 tipos de lechuga, pollo, queso, tomate, ajonjolí, tocineta en salsa miel mostaza." },
    { nombre: "Ensalada César",     opciones: preciosEnsaladas.todas, descripcion: "3 tipos de lechuga, pollo, crutones, queso parmesano y queso mozzarella con salsa césar a base de anchoas." },
    { nombre: "Ensalada Balsámica", opciones: preciosEnsaladas.todas, descripcion: "3 tipos de lechuga, pollo, queso, tomate, maíz tierno, queso mozzarella, crutones, vinagre balsámico y pimienta." },
  ],

  "Sandwiches": [
    { nombre: "Sandwich Jamón", opciones: preciosSandwiches.jamon, descripcion: "Pan italiano, jamón, queso fundido, tocineta, lechuga, tomate, cebolla y salsas." },
    { nombre: "Sandwich Pollo", opciones: preciosSandwiches.pollo, descripcion: "Pan italiano, pollo, queso fundido, tocineta, lechuga, tomate, cebolla y salsas." },
    { nombre: "Sandwich Atún",  opciones: preciosSandwiches.atun,  descripcion: "Pan italiano, atún, queso fundido, tocineta, lechuga, tomate, cebolla y salsas." },
  ],

  "Maicitos": [
    { nombre: "Maicitos Gratinados", opciones: { "Unidad": 20000 }, descripcion: "Queso mozzarella, queso cheddar, maíz, tocineta y queso parmesano." },
  ],

  "Entradas": [
    { nombre: "Pan de Ajo",      opciones: preciosEntradas.panDeAjo,     descripcion: "7 deliciosos panes de ajo." },
    { nombre: "Pan Dulces",      opciones: preciosEntradas.panDulces,    descripcion: "7 deliciosos panes dulces." },
    { nombre: "Papas Francesas", opciones: preciosEntradas.papas,        descripcion: "Porción de papas a la francesa." },
    { nombre: "Salsa Tártara",   opciones: preciosEntradas.salsaTartara, descripcion: "Sobre de salsa tártara adicional." },
    { nombre: "Piña Calada",     opciones: preciosEntradas.pinaCalada,   descripcion: "Copa de 1.5 oz de piña calada." },
  ],

  "Adiciones": [
    { nombre: "Adición Tomate",    opciones: preciosAdiciones.basica },
    { nombre: "Adición Cebolla",   opciones: preciosAdiciones.basica },
    { nombre: "Adición Pimentón",  opciones: preciosAdiciones.basica },
    { nombre: "Adición Maduro",    opciones: preciosAdiciones.basica },
    { nombre: "Adición Jalapeños", opciones: preciosAdiciones.basica },
    { nombre: "Adición Jamón",     opciones: preciosAdiciones.intermedia },
    { nombre: "Adición Maíz",      opciones: preciosAdiciones.intermedia },
    { nombre: "Adición Piña",      opciones: preciosAdiciones.intermedia },
    { nombre: "Adición Champiñón", opciones: preciosAdiciones.intermedia },
    { nombre: "Adición Salami",    opciones: preciosAdiciones.intermedia },
    { nombre: "Adición Tocineta",  opciones: preciosAdiciones.superior },
    { nombre: "Adición Queso",     opciones: preciosAdiciones.superior },
    { nombre: "Adición Pollo",     opciones: preciosAdiciones.superior },
    { nombre: "Adición Pepperoni", opciones: preciosAdiciones.superior },
    { nombre: "Adición Carne",     opciones: preciosAdiciones.superior },
    { nombre: "Adición Chorizo",   opciones: preciosAdiciones.superior },
    { nombre: "Adición Camarón",   opciones: preciosAdiciones.gourmet },
    { nombre: "Salsas (1 cup)",    opciones: preciosAdiciones.salsas },
    { nombre: "Adición Proteína",  opciones: preciosAdiciones.proteina },
  ],

  "Gaseosas": [
    { nombre: "Gaseosa 400 ml",  opciones: preciosBebidas.gaseosa400,  descripcion: "Sabores Postobón." },
    { nombre: "Gaseosa 1.5 lts", opciones: preciosBebidas.gaseosa1500, descripcion: "Sabores Postobón." },
  ],

  "Jugos y Granizados": [
    { nombre: "Jugo Hit 500 ml",       opciones: preciosBebidas.jugoHit,           descripcion: "Jugo Hit botella plástica." },
    { nombre: "Jugo Natural en Agua",  opciones: preciosBebidas.jugoAgua,          descripcion: "Jugo natural preparado en agua." },
    { nombre: "Jugo Natural en Leche", opciones: preciosBebidas.jugoLeche,         descripcion: "Jugo natural preparado en leche." },
    { nombre: "Granizada",             opciones: preciosBebidas.granizada,         descripcion: "Granizada en varios sabores." },
    { nombre: "Granizada Especial",    opciones: preciosBebidas.granizadaEspecial, descripcion: "Granizada especial en sabores premium." },
  ],

  "Limonadas y Sodas": [
    { nombre: "Limonada",   opciones: preciosBebidas.limonada, descripcion: "Limonada en varios sabores." },
    { nombre: "Soda Drive", opciones: preciosBebidas.sodas,    descripcion: "Soda en sabores Frutos Rojos, Frutos Amarillos, Lychee o Tamarindo." },
  ],

  "Cervezas": [
    { nombre: "Cerveza Nacional",      opciones: preciosBebidas.cervezaNacional, descripcion: "Club Colombia, Heineken o Sol." },
    { nombre: "Cerveza 3 Cordilleras", opciones: preciosBebidas.cerveza3Cord,   descripcion: "Cerveza artesanal 3 Cordilleras." },
  ],

  "Otros": [
    { nombre: "Agua",       opciones: preciosBebidas.agua,     descripcion: "Agua sin gas o con gas." },
    { nombre: "Mr Tea",     opciones: preciosBebidas.mrTea,    descripcion: "Té frío Mr Tea." },
    { nombre: "H2OH",       opciones: preciosBebidas.h2oh,     descripcion: "Agua saborizada H2OH." },
    { nombre: "Hatsu Soda", opciones: preciosBebidas.hatsuSoda, descripcion: "Bebida funcional Hatsu Soda." },
    { nombre: "Hatsu",      opciones: preciosBebidas.hatsu,    descripcion: "Bebida funcional Hatsu." },
    { nombre: "Bretaña",    opciones: preciosBebidas.bretana,  descripcion: "Agua saborizada Bretaña." },
  ],
};
