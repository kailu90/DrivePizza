//importaciones necesarias de firestone
import { plantaDB } from './firebaseConfig.js';
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const db = plantaDB.db;
const ordersList = document.getElementById('ordersContainer');
const totalOrdersCounter = document.getElementById('total-orders');
const paidOrdersCounter = document.getElementById('paid-orders');
const deliveredOrdersCounter = document.getElementById('sent-orders');
const undeliveredOrdersCounter = document.getElementById('undelivered-orders');
const sortSelect = document.getElementById('sort');
let viewOrder;




// Tu función que usaremos para obtener todos los pedidos
async function fetchOrdersFromFirestore() {
    try {
        const ordersCollection = collection(db, 'Pedidos');
        const q = query(ordersCollection, orderBy("ID PEDIDO", "desc"));
        const querySnapshot = await getDocs(q);

        const orders = [];
        querySnapshot.forEach((doc) => {
            // Firestore usa el ID del documento, que es diferente al "ID PEDIDO" que tienes
            // Asegúrate de guardar ambos para referencia
            orders.push({
                docId: doc.id,
                ...doc.data()
            });
        });

        return orders;
    } catch (e) {
        console.error("Error al obtener los pedidos: ", e);
        return [];
    }
}

// Lógica principal
let orders = [];

async function initializeOrders() {
    // Llamamos a la nueva función de Firestore
    orders = await fetchOrdersFromFirestore();

    // Ahora, usa el array 'orders' para llenar la tabla
    orders.forEach(order => {
        const row = document.createElement('tr');

        const orderNumber = document.createElement('td');
        orderNumber.textContent = order['ID PEDIDO'];
        orderNumber.classList = 'order-id';

        const deliveryDate = document.createElement('td');
        deliveryDate.textContent = order['FECHA ENTREGA'];

        const sede = document.createElement('td');
        sede.textContent = order.SEDE;

        const state = document.createElement('td');
        state.textContent = order.ESTADO;

        // ... el resto del código para crear las celdas ...
        const anchorsContainer = document.createElement('td');
        const viewOrder = document.createElement('a');
        viewOrder.textContent = "Ver";
        viewOrder.classList = "Ver-link";
        viewOrder.href = './order.html';

        const print = document.createElement('a');
        print.textContent = " Imprimir";
        print.classList = "ImprimirHiden";

        anchorsContainer.append(viewOrder, "|", print);

        const orderValue = document.createElement('td');
        orderValue.textContent = order.netCost;

        const totalOrderValue = document.createElement('td');
        totalOrderValue.textContent = order.costWithService;

        row.append(orderNumber, deliveryDate, sede, state, anchorsContainer, orderValue, totalOrderValue);
        ordersList.append(row);
    });
    
    // ... tu lógica de contadores y localStorage ...
    
    // Aquí puedes llamar a tu función de ordenamiento si la necesitas
    const rows = Array.from(ordersList.rows);
    sortOrders(rows, '0', 'desc');

    const undeliveredOrders = orders.filter(order => order.ESTADO === 'Pendiente');
    undeliveredOrdersCounter.textContent = undeliveredOrders.length > 0 ? undeliveredOrders.length : '0';
    
    const deliveredOrders = orders.filter(order => order.ESTADO === 'Entregado');
    deliveredOrdersCounter.textContent = deliveredOrders.length > 0 ? deliveredOrders.length : '0';
    
    const paidOrders = orders.filter(order => order.ESTADO === 'Liquidado');
    paidOrdersCounter.textContent = paidOrders.length > 0 ? paidOrders.length : '0';
    
    totalOrdersCounter.textContent = orders.length;

    // Puedes remover esta línea si no necesitas guardar los pedidos en localStorage
    localStorage.setItem('orders', JSON.stringify(orders));
}

initializeOrders();









  


ordersList.addEventListener("click", function (event) {



  // función para imprimir desde botón imprimir de Dashboard sin ver contenido

  event.preventDefault();

  const row = event.target.closest("tr");
  const tdId = row.querySelector(".order-id");
  const tdPrint = row.querySelector(".ImprimirHiden");

  if (event.target.matches(".ImprimirHiden")){
    console.log(tdPrint.textContent)
    
      // Crear el iframe oculto
      const iframe = document.createElement('iframe');
      iframe.id = 'hiddenIframe';
      document.body.appendChild(iframe);
  
      // Escribir el contenido a imprimir en el iframe
      const doc = iframe.contentWindow.document;
      doc.open();
  
      const dataOrders = JSON.parse(localStorage.getItem("orders"));
  
      dataOrders.forEach(order=>{ 
       
        if (order["ID PEDIDO"] === tdId.textContent) {
          console.log(order)
          doc.write(`
            
            <header class="car_header">        
                <img src="./Imagenes/logo_drive.png" alt="logo drive pizza">
                <h1>PEDIDO SEDE</h1>
            </header>
            <form class="car_container">
            <div class="car_data_container">        
                <div class="car_data_branch">
                    <p>SEDE</p>
                    <p id="sede-name">${order.SEDE}</p>
                </div>  
                <div class="car_data_date">
                    <p>FECHA</p>
                    <p id="delibery-date">${order["FECHA ENTREGA"]}</p>
                </div>  
            </div>
            <table class="car_product_list">
                    <thead class="table_head">
                        <tr>
                            <th>PRODUCTO</th>
                            <th>CANTIDAD</th>
                            <th>VALOR</th>
                        </tr>
                    </thead>
                    <tbody class="table_body" id="table-body">

                      ${order.products.map(product => {
                        return `<tr>
                            <td>${product.name}</td>
                            <td>${product.quantity}</td>
                            <td>${product.totalPrice}</td>
                        </tr>`

                      }
                      )}
                    </tbody>
            </table>
            <div class="car_data_observation">
                <p>OBSERVACIÓN:</p>
                <p id="comment">${order.OBSERVACIONES}</p>          
            </div>  
            <div class="car_total" id="total">
                Total Productos: <span id="total-amount">${order.products.length}</span>
            </div>
            <div class="car_total" id="valor-neto">
                Valor Neto: <span id="valor-neto-amount">${order.netCost}</span>
            </div>
            <div class="car_total" id="valor-servicio">
                Valor con servicio: <span id="valor-servicio-amount">${order.costWithService}</span>
            </div>
            </form>
            `);
        }
      })
    
      doc.close();
  
      // Esperar un momento para asegurar que el contenido esté cargado
      iframe.contentWindow.focus();
  
      // Imprimir el contenido del iframe
      iframe.contentWindow.print();
  
      // Eliminar el iframe después de la impresión para limpiar el DOM
      document.body.removeChild(iframe);
  
  }









  // funcion para ver la orden de cada pedido

  if (event.target.matches(".Ver-link")) {
    event.preventDefault();
    const row = event.target.closest("tr");
    const tdId = row.querySelector(".order-id");
    const informacion = encodeURIComponent(tdId.textContent);
    console.log(informacion);
    // Obtén el href original
    let href = event.target.getAttribute("href");
    console.log(href);
    // Añade el parámetro a la URL
    href += (href.includes("?") ? "&" : "?") + "id=" + informacion;

    // Redirige a la nueva URL
    window.location.href = href;
  }
});
  
