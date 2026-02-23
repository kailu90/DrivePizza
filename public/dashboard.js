//IMPORTA FUNCIONES DE LA BASE DE DATOS

import { callCenterDB } from './firebaseConfig.js';
import { doc, updateDoc, deleteDoc , getDoc, onSnapshot, getDocs, runTransaction, collection, query, where, orderBy, addDoc, serverTimestamp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ejecutarTransaccionStock } from './components.js'


const db = callCenterDB.db;
const auth = callCenterDB.auth;
const undeliveredCount = document.getElementById('undelivered-orders');
const sentCount = document.getElementById('sent-orders');
const paidCount = document.getElementById('paid-orders'); 
const totalCount = document.getElementById('total-orders');








/****************************CARGA DEL MENÚ DESPLEGABLE INVENTORY/DASHBOARD***************/


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

// Variable global para controlar la escucha activa
let unsubscribeOrders = null;

function listenForOrders(sortOrder = 'desc') {

const ordersContainer = document.getElementById('ordersContainer');

if (!ordersContainer) return; 

  if (unsubscribeOrders) {
    unsubscribeOrders();
  }


  // 1. IMPORTANTE: Si ya había una escucha (snapshot) activa, la cerramos
  if (unsubscribeOrders) {
    unsubscribeOrders();
  }

  const pedidosRef = collection(db, "Pedidos");
  const q = query(pedidosRef, orderBy("idPedido", sortOrder));

  // 2. Guardamos la nueva suscripción en la variable global
  unsubscribeOrders = onSnapshot(q, (querySnapshot) => {
    
    // Limpia el contenedor para pintar los datos nuevos en el orden correcto
    ordersContainer.innerHTML = '';
    
    let totalPedidos = 0;
    let pedidosPendientes = 0;
    let pedidosEnviados = 0;
    let pedidosPagados = 0;

    const formatter = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    });

    querySnapshot.forEach((doc) => {
      const pedido = doc.data();
      const docId = doc.id;

      // Conteo de estados
      if (pedido.status === 'pendiente') pedidosPendientes++;
      else if (pedido.status === 'entregado') pedidosEnviados++;
      else if (pedido.status === 'pagado') pedidosPagados++;

      const row = document.createElement('tr');
      row.className = 'inventory-management__row';      
      
      row.innerHTML = `
        <td class="inventory-management__cell">${pedido.idPedido}</td>
        <td class="inventory-management__cell">${pedido.deliveryDate}</td>
        <td class="inventory-management__cell">${pedido.user}</td>
        <td class="inventory-management__cell">
          <select 
            class="status-select" 
            data-doc-id="${doc.id}"
            ${pedido.status === 'pagado' ? 'disabled' : ''}
            onclick="event.stopPropagation()" 
            onchange="actualizarEstado(this, '${docId}')"
          >
            ${pedido.status === 'pendiente' ? `
                <option value="pendiente" selected hidden>pendiente</option> 
                <option value="entregado">entregado</option>
            ` : pedido.status === 'entregado' ? `
                <option value="entregado" selected hidden>entregado</option>
                <option value="pagado">pagado</option>
            ` : `
                <option value="pagado" selected>pagado</option>
            `}
          </select>
        </td>
       
        <td class="inventory-management__cell">${formatter.format(pedido.netCost || 0)}</td>
        <td class="inventory-management__cell">${formatter.format(pedido.total || 0)}</td>

         <td class="inventory-management__cell">
            <a class="inventory-management__link btn-edit" title="Editar">✏️</a> 
            <a class="inventory-management__link btn-print" title="Imprimir Comanda">🖨️</a>
            <a class="inventory-management__link btn-delete" title="Eliminar">🗑️</a>
        </td>
      `;

      ordersContainer.appendChild(row);
      totalPedidos++;
    });

    // Actualización de contadores (con validación de existencia)
    if (typeof undeliveredCount !== 'undefined') undeliveredCount.textContent = pedidosPendientes;
    if (typeof sentCount !== 'undefined') sentCount.textContent = pedidosEnviados;
    if (typeof paidCount !== 'undefined') paidCount.textContent = pedidosPagados;
    if (typeof totalCount !== 'undefined') totalCount.textContent = totalPedidos;
  });
}












/****************FILTRO PARA ORDENAR LISTA DE PEIDDO ASCENDENTES/DESCENDENTES***********/
const sortSelect = document.getElementById('sort');

if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
        const value = e.target.value;
        // Extraemos 'asc' o 'desc' del valor del select (ej: "0-desc" -> "desc")
        const order = value.split('-')[1]; 
        
        console.log(`Cambiando orden a: ${order}`);
        
        // Llamamos nuevamente a la función. 
        // Importante: onSnapshot se encargará de limpiar la vista anterior.
        listenForOrders(order);
    });
}























/*************************FUNCIÓN PARA VER DETALLES DEL PEDIDO******************/
const modalDetalle = document.getElementById('modal-detalle');
const closeModalDetalle = document.getElementById('close-modal-detalle');


if (ordersContainer) {
ordersContainer.addEventListener('click', async (e) => {
    const row = e.target.closest('.inventory-management__row');
    if (!row) return;

    const editBtn = e.target.closest('.btn-edit');
    const deleteBtn = e.target.closest('.btn-delete');
    const printBtn = e.target.closest('.btn-print');
    const statusSelect = e.target.closest('.status-select');
    
    const docId = row.querySelector('.status-select').getAttribute('data-doc-id');
    const idPedidoVisual = row.cells[0].innerText;   
           
    if (editBtn) {
       e.stopImmediatePropagation();
        console.log("Editando pedido:", docId);
        abrirModalPedido(docId, true); 
        return; 
        } 
        
    else if (deleteBtn) {
        e.stopImmediatePropagation();          
        console.log("Eliminando pedido N°:", idPedidoVisual);
        confirmarEliminacion(docId, idPedidoVisual, row);
        return;
    }
    else if (printBtn) {
        e.stopPropagation();
        imprimirDirecto(docId);
        return; 
    }

    if (statusSelect) return;
        console.log("Visualizando detalle pedido:", docId);
        abrirModalPedido(docId, false);

const btnGuardar = document.getElementById('btn-save-modal');

if (esEdicion) {
    // 1. Mostrar tu botón de guardar
    btnGuardar.style.display = 'block';
    
    // 2. Hacer las notas editables
    const obsContainer = document.getElementById('modal-obs');
    obsContainer.innerHTML = `<textarea id="edit-obs" style="width:100%; min-height:60px;">${pedido.orderNotes || ""}</textarea>`;

    // 3. Vincular la función de guardado al botón
    btnGuardar.onclick = () => guardarCambiosPedido(docId);
} else {
    // Si es solo vista, ocultamos el botón
    btnGuardar.style.display = 'none';
}

})};


/********************CONFIRMACIÓN DE ELIMINACIÓN DE PEDIDO EN FIREBASE***************/
async function confirmarEliminacion(docId, idPedidoVisual, rowElement) {
    // 1. Alerta profesional usando el idPedido que el usuario reconoce
    const confirmacion = confirm(`¿Estás seguro de que deseas eliminar el pedido N° ${idPedidoVisual}? \n\nEsta acción borrará el registro de la base de datos permanentemente.`);
    
    if (confirmacion) {
        try {
            // 2. Referencia al documento específico en la colección 'Pedidos'
            // docId es el ID único de Firebase (ej: "7hYxP9...")
            const docRef = doc(db, "Pedidos", docId);
            
            // 3. Ejecutar eliminación en Firebase
            await deleteDoc(docRef);
            
            // 4. Feedback visual y limpieza de UI
            alert(`Pedido ${idPedidoVisual} eliminado con éxito.`);
            
            // Animación simple de salida antes de remover del DOM
            rowElement.style.transition = "all 0.5s ease";
            rowElement.style.opacity = "0";
            rowElement.style.transform = "translateX(20px)";
            
            setTimeout(() => {
                rowElement.remove();
            }, 500);

        } catch (error) {
            console.error("Error al eliminar de Firebase:", error);
            alert("Hubo un error al intentar eliminar el pedido. Por favor, intenta de nuevo.");
        }
    }
}











/**********************ABRIR MODAL CON DETALLES DEL PEDIDOD***************/
async function abrirModalPedido(docId) {
    console.log("Abriendo pedido con ID:", docId);
    try {
        const pedidoRef = doc(db, "Pedidos", docId);
        const snap = await getDoc(pedidoRef);

        if (snap.exists()) {
            const pedido = snap.data();
            const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

            // Llenar encabezados
            document.getElementById('modal-id-pedido').textContent = pedido.idPedido;
            document.getElementById('modal-sede').textContent = pedido.user; // O pedido.sede según tu BD
            document.getElementById('modal-fecha').textContent = pedido.deliveryDate;
            document.getElementById('modal-obs').textContent = pedido.orderNotes || "Sin observaciones";

            // Llenar tabla de productos
            const tbody = document.getElementById('modal-table-body');
            tbody.innerHTML = ''; // Limpiar anterior

           // Usaremos un acumulador de texto para que el navegador pinte todo de un solo golpe
            let tablaHtml = '';
            pedido.products.forEach(prod => {
                // Sacamos el valor directamente de 'totalPrice' que vimos en tu Firebase
                const valorTotal = prod.totalPrice || 0; 

                tablaHtml += `
                    <tr>
                        <td>${prod.name}</td>
                        <td style="text-align: center;">${prod.quantity}</td>
                        <td>${formatter.format(valorTotal)}</td>
                    </tr>
                `;
            });

            tbody.innerHTML = tablaHtml;


            // Llenar totales
            document.getElementById('modal-neto').textContent = formatter.format(pedido.netCost || 0);
            document.getElementById('modal-total').textContent = formatter.format(pedido.total || 0);

            // Mostrar modal y quita scroll de body
            modalDetalle.style.display = 'flex';
            document.body.classList.add('no-scroll');
        }
    } catch (error) {
        console.error("Error al cargar detalles:", error);
        alert("No se pudieron cargar los detalles del pedido.");
    }
    }














//Cerrar el modal en X
closeModalDetalle.addEventListener('click', () => {
    modalDetalle.style.display = 'none';
    document.body.classList.remove('no-scroll');
});

// Cerrar si hacen clic fuera del contenido blanco
window.addEventListener('click', (e) => {
    if (e.target === modalDetalle) {
        modalDetalle.style.display = 'none';
        document.body.classList.remove('no-scroll');
    }
});



























/*****************CAMBIO DE ESTADO DE LOS PEDIDOS DEL DASHBOARD*******************/    
// 1. Selecciona el contenedor padre que sí existe al inicio del script (el <tbody>)

    if (ordersContainer) {
        // 2. Adjunta el escuchador de eventos 'change' al contenedor padre (ordersContainer)
        ordersContainer.addEventListener('change', (event) => {
            
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












/******** FUNCIÓN PARA ACTUALIZAR Y DESCONTAR LOS PRODUCTOS DEL STOCK *******/  
async function actualizarEstadoYDescontar(docId, nuevoEstado) {
    // 1. Define la referencia al documento
    const pedidoRef = doc(db, "Pedidos", docId);

    try {
        // 2. OBTENER el estado actual del pedido para validar
        const pedidoSnapshot = await getDoc(pedidoRef);
        
        if (!pedidoSnapshot.exists()) {
            console.error(`Error: Pedido con ID ${docId} no encontrado.`);
            return; 
        }
        
        const pedidoData = pedidoSnapshot.data();
        const estadoActual = pedidoData.status;
        const numeroPedidoVisible = pedidoData.idPedido || pedidoId;

        // 3. VALIDACIÓN DE REGLAS
        if (!esTransicionValida(estadoActual, nuevoEstado)) {
            console.warn(`❌ Transición inválida: No se puede cambiar de '${estadoActual}' a '${nuevoEstado}'.`);
            // Aquí puedes llamar a tu función para revertir el select visualmente
            return; 
        }

        // 4. Actualiza el campo 'status'
        await updateDoc(pedidoRef, {
            status: nuevoEstado
        });

        console.log(`✅ Estado del pedido ${docId} actualizado a '${nuevoEstado}' con éxito.`);

        // 5. SI EL NUEVO ESTADO ES ENTREGADO, PROCEDEMOS AL DESCUENTO
        if (nuevoEstado === "entregado") {
            console.log("El pedido cambió a estado entregado, ejecutando descontarInventario...");
            alert(`✅ Cambio de estado de pedido# '${numeroPedidoVisible}' a '${nuevoEstado}' realizado con éxito.`)
            
            // Es vital que este proceso esté dentro del try/catch
            await descontarInventario(docId);
        }

    } catch (error) { // <--- Definimos 'error' aquí
        // Ahora sí podemos usar la variable en el console.error
        console.error(`Error en el proceso del pedido ${docId}:`, error);
        alert("Hubo un error al procesar el cambio: " + error);
    }
}
















/********FUNCIÓN PARA DESCONTAR DEL INVENTARIO Y GENERAR UN REGISTRO DE TRANSACCIÓN*******/                       
async function descontarInventario(pedidoId) {
    console.log("🚀 Iniciando descuento de inventario para Pedido:", pedidoId);
    
    try {
        const pedidoRef = doc(db, "Pedidos", pedidoId);
        const pedidoSnapshot = await getDoc(pedidoRef);
        
        if (!pedidoSnapshot.exists()) {
            throw `El Pedido con ID ${pedidoId} no existe.`;
        }

        const pedidoData = pedidoSnapshot.data();
        const productosDelPedido = pedidoData.products; 

        const numeroPedidoVisible = pedidoData.idPedido || pedidoId;

        if (!productosDelPedido || productosDelPedido.length === 0) {
            console.warn("⚠️ El pedido no tiene productos.");
            return;
        }

        // Iteramos sobre el array de productos del pedido
        for (const item of productosDelPedido) {
            const nombreProducto = item.name;
            const cantidadADescontar = item.quantity;

            // 1. Necesitamos el ID del producto (Firebase ID)
            // Como en tu pedido solo guardas el nombre, hacemos la búsqueda rápida
            const q = query(collection(db, "Productos"), where("name", "==", nombreProducto));
            const productoDocs = await getDocs(q);

            if (productoDocs.empty) {
                console.error(`❌ Producto '${nombreProducto}' no encontrado en la colección Productos.`);
                continue; 
            }

            const productoDoc = productoDocs.docs[0];
            const productId = productoDoc.id;

            // 2. LLAMADA A NUESTRA FUNCIÓN CENTRALIZADA
            // Esta función ya hace la transacción, actualiza stock y crea el movimiento.
            await ejecutarTransaccionStock({
                productId: productId,
                name: nombreProducto,
                cantidad: cantidadADescontar,
                tipo: 'SALIDA',
                referenciaId: pedidoId, // El ID del pedido es nuestra referencia
                notas: `Salida automática: Entrega de Pedido #${numeroPedidoVisible}`
            });

            console.log(`✅ Item procesado: ${nombreProducto} (-${cantidadADescontar})`);
        }

        console.log("✨ Todos los productos del pedido han sido descontados correctamente.");

    } catch (error) {
        console.error("❌ Error al descontar inventario:", error);
        alert("Hubo un problema con el inventario: " + error);
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

window.addEventListener('load', () => {
    document.body.classList.add('loaded');
});


