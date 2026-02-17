
//******DEFINICIÓN DE PRECIOS POR CLASES**//
const preciosEntradas = {
    panDeAjo:    { "Unidad": 3500 }
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
    lasaña: { "sencilla": 26000 , "mixta": 26000 , "remix": 26000},
    lasañaVegetariana:  { "Unidad": 26000 },
    lasañaDrive:  { "Unidad": 30000 },
};
const preciosPizzas = {
    superEstofada: { "Porción": 16500, "Pequeña": 49000, "Mediana": 60000, "Grande": 85000, "Jumbo": 115000 },
    estofada:      { "Porción": 15500, "Pequeña": 44000, "Mediana": 55000, "Grande": 74000, "Jumbo": 92000 },
    especial:      { "Porción": 16500, "Pequeña": 49000, "Mediana": 60000, "Grande": 85000, "Jumbo": 115000 },
    clasica:       { "Porción": 13000, "Pequeña": 32000, "Mediana": 42000, "Grande": 58000, "Jumbo": 75000 },
    tipica:        { "Porción": 15500, "Pequeña": 44000, "Mediana": 55000, "Grande": 74000, "Jumbo": 92000 }
};
const preciosEstandarAdiciones = { 
    "Porción": 3100, 
    "Personal": 5500, 
    "Pequeña": 8000, 
    "Mediana": 8500, 
    "Grande": 9500, 
    "Jumbo": 11000 
};

const preciosVariedades = {
    calzone: { "Personal": 36000, "Grande": 53000 },
    stromboli: { "Unidad": 30000 },
    maizGratinado: { "Sencillo": 21000, "Con Pollo (50 gr)": 26000 },
    champiñonesGratinados: { "Unidad": 26000 }
};
const preciosHamburguesas = {
    hamburguesaSencilla: { "Unidad": 24000 },
    hamburguesaEspecial: { "Unidad": 27000 },
    hamburguesaEstofada: { "Unidad": 28000 },
    hamburguesaGolden:   { "Unidad": 28000 },
    hamburguesaDobleCarne: { "Unidad": 33000 }
};
const preciosSandwiches = {
    sandwichePolloJamon: { "Pollo": 22000 , "Jamon": 22000 ,  },
    sandwicheAtun:       { "Unidad": 28000 }
};
const preciosEnsaladas = {
    ensaladaPrimaveraPollo: { "Unidad": 29000 },
    ensaladaPrimaveraAtun:  { "Unidad": 32000 },
    ensaladaMolle:          { "Unidad": 32000 },
    ensaladaTijuana:        { "Unidad": 32500 }
};
const preciosBebidas = {
    // Limonadas
    limonada:    { "Natural": 9900 , "Cerezada": 13200 , "Coco": 16000 , "Hierbabuena": 11500 },   

    // Jarra de Té
    jarraDeTe:    { "Durazno": 15500 , "Limón": 15500 },    
    
    // Cervezas
    cervezaNacional:    { "Poker": 6600 , "Costeña": 6600 },
    cervezaPremium:     { "Club": 7300 , "Aguila": 7300 , "Redds": 7300 },
    cervezaCorona:      { "Unidad": 10500 },
    vasoMichelado:      { "Unidad": 2200 },

    // Jugos Naturales
    jugoEnAgua:         { "Mango": 9500 , "Fresa": 9500 , "Mora": 9500  , "Mandarina": 9500 , "naranja": 9500 , "lulo": 9500 , "Guanabana": 9500 , "Maracuyá": 9500 },
    jugoEnLeche:         { "Mango": 11600 , "Fresa": 11600 , "Mora": 11600  , "Mandarina": 11600 , "naranja": 11600 , "lulo": 11600 , "Guanabana": 11600 , "Maracuyá": 11600 },

    // Refrescos
    jugoHitVidrio:       { "Tropical": 4800, "Mora": 4800, "Naranja/Piña": 4800, "Mango": 4800 , "Lulo": 4800 },
    gaseosa400ml:       { "Naranja": 5800, "Uva": 5800, "Manzana": 5800, "Colombiana": 5800, "Kola": 5800, "Tamarindo": 5800 },
    gaseosa1500ml:      { "Naranja": 8500, "Uva": 8500, "Manzana": 8500, "Colombiana": 8500, "Kola": 8500, "Tamarindo": 8500 },
    agua:               { "Unidad": 4700 }
};

 // Especialidades
const preciosEspecialidades = {    
    malteadas:          { "Oreo": 17000, "Frutos Rojos": 17000 },
    granizados:         { "Mango Viche": 16500, "Café": 16500 },
    sodasMicheladas:    { "Frutos amarillos": 16500 , "Frutos rojos": 16500 , "Lychee": 16500 },
    tamarindoMichelado: { "Unidad": 10500 },
    copaSangria:        { "unidad": 20000 },
    infusiones:         { "Alegria": 7400, "Calma" : 7400, "Bienestar": 7400 },
    cafeOrigen:         { "unidad": 6800 }   
};
   
// Postres   
const preciosPostres = {    
     brownieHelado:      { "Unidad": 12700 }   
};






//*CATALOGO DE VARIEDADES VINCULADO A SU CLASE****//
const menuData = {
//*******Variedades entradas***********/
    "Entradas" : [
        { nombre: "Pan De Ajo", opciones: preciosEntradas.panDeAjo , descripcion: "5 deliciosos panes de ajo."}
    ],
//*******Variedades Pastas***********/    
    "Pastas": [
        { nombre: "carbonara", opciones: preciosPastas.carbonara, descripcion: "Spaguetti en slsa carbonara con tocineta."},
        { nombre: "alfredo", opciones: preciosPastas.alfredo , descripcion: "Salsa alfredo y pollo." },
        { nombre: "pesto camaron", opciones: preciosPastas.pestoCamaron , descripcion: "Salsa pesto, camarones, tomates cherry y queso parmesano."  },
        { nombre: "matriziana", opciones: preciosPastas.matriziana, descripcion: "Salsa napolitna, tocineta, tomate en julianas, pimienta roja y queso parmesano." }, 
        { nombre: "marinera", opciones: preciosPastas.marinera, descripcion: "Pulpo, anillos de calamar y camarones en salsa aurora o salsa blanca y queso parmesano." }, 
        { nombre: "spaguetti", opciones: preciosPastas.spaguetti,  descripcion: "Preparado con salsa napolitana y queso parmesano." },
        { nombre: "macaroni", opciones: preciosPastas.macaroni,  descripcion: "Preparado con salsa napolitana y queso gratinado." },
        { nombre: "fetuccine", opciones: preciosPastas.fetuccine,  descripcion: "Preparado con salsa napolitana y queso parmesano." }        
    ],
//*******Variedades Lasañas**********/  
    "Lasañas": [
        { nombre: "Lasaña", opciones: preciosLasañas.lasaña , descripcion: "Carne a la bolognesa, pollo, champiñones y salsa napolitana."  },
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
        { nombre: "Mexicana", opciones: preciosPizzas.especial , descripcion: "Carne a la bolognesa, jamón, tomate, cilantro, jalapeño y tostacos." },
        { nombre: "Indio", opciones: preciosPizzas.especial , descripcion: "Pollo, pico e'gallo, cebolla y jalapeño."},
        { nombre: "Suprema Pepperoni", opciones: preciosPizzas.especial , descripcion: "Jamón, salchicha, salami, cebolla y pimentón asado."},
        { nombre: "Criolla", opciones: preciosPizzas.especial , descripcion: "Carne deshilachada, tocineta y maiz tierno."},
        { nombre: "Hawaiana Chic", opciones: preciosPizzas.especial , descripcion: "Piña, tocineta y BBQ."},
        { nombre: "Teriyaki", opciones: preciosPizzas.especial , descripcion: "Carne a la bolognesa o pollo desmechado, vegetales al wok (cebolla, zuquini y pimentón asado) eb salsa teriyaki."},
        { nombre: "Carnivora", opciones: preciosPizzas.especial , descripcion: "Jamón, salchicha, salami, chorizo de ternera y tocineta." },
        { nombre: "Bolognesa", opciones: preciosPizzas.especial , descripcion: "Carne a la bolognesa y tocineta."},
        { nombre: "Mediterranea", opciones: preciosPizzas.especial , descripcion: "Pepperoni, tomate y aceitunas." },
        { nombre: "Ventana", opciones: preciosPizzas.especial , descripcion: "Tomate, pepperoni, aceitunas, champiñones y cebolla."},
        { nombre: "Paisa", opciones: preciosPizzas.especial , descripcion: "Tocineta, chorizo de ternera, jamón y maiz tierno."},
        { nombre: "Pizza Molle", opciones: preciosPizzas.especial , descripcion: "Pollo, champiñon, maíz tierno y maduro al horno."}        
    ],
    "Pizzas Gourmet": [
        { nombre: "Personal Camaron", opciones: preciosPizzas.gourmet , descripcion: "Queso mozzarella, cebolla, perejil y camarón." }     
    ],
    "Pizzas Clásicas": [
        { nombre: "Pollo y Queso", opciones: preciosPizzas.clasica , descripcion: "Queso mozzarella y pollo." },
        { nombre: "Champiñones y Queso", opciones: preciosPizzas.clasica ,  descripcion: "Queso mozzarella y champiñones."},
        { nombre: "Jamon y Queso", opciones: preciosPizzas.clasica , descripcion: "Queso mozzarella y jamón." },
        { nombre: "Doble Queso", opciones: preciosPizzas.clasica , descripcion: "Doble porción de queso mozzarella."},
        { nombre: "Hawaiana", opciones: preciosPizzas.clasica , descripcion: "Queso mozzarella, jamón y piña."},
        { nombre: "Carnes", opciones: preciosPizzas.clasica , descripcion: "Queso mozzarella, jamón, cábano y salami." },
        { nombre: "Napolitana", opciones: preciosPizzas.clasica , descripcion: "Queso mozzarella, tomate y orégano."}
    ],
    "Pizzas Típicas": [
        { nombre: "California", opciones: preciosPizzas.tipica , descripcion: "Champiñones y tomates cherry."},
        { nombre: "Pollo Miel - Mostaza", opciones: preciosPizzas.tipica , descripcion: "Pollo y salsa miel mostaza." },
        { nombre: "Caprichosa", opciones: preciosPizzas.tipica , descripcion: "Maduro al horno, pepperoni." },
        { nombre: "Samba", opciones: preciosPizzas.tipica , descripcion: "Maduro al horno, pepperoni."},
        { nombre: "Ciruelas y Tocineta", opciones: preciosPizzas.tipica , descripcion: "Ciruelas pasas y tocineta."},
        { nombre: "Toc", opciones: preciosPizzas.tipica , descripcion: "Maiz tierno, queso cheddar y tocineta."},
        { nombre: "Vegetariana", opciones: preciosPizzas.tipica , descripcion: "Cebolla, tomate, pimentón asado, aceitunas, champiñones y orégano."},
        { nombre: "Frutti Molle", opciones: preciosPizzas.tipica , descripcion: "Cerezas, durazno y piña."},
        { nombre: "Bocadillo Tocineta", opciones: preciosPizzas.tipica , descripcion: "Queso mozzarella, tocineta y bocadillo."},
        { nombre: "Suprema", opciones: preciosPizzas.tipica , descripcion: "Queso mozzarella, jamón, cabano, salami, pimentón, cebolla y orégano."},
        { nombre: "Pollo Bbq", opciones: preciosPizzas.tipica , descripcion: "Queso mozzarella, pollo aderezado con salsa BBQ."},
        { nombre: "Pollo Champiñones", opciones: preciosPizzas.tipica , descripcion: "Queso mozzarella, pollo y champiñones."},
        { nombre: "Pepperoni Americano", opciones: preciosPizzas.tipica , descripcion: "Queso mozzarella y pepperoni americano."}        
    ],
    //*****Variedades de los sabores de las Adiciones********/
     "Adiciones": [
        { nombre: "Adicion Jalapeño", opciones: preciosEstandarAdiciones },
        { nombre: "Adicion Salami", opciones: preciosEstandarAdiciones },
        { nombre: "Adicion Salchicha", opciones: preciosEstandarAdiciones },
        { nombre: "Adicion Cebolla", opciones: preciosEstandarAdiciones },
        { nombre: "Adicion Aceitunas", opciones: preciosEstandarAdiciones },
        { nombre: "Adicion Queso", opciones: preciosEstandarAdiciones },
        { nombre: "Adicion Pollo", opciones: preciosEstandarAdiciones },
        { nombre: "Adicion Champiñones", opciones: preciosEstandarAdiciones },
        { nombre: "Adicion Jamón", opciones: preciosEstandarAdiciones },
        { nombre: "Adicion Maíz Tierno", opciones: preciosEstandarAdiciones },
        { nombre: "Adicion Tocineta", opciones: preciosEstandarAdiciones },
        { nombre: "Adicion Tomate", opciones: preciosEstandarAdiciones },
        { nombre: "Adicion Pepperoni", opciones: preciosEstandarAdiciones },
        { nombre: "Adicion Maduro", opciones: preciosEstandarAdiciones }
    ],
     //*****Variedades de los sabores de las VARIEDADES*******/
    "Variedades": [
        { nombre: "Calzone", opciones: preciosVariedades.calzone },
        { nombre: "Stromboli", opciones: preciosVariedades.stromboli },
        { nombre: "Maíz Gratinado Sencillo", opciones: { "Sencillo": preciosVariedades.maizGratinado.Sencillo } },
        { nombre: "Maíz Gratinado con Pollo", opciones: { "Con Pollo": preciosVariedades.maizGratinado["Con Pollo (50 gr)"] }},
        { nombre: "Champiñones Gratinados", opciones: preciosVariedades.champiñonesGratinados }
    ],
    //**Variedades de Hamburguesas**/
      "Hamburguesas": [
        { nombre: "Sencilla", opciones: preciosHamburguesas.hamburguesaSencilla , descripcion: "Carne de res 140 gr, o filete de pollo de 150 gr, queso fundido, tocineta asada, pan artesanal, salsa de tocineta, lechuga, tomate y cebolla."},
        { nombre: "Especial", opciones: preciosHamburguesas.hamburguesaEspecial , descripcion: "Carne de res 140 gr, o filete de pollo de 150 gr, queso fundido, tocineta asada, pan artesanal, salsa de tocineta, piña, pepperoni, lechuga, tomate y cebolla."},
        { nombre: "Estofada", opciones: preciosHamburguesas.hamburguesaEstofada , descripcion: "Carne de res 140 gr, o filete de pollo de 150 gr, pan pizza, jamón, queso fundido, lechuga, tomate, cebolla, salsas y nuestra salsa MOLLE."},
        { nombre: "Golden", opciones: preciosHamburguesas.hamburguesaGolden , descripcion: "Carne de res 140 gr, queso mozzarella, queso cheddar, queso crema, tocineta asada, pan artesanal, tomate, lechiga romana, salsa tártara y salsa de frutos amarillos."},
        { nombre: "Doble Carne", opciones: preciosHamburguesas.hamburguesaDobleCarne, descripcion: "Doble Carne de res 140 gr, o doble filete de pollo de 150 gr, queso fundido, tocineta asada, pan artesanal, salsa de tocineta, lechuga, tomate y cebolla."}
    ],
    //**Variedades de Sanduches***/
    "Sandwiches": [
        { nombre: "Sandwiche Pollo Jamon", opciones: preciosSandwiches.sandwichePolloJamon, descripcion: "Pan italiano, queso fundido, tocineta, lechuga, tomate, cebolla y salsas."},
        { nombre: "Sandwiche Atun", opciones: preciosSandwiches.sandwicheAtun , descripcion: "Pan italiano, queso fundido, tocineta, lechuga, tomate, cebolla y salsas."}
    ],
    //**Variedades de Ensaladas***/
    "Ensaladas": [
        { nombre: "Ensalada Primavera Pollo", opciones: preciosEnsaladas.ensaladaPrimaveraPollo, descripcion: "Mix de lechugas, pasta fusilli, cebolla, tomate y vinagreta de la casa."},
        { nombre: "Ensalada Primavera Atun", opciones: preciosEnsaladas.ensaladaPrimaveraAtun, descripcion: "Mix de lechugas, pasta fusilli, cebolla, tomate y vinagreta de la casa."},
        { nombre: "Ensalada Molle", opciones: preciosEnsaladas.ensaladaMolle , descripcion: "Batavia, pollo desmechado, maíz tierno, piña, jamón, queso mozzarella y salsa MOLLE."},
        { nombre: "Ensalada Tijuana",opciones: preciosEnsaladas.ensaladaTijuana , descripcion: "Miz de lechugas, pollo, queso, tocineta, maíz, aguacate y pico e'gallo (tomate y cilantro aderezados)."}
    ],
    //**Variedades de Bebidas***/
     "Limonadas": [
        { nombre: "Limonada", opciones: preciosBebidas.limonada },
    ],

     "Jugos Naturales": [
        { nombre: "Jugo en Agua", opciones: preciosBebidas.jugoEnAgua },
        { nombre: "Jugo en Leche", opciones: preciosBebidas.jugoEnLeche },
    ],

     "Jarra de Té": [
        { nombre: "Jarra de Té", opciones: preciosBebidas.jarraDeTe },
    ],

     "Refrescos": [
        { nombre: "Jugo Hit Vidrio", opciones: preciosBebidas.jugoHitVidrio , descripcion: "Jugo hit 237 ml vidrio."},
        { nombre: "Gaseosa 400 ml", opciones: preciosBebidas.gaseosa400ml , descripcion: "Sabores postobón."},
        { nombre: "Gaseosa 1.5 lts", opciones: preciosBebidas.gaseosa1500ml , descripcion: "Sabores postobón."},
        { nombre: "Agua", opciones: preciosBebidas.agua }
    ],

    "Cervezas": [
        { nombre: "Cerveza Nacional", opciones: preciosBebidas.cervezaNacional },
        { nombre: "Cerveza Premium", opciones: preciosBebidas.cervezaPremium },
        { nombre: "Cerveza Corona", opciones: preciosBebidas.cervezaCorona },
        { nombre: "Vaso Michelado", opciones: preciosBebidas.vasoMichelado }
    ],
  
    "Especialidades": [
        { nombre: "Malteadas", opciones: preciosEspecialidades.malteadas },
        { nombre: "Granizados", opciones: preciosEspecialidades.granizados },
        { nombre: "Sodas Micheladas", opciones: preciosEspecialidades.sodasMicheladas },
        { nombre: "Tamarindo Michelado", opciones: preciosEspecialidades.tamarindoMichelado },
        { nombre: "Copa de Sangría", opciones: preciosEspecialidades.copaSangria },
        { nombre: "Infusiones", opciones: preciosEspecialidades.infusiones },
        { nombre: "Cafe Origen", opciones: preciosEspecialidades.cafeOrigen , descripcion: "250 ml de Café (4 pocillos 62.5 ml aproximadamente)."},        
    ],

    "Postres": [
       { nombre: "Brownie con Helado", opciones: preciosPostres.brownieHelado }       
    ]
        
    };


