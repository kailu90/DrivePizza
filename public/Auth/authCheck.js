import { plantaDB } from '../Api/firebaseConfig.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { CargarHeader, MostrarBotonSelector } from '../Shared/components.js';
import { mostrarSkeleton, ocultarSkeleton } from '../Shared/skeleton.js';

const auth = plantaDB.auth;
const db = plantaDB.db;

// Activar skeleton si la página lo indica con data-skeleton en el body
const skeletonType = document.body.dataset.skeleton;
if (skeletonType) mostrarSkeleton(skeletonType);

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.top.location.href = "../index.html";
    } else {
        try {
            const userDoc = await getDoc(doc(db, "Usuarios", user.uid));
            if (userDoc.exists()) {
                const { sede, rol } = userDoc.data();
                const mostrarSala = rol === 'callcenter' || rol === 'callcenter-admin' || rol === 'admin';
                CargarHeader(sede, null, mostrarSala);
                if (rol === 'admin') MostrarBotonSelector();
            }
            ocultarSkeleton('contenido-principal');
            document.body.classList.add('loaded');
        } catch (error) {
            console.error("Error en authCheck:", error);
            document.body.classList.add('loaded');
        }
    }
});