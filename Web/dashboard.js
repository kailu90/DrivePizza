//IMPORTA FUNCIONES DE LA BASE DE DATOS

import { db, auth } from './firebaseConfig.js';
import { doc, updateDoc, getDoc, getDocs, runTransaction, collection, onSnapshot, query, where, orderBy, addDoc, serverTimestamp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const ordersContainer = document.getElementById('ordersContainer');
const undeliveredCount = document.getElementById('undelivered-orders');
const sentCount = document.getElementById('sent-orders');
const paidCount = document.getElementById('paid-orders'); 
const totalCount = document.getElementById('total-orders');








/****************************CARGA DEL MENÚ DESPLEGABLE***************/


document.addEventListener("DOMContentLoaded", function () {
    fetch('sidebar.html')
        .then(response => response.text())
        .then(data => {
            document.getElementById('sidebar-container').innerHTML = data;

            // Selecciona todos los botones de toggle posibles.
            // Si el botón no existe, será 'null', que es lo que esperamos.
            const dashboardToggle = document.getElementById('toggle-btn');
            const inventoryToggle = document.getElementById('inventory-toggle');

            // Elige el botón correcto según la página actual.
            const currentToggleBtn = dashboardToggle || inventoryToggle;
            const sidebar = document.getElementById('sidebar');

            // Selecciona los elementos de la página actual.
            const mainElement = document.querySelector('.dashboard__main') || document.querySelector('.inventory__main');
            const footerElement = document.querySelector('.dashboard__footer') || document.querySelector('.inventory__footer');
            const sections = document.querySelectorAll('.dashboard__section, .inventory__section');

            // Asegúrate de que el botón exista antes de agregar el listener.
            if (currentToggleBtn) {
                currentToggleBtn.addEventListener('click', () => {
                    // Alterna las clases en el botón y el sidebar.
                    currentToggleBtn.classList.toggle('left-hidden');
                    sidebar.classList.toggle('is-hidden');
                    currentToggleBtn.classList.toggle('rotate');

                    // Alterna las clases de margen solo si los elementos existen.
                    if (mainElement) mainElement.classList.toggle('margin-hidden');
                    if (footerElement) footerElement.classList.toggle('margin-hidden');

                    sections.forEach(section => {
                        section.classList.toggle('margin-hidden-20');
                    });
                    // Cambia la flecha del botón basándose en el estado del sidebar
                    currentToggleBtn.textContent = sidebar.classList.contains('is-hidden') ? '>' : '<';
                });
            }
            listenForOrders();

        })
        .catch(error => console.error('Error al cargar el sidebar:', error));
});








/****************TRAE TODOS LOS PEDIDOS DE LA BASE DE DATOS************/


function listenForOrders(sortOrder = 'desc') {
  const pedidosRef = collection(db, "Pedidos");
  const q = query(pedidosRef, orderBy("idPedido", sortOrder));

  // onSnapshot se activa cada vez que hay un cambio en la colección.
  // Es una función de "observador" en tiempo real.
  onSnapshot(q, (querySnapshot) => {
    // Limpia y reinicia los contadores cada vez que hay un cambio.
    ordersContainer.innerHTML = '';
    let totalPedidos = 0;
    let pedidosPendientes = 0;
    let pedidosEnviados = 0;
    let pedidosPagados = 0;

    querySnapshot.forEach((doc) => {
      const pedido = doc.data();

      // Lógica para contar los pedidos por estado
      if (pedido.status === 'pendiente') {
        pedidosPendientes++;
      } else if (pedido.status === 'entregado') {
        pedidosEnviados++;
      } else if (pedido.status === 'pagado') {
        pedidosPagados++;
      }

      const row = document.createElement('tr');
      row.className = 'inventory-management__row';
      
      const fechaEntrega = pedido.deliveryDate;
      const formatter = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0
      });
      
      row.innerHTML = `
        <td class="inventory-management__cell">${pedido.idPedido}</td>
        <td class="inventory-management__cell">${fechaEntrega}</td>
        <td class="inventory-management__cell">${pedido.user}</td>
        <td class="inventory-management__cell">
          <select 
            class="status-select" 
            data-doc-id="${doc.id}"
            ${pedido.status === 'pagado' ? 'disabled' : ''}
        >
            
            ${pedido.status === 'pendiente' ? `
                <option value="pendiente" selected hidden>pendiente</option> 
                <option value="entregado">entregado</option>
            
            ` : pedido.status === 'entregado' ? `
                <option value="entregado" selected hidden>entregado</option>
                <option value="pagado">pagado</option>

            ` : pedido.status === 'pagado' ? `
                <option value="pagado" selected>pagado</option>
                
            ` : `
                <option value="${pedido.status}" selected>${pedido.status}</option>
            `}
            
        </select>
        </td>
        <td class="inventory-management__cell">
            <a class="inventory-management__link" href="cartDashboard.html?pedido=${pedido.idPedido}">Ver Detalles</a> 
        </td>
        <td class="inventory-management__cell">${formatter.format(pedido.netCost)}</td>
        <td class="inventory-management__cell">${formatter.format(pedido.total)}</td>
      `;

      ordersContainer.appendChild(row);
      totalPedidos++;
    });

    // Actualiza los contadores en el DOM
    undeliveredCount.textContent = pedidosPendientes;
    sentCount.textContent = pedidosEnviados;
    paidCount.textContent = pedidosPagados;
    totalCount.textContent = totalPedidos;
  });
}





/*****************CAMBIO DE ESTADO DE LOS PEDIDOS DEL DASHBOARD*******************/



    
// 1. Selecciona el contenedor padre que sí existe al inicio del script (el <tbody>)
    const contenedorPedidos = document.getElementById('ordersContainer'); 

    if (contenedorPedidos) {
        // 2. Adjunta el escuchador de eventos 'change' al contenedor padre (ordersContainer)
        contenedorPedidos.addEventListener('change', (event) => {
            
            // 3. Verifica si el elemento que disparó el evento es un <select> con la clase .status-select
            if (event.target.matches('.status-select')) {
                
                // ¡El trigger funcionó!
                
                // Obtener el ID del documento (pedido) afectado, que está en el select
                const docId = event.target.getAttribute('data-doc-id');
                
                // Obtener el nuevo estado seleccionado
                const nuevoEstado = event.target.value;

                console.log(`El pedido con ID: ${docId} ha cambiado al estado: ${nuevoEstado}`);
                
                // Llama a tu función de actualización de Firebase
                actualizarEstadoYDescontar(docId, nuevoEstado);
            }
        });
    } else {
        // Esto solo aparecería si el <tbody> con ID ordersContainer fue eliminado del HTML
        console.error("Error: No se encontró el contenedor padre con ID 'ordersContainer'.");
    }






/*****************ACTUALIZAR ESTADO DE LOS PEDIDOS DE DASHBOARD*******************/


/**********Reglas para impedir que se ejecute la actualización en Firebase 
si el cambio propuesto va en contra de las reglas de flujo de tu aplicación.*******/

function esTransicionValida(actual, nuevo) {
    if (actual === nuevo) {
        return true; 
    }

    switch (actual) {
        case 'pendiente':
            // Desde pendiente, solo permite avanzar (entregado o pagado)
            return nuevo === 'entregado' || nuevo === 'pagado';
            
        case 'entregado':
            // Desde entregado, solo permite avanzar a pagado. No permite volver a pendiente.
            return nuevo === 'pagado';
            
        case 'pagado':
            // Desde pagado, NUNCA permite cambiar a otro estado.
            return false;
            
        default:
            return true; 
    }
}




    async function actualizarEstadoYDescontar(docId, nuevoEstado) {

     console.log("ingresé a funcion de actualizar Estado")       
    // 1. Define la referencia al documento específico en la colección 'Pedidos'
    const pedidoRef = doc(db, "Pedidos", docId); // Asegúrate de que 'db' sea tu instancia de Firestore


    // 2. OBTENER el estado actual del pedido para validar la transición
    const pedidoSnapshot = await getDoc(pedidoRef);
    if (!pedidoSnapshot.exists()) {
        console.error(`Error: Pedido con ID ${docId} no encontrado.`);
        // Si el pedido no existe, salimos
        return; 
    }
    const estadoActual = pedidoSnapshot.data().status;

    // 🚨 3. VALIDACIÓN DE REGLAS: Si la transición es inválida, se detiene aquí.
    if (!esTransicionValida(estadoActual, nuevoEstado)) {
        console.warn(`❌ Transición inválida: No se puede cambiar de '${estadoActual}' a '${nuevoEstado}'.`);
        
        // Es crucial que el SELECT VISUAL se revierta si la transición falla.
        // Aquí debes llamar a una función que revierta el <select> en el HTML 
        // a su valor original (estadoActual) para evitar confusión al usuario.
        // Ejemplo: revertirSeleccionVisual(docId, estadoActual);

        return; // Detiene la ejecución.
    }


    try {
        // 4. Actualiza el campo 'status' del documento
        await updateDoc(pedidoRef, {
            status: nuevoEstado
        });

        console.log(`✅ Estado del pedido ${docId} actualizado a '${nuevoEstado}' con éxito.`);  
      } catch (e) {
        console.error(`Transacción de stock fallida para producto '${nombreProducto}':`, e);
      }

      if (nuevoEstado === "entregado") {
        console.log ("pedido cambio a estado entregado, ejecutaré la función descontarInventario");
        await descontarInventario(docId);
      }

     } 
    


/********FUNCIÓN PARA DESCONTAR DEL INVENTARIO Y GENERAR UN REGISTRO DE TRANSACCIÓN*******/


                       
async function descontarInventario(pedidoId) {

    console.log("ingresé a descontarInventario")
    const pedidoRef = doc(db, "Pedidos", pedidoId);
    
    // 1. Obtener los datos completos del pedido
    const pedidoSnapshot = await getDoc(pedidoRef);
    
    if (!pedidoSnapshot.exists()) {
        console.error(`Error: El Pedido con ID ${pedidoId} no existe.`);
        return;
    }

    const pedidoData = pedidoSnapshot.data();
    // Los productos estan en un array llamado "products"
    const productosDelPedido = pedidoData.products; 

    if (!productosDelPedido || productosDelPedido.length === 0) {
        console.warn(`El Pedido ${pedidoId} no contiene productos para descontar.`);
        return;
    }

    // 2. Iterar sobre cada producto del pedido y buscar/actualizar el stock
    for (const products of productosDelPedido) { // ⬅️ INICIO del bucle FOR
        const nombreProducto = products.name;
        const cantidadADescontar = products.quantity; 
        console.log(productosDelPedido)

        if (!nombreProducto || isNaN(cantidadADescontar)){
            console.warn(`Advertencia: Un producto en el pedido ${pedidoId} está incompleto.`);
            continue; // Saltar al siguiente producto
        }

        // 3. Buscar el producto en la colección 'Productos' por el campo 'Name'
        const productosRef = collection(db, "Productos");
        const q = query(productosRef, where("name", "==", nombreProducto));
        
        // Ejecutar la búsqueda
        const productoDocs = await getDocs(q);

        if (productoDocs.empty) {
            console.error(`❌ Producto NO ENCONTRADO: El producto con name='${nombreProducto}' no existe en la colección Productos.`);
            continue; 
        }

        // Tomamos el primer (y debería ser único) resultado de la búsqueda
        const productoDoc = productoDocs.docs[0];
        const productoRef = doc(db, "Productos", productoDoc.id);
        let finalStock = 0; // Usaremos esta para almacenar el stock después de la transacción

        // 4. Ejecutar Transacción para descontar el stock de forma atómica y segura
        try { // ⬅️ INICIO del TRY de la transacción
            await runTransaction(db, async (transaction) => {
                const stockDoc = await transaction.get(productoRef);
                if (!stockDoc.exists()) {
                    throw "El documento del producto ya no existe durante la transacción!";
                }

                const stockActual = stockDoc.data().stock || 0;
                finalStock = stockActual - cantidadADescontar; 
                
                // Actualizar el documento del producto dentro de la transacción
                transaction.update(productoRef, { stock: finalStock });
            });
            
            console.log(`👍 Descontado ${cantidadADescontar} de '${nombreProducto}'. Nuevo stock: ${finalStock}.`);

            // =======================================================
            // ➡️ PASO 5: REGISTRAR LA SALIDA EN 'Inventario'
            // =======================================================
            const inventoryRef = collection(db, 'Inventario'); 
            
            await addDoc(inventoryRef, {
                // Campos del pedido y producto
                date: serverTimestamp(),      
                idProduct: productoDoc.id,       
                quantity: cantidadADescontar,      
                transaction: 'SALIDA',         

                // Campos específicos de esta transacción:
                idOrder: pedidoId,               
                notes: `Salida por entrega de Pedido #${pedidoId}`, 

                // Campos no aplicables/null
                idInventory: null,          
                idSupplier: null,           
            });

            console.log(`  - Registro de salida creado en Inventario para el Pedido ${pedidoId}.`);

        } catch (e) { // ⬅️ CATCH del TRY de la transacción
            console.error(`Transacción de stock y/o registro fallido para producto '${nombreProducto}':`, e);
        }
    } 

} 








/*************************************FUNCIÓN PARA CERRAR SESIÓN****************************************/



onAuthStateChanged(auth, async (user) => {
    if (!user) {
        console.log("Acceso denegado o sesión cerrada.");
        window.location.href = "index.html";
    } else {
        //Captura de la sede
        try {
            const userDoc = await getDoc(doc(db, "Usuarios", user.uid));
            if (userDoc.exists()) {
                const sedeDesdeFirebase = userDoc.data().sede;
                CargarHeader(sedeDesdeFirebase); // Llamamos a tu función con el dato real
            }
        } catch (error) {
            console.error("Error al obtener la sede:", error);
        }
    }
});






const linkLogout = document.getElementById("link_logout");

if (linkLogout) {
    linkLogout.addEventListener("click", async (e) => {
        e.preventDefault();

        const confirmar = confirm("¿Estás seguro de que quieres cerrar sesión?");
        
        if (confirmar) {
            try {
                console.log("Cerrando sesión en Firebase...");
                await signOut(auth);
                
            } catch (error) {
                console.error("Error al cerrar sesión:", error);
                alert("Hubo un error al salir. Intenta de nuevo.");
            }
        }
    });
}