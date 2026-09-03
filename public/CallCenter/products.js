
//******DEFINICIÓN DE PRECIOS POR CLASES**//
const preciosPizzas = {
    superEstofada: { "Porción": 16500, "Pequeña": 49000, "Mediana": 60000, "Grande": 85000, "Jumbo": 115000 },
    estofada:      { "Porción": 15500, "Pequeña": 44000, "Mediana": 55000, "Grande": 74000, "Jumbo": 92000 },
    especial:      { "Porción": 16500, "Pequeña": 49000, "Mediana": 60000, "Grande": 85000, "Jumbo": 115000 },
    especialSinPorcion: { "Pequeña": 49000, "Mediana": 60000, "Grande": 85000, "Jumbo": 115000 },
    clasica:       { "Porción": 13000, "Pequeña": 32000, "Mediana": 42000, "Grande": 58000, "Jumbo": 75000 },
    tipica:        { "Porción": 15500, "Pequeña": 44000, "Mediana": 55000, "Grande": 74000, "Jumbo": 92000 },
    majestuosaPequeña: { "Pequeña": 49000 },
    premium:       { "Pizzeta": 20000 }, 
    majestuosaPizzeta:    { "Pizzeta": 24000 }    
};
const preciosPastas = {
    spaguettiSencillo:     { "pollo": 28000 , "carne": 28000 , "champiñones": 28000},
    spaguettiMixto:        { "pollo/champiñon": 28000 , "pollo/carne": 28000 , "carne/champiñones": 28000 },
    spaguettiRemix:        { "Unidad": 28000 },
    macaroniSencillo:      { "pollo": 28000 , "carne": 28000 , "champiñones": 28000},
    macaroniMixto:         { "pollo/champiñon": 28000 , "pollo/carne": 28000 , "carne/champiñones": 28000 },
    macaroniRemix:         { "Unidad": 28000 },
    fetuccine:     { "Unidad": 28000 },
    fetuccineSencillo:     { "pollo": 28000 , "carne": 28000 , "champiñones": 28000},
    fetuccineMixto:        { "pollo/champiñon": 28000 , "pollo/carne": 28000 , "carne/champiñones": 28000 },
    fetuccineRemix:        { "Unidad": 28000 },
    carbonara:     { "Unidad": 30000 },
    alfredo:       { "Unidad": 29000 },
    pestoCamaron:  { "Unidad": 29000 },
    matriziana:    { "Unidad": 28000 },
    marinera:      { "Unidad": 34000 },
};
const preciosLasañas = {
    lasañaSencilla:        { "pollo": 26000 , "carne": 26000 , "champiñones": 26000},
    lasañaMixta:        { "pollo/champiñon": 26000 , "pollo/carne": 26000 , "carne/champiñones": 26000 },
    lasañaRemix:        { "Unidad": 26000 },
    lasañaVegetariana:  { "Unidad": 26000 },
    lasañaDrive:   { "Unidad": 30000 },
};
const preciosCalzones = {
    calzoneClasico: { "pequeño": 29000, "Grande": 45000 },
    calzoneEspecial: { "pequeño": 32000, "Grande": 49000 }
};
const preciosStromboli = {
    stromboliClasico:   { "unidad": 20000 },
    stromboliEspecial: { "unidad": 23000 }
};
const preciosHamburguesas = {
    hamburguesaClasica: { "Unidad": 24000 },
    hamburguesaPollo: { "Unidad": 24000 },
    hamburguesaMixta: { "Unidad": 32000 },
    hamburguesaDobleCarne: { "Unidad": 35000 },
    hamburguesaEstofada: { "Res": 28000, "Pollo": 28000, "Mixta": 35000, },
    hamburguesaCartago: { "Unidad": 30000, "Combo": 35000 }
};
const preciosEnsaladas = {
    ensaladaDrive:      { "Unidad": 28000 },
    ensaladaMiCuate:    { "Unidad": 28000 },
    ensaladaPremium:    { "Unidad": 28000 },
    ensaladaCesar:      { "Unidad": 28000 },
    ensaladaBalsámica:  { "Unidad": 28000 }
};
const preciosSandwiches = {
    sandwicheJamon:     { "Unidad": 20000 },
    sandwichePollo:     { "Unidad": 23000 }, 
    sandwicheAtun:      { "Unidad": 25000 }
};
const preciosMaicitos = {
    maicitosGratinados: { "Unidad": 20000 },
};
const preciosAdiciones = {
    basicas:    { "Porción": 3000, "Pequeña": 8000, "Mediana": 10000, "Grande": 12000, "Jumbo": 14000, "Unidad": 3000, "Pizzeta": 3000, "Hamburguesa": 3000 },
    intermedia: { "Porción": 4000, "Pequeña": 11000, "Mediana": 13000, "Grande": 16000, "Jumbo": 18000, "Unidad": 4000, "Pizzeta": 4000, "Hamburguesa": 4000 },
    superior:   { "Porción": 5000, "Pequeña": 13000, "Mediana": 15000, "Grande": 18000, "Jumbo": 20000, "Unidad": 5000, "Pizzeta": 5000, "Hamburguesa": 5000 },
    gourmet:    { "Porción": 6000, "Pequeña": 16000, "Mediana": 20000, "Grande": 28000, "Jumbo": 34000, "Unidad": 6000, "Pizzeta": 6000, "Hamburguesa": 6000 },
    salsas:     { "Salsa Drive": 4000, "Salsa Cuate": 4000, "Salsa Napolitana": 4000, "Salsa de la casa": 4000 },
    hamburguesa: { "Hamburguesa": 8000 },
    salsaPiña:  { "unidad": 2000 }
};
const preciosBebidas = {

    // Refrescos   
    gaseosa400ml:       { "Pepsi": 6000, "Colombiana": 6000, "Manzana": 6000, "Piña": 6000, "Kola": 6000, "Uva": 6000 , "7 up": 6000 , "naranja": 6000 },
    gaseosa1500ml:      { "Pepsi": 9000, "Colombiana": 9000, "Manzana": 9000, "Piña": 9000, "Kola": 9000, "Uva": 9000 , "7 up": 9000 , "naranja": 9000 },
    jugoHit500ml:       { "Tropical": 6000, "Mora": 6000, "Naranja/Piña": 6000, "Mango": 6000 },
    agua:               { "Sin gas": 6000 , "Con gas": 6000 },
    bretaña:            { "300 ml": 4000 , "1.5 lts": 9000 },

    // Jugos Naturales
    jugoEnAgua:         { "Mango": 9000 , "Fresa": 9000 , "Mora": 9000 , "Mandarina": 9000 , "naranja": 9000 , "lulo": 9000 , "Guanabana": 9000 , "Maracuyá": 9000 },
    jugoEnLeche:        { "Mango": 10000 , "Fresa": 10000 , "Mora": 10000  , "Mandarina": 10000 , "naranja": 10000 , "lulo": 10000 , "Guanabana": 10000 , "Maracuyá": 10000 },
    granizada:          { "Limon": 9000 , "Maracuyá": 9000 , "Naranja": 9000  , "Mora": 9000 , "lulo": 9000 , "Guanabana": 9000 , "mandarina": 9000 },
    granizadaEspecial:  { "MaracuMango": 10000 , "Frutos Rojos": 10000 , "Fresa": 10000  , "Frutos Blancos": 10000 , "Frutos Amarillos": 10000 },

    // Limonadas
    limonada:    { "Natural": 8000 , "Cerezada": 10000 , "Coco": 11000 , "Hierbabuena": 9000 , "frutos Rojos": 11000 },   

    // Sodas
    sodas:    { "Frutos Rojos": 12000 , "Frutos Amarillos": 12000 , "Lychee": 12000 , "Tamarindo": 12000 },   
    
    // Cervezas
    cervezaNacional:    { "Club Colombia": 8000 , "Heineken": 8000 , "Sol": 8000 },
    cerveza3Cordilleras:{ "unidad": 10000 },
    vasoMichelado:      { "Unidad": 2200 },   

    // Otros
    MrTea:      { "Limon": 6000, "Durazno": 6000  },
    H2OH:       { "Limon": 6000, "Maracuyá": 6000 , "Limonata": 6000  },
    HatsuSoda:  { "Rojo": 8000, "Blanco": 8000, "Negro": 8000 , "Rosado": 8000 , "Verde": 8000 },
    Hatsu:      { "Rojo": 8000, "Blanco": 8000, "Negro": 8000 , "Rosado": 8000 , "Verde": 8000 }
};
const preciosEntradas = {
    panDeAjo:    { "Unidad": 3500 },
    panDulces:   { "Unidad": 3500 },
    papasFrancesa:   { "Unidad": 8000 }, 
    salsaTartara:   { "Unidad": 1000 },  
    piñaCalada:   { "Unidad": 2000 }  
};
const preciosBordes= { 
    "Pequeña": 14000, 
    "Mediana": 18000, 
    "Grande": 21000, 
    "Jumbo": 24000 
};




//*CATALOGO DE VARIEDADES VINCULADO A SU CLASE****//
const menuData = {
//*******Variedades entradas***********/
    "Entradas/Adición" : [
        { nombre: "Pan De Ajo", opciones: preciosEntradas.panDeAjo , descripcion: "7 deliciosos panes de ajo."},
        { nombre: "Pan Dulces", opciones: preciosEntradas.panDulces , descripcion: "7 deliciosos panes dulces."},
        { nombre: "Papas a la francesa", opciones: preciosEntradas.papasFrancesa , descripcion: "Porción de papas a la francesa."},
        { nombre: "Salsa tártara", opciones: preciosEntradas.salsaTartara , descripcion: "Sobre de salsa tártara adicional."},
        { nombre: "Piña Calada", opciones: preciosEntradas.piñaCalada , descripcion: "Copa de 1.5 Onzas de piña calada."},
    ],
//*******Variedades Pastas***********/    
    "Pastas": [
        { nombre: "Pasta Carbonara", opciones: preciosPastas.carbonara, descripcion: "Spaguetti en salsa carbonara con tocineta."},
        { nombre: "Pasta Alfredo", opciones: preciosPastas.alfredo , descripcion: "Salsa alfredo y pollo." },
        { nombre: "Pasta Pesto Camaron", opciones: preciosPastas.pestoCamaron , descripcion: "Salsa pesto, camarones, tomates cherry y queso parmesano."  },
        { nombre: "Pasta Matriziana", opciones: preciosPastas.matriziana, descripcion: "Salsa napolitana, tocineta, tomate en julianas, pimienta roja y queso parmesano." },
        { nombre: "Pasta Marinera", opciones: preciosPastas.marinera, descripcion: "Pulpo, anillos de calamar y camarones en salsa aurora o salsa blanca y queso parmesano." },
        { nombre: "Pasta Spaguetti Sencillo", opciones: preciosPastas.spaguettiSencillo , descripcion: "1 proteina (Carne,Pollo o champiñones) preparado con salsa napolitana y queso gratinado." },
        { nombre: "Pasta Spaguetti Mixto", opciones: preciosPastas.spaguettiMixto , descripcion: "2 proteina (Carne,Pollo o champiñones) preparado con salsa napolitana y queso gratinado."  },
        { nombre: "Pasta Spaguetti Remix", opciones: preciosPastas.spaguettiRemix , descripcion: "3 proteina (Carne,Pollo o champiñones) preparado con salsa napolitana y queso gratinado."  },
        { nombre: "Macaroni Sencillo", opciones: preciosPastas.macaroniSencillo , descripcion: "1 proteina (Carne,Pollo o champiñones) preparado con salsa napolitana y queso gratinado." },
        { nombre: "Macaroni Mixto", opciones: preciosPastas.macaroniMixto , descripcion: "2 proteina (Carne,Pollo o champiñones) preparado con salsa napolitana y queso gratinado."  },
        { nombre: "Macaroni Remix", opciones: preciosPastas.macaroniRemix , descripcion: "3 proteina (Carne,Pollo o champiñones) preparado con salsa napolitana y queso gratinado."  },
        { nombre: "Fetuccine sencillo", opciones: preciosPastas.fetuccineSencillo,  descripcion: "1 proteina (Carne,Pollo o champiñones) preparado con salsa napolitana y queso gratinado." },
        { nombre: "Fetuccine mixto", opciones: preciosPastas.fetuccineMixto,  descripcion: "2 proteina (Carne,Pollo o champiñones) preparado con salsa napolitana y queso gratinado."  },
        { nombre: "Fetuccine remix", opciones: preciosPastas.fetuccineRemix,  descripcion: "3 proteina (Carne,Pollo o champiñones) preparado con salsa napolitana y queso gratinado."  },
    ],
//*******Variedades Lasañas**********/  
    "Lasañas": [
        { nombre: "Lasaña Sencilla", opciones: preciosLasañas.lasañaSencilla , descripcion: "1 proteina (Carne,Pollo o champiñones) preparado con salsa napolitana y queso gratinado." },
        { nombre: "Lasaña Mixta", opciones: preciosLasañas.lasañaMixta , descripcion: "2 proteina (Carne,Pollo o champiñones) preparado con salsa napolitana y queso gratinado."  },
        { nombre: "Lasaña Remix", opciones: preciosLasañas.lasañaRemix , descripcion: "3 proteina (Carne,Pollo o champiñones) preparado con salsa napolitana y queso gratinado."  },
        { nombre: "Lasaña Vegetariana", opciones: preciosLasañas.lasañaVegetariana , descripcion: "Cebolla, tomate, pimentón asado, aceitunas, champiñones y salsa napolitana."  },
        { nombre: "Lasaña Drive", opciones: preciosLasañas.lasañaDrive , descripcion: "Pollo, maíz, tocineta,  y salsa de la casa."  }
    ],
//*****Variedades de los sabores de las pizzas********/
    "Pizzas Super Estofadas": [
        { nombre: "Super Estofada de Carnes", opciones: preciosPizzas.superEstofada, esEstofada: true, descripcion: "Doble porción de queso mozarella, queso crema, jamón, cabano, salami y pollo.", descripcionCiudad: { cartago: "Doble porción de queso mozarella, queso crema, jamón, ranchera, salami y pollo." } },
        { nombre: "Super Estofada Hawaiana", opciones: preciosPizzas.superEstofada, esEstofada: true, descripcion: "Doble porción de queso mozarella, queso crema, jamón y piña." },
    ],
    "Pizzas Estofadas": [
        { nombre: "Estofada de Carnes", opciones: preciosPizzas.estofada, esEstofada: true, descripcion: "Queso mozarella, jamón, cabano, salami, pollo, champiñon y salsa napolitana." },
        { nombre: "Estofada Hawaiana", opciones: preciosPizzas.estofada, esEstofada: true, descripcion: "Queso mozarella. jamón, piña y salsa napolitana." },
        { nombre: "Estofada Suprema", opciones: preciosPizzas.estofada, esEstofada: true, descripcion: "Queso mozarella, jamón, cabano, salami, cebolla, pimentón asado, queso y salsa napolitana." },
        { nombre: "Estofada Triple Queso", opciones: preciosPizzas.estofada, esEstofada: true, descripcion: "Triple porción de queso mozarella." }
    ],
    "Pizzas Especiales": [
        { nombre: "Drive", opciones: preciosPizzas.especial , descripcion: "Queso mozzarella, pollo, champiñones, maíz tierno y maduro."},
        { nombre: "Criolla", opciones: preciosPizzas.especial , descripcion: "Carne deshilachada, tocineta y maiz tierno."},
        { nombre: "Mexicana", opciones: preciosPizzas.especial , descripcion: "Carne a la bolognesa, jamón, tomate, cilantro, jalapeño y tostacos." },
        { nombre: "Hawaiana Chic", opciones: preciosPizzas.especial , descripcion: "Queso mozarella, piña, tocineta, jamón y salsa BBQ."},
        { nombre: "Suprema Pepperoni", opciones: preciosPizzas.especial , descripcion: "Queso mozzarella, jamón, ranchera, pepperoni, pimentón, cebolla y oregano"},
        { nombre: "Especial de carnes", opciones: preciosPizzas.especial , descripcion: "Queso mozzarella, jamón, cabano, salami, pollo y champiñones.", descripcionCiudad: { cartago: "Queso mozzarella, jamón, ranchera, salami, pollo y champiñones." } },
        { nombre: "Carnivora", opciones: preciosPizzas.especial , descripcion: "Jamón, salchicha, salami, chorizo de ternera y tocineta." },
        { nombre: "Teriyaki", opciones: preciosPizzas.especial , descripcion: "Carne a la bolognesa o pollo desmechado, vegetales al wok (cebolla, zuquini y pimentón asado) eb salsa teriyaki."},
        { nombre: "Paisa", opciones: preciosPizzas.especial , descripcion: "Tocineta, chorizo de ternera, jamón y maiz tierno."},
        { nombre: "Bolognesa", opciones: preciosPizzas.especial , descripcion: "Carne a la bolognesa y tocineta."},
        { nombre: "Camaron a la criolla", opciones: preciosPizzas.especial , descripcion: "Queso mozzarella, cebolla, perejil y camarón."},
        { nombre: "Carbonara", opciones: preciosPizzas.especialSinPorcion , descripcion: "Queso mozzarella, tocineta, pollo, champiñones, rúgula, parmesano y salsa carbonara."},
        { nombre: "La Majestuosa", opciones: preciosPizzas.majestuosaPequeña , descripcion: "Queso mozzarella, stroganoff lomo de res, champiñones salteados, tomates cherry, queso brie, vinagre balsámico al brandy, cebolla crocante y albahaca."}, 
        { nombre: "Topetunas", opciones: preciosPizzas.especial , descripcion: "Queso mozzarella, tomate, pepperoni y aceitunas."}  
    ],
    "Pizzas Clásicas": [
        { nombre: "Pollo", opciones: preciosPizzas.clasica , descripcion: "Queso mozzarella y pollo." },
        { nombre: "Hawaiana", opciones: preciosPizzas.clasica , descripcion: "Queso mozzarella, jamón y piña."},
        { nombre: "Tres Carnes", opciones: preciosPizzas.clasica , descripcion: "Queso Mozzarella, jamón, cabano y salami.", descripcionCiudad: { cartago: "Queso Mozzarella, jamón, ranchera y salami." } },
        { nombre: "Jamon", opciones: preciosPizzas.clasica , descripcion: "Queso mozzarella y jamón." },
        { nombre: "Margarita", opciones: preciosPizzas.clasica , descripcion: "Queso mozzarella y orégano." },
        { nombre: "Napolitana", opciones: preciosPizzas.clasica , descripcion: "Queso mozzarella, tomate y orégano."},
        { nombre: "Doble Queso", opciones: preciosPizzas.clasica , descripcion: "Doble porción de queso mozzarella."},
        { nombre: "Champiñones", opciones: preciosPizzas.clasica ,  descripcion: "Queso mozzarella y champiñones."},
        { nombre: "Bocadillo", opciones: preciosPizzas.clasica , descripcion: "Queso mozzarella y bocadillo."} 
    ],
    "Pizzas Típicas": [
        { nombre: "Pollo Champiñones", opciones: preciosPizzas.tipica , descripcion: "Queso mozzarella, pollo y champiñones."},
        { nombre: "Pepperoni", opciones: preciosPizzas.tipica , descripcion: "Queso mozzarella y pepperoni."},   
        { nombre: "Maduro tocineta", opciones: preciosPizzas.tipica , descripcion: "Queso mozzarella, maduro y tocineta."},
        { nombre: "Toc", opciones: preciosPizzas.tipica , descripcion: "Maiz tierno, queso cheddar y tocineta."},
        { nombre: "Suprema", opciones: preciosPizzas.tipica , descripcion: "Queso mozzarella, jamón, cabano, salami, pimentón, cebolla y orégano."},
        { nombre: "Suprema de Pollo", opciones: preciosPizzas.tipica , descripcion: "Queso mozzarella, pollo, pimentón, cebolla y orégano."},
        { nombre: "Pollo Bbq", opciones: preciosPizzas.tipica , descripcion: "Queso mozzarella, pollo aderezado con salsa BBQ."},
        { nombre: "Pollo Miel - Mostaza", opciones: preciosPizzas.tipica , descripcion: "Pollo y salsa miel mostaza." },
        { nombre: "Vegetariana", opciones: preciosPizzas.tipica , descripcion: "Cebolla, tomate, pimentón asado, aceitunas, champiñones y orégano."},
        { nombre: "Ciruelas y Tocineta", opciones: preciosPizzas.tipica , descripcion: "Ciruelas pasas y tocineta."},
        { nombre: "Bocadillo Tocineta", opciones: preciosPizzas.tipica , descripcion: "Queso mozzarella, tocineta y bocadillo."}   
    ],
    "Pizzetas Premium": [
        { nombre: "Pizzeta carbonara", opciones: preciosPizzas.premium , descripcion: "Queso mozzarella, tocineta, pollo, champiñones, rúgula, parmesano y salsa carbonara."},
        { nombre: "Pizzeta Milan", opciones: preciosPizzas.premium  , descripcion: "Queso mozzarella, tocineta, BBQ sailor y queso filadelfia."},   
        { nombre: "Pizzeta Iberica", opciones: preciosPizzas.premium  , descripcion: "Queso mozzarella, pepperoni, chorizo español, jamón serrano, salami y queso parmesano."},
        { nombre: "Pizzeta California", opciones: preciosPizzas.premium   , descripcion: "Queso mozzarella, tomate cherry, champiñones, cebolla caramelizada, tocineta y queso parmesano."},
        { nombre: "Pizzeta Cuatro Quesos", opciones:preciosPizzas.premium  , descripcion: "Queso mozzarella, queso azul, qeuso filadelfia, queso parmesano, tomates secos y ralladura de limón."},
        { nombre: "Pizzeta del Huerto", opciones: preciosPizzas.premium   , descripcion: "Queso mozzarella, cahmpiñones, jamón, tomate cherry, aderezo césar y rúgula."},
        { nombre: "Pizzeta Florencia", opciones: preciosPizzas.premium  , descripcion: "Pesto, qeuso mozzarella, balsámico, jamón serrano, rúgula y queso filadelfia."},
        { nombre: "Pizzeta Livorno", opciones: preciosPizzas.premium  , descripcion: "Pesto, queso mozzarella, camarones, tomate cherry y queso parmesano." },
        { nombre: "Pizzeta Venecia", opciones: preciosPizzas.premium   , descripcion: "Pesto, queso mozzarella, tomates confitados y queso filadelfia."},
        { nombre: "Pizzeta Salami", opciones: preciosPizzas.premium  , descripcion: "Pesto, queso mozzarella, salami madurado y queso filadelfia."},
        { nombre: "Pizzeta Genova", opciones: preciosPizzas.premium   , descripcion: "Pesto, queso mozzarella, queso de búfala, tomate cherry, albahaca y queso parmesano."}, 
        { nombre: "Pizzeta la Majestuosa", opciones: preciosPizzas.majestuosaPizzeta  , descripcion: "Queso mozzarella, stroganoff lomo de res, champiñones salteados, tomates cherry, queso brie, vinagre balsámico al brandy, cebolla crocante y albahaca."} 
    ],
    //*****Variedades de los sabores de las Adiciones********/
     "Adiciones": [
        { nombre: "Adición Tomate", opciones: preciosAdiciones.basicas },
        { nombre: "Adición Cebolla", opciones: preciosAdiciones.basicas },
        { nombre: "Adición Pimentón", opciones: preciosAdiciones.basicas },
        { nombre: "Adición Maduro", opciones: preciosAdiciones.basicas },
        { nombre: "Adición Jalapeños", opciones: preciosAdiciones.basicas },
        { nombre: "Adición Jamón", opciones: preciosAdiciones.intermedia },
        { nombre: "Adición Ranchera", opciones: preciosAdiciones.intermedia },
        { nombre: "Adición Maiz", opciones: preciosAdiciones.intermedia },
        { nombre: "Adición Piña", opciones: preciosAdiciones.intermedia },
        { nombre: "Adición Champiñon", opciones: preciosAdiciones.intermedia},
        { nombre: "Adición Salami", opciones: preciosAdiciones.intermedia},
        { nombre: "Adición Tocineta", opciones: preciosAdiciones.superior },
        { nombre: "Adición Queso", opciones: preciosAdiciones.superior},
        { nombre: "Adición Pollo", opciones: preciosAdiciones.superior},
        { nombre: "Adición Pepperoni", opciones: preciosAdiciones.superior},
        { nombre: "Adición Carne", opciones: preciosAdiciones.superior},
        { nombre: "Adición Chorizo", opciones: preciosAdiciones.superior},
        { nombre: "Adición Camarón", opciones: preciosAdiciones.gourmet},
        { nombre: "Adición Salsas (1 cup)", opciones: preciosAdiciones.salsas},
        { nombre: "Adición Filete de Pollo", opciones: preciosAdiciones.hamburguesa},
        { nombre: "Adición Carne de Res", opciones: preciosAdiciones.hamburguesa}
    ],
    //*****Variedades de los Bordes********/
    "Bordes": [
        { nombre: "Borde solo queso", opciones: preciosBordes , descripcion: "No disponible para porción o pizzeta, ni para Estofada ni super estofada" },
        { nombre: "Borde solo arequipe", opciones: preciosBordes , descripcion: "No disponible para porción o pizzeta, ni para Estofada ni super estofada" },
        { nombre: "Borde solo bocadillo", opciones: preciosBordes , descripcion: "No disponible para porción o pizzeta, ni para Estofada ni super estofada" },
        { nombre: "Borde arequipe/Queso", opciones: preciosBordes , descripcion: "No disponible para porción o pizzeta, ni para Estofada ni super estofada" },
        { nombre: "Borde bocadillo/Queso", opciones: preciosBordes , descripcion: "No disponible para porción o pizzeta, ni para Estofada ni super estofada" }
    ],
    //*****Variedades de los sabores de las Calzones*******/
    "Calzones": [
        { nombre: "Clásico", opciones: preciosCalzones.calzoneClasico },
        { nombre: "Especial", opciones: preciosCalzones.calzoneEspecial },
    ],
    //*****Variedades de los sabores de las Stromboli*******/
    "Stromboli": [
        { nombre: "Clásico", opciones: preciosStromboli.stromboliClasico },
        { nombre: "Especial", opciones: preciosStromboli.stromboliEspecial },
    ],
    //*****Variedades de los sabores de los Maicitos*******/
    "Maicitos": [
        { nombre: "Maicitos Gratinados", opciones: preciosMaicitos.maicitosGratinados , descripcion: "Queso mozzarella, queso cheddar, maíz, tocineta y queso parmesano."},
    ],
    //**Variedades de Hamburguesas**/
      "Hamburguesas": [
        { nombre: "hamburguesa Clasica", opciones: preciosHamburguesas.hamburguesaClasica , descripcion: "Carne de res, queso mozarella, tocineta, melao de piña, vegetales, salsa de la casa."},
        { nombre: "Hamburguesa Pollo", opciones: preciosHamburguesas.hamburguesaPollo , descripcion: "filete de pollo, queso mozarella, tocineta, melao de piña, vegetales, salsa de la casa."},
        { nombre: "Hamburguesa Mixta", opciones: { "Filete de pollo": 32000 }, opcionesCiudad: { cartago: { "Filete de pollo": 32000, "Pollo desmechado": 29000 } }, descripcion: "Carne de res 140 gr y filete de pollo de 150 gr, queso mozarella, tocineta, melao de piña, vegetales, salsa de la casa."},
        { nombre: "Hamburguesa Doble Carne", opciones: preciosHamburguesas.hamburguesaDobleCarne, descripcion: "Doble Carne de res, queso mozarella, tocineta, melao de piña, vegetales, salsa de la casa."},
        { nombre: "Hamburguesa Estofada", opciones: preciosHamburguesas.hamburguesaEstofada , descripcion: "Pan con masa de pizza, carne de res o pollo, doble porción de queso mozarella, jamon, vegetales, salsa de la casa."},
        // ── Solo Cartago ──────────────────────────────────────────────────────
        { nombre: "La Propia", opciones: preciosHamburguesas.hamburguesaCartago , descripcion: "", tieneCombo: true },
        { nombre: "La Golosa", opciones: preciosHamburguesas.hamburguesaCartago , descripcion: "Pan brioche sellado, tocineta a la parrilla, dip umani, cogollo europeo, tomate confitado en vino tinto con notas de ron sailor, 150g de carne Angus, croqueta de mix de queso, queso ricotta, queso cheddar y mayonesa trufada.", tieneCombo: true },
        { nombre: "La Gladiadora", opciones: preciosHamburguesas.hamburguesaCartago , descripcion: "Pan brioche, tártara de la casa, queso gouda ahumado, queso filadelfia, maduro caldao en melado de whisky Jack Daniel's, suero costeño, 150g de carne Angus, cogollo europeo, pepperoni crunch y salsa ahumada a base de ajonjolí.", tieneCombo: true },
    ],    
    //**Variedades de Sanduches***/
    "Sandwiches": [
        { nombre: "Sandwiche Jamon", opciones: preciosSandwiches.sandwicheJamon, descripcion: "Pan italiano, jamón, queso fundido, tocineta, lechuga, tomate, cebolla y salsas."},
        { nombre: "Sandwiche Pollo", opciones: preciosSandwiches.sandwichePollo, descripcion: "Pan italiano, pollo, queso fundido, tocineta, lechuga, tomate, cebolla y salsas."},
        { nombre: "Sandwiche Atun", opciones: preciosSandwiches.sandwicheAtun , descripcion: "Pan italiano, atún, queso fundido, tocineta, lechuga, tomate, cebolla y salsas."}
    ],
    //**Variedades de Ensaladas***/
    "Ensaladas": [
        { nombre: "Ensalada Drive", opciones: preciosEnsaladas.ensaladaDrive, descripcion: "Lechuga, jamón, pollo, queso, mozarrella, maíz, piña, tomate y salsa de la casa."},
        { nombre: "Ensalada Mi Cuate", opciones: preciosEnsaladas.ensaladaMiCuate, descripcion: "3 tipos de lechuga, pollo, aguacate, pica de gallo, tocineta, queso, maíz tierno, nachos, salsa miel-mostaza y salsa picante."},
        { nombre: "Ensalada Premium", opciones: preciosEnsaladas.ensaladaPremium , descripcion: "3 tipos de lechugas, pollo, queso, tomate, ajonjolí, tocineta en salsa miel-mostaza."},
        { nombre: "Ensalada Cesar", opciones: preciosEnsaladas.ensaladaCesar , descripcion: "3 tipos de lechuga, pollo, crutones de pan, queso parmesano, queso mozarrella con salsa cesar a base de anchoas."},
        { nombre: "Ensalada Balsámica", opciones: preciosEnsaladas.ensaladaBalsámica , descripcion: "3 tipos de lechuga, pollo, queso, tomate, maíz tierno, queso mozarrella, crutones de pan, vinagre balsámico y pimienta."}
    ],
    //**Variedades de Bebidas***/
     "Refrescos": [
        { nombre: "Jugo Hit 500 ml", opciones: preciosBebidas.jugoHit500ml , descripcion: "Jugo hit 500 ml plástica."},
        { nombre: "Gaseosa 400 ml", opciones: preciosBebidas.gaseosa400ml , descripcion: "Sabores postobón."},
        { nombre: "Gaseosa 1.5 lts", opciones: preciosBebidas.gaseosa1500ml , descripcion: "Sabores postobón."},
        { nombre: "Agua", opciones: preciosBebidas.agua },
        { nombre: "Bretaña", opciones: preciosBebidas.bretaña }
    ],       
    "Jugos Naturales": [
        { nombre: "Jugo en Agua", opciones: preciosBebidas.jugoEnAgua },
        { nombre: "Jugo en Leche", opciones: preciosBebidas.jugoEnLeche },
        { nombre: "Granizada", opciones: preciosBebidas.granizada },
        { nombre: "Granizada Especial", opciones: preciosBebidas.granizadaEspecial },
    ],
     "Limonadas": [
        { nombre: "Limonada", opciones: preciosBebidas.limonada },
    ],
     "Sodas": [
        { nombre: "Sodas", opciones: preciosBebidas.sodas },
    ],
    "Cervezas": [
        { nombre: "Cerveza Nacional", opciones: preciosBebidas.cervezaNacional },
        { nombre: "Cerveza 3 Cordilleras", opciones: preciosBebidas.cerveza3Cordilleras },
        { nombre: "Vaso Michelado", opciones: preciosBebidas.vasoMichelado }
    ],
     "Otros": [
        { nombre: "Mr Tea", opciones: preciosBebidas.MrTea },
        { nombre: "H2OH", opciones: preciosBebidas.H2OH },
        { nombre: "Hatsu Soda", opciones: preciosBebidas.HatsuSoda },
        { nombre: "Hatsu", opciones: preciosBebidas.Hatsu },
        { nombre: "Soda Bretaña 300 ml(vidrio)", opciones: preciosBebidas.bretaña300ml },
        // ── Solo Cartago ──────────────────────────────────────────────────────
        { nombre: "Malteada", opciones: { "Oreo": 16000, "Café": 16000, "Frutos Rojos": 16000, "Vainilla": 16000 } },
    ],
    };

// ── Configuración de menú por ciudad ──────────────────────────────────────────
// Agrega categorías o productos exactos a excluir por ciudad.
// Las promos son exclusivas de Bucaramanga (sedes BGA), por eso se ocultan en Cartago.
const MENU_EXCLUIR = {
    bucaramanga: {
        categorias: [],
        productos:  ['La Propia', 'La Golosa', 'La Gladiadora', 'Malteada']
    },
    cartago: {
        categorias: [],
        productos:  ['Pan De Ajo', 'Pan Dulces', 'Salsa tártara']
    }
};