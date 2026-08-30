//Esta es la lógica para el logueo de los usuarios pantalla principal del sistema de DrivePizza.

import { supabase } from '../Api/supabaseConfig.js'
import { mostrarSkeleton, ocultarSkeleton } from '../Shared/skeleton.js'
import { mostrarOverlay, ocultarOverlay } from '../Shared/overlay.js'
import { getSedes } from '../Shared/sedesService.js'

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
    gastrofusion:     'Pizzerias/pizzerias.html',
}



/***************************LÓGICA DE CREACIÓN DE USUARIO******************************/

// ── Registro: ciudad → sede dinámica ────────────────────────────────────────
let _regInited = false;
let _regCiudad = 'bucaramanga';
let _regSedes  = [];

// Sedes operativas que no están en la tabla sedes (solo Bucaramanga)
const _SEDES_ESPECIALES_BGA = [
    { value: 'planta',      label: 'Planta de Producción', grupo: 'Operaciones Centrales' },
    { value: 'callcenter',  label: 'Callcenter',           grupo: 'Operaciones Centrales' },
];

async function _initRegForm() {
    if (!_regInited) {
        _regSedes = await getSedes();
        document.getElementById('reg_ciudad')?.addEventListener('change', e => {
            _regCiudad = e.target.value;
            document.getElementById('reg_sede').value = '';
            _renderRegSedes();
        });
        _regInited = true;
    }
    _regCiudad = '';
    document.getElementById('reg_ciudad').value = '';
    const _selSede = document.getElementById('reg_sede');
    _selSede.innerHTML = '<option value="" disabled selected>Selecciona tu sede</option>';
}

function _renderRegSedes() {
    const sel = document.getElementById('reg_sede');
    if (!sel || !_regCiudad) return;
    sel.innerHTML = '<option value="" disabled selected>Selecciona tu sede</option>';

    if (_regCiudad === 'bucaramanga') {
        const og = document.createElement('optgroup');
        og.label = 'Operaciones Centrales';
        _SEDES_ESPECIALES_BGA.forEach(({ value, label }) => {
            const o = document.createElement('option');
            o.value = value; o.textContent = label;
            og.appendChild(o);
        });
        sel.appendChild(og);
    }

    const eventos = _regSedes.filter(s => s.ciudad?.toLowerCase() === _regCiudad && s.name.toLowerCase() === 'gastrofusion');
    if (eventos.length) {
        const og = document.createElement('optgroup');
        og.label = 'Eventos';
        eventos.forEach(s => {
            const o = document.createElement('option');
            o.value = s.name.toLowerCase(); o.textContent = s.name;
            og.appendChild(o);
        });
        sel.appendChild(og);
    }

    const pizzerias = _regSedes.filter(s => s.ciudad?.toLowerCase() === _regCiudad && s.name.toLowerCase() !== 'gastrofusion');
    if (pizzerias.length) {
        const og = document.createElement('optgroup');
        og.label = 'Pizzerías';
        pizzerias.forEach(s => {
            const o = document.createElement('option');
            o.value = s.name.toLowerCase(); o.textContent = s.name;
            og.appendChild(o);
        });
        sel.appendChild(og);
    }
}

if (btnCreateAccount) btnCreateAccount.addEventListener('click', () => {
    registrationModal.classList.add('active');
    _initRegForm();
})
if (closeRegistrationModalBtn) closeRegistrationModalBtn.addEventListener('click', () => registrationModal.classList.remove('active'))

const registerForm = document.getElementById("register_form")
registerForm.addEventListener("submit", async (e) => {
    e.preventDefault()
    const username    = document.getElementById("reg_user").value.trim().toLowerCase().replace(/\s+/g, '')
    const email       = document.getElementById("reg_email").value.trim()
    const pass        = document.getElementById("reg_pass").value
    const confirmPass = document.getElementById("reg_confirm_pass").value
    const sede        = document.getElementById("reg_sede").value
    const ciudad      = document.getElementById("reg_ciudad").value

    if (username.length < 5)  { displayLoginError("El usuario es muy corto."); return }
    if (pass !== confirmPass)  { displayLoginError("Las contraseñas no coinciden."); return }

    try {
        const { data: exist } = await supabase.from('usuarios').select('id').eq('username', username).limit(1)
        if (exist?.length)    { displayLoginError("Este usuario ya está tomado, intenta con otro."); return }

        const { data, error } = await supabase.auth.signUp({ email, password: pass })
        if (error) throw error

        await supabase.from('usuarios').insert({
            id: data.user.id, username, email, sede, ciudad,
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
        const redirectTo = window.location.origin + window.location.pathname
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
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


/*************************** MANEJO DE RECUPERACIÓN DE CONTRASEÑA ******************************/

const resetModal             = document.getElementById("reset_modal")
const confirmationResetModal = document.getElementById("confirmation_reset_modal")
const resetForm              = document.getElementById("reset_form")

// Supabase detecta automáticamente el token de recuperación en el hash de la URL
// y dispara este evento con type='PASSWORD_RECOVERY'
supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
        resetModal.classList.add('active')
    }
})

resetForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const newPass     = document.getElementById("reset_pass").value
    const confirmPass = document.getElementById("reset_confirm_pass").value
    if (newPass !== confirmPass) { displayLoginError("Las contraseñas no coinciden."); return }
    if (newPass.length < 6)     { displayLoginError("La contraseña debe tener al menos 6 caracteres."); return }
    try {
        const { error } = await supabase.auth.updateUser({ password: newPass })
        if (error) throw error
        resetModal.classList.remove('active')
        resetForm.reset()
        confirmationResetModal.classList.add('active')
        confirmationResetModal.onclick = (e) => { if (e.target === confirmationResetModal) confirmationResetModal.classList.remove('active') }
        await supabase.auth.signOut()
    } catch (err) {
        console.error("Error al cambiar contraseña:", err)
        displayLoginError(err.message || "Error al cambiar la contraseña.")
    }
})

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
   









