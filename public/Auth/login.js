//Esta es la lógica para el logueo de los usuarios pantalla principal del sistema de DrivePizza.

import { supabase } from '../Api/supabaseConfig.js'
import { mostrarSkeleton, ocultarSkeleton } from '../Shared/skeleton.js'
import { mostrarOverlay, ocultarOverlay } from '../Shared/overlay.js'

mostrarSkeleton('login')
const login_form              = document.getElementById("login_form")
const errorMessage            = document.getElementById("login_error")
const btnCreateAccount        = document.getElementById("btn_create_account")
const btnForgotPass           = document.getElementById("btn_forgot_pass")
const registrationModal       = document.getElementById("registration_modal")
const closeRegistrationModalBtn = document.querySelector(".close_registration_modal_btn")
const forgotModal             = document.getElementById("forgot_modal")
const closeForgotModalBtn     = document.querySelector(".close_forgot_modal_btn")
const confirmationModal       = document.getElementById("confirmation_modal")
const confirmationForgotModal = document.getElementById("confirmation_forgot_modal")

const REDIRECT_ROL = {
    admin:            'selector.html',
    planta:           'Planta/dashboard.html',
    'planta-admin':   'Planta/dashboard.html',
    callcenter:       'CallCenter/callcenter-shell.html',
    'callcenter-admin': 'CallCenter/callcenter-shell.html',
    pizzeria:         'Pizzerias/pizzerias.html',
}



/***************************LÓGICA DE CREACIÓN DE USUARIO******************************/

if (btnCreateAccount) btnCreateAccount.addEventListener('click', () => registrationModal.classList.add('active'))
if (closeRegistrationModalBtn) closeRegistrationModalBtn.addEventListener('click', () => registrationModal.classList.remove('active'))

const registerForm = document.getElementById("register_form")
registerForm.addEventListener("submit", async (e) => {
    e.preventDefault()
    const username    = document.getElementById("reg_user").value.trim().toLowerCase().replace(/\s+/g, '')
    const email       = document.getElementById("reg_email").value.trim()
    const pass        = document.getElementById("reg_pass").value
    const confirmPass = document.getElementById("reg_confirm_pass").value
    const sede        = document.getElementById("reg_sede").value

    if (username.length < 5)  { displayLoginError("El usuario es muy corto."); return }
    if (pass !== confirmPass)  { displayLoginError("Las contraseñas no coinciden."); return }

    try {
        const { data: exist } = await supabase.from('usuarios').select('id').eq('username', username).limit(1)
        if (exist?.length)    { displayLoginError("Este usuario ya está tomado, intenta con otro."); return }

        const { data, error } = await supabase.auth.signUp({ email, password: pass })
        if (error) throw error

        await supabase.from('usuarios').insert({
            id: data.user.id, username, email, sede,
            rol: 'pending', active: false, status: 'pending',
        })

        await supabase.auth.signOut()
        messageConfirmation()
    } catch (error) {
        console.error("Error en el proceso:", error)
        const msg = error.message?.includes('already') ? "El correo ya existe." : (error.message || "Error en el registro.")
        displayLoginError(msg)
    }
})

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

login_form.addEventListener("submit", async (e) => {
    e.preventDefault()
    const usernameValue = document.getElementById("login_user").value.trim().toLowerCase().replace(/\s+/g, '')
    const password      = document.getElementById("login_password").value
    if (!usernameValue || !password) { displayLoginError("El usuario y la contraseña no pueden estar vacíos."); return }

    mostrarOverlay('Iniciando sesión...')
    try {
        // Si no es email, buscamos el email real por username
        let emailForAuth = usernameValue
        if (!usernameValue.includes('@')) {
            const { data: rows, error } = await supabase
                .from('usuarios').select('email').eq('username', usernameValue).limit(1)
            if (error || !rows?.length) { ocultarOverlay(); displayLoginError("El nombre de usuario no existe."); return }
            emailForAuth = rows[0].email
        }

        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email: emailForAuth, password })
        if (authError) throw authError

        const { data: perfil } = await supabase.from('usuarios').select('*').eq('id', authData.user.id).single()
        if (!perfil) { await supabase.auth.signOut(); ocultarOverlay(); displayLoginError("No se encontró perfil de usuario."); return }
        if (!perfil.active) { await supabase.auth.signOut(); ocultarOverlay(); displayLoginError("Tu cuenta está pendiente de aprobación por el administrador."); return }

        window.location.href = REDIRECT_ROL[perfil.rol] || 'index.html'
    } catch (error) {
        console.error("Error al iniciar sesión:", error)
        ocultarOverlay()
        const msg = error.message?.includes('Invalid') ? "Usuario o contraseña incorrectos."
            : error.message?.includes('many') ? "Acceso bloqueado temporalmente."
            : "Usuario o contraseña incorrectos."
        displayLoginError(msg)
    }
})

function displayLoginError(message = "Usuario o contraseña incorrectos.") {
    errorMessage.textContent = message
    errorMessage.style.display = "block"
    setTimeout(() => { errorMessage.style.display = "none" }, 5000)
}














/*************************** LÓGICA OLVIDO/CAMBIO DE CONTRASEÑA ******************************/

if (btnForgotPass) btnForgotPass.addEventListener('click', () => forgotModal.classList.add('active'))
if (closeForgotModalBtn) closeForgotModalBtn.addEventListener('click', () => forgotModal.classList.remove('active'))

const forgotForm       = document.getElementById("forgot_form")
const forgotEmailInput = document.getElementById("forgot_email")

forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault()
    const email = forgotEmailInput.value.trim()
    if (!email) { displayLoginError("Por favor, ingresa tu correo electrónico."); return }
    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email)
        if (error) throw error
        messageForgot()
        forgotForm.reset()
    } catch (error) {
        console.error("Error al enviar correo de recuperación:", error)
        displayLoginError(error.message || "Error al enviar el correo.")
    }
})

function messageForgot() {
    forgotModal.classList.remove('active')
    confirmationForgotModal.classList.add('active')
    confirmationForgotModal.onclick = (e) => { if (e.target === confirmationForgotModal) confirmationForgotModal.classList.remove('active') }
}

window.addEventListener('load', () => {
    document.body.classList.add('loaded');
    ocultarSkeleton('contenido-principal');
});









/*******************************CIERRE DE SESIÓN*************************/
export const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = "index.html"
}
window.handleLogout = handleLogout
   









