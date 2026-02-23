// firebaseConfig.js
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Importamos el objeto centralizado
import { config } from "./config.js";

/**
 * Función para inicializar o recuperar una instancia de Firebase
 * @param {Object} firebaseSettings - Configuración del módulo
 * @param {string} appName - Nombre único del módulo
 */
const initFirebase = (firebaseSettings, appName) => {
    // Verificamos si la app ya fue inicializada para no duplicarla
    const app = !getApps().some(app => app.name === appName) 
                ? initializeApp(firebaseSettings, appName) 
                : getApp(appName);
    
    return {
        db: getFirestore(app),
        auth: getAuth(app)
    };
};

// Inicializamos los módulos
export const plantaDB = initFirebase(config.plantaDB, "planta");
export const callCenterDB = initFirebase(config.callCenterDB, "callCenter");