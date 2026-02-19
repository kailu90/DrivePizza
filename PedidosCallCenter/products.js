
//******DEFINICIÓN DE PRECIOS POR CLASES**//
const preciosPizzas = {
    superEstofada: { "Porción": 16500, "Pequeña": 49000, "Mediana": 60000, "Grande": 85000, "Jumbo": 115000 },
    estofada:      { "Porción": 15500, "Pequeña": 44000, "Mediana": 55000, "Grande": 74000, "Jumbo": 92000 },
    especial:      { "Porción": 16500, "Pequeña": 49000, "Mediana": 60000, "Grande": 85000, "Jumbo": 115000 },    
    clasica:       { "Porción": 13000, "Pequeña": 32000, "Mediana": 42000, "Grande": 58000, "Jumbo": 75000 },
    tipica:        { "Porción": 15500, "Pequeña": 44000, "Mediana": 55000, "Grande": 74000, "Jumbo": 92000 },
    majestuosaPequeña: { "Pequeña": 49000 },
    premium:       { "Pizzeta": 20000 }, 
    majestuosaPizzeta:    { "Pizzeta": 24000 }    
};
const preciosPastas = {
    spaguetti:     { "sencilla": 28000 , "mixta": 28000 , "remix": 28000},
    macaroni:      { "Unidad": 28000 },
    fetuccine:     { "Unidad": 28000 },
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
    hamburguesaDobleCarne: { "Unidad": 35000 },
    hamburguesaEstofada: { "Res": 28000, "Pollo": 28000, "Mixta": 35000, }
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
    maicitosGratinados: { "Unidad": 20000 }
};
const preciosAdiciones = { 
    basicas:    { "Porción": 3000, "Pequeña": 8000, "Mediana": 10000, "Grande": 12000, "Jumbo": 14000 },
    intermedia: { "Porción": 4000, "Pequeña": 11000, "Mediana": 13000, "Grande": 16000, "Jumbo": 18000 },
    superior:   { "Porción": 5000, "Pequeña": 13000, "Mediana": 15000, "Grande": 18000, "Jumbo": 20000 },
    gourmet:    { "Porción": 6000, "Pequeña": 16000, "Mediana": 20000, "Grande": 28000, "Jumbo": 34000 }, 
    salsas:     { "Salsa Drive": 4000, "Salsa Cuate": 4000, "Salsa Napolitana": 4000, "Salsa de la casa": 4000 }, 
    hamburguesa: { "Filete Pollo": 8000, "Carne res": 8000 },
    salsaPiña:  { "unidad": 2000 }
};
const preciosBebidas = {
    // Limonadas
    limonada:    { "Natural": 8000 , "Cerezada": 10000 , "Coco": 11000 , "Hierbabuena": 11500 , "frutos Rojos": 11000 },   

    // Sodas
    sodas:    { "Frutos Rojos": 12000 , "Frutos Amarillos": 12000 , "Lychee": 12000 , "Tamarindo": 12000 },   
    
    // Cervezas
    cervezaNacional:    { "Poker": 9000 , "Costeña": 9000 },
    cerveza3Cordilleras:{ "unidad": 10000 },
    cervezaCorona:      { "Unidad": 10500 },
    vasoMichelado:      { "Unidad": 2200 },

    // Jugos Naturales
    jugoEnAgua:         { "Mango": 9500 , "Fresa": 9500 , "Mora": 9500  , "Mandarina": 9500 , "naranja": 9500 , "lulo": 9500 , "Guanabana": 9500 , "Maracuyá": 9500 },
    jugoEnLeche:         { "Mango": 11600 , "Fresa": 11600 , "Mora": 11600  , "Mandarina": 11600 , "naranja": 11600 , "lulo": 11600 , "Guanabana": 11600 , "Maracuyá": 11600 },
    granizada:         { "Limon": 9000 , "Maracuyá": 9000 , "Naranja": 9000  , "Mora": 9000 , "lulo": 9000 , "Guanabana": 9000 , "mandarina": 9000 },
    granizadaEspecial:{ "MaracuMango": 10000 , "Frutos Rojos": 10000 , "Fresa": 10000  , "Frutos Blancos": 10000 , "Frutos Amarillos": 10000 },

    // Refrescos
    jugoHitVidrio:       { "Tropical": 4800, "Mora": 4800, "Naranja/Piña": 4800, "Mango": 4800 , "Lulo": 4800 },
    gaseosa400ml:       { "Naranja": 6000, "Uva": 6000, "Manzana": 6000, "Colombiana": 6000, "Kola": 6000, "Tamarindo": 6000 ,},
    gaseosa1500ml:      { "Naranja": 9000, "Uva": 9000, "Manzana": 9000, "Colombiana": 9000, "Kola": 9000, "Tamarindo": 9000 },
    agua:               { "Unidad": 4700 },

    // Otros
    MrTea:      { "Limon": 6000, "Durazno": 6000  },
    H2OH:       { "Limon": 6000, "Maracuyá": 6000 , "Limonata": 6000  },
    HatsuSoda:  { "Rojo": 8000, "Blanco": 8000, "Negro": 8000 },
    Hatsu:      { "Rojo": 10000, "Blanco": 10000, "Negro": 10000 }
};
const preciosEntradas = {
    panDeAjo:    { "Unidad": 3500 },
    panDulces:   { "Unidad": 3500 }    
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
    "Entradas" : [
        { nombre: "Pan De Ajo", opciones: preciosEntradas.panDeAjo , descripcion: "7 deliciosos panes de ajo."},
        { nombre: "Pan Dulces", opciones: preciosEntradas.panDulces , descripcion: "7 deliciosos panes dulces."}
    ],
//*******Variedades Pastas***********/    
    "Pastas": [
        { nombre: "Carbonara", opciones: preciosPastas.carbonara, descripcion: "Spaguetti en slsa carbonara con tocineta."},
        { nombre: "Alfredo", opciones: preciosPastas.alfredo , descripcion: "Salsa alfredo y pollo." },
        { nombre: "Pesto Camaron", opciones: preciosPastas.pestoCamaron , descripcion: "Salsa pesto, camarones, tomates cherry y queso parmesano."  },
        { nombre: "Matriziana", opciones: preciosPastas.matriziana, descripcion: "Salsa napolitna, tocineta, tomate en julianas, pimienta roja y queso parmesano." }, 
        { nombre: "Marinera", opciones: preciosPastas.marinera, descripcion: "Pulpo, anillos de calamar y camarones en salsa aurora o salsa blanca y queso parmesano." }, 
        { nombre: "Spaguetti", opciones: preciosPastas.spaguetti,  descripcion: "Preparado con salsa napolitana y queso parmesano." },
        { nombre: "Macaroni", opciones: preciosPastas.macaroni,  descripcion: "Preparado con salsa napolitana y queso gratinado." },
        { nombre: "Fetuccine", opciones: preciosPastas.fetuccine,  descripcion: "Preparado con salsa napolitana y queso parmesano." }        
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
        { nombre: "Super Estofada de Carnes", opciones: preciosPizzas.superEstofada , descripcion: "Jamón, salchicha, salami, pollo, champiñon, queso crema, extra queso y salsa napolitana." },
        { nombre: "Super Estofada Hawaiana", opciones: preciosPizzas.superEstofada , descripcion: "Jamón, piña, queso crema, extra queso y salsa napolitana." },
    ],
    "Pizzas Estofadas": [
        { nombre: "Estofada de Carnes", opciones: preciosPizzas.estofada ,  descripcion: "Jamón, salchicha, salami, pollo, champiñon, queso y salsa napolitana." },
        { nombre: "Estofada Hawaiana", opciones: preciosPizzas.estofada , descripcion: "Jamón, piña, queso y salsa napolitana." },
        { nombre: "Estofada Suprema", opciones: preciosPizzas.estofada ,  descripcion: "Jamón, salchicha, salami, cebolla, pimentón asado, queso y salsa napolitana." },
        { nombre: "Estofada Triple Queso", opciones: preciosPizzas.estofada ,  descripcion: "Triple porción de queso mozarella." }
    ],
    "Pizzas Especiales": [
        { nombre: "Drive", opciones: preciosPizzas.especial , descripcion: "Queso mozzarella, pollo, champiñones, maíz tierno y maduro."},
        { nombre: "Criolla", opciones: preciosPizzas.especial , descripcion: "Carne deshilachada, tocineta y maiz tierno."},
        { nombre: "Mexicana", opciones: preciosPizzas.especial , descripcion: "Carne a la bolognesa, jamón, tomate, cilantro, jalapeño y tostacos." },
        { nombre: "Hawaiana Chic", opciones: preciosPizzas.especial , descripcion: "Piña, tocineta y BBQ."},
        { nombre: "Suprema Pepperoni", opciones: preciosPizzas.especial , descripcion: "Jamón, salchicha, salami, cebolla y pimentón asado."},
        { nombre: "Especial de carnes", opciones: preciosPizzas.especial , descripcion: "Queso mozzarella, jamón, cabano, salami, pollo y champiñones."},
        { nombre: "Carnivora", opciones: preciosPizzas.especial , descripcion: "Jamón, salchicha, salami, chorizo de ternera y tocineta." },
        { nombre: "Teriyaki", opciones: preciosPizzas.especial , descripcion: "Carne a la bolognesa o pollo desmechado, vegetales al wok (cebolla, zuquini y pimentón asado) eb salsa teriyaki."},
        { nombre: "Paisa", opciones: preciosPizzas.especial , descripcion: "Tocineta, chorizo de ternera, jamón y maiz tierno."},
        { nombre: "Bolognesa", opciones: preciosPizzas.especial , descripcion: "Carne a la bolognesa y tocineta."},
        { nombre: "Camaron a la criolla", opciones: preciosPizzas.especial , descripcion: "Queso mozzarella, cebolla, perejil y camarón."},
        { nombre: "Carbonara", opciones: preciosPizzas.especial , descripcion: "Queso mozzarella, tocineta, pollo, champiñones, rúgula, parmesano y salsa carbonara. (NO DISPONIBLE EN PORCIÓN)"},
        { nombre: "La Majestuosa", opciones: preciosPizzas.majestuosaPequeña , descripcion: "Queso mozzarella, stroganoff lomo de res, champiñones salteados, tomates cherry, queso brie, vinagre balsámico al brandy, cebolla crocante y albahaca."}   
    ],
    "Pizzas Clásicas": [
        { nombre: "Pollo y Queso", opciones: preciosPizzas.clasica , descripcion: "Queso mozzarella y pollo." },
        { nombre: "Hawaiana", opciones: preciosPizzas.clasica , descripcion: "Queso mozzarella, jamón y piña."},
        { nombre: "Tres Carnes", opciones: preciosPizzas.clasica , descripcion: "Queso Mozzarella, jamón, cabano y salami."},
        { nombre: "Jamon y Queso", opciones: preciosPizzas.clasica , descripcion: "Queso mozzarella y jamón." },
        { nombre: "Margarita", opciones: preciosPizzas.clasica , descripcion: "Queso mozzarella y orégano." },
        { nombre: "Napolitana", opciones: preciosPizzas.clasica , descripcion: "Queso mozzarella, tomate y orégano."},
        { nombre: "Doble Queso", opciones: preciosPizzas.clasica , descripcion: "Doble porción de queso mozzarella."},
        { nombre: "Champiñones y Queso", opciones: preciosPizzas.clasica ,  descripcion: "Queso mozzarella y champiñones."},
        { nombre: "Bocadillo", opciones: preciosPizzas.clasica , descripcion: "Queso mozzarella y bocadillo."} 
    ],
    "Pizzas Típicas": [
        { nombre: "Pollo Champiñones", opciones: preciosPizzas.tipica , descripcion: "Queso mozzarella, pollo y champiñones."},
        { nombre: "Pepperoni", opciones: preciosPizzas.tipica , descripcion: "Queso mozzarella y pepperoni."},   
        { nombre: "Maduro tocineta", opciones: preciosPizzas.tipica , descripcion: "Queso mozzarella, maduro y tocineta."},
        { nombre: "Toc", opciones: preciosPizzas.tipica , descripcion: "Maiz tierno, queso cheddar y tocineta."},
        { nombre: "Suprema", opciones: preciosPizzas.tipica , descripcion: "Queso mozzarella, jamón, cabano, salami, pimentón, cebolla y orégano."},
        { nombre: "Suprema de Pollo", opciones: preciosPizzas.tipica , descripcion: "Queso mozzarella, jamón, cabano, salami, pimentón, cabolla y orégano."},
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
        { nombre: "Adición Proteina Hamburguesa", opciones: preciosAdiciones.hamburguesa},
        { nombre: "Adición Salsa Piña", opciones: preciosAdiciones.salsaPiña}
    ],
    //*****Variedades de los Bordes********/
    "Bordes": [
        { nombre: "Borde queso", opciones: preciosBordes , descripcion: "No disponible para porción o pizzeta, ni para Estofada ni super estofada" },
        { nombre: "Borde arequipe Queso", opciones: preciosBordes , descripcion: "No disponible para porción o pizzeta, ni para Estofada ni super estofada" },
        { nombre: "Borde bocadillo Queso", opciones: preciosBordes , descripcion: "No disponible para porción o pizzeta, ni para Estofada ni super estofada" }
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
    //**Variedades de Hamburguesas**/
      "Hamburguesas": [
        { nombre: "hamburguesa Clasica", opciones: preciosHamburguesas.hamburguesaClasica , descripcion: "Carne de res 140 gr, o filete de pollo de 150 gr, queso fundido, tocineta asada, pan artesanal, salsa de tocineta, lechuga, tomate y cebolla."},
        { nombre: "Hamburguesa Pollo", opciones: preciosHamburguesas.hamburguesaPollo , descripcion: "Carne de res 140 gr, o filete de pollo de 150 gr, queso fundido, tocineta asada, pan artesanal, salsa de tocineta, piña, pepperoni, lechuga, tomate y cebolla."},
        { nombre: "Hamburguesa Doble Carne", opciones: preciosHamburguesas.hamburguesaDobleCarne, descripcion: "Doble Carne de res 140 gr, o doble filete de pollo de 150 gr, queso fundido, tocineta asada, pan artesanal, salsa de tocineta, lechuga, tomate y cebolla."},
        { nombre: "Hamburguesa Estofada", opciones: preciosHamburguesas.hamburguesaEstofada , descripcion: "Carne de res 140 gr, o filete de pollo de 150 gr, pan pizza, jamón, queso fundido, lechuga, tomate, cebolla, salsas y nuestra salsa MOLLE."}
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
     "Limonadas": [
        { nombre: "Limonada", opciones: preciosBebidas.limonada },
    ],

     "Sodas": [
        { nombre: "Sodas", opciones: preciosBebidas.sodas },
    ],

     "Jugos Naturales": [
        { nombre: "Jugo en Agua", opciones: preciosBebidas.jugoEnAgua },
        { nombre: "Jugo en Leche", opciones: preciosBebidas.jugoEnLeche },
        { nombre: "Granizada", opciones: preciosBebidas.granizada },
        { nombre: "Granizada Especial", opciones: preciosBebidas.granizadaEspecial },
    ],

     "Refrescos": [
        { nombre: "Jugo Hit Vidrio 237 ml", opciones: preciosBebidas.jugoHitVidrio , descripcion: "Jugo hit 237 ml vidrio."},
        { nombre: "Gaseosa 400 ml", opciones: preciosBebidas.gaseosa400ml , descripcion: "Sabores postobón."},
        { nombre: "Gaseosa 1.5 lts", opciones: preciosBebidas.gaseosa1500ml , descripcion: "Sabores postobón."},
        { nombre: "Agua", opciones: preciosBebidas.agua }
    ],

    "Cervezas": [
        { nombre: "Cerveza Nacional", opciones: preciosBebidas.cervezaNacional },
        { nombre: "Cerveza 3 Cordilleras", opciones: preciosBebidas.cerveza3Cordilleras },
        { nombre: "Cerveza Corona", opciones: preciosBebidas.cervezaCorona },
        { nombre: "Vaso Michelado", opciones: preciosBebidas.vasoMichelado }
    ],
     "Otros": [
        { nombre: "Mr Tea", opciones: preciosBebidas.MrTea },
        { nombre: "H2OH", opciones: preciosBebidas.H2OH },
        { nombre: "Hatsu Soda", opciones: preciosBebidas.HatsuSoda },
        { nombre: "Hatsu", opciones: preciosBebidas.Hatsu }
    ],


    };


