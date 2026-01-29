//IMPORTA FUNCIONES DE LA BASE DE DATOS

import { db } from './firebaseConfig.js';
import { runTransaction, doc, updateDoc, increment, collection, onSnapshot, getDocs, query, orderBy , serverTimestamp, addDoc , where }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ejecutarTransaccionStock } from './components.js';

const addStock = document.querySelector('.btn-add-stock');
const cancelButton = document.getElementById('btn-cancel');
const inventoryManagementStock = document.getElementById('inventory-management__stock');
const productSelect = document.getElementById('product-select');







/****************TRAE TODOS LOS PRODUCTOS DE LA BASE DE DATOS************/
document.addEventListener("DOMContentLoaded", function() {  

    const productsContainer = document.getElementById('productsContainer');
    const totalValueCounter = document.getElementById('total-value-counter');
    const outOfStockCounter = document.getElementById('out-of-stock-counter');
    const totalProductsCounter = document.getElementById('incoming-orders');
    


    function listenForProducts(sortOrder = 'asc') {
    const productsRef = collection(db, "Productos");
    const q = query(productsRef, orderBy("name", sortOrder));
    
    /************FORMATEAR COMO MONEDA************************/
    
    const formatter = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0
    });

    onSnapshot(q, (querySnapshot) => {
        productsContainer.innerHTML = '';
        let totalValue = 0;
        let outOfStock = 0;
        let totalProducts = 0; 
        
        querySnapshot.forEach((doc) => {
            const product = doc.data();


         /**************************CONTADORES*******************/

          const totalProductValue = product.stock * product.price;
          totalValue += totalProductValue;              
          totalProducts++;       

          if (product.stock === 0) {
            outOfStock++;
          }  
           
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="inventory-management__cell">${product.idProduct}</td>
                <td class="inventory-management__cell">${product.name}</td>
                <td class="inventory-management__cell">${product.measurementUnit}</td>
                <td class="inventory-management__cell">${product.stock}</td>
                <td class="inventory-management__cell">${formatter.format(product.price)}</td>
                <td class="inventory-management__cell">${formatter.format(totalProductValue)}</td>
                <td class="inventory-management__cell">
                    <button class="action-button edit-button">Editar</button>                   
                </td>
            `;
            productsContainer.appendChild(row);
        });

        /*******************ACTUALIZAR CONTADORES PEDIDOS EN EL HTML**************************/
   

      if (totalValueCounter) {
        totalValueCounter.textContent = formatter.format(totalValue);
      }
      if (outOfStockCounter) {
        outOfStockCounter.textContent = outOfStock;
      }
      if (totalProductsCounter) {
        totalProductsCounter.textContent = totalProducts;
      }    

    });
  
  }
    listenForProducts();







/*********************************FUNCIÓN PARA INGRESO DE STOCK***************************/


const modal = document.getElementById("modal-stock");
const btnOpen = document.getElementById("btn-add-stock");
const btnCancel = document.getElementById("btn-cancel");
const btnCloseX = document.getElementById("btn-close-x");

// Abrir modal
btnOpen.addEventListener("click", () => {
    console.log("se ingresa a abrir modal ingreso Stock")
    modal.style.display = "block";
    obtenerProductosParaStock();
    obtenerProveedoresParaStock();
});

// Función para cerrar modal
const closeModal = () => {
    console.log("se ingresa a cerrar modal ingreso Stock")
    modal.style.display = "none";
    document.getElementById("form-stock").reset(); // Limpia el formulario al cerrar
};

btnCancel.addEventListener("click", closeModal);
btnCloseX.addEventListener("click", closeModal);

// Cerrar si hacen clic fuera de la caja blanca
window.addEventListener("click", (event) => {
    if (event.target == modal) {
        closeModal();
    }
});


const productStock = document.getElementById("product-select");
const supplierStock = document.getElementById("supplier-select");
const quantityStock = document.getElementById("stock-quantity");
const observationStock  = document.getElementById("stock-observation");

/*************Obtener listado de los productos disponibles*************/

async function obtenerProductosParaStock() {
    try {
        console.log("Ingresé a obtener lista de productos activos")
        // 1. Referencia y Consulta
        const productosRef = collection(db, "Productos");
        const q = query(productosRef, where("active", "==", true), orderBy("name", "asc"));
        
        // 2. Ejecución
        const querySnapshot = await getDocs(q);
        
        // 3. Limpiar el select antes de llenar (evita duplicados)
        productStock.innerHTML = '<option value="" disabled selected>Selecciona un producto</option>';

        // 4. Mapeo de datos
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const option = document.createElement("option");
            option.value = doc.id; // Guardamos el ID de Firebase como valor
            option.textContent = data.name; // Mostramos el nombre al usuario
            productStock.appendChild(option);
        });

        console.log("Productos cargados en el modal.");
    } catch (error) {
        console.error("Error al cargar productos:", error);
    }
}


/*************Obtener listado de los proveedores disponibles*************/


async function obtenerProveedoresParaStock() {
    try {
        console.log("Ingresé a obtener lista de proveedores")
        // 1. Referencia y Consulta
        const proveedoresRef = collection(db, "Proveedores");
        const q = query(proveedoresRef , orderBy("name", "asc"));
        
        // 2. Ejecución
        const querySnapshot = await getDocs(q);
        
        // 3. Limpiar el select antes de llenar (evita duplicados)
        supplierStock.innerHTML = '<option value="" disabled selected>Selecciona un proveedor</option>';
        // 4. Mapeo de datos
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const option = document.createElement("option");
            option.value = doc.id; // Guardamos el ID de Firebase como valor
            option.textContent = data.name; // Mostramos el nombre al usuario
            supplierStock.appendChild(option);
        });

        console.log("Proveedores cargados en el modal.");
    } catch (error) {
        console.error("Error al cargar proveedores:", error);
    }
}



});







/****************ESCUCHADOR ENVIAR DATOS DEL FORMULARIO PARA ACTIVAR FUNCION DE ACTUALIZACIÓN STOCK******/

const stockForm = document.getElementById('form-stock');
const inputQuantity = document.getElementById('stock-quantity');
const proveedorSelect = document.getElementById('supplier-select');
const inputObservations = document.getElementById('stock-observation'); 
const btnEnviar = document.getElementById('btn-enviar');
const modalStock = document.getElementById('modal-stock');

if (stockForm) {
    stockForm.addEventListener('submit', handleStockSubmit);
}

/****************ACTUALIZACIÓN Y CREACIÓN REGISTRO EN BASE DE DATOS DE INVENTARIO*****/
async function handleStockSubmit(event) {
    event.preventDefault();

    // 1. Capturar IDs y Nombres desde el formulario
    const productId = productSelect.value;
    const supplierId = proveedorSelect.value;
    const quantityToAdd = parseInt(inputQuantity.value, 10);
    const observations = inputObservations.value.trim();

    const productName = productSelect.options[productSelect.selectedIndex].text;
    const supplierName = proveedorSelect.options[proveedorSelect.selectedIndex].text;

    if (!productId || !supplierId || isNaN(quantityToAdd) || quantityToAdd <= 0) {
        alert("Completa los campos correctamente.");
        return;
    }

    if (btnEnviar) {
        btnEnviar.disabled = true;
        btnEnviar.textContent = 'Procesando...';
    }

    let nuevoIdNumero = 0;

    try {
        // --- TRANSACCIÓN PARA ASEGURAR EL ID CORRELATIVO ---
        await runTransaction(db, async (transaction) => {
            
            // A. Referencia al documento exacto: Colección 'Contadores', Documento 'IdInventory'
            const contadorRef = doc(db, "Contadores", "idInventory");
            const contadorSnap = await transaction.get(contadorRef);

            if (!contadorSnap.exists()) {
                throw "El documento de contador 'idInventory' no existe en Firebase.";
            }

            // B. Obtener el valor del campo exacto: 'ultimoIdInventory'
            const dataContador = contadorSnap.data();
            const idActual = dataContador.ultimoIdInventory || 0;

            nuevoIdNumero = idActual + 1;

            // C. Referencias para las actualizaciones
            const productRef = doc(db, 'Productos', productId);
            const nuevoMovimientoRef = doc(collection(db, 'Movimientos')); // Crea un nuevo ID de documento aleatorio

            // D. Ejecutar las actualizaciones atómicas
            
            // 1. Actualizar el contador con el nuevo número
            transaction.update(contadorRef, { ultimoIdInventory: nuevoIdNumero });

            // 2. Actualizar el stock del producto
            transaction.update(productRef, { 
                stock: increment(quantityToAdd),
                ultimaActualizacion: serverTimestamp()
            });

            // 3. Crear el registro en 'Movimientos' con el ID correlativo
            transaction.set(nuevoMovimientoRef, {
                movimientoId: nuevoIdNumero, // El número secuencial (ej: 1, 2, 3...)
                fecha: serverTimestamp(),
                tipo: 'ENTRADA',
                productoId: productId,
                productoNombre: productName,
                proveedorId: supplierId,
                proveedorNombre: supplierName,
                cantidad: quantityToAdd,
                motivo: 'Ingreso Manual Stock',
                notas: observations || 'Sin observaciones.',
                usuario: "Admin"
            });
        });

        alert(`✅ Ingreso exitoso.N° ${nuevoIdNumero}\n\n${productName}\n${quantityToAdd} unidades`);
        
        stockForm.reset();
        if (modalStock) modalStock.style.display = "none";


    } catch (error) {
        console.error("❌ Error en la transacción:", error);
        alert("Error: " + error);
    } finally {
        if (btnEnviar) {
            btnEnviar.disabled = false;
            btnEnviar.textContent = 'Enviar';
        }
    }
}







/*********************************FUNCIÓN PARA CREACIÓN DE PRODUCTO**************************/

const modalCreate = document.getElementById("modal-create-product");
const btnOpenCreate = document.getElementById("btn-create-product");
const btnCancelCreate = document.getElementById("btn-cancel-create");
const btnCloseXCreate = document.getElementById("btn-close-x-create");

// Abrir modal creación producto
btnOpenCreate.addEventListener("click", () => {
    console.log("se ingresa a abrir modal creación producto")
    modalCreate.style.display = "block";
    obtenerProveedoresParaCreate();
    obtenerCategoriasCreate();
});

// Cerrar modal creación producto
const closeModalCreate = () => {
    console.log("se ingresa a cerrar modal ingreso Stock")
    modalCreate.style.display = "none";
    document.getElementById("form-stock").reset(); // Limpia el formulario al cerrar
};

btnCancelCreate.addEventListener("click", closeModalCreate);
btnCloseXCreate.addEventListener("click", closeModalCreate);




/*******Obtener los proveedores de firebase************/

const suppliersList = document.getElementById("suppliers-list");

async function obtenerProveedoresParaCreate() {
    try {
        console.log("Ingresé a obtener lista de proveedores")
        // 1. Referencia y Consulta
        const proveedoresRef = collection(db, "Proveedores");
        const q = query(proveedoresRef, orderBy("name", "asc"));
        
        // 2. Ejecución
        const querySnapshot = await getDocs(q);
        
        // Referencia al datalist
       
        suppliersList.innerHTML = ''; // Limpiar opciones anteriores

        // 4. Mapeo de datos
        querySnapshot.forEach((doc) => {
        const data = doc.data();
        
        // Validamos que el nombre exista para evitar el 'undefined'
        if (data.name) {
            const option = document.createElement("option");
            
            // 1. Asignamos el nombre al value (esto es lo que el usuario ve y busca)
            option.value = data.name; 
            
            // 2. IMPORTANTE: Deja el textContent vacío o igual al nombre 
            // para que no aparezca el subtítulo 'undefined'
            option.textContent = ""; 

            suppliersList.appendChild(option);
        }
    });

        console.log("Proveedores cargados en el modal.");
    } catch (error) {
        console.error("Error al cargar proveedores:", error);
    }
}


/*****Obtener las categorias de firebase****************/

const categoryList = document.getElementById("category-list");

async function obtenerCategoriasCreate() {
    try {
        console.log("Ingresé a obtener lista de categorias")
        // 1. Referencia y Consulta
        const categoriasRef = collection(db, "Categorias");
        const q = query(categoriasRef, orderBy("name", "asc"));
        
        // 2. Ejecución
        const querySnapshot = await getDocs(q);
        
        // 3. Limpiar el select antes de llenar (evita duplicados)
        categoryList.innerHTML = '';
        // 4. Mapeo de datos
        querySnapshot.forEach((doc) => {
            const data = doc.data();

        if (data.name) {
            const option = document.createElement("option");
            
            // 1. Asignamos el nombre al value (esto es lo que el usuario ve y busca)
            option.value = data.name; 
            
            // 2. IMPORTANTE: Deja el textContent vacío o igual al nombre 
            // para que no aparezca el subtítulo 'undefined'
            option.textContent = ""; 

            categoryList.appendChild(option);
        }
    });

        console.log("Categorias cargadas en el modal.");
    } catch (error) {
        console.error("Error al cargar categorias:", error);
    }
}





/*****************************REGISTRO DE TRANSACCIÓN (ENTRADA) EN LA COLECCIÓN MOVIMIENTOS DE FIREBASE**************************/
const operacionExitosa = await ejecutarTransaccionStock({
    productId: idSeleccionado,
    productNombre: nombreSeleccionado,
    cantidad: cant,
    tipo: 'ENTRADA',
    proveedor: { id: idProv, nombre: nomProv },
    referenciaId: 'INGRESO_MANUAL'
});