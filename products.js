// Importa las funciones de Firebase necesarias
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { db } from './firebaseConfig.js';
import { collection, getDocs, onSnapshot , query, orderBy , where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

// Función que inicializa el formulario
async function initializeForm(currentUser) {
    const userSelect = document.getElementById('location');

    userSelect.innerHTML = '<option value="" selected disabled>Seleccionar</option>';

    if (currentUser) {
        try {
            // Obtenemos el prefijo del correo electrónico (usuario)
            const userEmailPrefix = currentUser.email.split('@')[0];

            // Realizamos la consulta para encontrar la sede que coincida
            const sedesCollection = collection(db, 'Sedes');
            const q = query(sedesCollection, where("name", "==", userEmailPrefix));
            
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const sedeData = querySnapshot.docs[0].data();
                
                // Crea la opción de la sede del usuario
                const option = document.createElement('option');
                option.value = sedeData.name;
                option.textContent = sedeData.name;
                option.selected = true;
                userSelect.appendChild(option);
                userSelect.disabled = true;

                // Agrega las demás sedes como opciones deshabilitadas
                const allSedesQuery = query(collection(db, 'Sedes'), orderBy("name"));
                const allSedesSnapshot = await getDocs(allSedesQuery);
                allSedesSnapshot.forEach(doc => {
                    if (doc.data().name !== sedeData.name) {
                        const otherOption = document.createElement('option');
                        otherOption.value = doc.data().name;
                        otherOption.textContent = doc.data().name;
                        otherOption.disabled = true;
                        userSelect.appendChild(otherOption);
                    }
                });

            } else {
                // Si no se encuentra una sede para el usuario
                const allSedesQuery = query(collection(db, 'Sedes'), orderBy("name"));
                const allSedesSnapshot = await getDocs(allSedesQuery);
                allSedesSnapshot.forEach(doc => {
                    const option = document.createElement('option');
                    option.value = doc.data().name;
                    option.textContent = doc.data().name;
                    userSelect.appendChild(option);
                });
            }

        } catch (e) {
            console.error("Error al obtener las sedes: ", e);
            const option = document.createElement('option');
            option.textContent = 'Error al cargar sedes.';
            option.disabled = true;
            userSelect.appendChild(option);
        }
    } else {
        // Lógica para cuando no hay un usuario logueado
        console.log("No hay un usuario logueado.");
        const option = document.createElement('option');
        option.textContent = 'Debe iniciar sesión para ver las sedes.';
        option.disabled = true;
        userSelect.appendChild(option);
    }
}
// Esperamos a que la autenticación de Firebase esté lista
const auth = getAuth();
onAuthStateChanged(auth, (user) => {
    // onAuthStateChanged se asegura de que el objeto 'user' no sea null
    // y de que la autenticación haya terminado de cargar.
    initializeForm(user);
});












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

  } catch (error) {
    console.error('Error al obtener los productos de Firestore:', error);
    productsContainer.innerHTML = '<li>Error al cargar los productos.</li>';
  }
}

// Llama a la nueva función para que se ejecute
fetchProductsFromFirestore();





//Se pinta la lista de productos disponibles en el frontend
function CreateProducstForm(productsData) {
  console.log(productsData);
  const productsContainer = document.getElementById('products-list');

  const existingProducts = productsContainer.querySelectorAll('.product');
  if (existingProducts) {
    existingProducts.forEach(product => product.remove());
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