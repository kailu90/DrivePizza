import { plantaDB } from '../Api/firebaseConfig.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { MostrarBotonSelector } from '../Shared/components.js';

const auth = plantaDB.auth;
const db   = plantaDB.db;

const ROLES_PLANTA = ['planta', 'admin', 'planta-admin'];
const LOGIN_URL    = '../index.html';

/**
 * Verifica que el usuario tenga sesión activa y rol permitido.
 * Lee el documento de Usuarios directamente por UID (1 lectura exacta).
 *
 * @param {Function} onSuccess  Callback que recibe { uid, username, sede, rol }
 *                              Se ejecuta solo si el acceso es válido.
 * @param {string[]} [roles]    Roles permitidos. Por defecto ['planta', 'admin'].
 */
export function verificarAccesoPlanta(onSuccess, roles = ROLES_PLANTA) {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = LOGIN_URL;
            return;
        }

        try {
            const userDoc = await getDoc(doc(db, 'Usuarios', user.uid));

            if (!userDoc.exists()) {
                window.location.href = LOGIN_URL;
                return;
            }

            const { username, sede, rol } = userDoc.data();

            if (!roles.includes(rol)) {
                window.location.href = LOGIN_URL;
                return;
            }

            onSuccess({
                uid:      user.uid,
                username: username || user.email,
                sede,
                rol,
            });

            if (rol === 'admin') MostrarBotonSelector();

        } catch (error) {
            console.error('plantaAuth — error verificando acceso:', error);
            window.location.href = LOGIN_URL;
        }
    });
}
