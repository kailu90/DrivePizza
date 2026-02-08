//Lógica para la previsualización de la orden, confirmación antes de enviar a BD.


// Importa las funciones de Firebase necesarias
import { db } from './firebaseConfig.js';
import { collection, addDoc ,  doc, runTransaction, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


const productsList = document.getElementById('list');
const productsCount = document.getElementById('total-amount');
const totalPriceParagraph = document.getElementById('valor-neto-amount');
const finalPriceParagraph = document.getElementById('valor-servicio-amount');
const idPedidoDisplay = document.getElementById('idPedido');
const sedeParagraph = document.getElementById('sede-name');
const deliberyDateParagraph = document.getElementById('delibery-date');
const commentParagraph = document.getElementById('comment');
const listContainer = document.getElementById('table-body');

let products = 0;
let localStorageData;
let orderWithPrices;


//Datos de localstorage llenan tabla para previsualizar la orden.
if (localStorage.getItem('order')) {
  localStorageData = localStorage.getItem('order');
  const order = Object.entries(JSON.parse(localStorageData));

  const storageApiData = localStorage.getItem('productsInfo');
  const productsInfo = Object.entries(JSON.parse(storageApiData));
  const dataCorrected = productsInfo.map(product => {
    const corrected = [product[0], { ...product[1], name: product[1].name.trim() }];
    return corrected;
  })

  if (dataCorrected) {
    cart(order, dataCorrected);
  }
}

function cart(order, apiData) {
let totalPrice = 0;

  // ➡️ Array temporal para construir los productos con TODOS los datos, incluyendo el ID
  let tempProducts = []; 

order.forEach((keyValue, current) => {
 if (keyValue[0] === "idPedido") {
            idPedidoDisplay.textContent = keyValue[1]; 
        }
        //sede
        else if(keyValue[0] === "user") {
            sedeParagraph.textContent = keyValue[1];
        } 
        // Fecha de Entrega
        else if (keyValue[0] === "deliveryDate") {
            deliberyDateParagraph.textContent = keyValue[1];
        } 
        // Notas del Pedido
        else if (keyValue[0] === "orderNotes") {
            commentParagraph.textContent = keyValue[1];
        } else {
            const item = document.createElement('tr');

            const itemName = document.createElement('td');
            itemName.textContent = keyValue[0];

            const count = document.createElement('td');
            count.textContent = keyValue[1];

            let quantityPrice;
            let currentProductId = null; // ⬅️ Variable para almacenar el ID
            let currentProductTotal = 0; // ⬅️ Variable para almacenar el total por producto

            apiData.forEach(product => {
                // product[0] es el ID del documento de Firestore
                // product[1].name es el nombre del producto
                if (product[1].name === keyValue[0].trim()) {
                    const productPrice = parseFloat(product[1].price);
                    const priceTimesQuantity = productPrice * parseInt(keyValue[1]);
                    
                    // ➡️ CAPTURA EL ID Y EL TOTAL:
                    currentProductId = product[0]; // ¡Aquí está el ID!
                    currentProductTotal = priceTimesQuantity;
                    // ------------------------------------

                    const formattedPrice = new Intl.NumberFormat('es-CO', {
                        style: 'currency',
                        currency: 'COP',
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2
                    }).format(priceTimesQuantity);
                    totalPrice += priceTimesQuantity;
                    quantityPrice = document.createElement('td');
                    quantityPrice.textContent = formattedPrice;
                    order[current].push(formattedPrice);
                    return;
                }
            });

            item.append(itemName, count, quantityPrice);
            listContainer.append(item);

            // ➡️ AÑADE EL PRODUCTO AL ARRAY TEMPORAL CON EL ID
            if (currentProductId) {
                // El campo totalPrice debe ser el valor numérico, no el formato con símbolos
                const cleanPrice = currentProductTotal; 
                tempProducts.push({
                    idProduct: currentProductId, // ⬅️ ID del producto
                    name: keyValue[0],
                    quantity: parseInt(keyValue[1]),
                    totalPrice: cleanPrice
                });
            }

            if (keyValue[0] !== "user" && keyValue[0] !== "orderNotes" && keyValue[0] !== "deliveryDate" && keyValue[0] !== "idPedido") {
                products++;
            }
        }
  });

  let finalPrice = ((15 * totalPrice) / 100) + totalPrice;
  totalPriceParagraph.textContent = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(totalPrice);
  finalPriceParagraph.textContent = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(finalPrice);

  productsCount.textContent = products;

  
  // ➡️ PREPARA EL OBJETO FINAL 'orderWithPrices'
  orderWithPrices = {
    products: tempProducts, // ⬅️ USAMOS EL ARRAY TEMPORAL CON IDs
    netCost: totalPrice, 
    total: finalPrice, 
    recargo: (15 * totalPrice) / 100 
  };

  // ➡️ ASIGNA EL RESTO DE CAMPOS DEL PEDIDO (sedes, fechas, etc.)
  order.forEach(item => {
    if (item[0] === "idPedido") {
        orderWithPrices.idPedido = item[1];
    } else if (item[0] === "user") {
        orderWithPrices.user = item[1];
    } else if (item[0] === "deliveryDate") {
        orderWithPrices.deliveryDate = item[1];
    } else if (item[0] === "orderNotes") {
        orderWithPrices.orderNotes = item[1];
    }
});

orderWithPrices.status = 'pendiente';
orderWithPrices.orderDate = new Date().toISOString();
}

//Creación de idPedido.

async function saveOrderWithConsecutiveId(pedidoData) {
    const contadorRef = doc(db, "Contadores", "idPedidos");
    const pedidosRef = collection(db, "Pedidos");
 
    try {
        await runTransaction(db, async (transaction) => {
            const contadorDoc = await transaction.get(contadorRef);
            let nuevoId;

            //throw new Error("¡Error de Transacción Forzado para Pruebas!"); Prueba de error al enviar

            if (contadorDoc.exists()) {
                const ultimoId = contadorDoc.data().ultimoId;
                nuevoId = ultimoId + 1;
         
            } else {
                nuevoId = 1500;           
            }             
            await addDoc(pedidosRef, { ...pedidoData, idPedido: nuevoId });
            transaction.set(contadorRef, { ultimoId: nuevoId });          
        });

        console.log("¡Pedido registrado con éxito con ID consecutivo!");
        return true;
    } catch (e) {
        console.error("Error al añadir el documento con ID consecutivo: ", e);
        return false;
    }
}





//Regresa a lista de productos para adicionar productos faltantes o editar orden que se encuentra en el carrito.
document.getElementById('btn_edit').addEventListener('click', function (event) {
  event.preventDefault(); // Evita el comportamiento predeterminado del botón
  history.back(); // Regresa a la página anterior sin refrescar
});





//Escucha click de confirmarción para enviar la información y obtener el idUser 

document.getElementById('btn_confirm').addEventListener('click', async function (event) {
  event.preventDefault();
  const btnConfirm = event.target; // Capturamos el botón
  
  try {
    btnConfirm.disabled = true; // Deshabilita el botón al inicio

    if (!orderWithPrices) {
      throw new Error("Error interno: No se encontró el pedido en el localStorage.");
    }

    // --- 1. Lógica para obtener el idUser de la sede ---
    const sedesRef = collection(db, "Sedes");
    const sedeNameLowerCase = orderWithPrices.user.toLowerCase();
    const q = query(sedesRef, where("name", "==", sedeNameLowerCase));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      throw new Error("Sede no encontrada en la base de datos. No se puede asignar el usuario.");
    }

    const sedeDoc = querySnapshot.docs[0];
    const idUser = sedeDoc.data().idUser;
    orderWithPrices.idUser = idUser;
    // --------------------------------------------------

    // 2. Llama a la función de guardado y ESPERA la confirmación
    // La función retorna 'true' si fue exitosa, 'false' si hubo un error en la transacción
    const success = await saveOrderWithConsecutiveId(orderWithPrices);

    if (success) {
      // ✅ ÉXITO: La transacción de Firebase terminó correctamente.
      localStorage.removeItem('order');
      localStorage.removeItem('productsInfo');
      // Redirige a la página de confirmación.
      window.location.href = 'envioOK.html'; 

    } else {
      // ❌ FALLO: La función saveOrderWithConsecutiveId reportó un error de transacción.
      throw new Error("El pedido no pudo ser enviado a Firebase debido a un fallo en la transacción. Intente de nuevo.");
    }

  } catch (error) {
    console.error("Error al procesar el pedido: ", error);

    // ⚠️ Mensaje de error visible para el usuario
    alert(`¡ERROR AL ENVIAR EL PEDIDO!\n\nDetalles: ${error.message}\n\nPor favor intente nuevamente, si el error persiste, contacte a soporte.`);
    
    // Si hay un error, el botón se habilita de nuevo
    btnConfirm.disabled = false;
  }
});


window.addEventListener('load', () => {
    document.body.classList.add('loaded');
});
