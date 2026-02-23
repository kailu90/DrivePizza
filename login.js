//Esta es la lógica para el logueo de los usuarios pantalla principal del sistema de DrivePizza.

//Importa las funciones necesarias del SDK de Firebase
import { plantaDB } from './firebaseConfig.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut , getAuth} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp, query, collection, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

//Definición de las variables necesarias.
const auth = plantaDB.auth;//puente para la variable 'auth' que usa tu lógica de login
const db = plantaDB.db;
const login_form = document.getElementById("login_form");
const errorMessage = document.getElementById("login_error");
const btnCreateAccount = document.getElementById("btn_create_account");
const btnForgotPass = document.getElementById("btn_forgot_pass");
const registrationModal = document.getElementById("registration_modal");
const closeRegistrationModalBtn = document.querySelector(".close_registration_modal_btn");
const forgotModal = document.getElementById("forgot_modal");
const closeForgotModalBtn = document.querySelector(".close_forgot_modal_btn");
const confirmationModal = document.getElementById("confirmation_modal");
const confirmationForgotModal = document.getElementById("confirmation_forgot_modal");






console.log("Intentando login en el proyecto:", plantaDB.db.app.options.projectId);


/***************************LÓGICA DE CREACIÓN DE USUARIO******************************/

//En esta función escuchamos el evento click del botón "crear cuenta", para abrir modal de registro de un usuario nuevo.
if (btnCreateAccount) {
    btnCreateAccount.addEventListener('click', openRegistrationModal);
}
function openRegistrationModal() {
    console.log("Ingresé a función crear cuenta")
    registrationModal.classList.add('active');
}

//En esta función escuchamos el evento submit del botón "request_confirmation_modal_btn" del registration_modal, para abrir modal de registro.
const registerForm = document.getElementById("register_form");

registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Captura de datos
    const username = document.getElementById("reg_user").value.trim().toLowerCase().replace(/\s+/g, '');
    const email = document.getElementById("reg_email").value;
    const pass = document.getElementById("reg_pass").value;
    const confirmPass = document.getElementById("reg_confirm_pass").value;

    // Confirmar si el usuario es muy corto
    if (username.length < 5) {
    displayLoginError("El usuario es muy corto.");
    return;
    }

    // Consultar si existe
    const q = query(collection(db, "Usuarios"), where("username", "==", username));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
    displayLoginError("Este usuario ya está tomado, intenta con otro.");
    return;
    }


    // Validación de password que sean iguales.
    if (pass !== confirmPass) {
        displayLoginError("Las contraseñas no coinciden.");
        return;
    }

    try {
        console.log("Iniciando proceso de verificación y registro en Firebase...");

        const q = query(collection(db, 'Usuarios'), where("username", "==", username));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            displayLoginError("El nombre de usuario ya está en uso.");
            return;
        }
        
        //Creación de usuario en la BD con auth de firebase.
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const uid = userCredential.user.uid;
        const sedeValue = document.getElementById("reg_sede").value;

        //Crear documento en Firestore dentro de la colección Usuarios.
        await setDoc(doc(db, 'Usuarios', uid), {
            uid: uid,
            username: username,
            email: email,
            sede: sedeValue,
            rol: 'pending',
            active: false,
            status: 'pending',
            createdAt: serverTimestamp()
        });

        //Cerramos sesión, para que no entre automáticamente y espere aprobación del administrador.
        await auth.signOut();

        //Mensaje de confirmación de registro en la BD exitoso.
        console.log("Registro exitoso en BD. Activando modal de confirmación.");
        messageConfirmation();

    } catch (error) {
        console.error("Error en el proceso:", error);
        //Mensaje de posible error que se presente.
        const msg = error.code === 'auth/email-already-in-use' ? "El correo ya existe." : error.message;
        displayLoginError(msg);
    }
});

//En esta función escuchamos el evento click del botón "Cancelar" de registration modal para cerrar modal.
if (closeRegistrationModalBtn) {
    closeRegistrationModalBtn.addEventListener('click', closeRegistrationModal);
}
function closeRegistrationModal() {
   console.log("Cerré modal de registro")
   registrationModal.classList.remove('active');
}

//En esta función escuchamos la respuesta de la BD de firestores, cuando se crea el usuario en colección, para abrir modal de confirmación.
function messageConfirmation () {
   console.log("Envio mensaje confirmación Registro exitoso");
   registrationModal.classList.remove('active');
   confirmationModal.classList.add('active');

    confirmationModal.addEventListener('click', (event) => {
  
    //En esta función escuchamos el evento click en el contenedor PADRE (el fondo), para cerrar el modal de confirmación.
    if (event.target === confirmationModal) {
        confirmationModal.classList.remove('active');
        console.log("Clic fuera del contenido: Modal cerrado.");
    }
}); 
}











/***************************LÓGICA DE AUTENTICACIÓN EN LOGIN******************************/

//En esta función escuchamos el evento submit y enviamos los datos de login y password a la BD.
login_form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const usernameValue = document.getElementById("login_user").value.trim().toLowerCase().replace(/\s+/g, '');
    const password = document.getElementById("login_password").value;
    let emailForAuth = usernameValue;


    if (!usernameValue || !password) {
        displayLoginError("El usuario y la contraseña no pueden estar vacíos.");
        return;
    }

    try {
        // Si no es un email (no contiene @), buscamos el alias en Firestore
        if (!usernameValue.includes('@')) {
            const q = query(collection(db, "Usuarios"), where("username", "==", usernameValue));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                console.log("nombre de usuario no existe")
                displayLoginError("El nombre de usuario no existe.");
                return;
            }

            // Obtenemos el email real vinculado a ese username
            emailForAuth = querySnapshot.docs[0].data().email;
        }

        //Autenticación en Firebase con Auth.
        const userCredential = await signInWithEmailAndPassword(auth, emailForAuth , password);
        const user = userCredential.user;
        
        //Obtener el documento del usuario de la colección "Usuarios"
        const userDoc = await getDoc(doc(db, "Usuarios", user.uid));

        if (userDoc.exists()) {
            const userData = userDoc.data();

            //Acá confirmamos si el usuario creado en firestore ha sido activado por el administrador.
            if (userData.active !== true) {
                // Si no está activo, cerramos la sesión que Firebase abrió automáticamente
                await auth.signOut(); 
                displayLoginError("Tu cuenta está pendiente de aprobación por el administrador.");
                return;
            }
     

            //Lógica de Redirección (solo si pasó la validación de 'active')
            if (userData.rol === 'admin') window.location.href = 'dashboard.html';
            else if (userData.rol === 'planta') window.location.href = 'dashboard.html';
            else if (userData.rol === 'callcenter') window.location.href = 'callcenter.html';
            else if (userData.rol === 'pizzeria') window.location.href = 'pizzerias.html';

        } else {
            // El usuario existe en Auth pero no en la colección Usuarios
            await auth.signOut();
            displayLoginError("No se encontró información de perfil para este usuario.");
        }

    } catch (error) {
        console.error("Error al iniciar sesión:", error.code);
        let userMessage = "Usuario o contraseña incorrectos.";
        if (error.code === 'auth/too-many-requests') {
             userMessage = "Acceso bloqueado temporalmente.";
        }
        displayLoginError(userMessage);
    }
});
//Esta función muestra mensaje de error cuando se ingresan credenciales en el login que no coinceden con las de la BD.
 function displayLoginError(message = "Usuario o contraseña incorrectos") {
 
    errorMessage.textContent = message;    
    errorMessage.style.display = "block"; 
    
    //Este mensaje se oculta después de 5 segundos.
    setTimeout(() => {       
        errorMessage.style.display = "none";
    }, 5000);
}














/*************************** LÓGICA OLVIDO/CAMBIO DE CONTRASEÑA ******************************/

const forgotForm = document.getElementById("forgot_form"); 
const forgotEmailInput = document.getElementById("forgot_email");

forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();


    //validación si el campo mail cumple con los requisitos mínimos.



    const email = forgotEmailInput.value.trim();

    if (!email) {
        displayLoginError("Por favor, ingresa tu correo electrónico.");
        return;
    }

    try {
        console.log("Iniciando solicitud de restablecimiento para:", email);
        
        //Llamada a Firebase
        await sendPasswordResetEmail(auth, email);

        //Feedback de éxito
        console.log("Correo de restablecimiento enviado con éxito.");
        messageForgot();

        //Cerrar el modal y limpiar el formulario
        forgotForm.reset();

    } catch (error) {
        console.error("Error al enviar correo de recuperación:", error.code);
        let mensajeError = "";
        
        // Manejo de errores específicos
        if (error.code === 'auth/user-not-found') {
            mensajeError = "No existe una cuenta con este correo electrónico.";
        } else if (error.code === 'auth/invalid-email') {
            mensajeError = "El formato del correo electrónico no es válido.";
        } else if (error.code === 'auth/too-many-requests') {
            mensajeError = "Demasiadas solicitudes. Inténtalo más tarde.";
        } else {
           
            if (mensajeError) {
            displayLoginError(mensajeError);
            }
        }       
    }
});

//En esta función escuchamos el evento click del botón "olvide contraseña" para abrir modal de olvido de contraseña.
if (btnForgotPass) {
    btnForgotPass.addEventListener('click', forgotPassword);
}
function forgotPassword() {
    console.log("Ingresé a función olvidé contraseña")
    forgotModal.classList.add('active');
}


//En esta función escuchamos el evento click del botón "Cancelar" del modal forgot para cerrarlo.
if (closeForgotModalBtn) {
    closeForgotModalBtn.addEventListener('click', closeForgotModal);
}
function closeForgotModal() {
   console.log("Cerré modal de registro")
   forgotModal.classList.remove('active');
}

//En esta función escuchamos el evento click del botón "Solicitar cambio" de forgot Modal para enviar mensaje de confirmación modal.
function messageForgot() {
    console.log("Envio mensaje forgot ok");
    forgotModal.classList.remove('active');
    confirmationForgotModal.classList.add('active');

    // Usar .onclick en lugar de addEventListener evita acumular funciones en memoria
    confirmationForgotModal.onclick = (event) => {
        if (event.target === confirmationForgotModal) {
            confirmationForgotModal.classList.remove('active');
            console.log("Modal cerrado.");
        }
    };
}

window.addEventListener('load', () => {
    document.body.classList.add('loaded');
});









/*******************************CIERRE DE SESIÓN*************************/
    export const handleLogout = async () => {
        try {
            await signOut(auth);
            console.log("Sesión cerrada correctamente");
            window.location.href = "index.html"; // Redirigir al login
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
            alert("No se pudo cerrar la sesión, intenta de nuevo.");
        }
    };    

   window.handleLogout = handleLogout;
   









