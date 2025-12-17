// Importa las funciones de Firebase necesarias
import { db } from './firebaseConfig.js';
// Importa 'where' para hacer la consulta por campo
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Referencias a los elementos del DOM de tu HTML
const sedeName = document.getElementById('sede-name');
const deliveryDate = document.getElementById('delibery-date');
const tableBody = document.getElementById('table-body');
const comment = document.getElementById('comment');
const totalAmount = document.getElementById('total-amount');
const valorNetoAmount = document.getElementById('valor-neto-amount');
const valorServicioAmount = document.getElementById('valor-servicio-amount');

// Función para obtener los parámetros de la URL
function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    const regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    const results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

// Función para formatear el valor como moneda
const formatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
});

// Función para renderizar una fila de producto en la tabla
function renderProductRow(product) {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td class="table_cell">${product.name}</td>
        <td class="table_cell">${product.quantity}</td>
        <td class="table_cell">${formatter.format(product.totalPrice)}</td>
    `;
    tableBody.appendChild(row);
}

// Función principal para cargar y mostrar los detalles del pedido
async function loadPedidoDetails() {
    const pedidoId = getUrlParameter('pedido');

    if (!pedidoId) {
        console.error("No se encontró el ID del pedido en la URL.");
        return;
    }

    try {
        const pedidosRef = collection(db, "Pedidos");
        
        let querySnapshot;
        
        // Intenta la consulta con un NÚMERO
        let q = query(pedidosRef, where("idPedido", "==", parseInt(pedidoId)));
        querySnapshot = await getDocs(q);

        // Si no se encontró, intenta la consulta con una CADENA DE TEXTO
        if (querySnapshot.empty) {
            q = query(pedidosRef, where("idPedido", "==", pedidoId));
            querySnapshot = await getDocs(q);
        }

        if (!querySnapshot.empty) {
            const pedidoSnap = querySnapshot.docs[0];
            const pedido = pedidoSnap.data();        

            // Llenar los campos del HTML
            sedeName.textContent = pedido.user;
            deliveryDate.textContent = pedido.deliveryDate;
            comment.textContent = pedido.orderNotes;
            
            if (pedido.products && pedido.products.length > 0) {
                pedido.products.forEach(product => {
                    renderProductRow(product);
                });
            }

            totalAmount.textContent = pedido.products.length;
            valorNetoAmount.textContent = formatter.format(pedido.netCost);
            valorServicioAmount.textContent = formatter.format(pedido.total);
            
        } else {
            console.log("No se encontró el pedido con el ID:", pedidoId);
        }
    } catch (e) {
        console.error("Error al cargar el pedido:", e);
    }
}



// cambio de estado a las ordenes del dashboard

async function updateOrderStatus(docId, newStatus) {
    const pedidoRef = doc(db, "Pedidos", docId);
    try {
        await updateDoc(pedidoRef, {
            status: newStatus
        });
        console.log(`Estado del pedido ${docId} actualizado a ${newStatus}`);
    } catch (error) {
        console.error("Error al actualizar el estado:", error);
    }
}




// Llama a la función al cargar la página
document.addEventListener('DOMContentLoaded', loadPedidoDetails);


// Función para imprimir la orden
document.getElementById('btn_print').addEventListener('click', function() {
    window.print();
});