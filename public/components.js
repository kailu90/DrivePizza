    import { auth , db } from './firebaseConfig.js'; 
    import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
    import { doc, getDoc, collection, runTransaction, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
    
    window.CargarHeader = CargarHeader;

    window.addEventListener('load', () => {
        document.body.classList.add('loaded');
    });


    /*************************************VIGILANTE DE ESTADO DE AUTENTICACIÓN**************************************/
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
                    CargarHeader(sedeDesdeFirebase);
                }
            } catch (error) {
                console.error("Error al obtener la sede:", error);
            }
        }
    });

    /*******FUNCIÓN PARA CARGAR EL HEADER EN TODAS LAS VISTAS QUE LO REQUIEREN*****************/
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

        
    /*******FUNCIÓN PARA CERRAR CESIÓN EN TODAS LAS VISTAS QUE LO REQUIEREN*****************/
    const linkLogout = document.getElementById("link_logout");
        if (linkLogout) {
            linkLogout.addEventListener("click", async (e) => {
                e.preventDefault();

                const confirmar = confirm("¿Estás seguro de que quieres cerrar sesión?");
                
                if (confirmar) {
                    try {
                        console.log("Cerrando sesión en Firebase...");
                        await signOut(auth);
                    
                    } catch (error) {
                        console.error("Error al cerrar sesión:", error);
                        alert("Hubo un error al salir. Intenta de nuevo.");
                    }
                }
            });
        }
    }



/***************************** FUNCIÓN CENTRALIZADA DE INVENTARIO PARA CREACIÓN DE MOVIMIENTO Y SUMA/DESCUENTO DE STOCK************************/
export async function ejecutarTransaccionStock({
    productId,
    name,
    cantidad,
    tipo,
    referenciaId,
    notas = ""
}) {
    try {
        await runTransaction(db, async (transaction) => {
            const productRef = doc(db, "Productos", productId);
            const contadorRef = doc(db, "Contadores", "idInventory");
            const movimientoRef = doc(collection(db, "Movimientos"));

            const productSnap = await transaction.get(productRef);
            const contadorSnap = await transaction.get(contadorRef);

            if (!productSnap.exists()) throw "Producto no encontrado";
            if (!contadorSnap.exists()) throw "El contador idInventory no existe";

            // USAMOS UN NOMBRE CLARO: proximoNumero
            const ultimoNumero = contadorSnap.data().ultimoIdInventory || 0;
            const proximoNumero = ultimoNumero + 1; 

            const impacto = (tipo === 'ENTRADA') ? cantidad : -cantidad;

            // ACTUALIZACIONES
            transaction.update(productRef, { 
                stock: increment(impacto),
                ultimaActualizacion: serverTimestamp()
            });

            transaction.update(contadorRef, { 
                ultimoIdInventory: proximoNumero 
            });

            transaction.set(movimientoRef, {
                movimientoId: proximoNumero, // <--- CAMBIADO PARA EVITAR EL ERROR
                fecha: serverTimestamp(),
                tipo: tipo,
                productoId: productId,
                productoNombre: name,
                cantidad: cantidad,
                referenciaId: referenciaId,
                motivo: tipo === 'SALIDA' ? "Entrega de Pedido" : "Ingreso Manual",
                notas: notas,
                usuario: "Admin"
            });
        });
        
        return true; 
    } catch (e) {
        console.error("Error en components.js:", e);
        throw e; // Esto permite que dashboard.js sepa que falló
    }
}