import { auth } from './firebaseConfig.js'; 
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


export function CargarHeader(nombreSede) {
    const headerContainer = document.getElementById('header-container');
    console.log("Ingresé a cargar header")
    console.log("El título recibido es:", nombreSede);
    if (!headerContainer) return;

    headerContainer.innerHTML = `
    <header class="header">
        <div class="sidebar_img">
            <img src="./Imagenes/logo.png" alt="logo drive">
        </div>

        <h1 class="header-title">DrivePizza ${nombreSede}</h1>
        
        <nav class="header-menu">
            <ul class="header-list">
                <li class="header-item">
                    <button id="link_logout" class="header-link" style="cursor:pointer; font-weight:bold;">
                        Cerrar Sesión
                    </button>
                </li>
            </ul>
        </nav>
    </header>  
    `;  
 
 const linkLogout = document.getElementById("link_logout");
    if (linkLogout) {
        linkLogout.addEventListener("click", async (e) => {
            e.preventDefault();

            // Tu alert/confirm original
            const confirmar = confirm("¿Estás seguro de que quieres cerrar sesión?");
            
            if (confirmar) {
                try {
                    console.log("Cerrando sesión en Firebase...");
                    await signOut(auth);
                    // No necesitas el redireccionamiento aquí porque 
                    // el "Guardián" (onAuthStateChanged) lo hará automáticamente al detectar que user es null.
                } catch (error) {
                    console.error("Error al cerrar sesión:", error);
                    alert("Hubo un error al salir. Intenta de nuevo.");
                }
            }
        });
    }
}

window.CargarHeader = CargarHeader;

window.addEventListener('load', () => {
    document.body.classList.add('loaded');
});




/*************************************FUNCIÓN PARA CERRAR SESIÓN****************************************/
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        console.log("Acceso denegado o sesión cerrada.");
        window.location.href = "index.html";
    } else {
        //Captura de la sede
        try {
            const userDoc = await getDoc(doc(db, "Usuarios", user.uid));
            if (userDoc.exists()) {
                const sedeDesdeFirebase = userDoc.data().sede;
                CargarHeader(sedeDesdeFirebase); // Llamamos a tu función con el dato real
            }
        } catch (error) {
            console.error("Error al obtener la sede:", error);
        }
    }
});
