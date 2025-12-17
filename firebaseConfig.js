// Importa las funciones de Firebase que vas a usar

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Tu configuración de Firebase

const firebaseConfig = {
  apiKey: "AIzaSyDDcqQCMxDMLblX03borRuO_HiLHihyE0A",
  authDomain: "drivepizzabga2025.firebaseapp.com",
  projectId: "drivepizzabga2025",
  storageBucket: "drivepizzabga2025.firebasestorage.app",
  messagingSenderId: "17721210646",
  appId: "1:17721210646:web:911c60594f8ab962ac8237"
};


// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
