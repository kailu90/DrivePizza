//Lógica para el logueo de los usuarios pantalla principal.

//Importa las funciones necesarias del SDK de Firebase
import { auth, db } from './firebaseConfig.js';
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Definición de Variables
const DOMINIO_USUARIO = "@pedidosdrive.com";
const login_form = document.getElementById("login_form");
const errorMessage = document.getElementById("login_error");
const btnCreateAccount = document.getElementById("btn_create_account")
const btnForgotPass = document.getElementById("btn_forgot_pass")
const registrationModal = document.getElementById("registration_modal")
const closeRegistrationModalBtn = document.querySelector(".close_registration_modal_btn");
const forgotModal = document.getElementById("forgot_modal")
const closeForgotModalBtn = document.querySelector(".close_forgot_modal_btn");

//Escuchar el evento para abrir modal de registro nuevo.
if (btnCreateAccount) {
    btnCreateAccount.addEventListener('click', openRegistrationModal);
}
function openRegistrationModal() {
    console.log("Ingresé a función crear cuenta")
    registrationModal.classList.add('active');
}

//Escuchar el clic en el botón "Cancelar" de registration modal para cerrar modal.
if (closeRegistrationModalBtn) {
    closeRegistrationModalBtn.addEventListener('click', closeRegistrationModal);
}
function closeRegistrationModal() {
   console.log("Cerré modal de registro")
   registrationModal.classList.remove('active');
}


//Escuchar el evento para abrir modal de olvido de contraseña.
if (btnForgotPass) {
    btnForgotPass.addEventListener('click', forgotPassword);
}
function forgotPassword() {
    console.log("Ingresé a función olvidé contraseña")
    forgotModal.classList.add('active');
}
//Escuchar el clic en el botón "Cancelar" de forgot Modal para cerrar modal.
if (closeForgotModalBtn) {
    closeForgotModalBtn.addEventListener('click', closeForgotModal);
}
function closeForgotModal() {
   console.log("Cerré modal de Forgot")
   forgotModal.classList.remove('active');
}



//Función muestra mensaje de error por las credenciales ingresadas en el login.
 function displayLoginError(message = "Usuario o contraseña incorrectos") {
 
    errorMessage.textContent = message;    
    errorMessage.style.display = "block"; 
    
    //Ocultar el mensaje después de 5 segundos (5000 milisegundos)
    setTimeout(() => {       
        errorMessage.style.display = "none";
    }, 5000);
}




//Escuchar el evento de envío del formulario
login_form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("login_user").value;
    const password = document.getElementById("login_password").value;
    const email = `${username}${DOMINIO_USUARIO}`;


    //validación que los campos no estén vacios
    if (!username || !password) {
        console.log("ingresé a campos vacios")
        displayLoginError("El usuario y la contraseña no pueden estar vacíos.");
        return; // Detiene la ejecución si hay campos vacíos
    }

    try {
        // Lógica de autenticación de Firebase
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        console.log("Sesión iniciada con éxito para:", email);

        // Lógica de Redirección (rol admin/user)
        const userDoc = await getDoc(doc(db, "Usuarios", user.uid));

        if (userDoc.exists() && userDoc.data().rol === 'admin') {
            window.location.href = "dashboard.html"; 
        } else {
            window.location.href = "products.html";
        }

    } catch (error) {
        // Si hay un error de Firebase:
        console.error("Error al iniciar sesión:", error.code);
        
        // Determinar el mensaje de error
        let userMessage = "Usuario o contraseña incorrectos.";
        if (error.code === 'auth/too-many-requests') {
             userMessage = "Acceso bloqueado temporalmente por demasiados intentos fallidos.";
        }
        
        // Usamos la función para mostrar el mensaje temporal
        displayLoginError(userMessage);
    }
});
