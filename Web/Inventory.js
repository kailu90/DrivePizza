//IMPORTA FUNCIONES DE LA BASE DE DATOS

import { db } from './firebaseConfig.js';
import { doc, updateDoc, increment, collection, onSnapshot, getDocs, query, orderBy , serverTimestamp, addDoc }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


const addStock = document.querySelector('.btn-add-stock');
const cancelButton = document.getElementById('btn-cancel');
const inventoryManagementStock = document.getElementById('inventory-management__stock');
const productSelect = document.getElementById('product-select');


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
            const mainElement = document.querySelector('.dashboard__main') || document.querySelector('.inventory__main');;
            const footerElement = document.querySelector('.dashboard__footer') || document.querySelector('.inventory__footer') ;
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

        })
        .catch(error => console.error('Error al cargar el sidebar:', error));
});







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



/*******************INGRESO DE STOCK AL INVENTARIO**************************/




if (addStock && cancelButton && inventoryManagementStock && productSelect) {
  
/**TRIGGER PARA MOSTRAR FORMULARIO DE INGRESO DE STOC********/


    addStock.addEventListener('click', async (event) => {
        console.log("Abriendo panel de stock...");
        event.preventDefault();
        

        // 1. Mostrar el panel (Tu lógica original)
        inventoryManagementStock.classList.remove('is-hidden');
        inventoryManagementStock.classList.add('is-visible');

        // 2. Poner el <select> en estado de carga
        productSelect.innerHTML = '<option value="">Cargando productos...</option>';
        productSelect.disabled = true;

        // 3. Cargar productos desde Firebase
        try {
            const querySnapshot = await getDocs(collection(db, "Productos"));
            
            // 4. Convertir datos
            const productsArray = querySnapshot.docs.map(doc => ({ 
              id: doc.id, 
              ...doc.data() 
            }));

            // 5. Llamar a tu función para renderizar el <select>
            renderSelectOptions(productsArray); 

            // 6. Habilitar el select
            productSelect.disabled = false;

        } catch (error) {
            console.error("Error al cargar productos: ", error);
            productSelect.innerHTML = '<option value="">Error al cargar</option>';
        }


    /******CARGA DE PROVEEDORES**** */

        loadSuppliers();

    });

    cancelButton.addEventListener('click', (event) => {
        event.preventDefault();
        console.log("entre a cancelar")
        inventoryManagementStock.classList.remove('is-visible'); 
        inventoryManagementStock.classList.add('is-hidden');
    });
      
  } else {
        console.error("No se encontró el botón de 'Agregar Stock', 'Cancelar' o el formulario de stock en el HTML.");
    
}




/*****************************CARGA PRODUCTOS PARA ADICIONAR EN EL STOCK*******************/

   function renderSelectOptions(products) {
    // La referencia a productSelect ya la tenemos globalmente
    
    console.log("Renderizando opciones del select...");
    
    // A. Limpiar el SELECT (más eficiente)
    productSelect.innerHTML = '';

    // B. Manejo de estado de carga/vacío
    if (products.length === 0) {
        const option = new Option("No hay productos disponibles 😔", "");
        option.disabled = true;
        productSelect.appendChild(option);
        return;
    }

    // C. Añadir el placeholder (opción por defecto)
    const placeholder = new Option("Selecciona un producto", "");
    placeholder.disabled = true;
    placeholder.selected = true; // Aseguramos que sea la seleccionada
    productSelect.appendChild(placeholder);

    // D. Rellenar el SELECT
    products.forEach(product => {
        // ¡OJO AQUÍ!
        // Revisa si tu campo en Firebase se llama 'name' o 'nombre'
        // Usa 'product.nombre' si es en español.
        const option = new Option(product.name, product.id); // <- Usando 'product.nombre'
        productSelect.appendChild(option);
    });

    console.log(`✅ ${products.length} productos cargados en el menú desplegable.`);
}

});





/****************ESCUCHADOR ENVIAR DATOS DEL FORMULARIO PARA ACTIVAR FUNCION DE ACTUALIZACIÓN STOCK******/

const stockForm = document.querySelector('#inventory-management__stock .form-body');
const inputQuantity = document.getElementById('quantity');
const proveedorSelect = document.getElementById('proveedor-select');
const inputObservations = document.getElementById('observations'); 
const btnEnviar = document.getElementById('btn-enviar');





if (stockForm) {
    stockForm.addEventListener('submit', handleStockSubmit);
}



/****************ACTUALIZACIÓN Y CREACIÓN REGISTRO EN BASE DE DATOS DE INVENTARIO*****/


async function handleStockSubmit(event) {
    event.preventDefault(); 

    // 1. Capturar todos los valores del formulario
    const productId = productSelect.value;
    const quantityToAdd = parseInt(inputQuantity.value, 10);
    const supplierId = proveedorSelect.value; // Captura el ID del proveedor
    const observations = inputObservations.value.trim(); // Captura y limpia las observaciones

    // 2. Validación
    if (!productId) {
        alert("Por favor, selecciona un producto.");
        return;
    }
    if (!supplierId) {
        alert("Por favor, selecciona un proveedor.");
        return;
    }
    if (isNaN(quantityToAdd) || quantityToAdd <= 0) {
        alert("Por favor, ingresa una cantidad válida mayor a cero.");
        return;
    }
    
    // 3. Feedback visual
    if(btnEnviar) {
        btnEnviar.disabled = true;
        btnEnviar.textContent = 'Procesando...';
    }

    try {
        // =======================================================
        // OPERACIÓN 1: ACTUALIZAR EL STOCK EN 'Productos'
        // =======================================================
        const productRef = doc(db, 'Productos', productId);
        await updateDoc(productRef, {
            stock: increment(quantityToAdd)
        });

        // =======================================================
        // OPERACIÓN 2: CREAR EL REGISTRO EN LA COLECCIÓN 'Inventario'
        // =======================================================
        const inventoryRef = collection(db, 'Inventario'); 
        
        await addDoc(inventoryRef, {
            // Campos principales
            date: serverTimestamp(),      
            idProduct: productId,         
            quantity: quantityToAdd,      
            transaction: 'INGRESO',           

            // Campos específicos de este ingreso
            idSupplier: supplierId,       // ⬅️ ¡Usando el ID del proveedor seleccionado!
            notes: observations || 'Sin observaciones.', // ⬅️ ¡Usando las observaciones!

            // Campos no aplicables ahora
            idInventory: null,            
            idOrder: null,                
        });

        console.log(`✅ Stock actualizado y registrado en Inventario para el producto: ${productId}`);

        alert(`¡Ingreso de stock de ${quantityToAdd} unidades registrado con éxito!`);
        
        // 4. Cerrar y resetear
        inventoryManagementStock.classList.remove('is-visible'); 
        inventoryManagementStock.classList.add('is-hidden');
        stockForm.reset(); 
        
    } catch (error) {
        console.error("❌ Error en la transacción de stock:", error);
        alert("Hubo un error al guardar el stock o el registro. Consulta la consola.");
    } finally {
        // 5. Restaurar botón
        if(btnEnviar) {
            btnEnviar.disabled = false;
            btnEnviar.textContent = 'Enviar';
        }
    }
}



/*************************CARGA DE PROVEEDORES EN FORMULARIO********/


/*********TRAER LOS PROVEEDORES DE LA BASE DE DATOS*******************/

async function loadSuppliers() {
    if (!proveedorSelect) return;

    // 1. Mostrar estado de carga
    proveedorSelect.innerHTML = '<option value="">Cargando proveedores...</option>';
    proveedorSelect.disabled = true;
    
    try {
        // 2. Obtener datos de la colección 'Proveedores'
        const suppliersSnapshot = await getDocs(collection(db, "Proveedores"));
        
        // 3. Convertir datos a un array { id, name }
        const suppliersArray = suppliersSnapshot.docs.map(doc => ({ 
            id: doc.id, 
            name: doc.data().name // 💡 Asume que el campo del nombre es 'name'
        }));

        // 4. Renderizar el <select>
        renderSupplierOptions(suppliersArray); 
        proveedorSelect.disabled = false;
        
        console.log(`✅ ${suppliersArray.length} proveedores cargados.`);

    } catch (error) {
        console.error("❌ Error al cargar proveedores:", error);
        proveedorSelect.innerHTML = '<option value="">Error al cargar proveedores</option>';
    }
}


/*********PINTAR LOS PROVEEDORES EN LISTADO DE FORMULARIO******************/

function renderSupplierOptions(suppliers) {
    proveedorSelect.innerHTML = ''; // Limpiar select
    
    // 1. Placeholder/Opción por defecto
    const placeholder = new Option("Selecciona el proveedor", "");
    placeholder.disabled = true;
    placeholder.selected = true; 
    proveedorSelect.appendChild(placeholder);

    // 2. Rellenar el SELECT
    if (suppliers.length > 0) {
        suppliers.forEach(supplier => {
            // El 'value' debe ser el ID de Firebase para el campo idSupplier
            const option = new Option(supplier.name, supplier.id); 
            proveedorSelect.appendChild(option);
        });
    } else {
        const option = new Option("No hay proveedores disponibles", "");
        option.disabled = true;
        proveedorSelect.appendChild(option);
    }
}