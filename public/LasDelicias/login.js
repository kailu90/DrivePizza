import { supabase } from './supabaseConfig.js'
import { mostrarSkeleton, ocultarSkeleton } from '../Shared/skeleton.js'
import { mostrarOverlay, ocultarOverlay } from '../Shared/overlay.js'

mostrarSkeleton('login')

const loginForm    = document.getElementById('login_form')
const errorMessage = document.getElementById('login_error')

const REDIRECT_ROL = {
    callcenter:         'shell.html',
    'callcenter-admin': 'shell.html',
    admin:              'shell.html',
}

// ── Login ────────────────────────────────────────────────────────────────────
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const usernameValue = document.getElementById('login_user').value.trim().toLowerCase().replace(/\s+/g, '')
    const password      = document.getElementById('login_password').value
    if (!usernameValue || !password) { displayError('El usuario y la contraseña no pueden estar vacíos.'); return }

    mostrarOverlay('Iniciando sesión...')
    try {
        let emailForAuth = usernameValue
        if (!usernameValue.includes('@')) {
            const { data: rows, error } = await supabase
                .from('usuarios').select('email').eq('username', usernameValue).limit(1)
            if (error || !rows?.length) { ocultarOverlay(); displayError('El nombre de usuario no existe.'); return }
            emailForAuth = rows[0].email
        }

        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email: emailForAuth, password })
        if (authError) throw authError

        const { data: perfil } = await supabase.from('usuarios').select('*').eq('id', authData.user.id).single()
        if (!perfil)        { await supabase.auth.signOut(); ocultarOverlay(); displayError('No se encontró perfil de usuario.'); return }
        if (!perfil.active) { await supabase.auth.signOut(); ocultarOverlay(); displayError('Tu cuenta está pendiente de aprobación.'); return }

        window.location.href = REDIRECT_ROL[perfil.rol] || 'index.html'
    } catch (err) {
        ocultarOverlay()
        const msg = err.message?.includes('Invalid')    ? 'Usuario o contraseña incorrectos.'
            :       err.message?.includes('many')       ? 'Acceso bloqueado temporalmente.'
            :       err.message?.includes('confirmed')  ? 'Cuenta pendiente de activación, contacta al administrador.'
            :       'Usuario o contraseña incorrectos.'
        displayError(msg)
    }
})

// ── Registro ─────────────────────────────────────────────────────────────────
const btnCreateAccount        = document.getElementById('btn_create_account')
const registrationModal       = document.getElementById('registration_modal')
const closeRegistrationBtn    = document.querySelector('.close_registration_modal_btn')
const confirmationModal       = document.getElementById('confirmation_modal')

if (btnCreateAccount)     btnCreateAccount.addEventListener('click', () => registrationModal.classList.add('active'))
if (closeRegistrationBtn) closeRegistrationBtn.addEventListener('click', () => registrationModal.classList.remove('active'))

// Cargar sedes al abrir el modal
let _sedesLoaded = false
if (btnCreateAccount) btnCreateAccount.addEventListener('click', async () => {
    if (_sedesLoaded) return
    _sedesLoaded = true
    const { data: sedes } = await supabase.from('sedes').select('id, name, nombre_display').order('name')
    const sel = document.getElementById('reg_sede')
    if (!sel || !sedes?.length) return
    sedes.forEach(s => {
        const o = document.createElement('option')
        o.value = s.id
        o.textContent = s.nombre_display || s.name
        sel.appendChild(o)
    })
})

document.getElementById('register_form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const username    = document.getElementById('reg_user').value.trim().toLowerCase().replace(/\s+/g, '')
    const email       = document.getElementById('reg_email').value.trim()
    const pass        = document.getElementById('reg_pass').value
    const confirmPass = document.getElementById('reg_confirm_pass').value
    const sede        = document.getElementById('reg_sede').value

    if (username.length < 3)  { displayError('El usuario es muy corto.'); return }
    if (pass !== confirmPass)  { displayError('Las contraseñas no coinciden.'); return }

    try {
        const { data: exist } = await supabase.from('usuarios').select('id').eq('username', username).limit(1)
        if (exist?.length) { displayError('Este usuario ya está tomado.'); return }

        const { data, error } = await supabase.auth.signUp({ email, password: pass })
        if (error) throw error

        await supabase.from('usuarios').insert({
            id: data.user.id, username, email, sede,
            rol: 'pending', active: false, status: 'pending',
        })

        await supabase.auth.signOut()
        registrationModal.classList.remove('active')
        confirmationModal.classList.add('active')
        confirmationModal.onclick = (ev) => { if (ev.target === confirmationModal) confirmationModal.classList.remove('active') }
    } catch (err) {
        const msg = err.message?.includes('already') ? 'El correo ya existe.' : (err.message || 'Error en el registro.')
        displayError(msg)
    }
})

// ── Recuperar contraseña ──────────────────────────────────────────────────────
const btnForgotPass          = document.getElementById('btn_forgot_pass')
const forgotModal            = document.getElementById('forgot_modal')
const closeForgotBtn         = document.querySelector('.close_forgot_modal_btn')
const confirmationForgotModal = document.getElementById('confirmation_forgot_modal')

if (btnForgotPass)  btnForgotPass.addEventListener('click', () => forgotModal.classList.add('active'))
if (closeForgotBtn) closeForgotBtn.addEventListener('click', () => forgotModal.classList.remove('active'))

document.getElementById('forgot_form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = document.getElementById('forgot_email').value.trim()
    if (!email) { displayError('Ingresa tu correo electrónico.'); return }
    try {
        const redirectTo = window.location.origin + window.location.pathname
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
        if (error) throw error
        forgotModal.classList.remove('active')
        confirmationForgotModal.classList.add('active')
        confirmationForgotModal.onclick = (ev) => { if (ev.target === confirmationForgotModal) confirmationForgotModal.classList.remove('active') }
        document.getElementById('forgot_form').reset()
    } catch (err) {
        displayError(err.message || 'Error al enviar el correo.')
    }
})

// ── Reseteo de contraseña ─────────────────────────────────────────────────────
const resetModal             = document.getElementById('reset_modal')
const confirmationResetModal = document.getElementById('confirmation_reset_modal')

supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') resetModal.classList.add('active')
})

document.getElementById('reset_form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const newPass     = document.getElementById('reset_pass').value
    const confirmPass = document.getElementById('reset_confirm_pass').value
    if (newPass !== confirmPass)  { displayError('Las contraseñas no coinciden.'); return }
    if (newPass.length < 6)       { displayError('Mínimo 6 caracteres.'); return }
    try {
        const { error } = await supabase.auth.updateUser({ password: newPass })
        if (error) throw error
        resetModal.classList.remove('active')
        document.getElementById('reset_form').reset()
        confirmationResetModal.classList.add('active')
        confirmationResetModal.onclick = (ev) => { if (ev.target === confirmationResetModal) confirmationResetModal.classList.remove('active') }
        await supabase.auth.signOut()
    } catch (err) {
        displayError(err.message || 'Error al cambiar la contraseña.')
    }
})

// ── Toggle contraseña ─────────────────────────────────────────────────────────
document.getElementById('btn-toggle-pass')?.addEventListener('click', () => {
    const input  = document.getElementById('login_password')
    const eyeOn  = document.getElementById('icon-eye')
    const eyeOff = document.getElementById('icon-eye-off')
    const visible = input.type === 'text'
    input.type = visible ? 'password' : 'text'
    eyeOn.style.display  = visible ? '' : 'none'
    eyeOff.style.display = visible ? 'none' : ''
})

function displayError(msg = 'Usuario o contraseña incorrectos.') {
    errorMessage.textContent   = msg
    errorMessage.style.display = 'block'
    setTimeout(() => { errorMessage.style.display = 'none' }, 5000)
}

window.addEventListener('load', () => {
    document.body.classList.add('loaded')
    ocultarSkeleton('contenido-principal')
})
