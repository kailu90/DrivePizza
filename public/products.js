// Importa las funciones de Firebase necesarias
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { db } from './firebaseConfig.js';
import { collection, getDocs, onSnapshot , query, orderBy , where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


//autenticación de usuario en products
const auth = getAuth();

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Ejecutamos las funciones y ESPERAMOS a que terminen
        // Antes de mostrar nada al usuario
        try {
            await Promise.all([
                initializeForm(user), 
                fetchProductsFromFirestore()
            ]);
            
            // SOLO cuando ambas funciones terminaron, mostramos la página
            document.body.classList.add('loaded');
            
        } catch (error) {
            console.error("Error cargando datos:", error);
            document.body.classList.add('loaded'); // Mostrar igual para que no quede negro
        }
    } else {
        window.location.href = 'index.html';
    }
});

const productForm = document.getElementById('form');

//Creación de lista de Sedes disponibles desde la BD

async function fetchSedesFromFirestore() {
  const sedesCollection = collection(db, 'Sedes');
  const q = query(sedesCollection, orderBy("name")); //Lista se ordena alfabéticamente por nombre
  
  try {
    const querySnapshot = await getDocs(q);
    const sedesData = [];
    querySnapshot.forEach((doc) => {
      sedesData.push(doc.data());
    });
    return sedesData;
  } catch (e) {
    console.error("Error al obtener las sedes: ", e);
    return [];
  }
}

const userSelect = document.getElementById('location');




// Función que inicializa el formulario de productos disponibles
async function initializeForm(currentUser) {
    const userSelect = document.getElementById('location');
    
    // 1. Traer sedes
    const sedes = await fetchSedesFromFirestore();
    
    // 2. Traer perfil de usuario (ESTO es lo que tarda)
    const usuariosRef = collection(db, 'Usuarios');
    const qUser = query(usuariosRef, where("uid", "==", currentUser.uid));
    const userSnapshot = await getDocs(qUser);
    
    let sedeAsignada = null;
    if (!userSnapshot.empty) {
        sedeAsignada = userSnapshot.docs[0].data().sede;
    }

    // 3. Limpiar y llenar el select de una vez
    userSelect.innerHTML = '<option value="" disabled>Seleccionar</option>';
    
    sedes.forEach(sede => {
        const option = document.createElement('option');
        option.value = sede.name;
        option.textContent = sede.name;
        
        // Aquí hacemos el match antes de que el usuario lo vea
        if (sedeAsignada && sede.name === sedeAsignada) {
            option.selected = true;
        }
        userSelect.appendChild(option);
    });

    if (sedeAsignada) userSelect.disabled = true;
}




//Restricción para que no puedan seleccionar fecha del día o anterior a la que se hace el pedido
const dayDeliveryInput = document.getElementById("day_delivery");
const today = new Date();
today.setDate(today.getDate() + 1);
const year = today.getFullYear();
const month = String(today.getMonth() + 1).padStart(2, '0');
const day = String(today.getDate()).padStart(2, '0');
const tomorrowDate = `${year}-${month}-${day}`;
dayDeliveryInput.min = tomorrowDate;

// Función para obtener los productos de Firestore
async function fetchProductsFromFirestore() {
  const productsContainer = document.getElementById('products-list');
  const productsCollection = collection(db, 'Productos');

  //Ordenamos los productos por nombre alfabéticamente
  const q = query(productsCollection, where("active", "==", true) , orderBy("name"));

  try {
    const querySnapshot = await getDocs(q);
    const productsData = [];

    // Recorre los documentos obtenidos y guarda los datos
    querySnapshot.forEach((doc) => {
      const productData = doc.data();
      productsData.push(productData);
    });

    // Usa la función que ya tienes para crear el formulario
    CreateProducstForm(productsData);

    // Guarda los datos en localStorage
    localStorage.setItem('productsInfo', JSON.stringify(productsData));


    // Muestro el contenedor principal
    document.body.classList.add('loaded');



  } catch (error) {
    console.error('Error al obtener los productos de Firestore:', error);
    productsContainer.innerHTML = '<li>Error al cargar los productos.</li>';
  }
}

//Se crean la lista de productos disponibles en el frontend
function CreateProducstForm(productsData) {
    const productsContainer = document.getElementById('products-list');
    
    // Limpiar solo los elementos de producto, preservando los selects de Sede/Fecha si están ahí
    const products = productsContainer.getElementsByClassName('product');
    while(products[0]) {
        products[0].parentNode.removeChild(products[0]);
    }

    productsData.forEach(product => {
        const productElement = createProductElement(product);
        productsContainer.appendChild(productElement);
    });
}

//Creación de estructura de los productos 
function createProductElement(product) {

  const li = document.createElement('li');
  li.className = 'product';

  const label = document.createElement('label');
  label.textContent = product.name;

  li.appendChild(label);

  const stock = parseInt(product.stock);
  console.log(stock);
  if (product.quantities) {
    const select = createPresentationSelect(product, stock);

    if (select) {
      li.appendChild(select);
    } else {
      const outOfStock = createOutOfStockElement();
      li.appendChild(outOfStock);
    }
  } else { // si no existe ningun tipo de presentación
    if (stock > 0) {
      const select = createRegularSelect(product);
      li.appendChild(select);
    } else {
      const outOfStock = createOutOfStockElement();
      li.appendChild(outOfStock);
    }
  }
  return li;
}



//Muestra los productos de la BD en el frontend

function createPresentationSelect(product, stock) {
  const presentations = product.quantities;
  const select = document.createElement("select");
  select.name = product.name;
  select.id = product.id_product;

  let hasOptions = false;

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Seleccione una cantidad";
  defaultOption.disabled = false;
  defaultOption.selected = true;
  select.appendChild(defaultOption);

  const dontCountStock = ['MASA x 140gr', 'MASA x 250gr', 'POLLO', 'MASA x 350gr', 'MASA x 450gr', 'MASA x 700gr'];

  if (typeof presentations === 'string') {
    const presentationsArray = presentations.split(',').map(item => parseInt(item.trim()));


    presentationsArray.forEach((presentationValue) => {
      if (dontCountStock.includes(product.name)) {
        const option = document.createElement("option");
        option.value = presentationValue;
        option.textContent = presentationValue > 1 ? `${presentationValue} ${product.measurementUnit}s` : `${presentationValue} ${product.measurementUnit}`;
        select.appendChild(option);
        hasOptions = true;
      } else if (stock >= presentationValue) {
        const option = document.createElement("option");
        option.value = presentationValue;
        option.textContent = presentationValue > 1 ? `${presentationValue} ${product.measurementUnit}s` : `${presentationValue} ${product.measurementUnit}`;
        select.appendChild(option);
        hasOptions = true;
      }
    });
  }

  return hasOptions ? select : null;
}


//Mostrar No disponible los productos sin Stock
function createOutOfStockElement() {
  const outOfStock = document.createElement('span');
  outOfStock.className = 'out-of-stock';
  outOfStock.textContent = 'No disponible';
  return outOfStock;
}

function createRegularSelect(product) {
  const select = document.createElement('select');
  select.name = product.nombre;
  select.id = product.id_producto;

  const stock = parseInt(product.stock);

  for (let i = 0; i <= stock; i++) {
    const option = document.createElement('option');
    option.value = i.toString();
    option.textContent = i.toString();
    select.appendChild(option);
  }

  return select;
}



//Guardar información del pedido en localstorage para su posteior envío
function saveOrder(data) {
  const newOrder = {};

  Array.from(data.elements).forEach(element => {
    if (element.name) {
      if (element.value !== "0" && element.value !== "") {
        const key = element.name.split('_').join(' ');
        newOrder[key] = element.value;
      }
    }
  });

  if (Object.keys(newOrder).length !== 0) {
    localStorage.setItem('order', JSON.stringify(newOrder));
  }
}



//escucha el evento submit del formulario no se ejecute, y ejecute función saveOrder
//y luego direcciona a cart.html
productForm.addEventListener('submit', async function (event) {
  event.preventDefault();

  const form = event.target;
  saveOrder(form);

  window.location.href = 'cart.html';
});