//********FUNCION DE RENDERIZADO DE TODOS LOS PRODUCTOS DISPONIBLE*******/
let carrito = [];

//********Variable para poder utilizar los sabores de las pizzas en los calzones*/
let modoCalzoneActivo = false;

// Inicializar interfaz y llama funciones necesarias.
function init() {
    renderCategories();
    crearBuscador();
    seleccionarCategoria("Pizzas");    
}

// Inyeccción de barra buscadora por nombre de productos
function crearBuscador() {
    const grid = document.getElementById('productGrid');
    const buscadorHTML = `
        <div class="search-container no-print" style="grid-column: 1 / -1; margin-bottom: 20px;">
            <input type="text" id="productSearch" 
                   placeholder="🔍 Buscar producto (ej: Hawaiana, Pollo, Carne...)" 
                   oninput="ejecutarFiltro()" 
                   style="width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 8px; font-size: 16px;">
        </div>
    `;
    // Insertar justo antes del grid
    grid.insertAdjacentHTML('beforebegin', buscadorHTML);
}

//Función para mostrar el sidebar lado izquierdo.
function renderCategories() {
    const nav = document.getElementById('categoryNav');
    const categoriasVisibles = [
        "Pizzas", 
        "Calzones Clásicos", 
        "Calzones Especiales",
        "Lasañas", 
        "Pastas", 
        "Hamburguesas", 
        "Bebidas",
        "Stromboli Clásico",
        "Stromboli Especial",
        "Sandwiches", 
        "Ensaladas", 
        "Bordes", 
        "Adiciones",   
        "Entradas",         
    ];
    
    nav.innerHTML = categoriasVisibles.map(c => `
        <button class="cat-btn" onclick="seleccionarCategoria('${c}')">${c}</button>
    `).join('');
}

// Selección categoria para mostrar variedad según categoria.
function seleccionarCategoria(categoria) {
    modoCalzoneActivo = (categoria === "Calzones");
    
    // Limpiar el texto de búsqueda al cambiar de categoría
    const input = document.getElementById('productSearch');
    if (input) input.value = "";
    
    renderProducts(categoria);
}

 // Muestra sabor según categoria para mostrar variedad según categoria.
function renderProducts(categoria) {
    const grid = document.getElementById('productGrid');
    let productos = [];

    //Agrupamos los productos según la categoría seleccionada, para mostrar las diferentes variaciones.
    if (categoria === "Pizzas") {
        const llavesPizzas = ["Pizzas Super Estofadas", "Pizzas Estofadas", "Pizzas Especiales", "Pizzas Clásicas", "Pizzas Típicas", "Pizzetas Premium"];
        llavesPizzas.forEach(key => {
            if (menuData[key]) productos = [...productos, ...menuData[key]];
        });
    } else if (categoria === "Calzones Clásicos") {
        const llavesPizzas = [ "Pizzas Clásicas" ];
        llavesPizzas.forEach(key => {
           if (menuData[key]) {
                // Mapeamos los sabores de pizza para asignarles los precios de calzone
                const saboresTransformados = menuData[key].map(saborOriginal => ({
                    ...saborOriginal,
                    nombre: `Calzone ${saborOriginal.nombre}`, // Agregamos el prefijo
                    opciones: preciosCalzones.calzoneClasico // <--- Vinculamos tus precios de calzone
                }));
                productos = [...productos, ...saboresTransformados];
            }
        });   
    } else if (categoria === "Calzones Especiales") {
        const llavesPizzas = [ "Pizzas Super Estofadas" , "Pizzas Estofadas" , "Pizzas Típicas" , "Pizzas Especiales" , ];
         llavesPizzas.forEach(key => {
            if (menuData[key]) {
                // Mapeamos los sabores de pizza para asignarles los precios de calzone
                const saboresTransformados = menuData[key].map(saborOriginal => ({
                    ...saborOriginal,
                    nombre: `Calzone ${saborOriginal.nombre}`, // Agregamos el prefijo
                    opciones: preciosCalzones.calzoneEspecial // <--- Vinculamos tus precios de calzone
                }));
                productos = [...productos, ...saboresTransformados];
            }
        });       
    } else if (categoria === "Stromboli Clásico") {
        const llavesPizzas = [ "Pizzas Clásicas" ];
        llavesPizzas.forEach(key => {
           if (menuData[key]) {
                // Mapeamos los sabores de pizza para asignarles los precios de calzone
                const saboresTransformados = menuData[key].map(saborOriginal => ({
                    ...saborOriginal,
                    nombre: `Stromboli ${saborOriginal.nombre}`, // Agregamos el prefijo
                    opciones: preciosStromboli.stromboliClasico // <--- Vinculamos tus precios de calzone
                }));
                productos = [...productos, ...saboresTransformados];
            }
        });   
    } else if (categoria === "Stromboli Especial") {
        const llavesPizzas = [ "Pizzas Super Estofadas" , "Pizzas Estofadas" , "Pizzas Típicas" , "Pizzas Especiales" , ];
         llavesPizzas.forEach(key => {
            if (menuData[key]) {
                // Mapeamos los sabores de pizza para asignarles los precios de calzone
                const saboresTransformados = menuData[key].map(saborOriginal => ({
                    ...saborOriginal,
                    nombre: `Stromboli ${saborOriginal.nombre}`, // Agregamos el prefijo
                    opciones: preciosStromboli.stromboliEspecial // <--- Vinculamos tus precios de calzone
                }));
                productos = [...productos, ...saboresTransformados];
            }
        });       
    }  
    
    
    
    else if (categoria === "Bebidas") {
        const llavesBebidas = ["Limonadas", "Sodas", "Cervezas", "Jugos Naturales", "Refrescos" , "Otros"];
        llavesBebidas.forEach(key => {
            if (menuData[key]) productos = [...productos, ...menuData[key]];
        });
    } else {
        // Para categorías directas como "Entradas" o "Pastas"
        productos = menuData[categoria] || [];
    }

    // 2. Renderizamos las tarjetas
    grid.innerHTML = productos.map(p => {
        // SEGURIDAD: Validamos que p.opciones exista antes de usar Object.values
      let opcionesFinales;
        if (categoria === "Calzone Clásico") {
            // Ignoramos preciosPizzas.clasica y usamos los de calzone
            opcionesFinales = preciosVariedades.calzoneClasico;
        } else if (categoria === "Calzone Especial") {
            opcionesFinales = preciosVariedades.calzoneEspecial;
        } else {
            opcionesFinales = p.opciones || {};
        }
        const listaPrecios = Object.values(opcionesFinales);

        // Si el producto no tiene precios (por un error en products.js), lo saltamos
        if (listaPrecios.length === 0) {
            console.error(`Error: El producto "${p.nombre}" no tiene opciones de precio.`);
            return ''; 
        }

        const precioMin = Math.min(...listaPrecios);
        const precioMostrar = listaPrecios.length > 1 
            ? `$${precioMin.toLocaleString()}+` 
            : `$${listaPrecios[0].toLocaleString()}`;

        const prefijo = modoCalzoneActivo ? "Calzone " : "";
        const nombreCompleto = `${prefijo}${p.nombre}`;

        return `
            <div class="card" data-nombre="${nombreCompleto}" onclick='prepararSeleccion(${JSON.stringify(p)}, ${modoCalzoneActivo})'>
                <h4>${nombreCompleto}</h4>
                ${p.descripcion ? `<p class="product-desc">${p.descripcion}</p>` : ''}
                <p class="price">${precioMostrar}</p>
            </div>
        `;
    }).join('');
}

//Ejecutamos el filtro para buscar por nombre de productos ---
function ejecutarFiltro() {
    const query = document.getElementById('productSearch').value.toLowerCase();
    const cards = document.querySelectorAll('.card');

    cards.forEach(card => {
        // Obtenemos el nombre desde el atributo data-nombre que pusimos arriba
        const nombreProducto = card.getAttribute('data-nombre').toLowerCase();
        card.style.display = nombreProducto.includes(query) ? "block" : "none";
    });
}

function prepararSeleccion(producto, categoria) {
    let productoFinal = { ...producto };
    
    // Si la categoría seleccionada es de calzones, sobreescribimos nombre y precios
    if (categoria === "Calzone Clasico") {
        productoFinal.nombre = `Calzone ${producto.nombre}`;
        productoFinal.opciones = preciosVariedades.calzoneClasico;
    } else if (categoria === "Calzone Especial") {
        productoFinal.nombre = `Calzone ${producto.nombre}`;
        productoFinal.opciones = preciosVariedades.calzoneEspecial;
    }
    
    abrirSeleccion(productoFinal);
}

// Nueva función para manejar la lógica de tamaños/opciones
function abrirSeleccion(producto) {
    console.log("entré a abrirSeleccion")
    const opciones = Object.keys(producto.opciones);

    // Si solo tiene una opción (ej: "Unidad"), se agrega directo
    if (opciones.length === 1) {
        const tamano = opciones[0];
        const precio = producto.opciones[tamano];
        confirmarAgregar(producto.nombre, tamano, precio);
    } else {
        // Si tiene varios tamaños, activamos tu modal del HTML
        const modal = document.getElementById('modal-seleccion');
        const titulo = document.getElementById('modal-titulo');
        const gridOpciones = document.getElementById('opciones-tamano');

        titulo.innerText = producto.nombre;
        gridOpciones.innerHTML = Object.entries(producto.opciones).map(([tam, pre]) => `
            <button class="btn-tamano" onclick="confirmarAgregar('${producto.nombre}', '${tam}', ${pre}); cerrarModal()">
                ${tam} <br> <strong>$${pre.toLocaleString()}</strong>
            </button>
        `).join('');

        modal.style.display = 'flex';
    }
}

function confirmarAgregar(nombre, tamano, precio) {
    console.log("entré a confirmasAgregar")
    // Creamos un objeto único para el carrito
    const itemPedido = {
        id: Date.now(), // ID temporal para poder borrarlo
        nombre: `${nombre} (${tamano})`,
        precio: precio
    };
    
    carrito.push(itemPedido);
    actualizarComanda();
}

function cerrarModal() {
    console.log("entré a cerrarModal")
    const modal = document.getElementById('modal-seleccion');
    if (modal) {
        modal.style.display = 'none';
    }
}
// Escuchamos el evento de clic en la ventana (window) o directamente en el modal
window.addEventListener('click', function(event) {
    const modal = document.getElementById('modal-seleccion');
    
    // Verificamos si el clic fue directamente en el fondo (el contenedor principal)
    // y no en sus elementos hijos (como el formulario o botones)
    if (event.target === modal) {
        cerrarModal();
    }
});

// Regresamos al panel de administración del CallCenter
const btnHome = document.getElementById('btn-home'); 

function regresarHome() {
    console.log("Regresando al panel principal...");
    window.location.href = '../callcenter.html'; 
}

if (btnHome) {
    btnHome.addEventListener('click', regresarHome);
}



//*******FUNCIONES DEL CARRITO DONDE AÑADIMOS DATOS DE PEDIDO********/
function actualizarComanda() {
    const container = document.getElementById('orderItems');
    const totalDisp = document.getElementById('totalDisplay');
    
    if(carrito.length === 0) {
        container.innerHTML = '<p class="empty-msg">No hay productos</p>';
        totalDisp.innerText = "$0";
        return;
    }

    container.innerHTML = carrito.map((item, index) => `
        <div class="item-row">
            <span>${item.nombre}</span>
            <div>
                <strong>$${item.precio.toLocaleString()}</strong>
                <button onclick="eliminarItem(${index})" class="btn-delete">🗑️</button>
            </div>
        </div>
    `).join('');

    const total = carrito.reduce((sum, item) => sum + item.precio, 0);
    totalDisp.innerText = `$${total.toLocaleString()}`;
}

function eliminarItem(index) {
    carrito.splice(index, 1);
    actualizarComanda();
}
//Funciónes del checkout del pedido.(datos del cliente)
function abrirCheckout() {
    if (carrito.length === 0) return alert("El carrito está vacío");
    
    const modal = document.getElementById('modal-checkout');
    modal.style.display = 'flex';
    
    // IMPORTANTE: El foco automático
    setTimeout(() => {
        document.getElementById('clienteNombre').focus();
    }, 100);
}




//Cerramos el modal al hacer click por fuera de él.
function cerrarCheckout() {
    const modal = document.getElementById('modal-checkout');
    if (modal) {
        modal.style.display = 'none';
    }
}
// Escuchamos el evento de clic en la ventana (window) o directamente en el modal
window.addEventListener('click', function(event) {
    const modal = document.getElementById('modal-checkout');
    
    // Verificamos si el clic fue directamente en el fondo (el contenedor principal)
    // y no en sus elementos hijos (como el formulario o botones)
    if (event.target === modal) {
        cerrarCheckout();
    }
});



//función para realizar el proceso del pago y capturar toda la información necesaria.
// Agregamos 'async' para poder esperar la respuesta de Firebase
async function procesarPedidoFinal() {
    const datos = {
        telefono: document.getElementById('clienteTelefono').value,
        nombre: document.getElementById('clienteNombre').value,
        direccion: document.getElementById('clienteDireccion').value,
        pago: document.getElementById('metodoPago').value,
        obs: document.getElementById('observaciones').value,
        sede: document.getElementById('sedeSelector').value,
        // Agregamos el contenido del carrito y el total para la base de datos
        productos: carrito,
        total: carrito.reduce((sum, item) => sum + item.precio, 0),
        impreso: false
    };

    // Validación
    if (!datos.telefono || !datos.nombre || !datos.direccion || !datos.pago) {
        return alert("⚠️ Teléfono, Nombre, Dirección y Pago son obligatorios.");
    }

    try {
        const pedidoId = await window.enviarAFirebase(datos);
        console.log("Pedido guardado con éxito. ID:", pedidoId);

        cerrarCheckout();

        // 1. Limpiamos el carrito inmediatamente
        carrito = [];
        actualizarComanda();

        // 2. Avisamos al operador
        alert(`✅ ¡ÉXITO! El pedido #${pedidoId} ya está en camino a la sede ${datos.sede}.`);

    } catch (error) {
        console.error("Error:", error);
        alert("Hubo un error al enviar el pedido.");
    }
}

// Ahora recibe el 'pedidoId' de Firebase
function confirmarImpresion(datos, pedidoId) {
    const container = document.getElementById('orderItems');
    
    // 1. Evitar duplicados
    const seccionesPrevias = container.querySelectorAll('.info-cliente-ticket');
    seccionesPrevias.forEach(s => s.remove());

    // 2. Usamos los últimos 5 caracteres del ID de Firebase como número de pedido
    // Esto es mucho más profesional que un número aleatorio
    const nPedido = pedidoId;

    // 3. Crear el HTML (He actualizado el nombre a MOLLE PIZZA si es el caso)
    const infoHtml = `
        <div class="info-cliente-ticket" style="font-family: 'Courier New', monospace; color: black;">
            <h2 style="text-align:center; margin:0; font-size: 16pt;">DRIVE PIZZA</h2>
            <p style="text-align:center; margin:5px 0; font-size: 12pt;">${datos.sede.toUpperCase()}</p>
            
            <div style="border: 3px solid black; text-align: center; padding: 10px; margin: 10px 0;">
                <span style="display: block; font-size: 14pt; font-weight: bold;">PEDIDO N°</span>
                <span style="display: block; font-size: 32pt; font-weight: 900;">#${nPedido}</span>
            </div>

            <div style="border-top: 1px dashed black; margin: 10px 0;"></div>
            
            <p style="margin: 4px 0;"><strong>CLIENTE:</strong> ${datos.nombre}</p>
            <p style="margin: 4px 0;"><strong>TEL:</strong> ${datos.telefono}</p>
            <p style="margin: 4px 0;"><strong>DIR:</strong> ${datos.direccion}</p>
            <p style="margin: 4px 0;"><strong>PAGO:</strong> ${datos.pago}</p>
            ${datos.obs ? `<p style="margin: 4px 0;"><strong>OBS:</strong> ${datos.obs}</p>` : ''}
            
            <div style="border-top: 1px solid black; margin: 10px 0;"></div>
            <p style="text-align:center; font-weight:bold; margin-bottom: 10px;">DETALLE DEL PEDIDO</p>
        </div>
    `;
    
    container.insertAdjacentHTML('afterbegin', infoHtml);
    alert(`Pedido #${pedidoId} enviado correctamente a la sede ${datos.sede.toUpperCase()}`);
    carrito = [];
    actualizarComanda();
}
// Iniciar
init();

//Limpiado automático del buscador con Escape
document.addEventListener('keydown', (e) => {
    if (e.key === "Escape") {
        const input = document.getElementById('productSearch');
        if (input) {
            input.value = "";
            ejecutarFiltro(); // Resetea la vista de las cards
            input.focus();    // Devuelve el cursor al buscador
        }
        cerrarModal(); // También cerramos cualquier modal abierto
    }
});