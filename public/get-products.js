//importaciones necesarias de firestone
import { db } from './firebaseConfig.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Tu función que usaremos para obtener todos los productos activos para el frontend de los pedidos (cliente)
async function fetchProductsFromFirestore() {
    try {
        const productsCollection = collection(db, 'Productos');
        const q = query(productsCollection, where("active", "==", true));
        const querySnapshot = await getDocs(q);

        const products = [];
        querySnapshot.forEach((doc) => {
            products.push({ docId: doc.id, ...doc.data() });
        });
        return products;
    } catch (e) {
        console.error("Error al obtener los productos: ", e);
        return [];
    }
}



const productsContainer = document.getElementById('productsContainer');
const productsTotalPriceCounter = document.getElementById('productsTotalPriceCounter'); // Asegúrate de que este ID existe en tu HTML
const outOfStockCounter = document.getElementById('outOfStockCounter'); // Asegúrate de que este ID existe en tu HTML

async function initializeProductDashboard() {
    const products = await fetchProductsFromFirestore();

    let totalCount = 0;
    let outOfStock = 0;
    
    // Limpia la tabla antes de llenarla
    productsContainer.innerHTML = '';

    products.forEach(product => {
        // Tu lógica para contar stock y precio
        if (product.stock === '' || product.stock === 0) {
            outOfStock++;
        }
        const priceStock = parseFloat(product.price) * Number(product.stock);
        totalCount += priceStock;

        // Lógica para crear las filas de la tabla
        const row = document.createElement('tr');
        
        const productName = document.createElement('td');
        productName.textContent = product.name;

        const category = document.createElement('td');
        category.textContent = product.category;

        const productStock = document.createElement('td');
        productStock.textContent = product.stock;

        const activeStatus = document.createElement('td');
        activeStatus.textContent = product.active ? '✅' : '❌';

        row.append(productName, category, productStock, activeStatus);

        productsContainer.append(row);
    });

    // Actualiza los contadores
    const formattedValue = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2 
    }).format(totalCount);

    if (productsTotalPriceCounter) {
      productsTotalPriceCounter.textContent = formattedValue;
    }
    if (outOfStockCounter) {
      outOfStockCounter.textContent = outOfStock;
    }
}

// Llama a la función principal para iniciar el proceso
initializeProductDashboard();