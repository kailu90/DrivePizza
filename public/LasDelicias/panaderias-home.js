import { supabase } from './supabaseConfig.js'
import { mountHeader, setHeaderUser } from './Shared/ldHeader.js'

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        window.parent.postMessage({ type: 'logout' }, '*')
        return
    }

    const { data: perfil } = await supabase
        .from('usuarios').select('*').eq('id', user.id).single()

    if (!perfil || !perfil.active) {
        await supabase.auth.signOut()
        window.parent.postMessage({ type: 'logout' }, '*')
        return
    }

    if (window === window.top) {
        mountHeader({
            navLabel: 'Panaderias',
            onLogout: async () => {
                if (!confirm('¿Deseas cerrar sesión?')) return
                await supabase.auth.signOut()
                window.parent.postMessage({ type: 'logout' }, '*')
            },
        })
        setHeaderUser({ username: perfil.username, sede: perfil.sede || '' })
    }

    if (['admin', 'panaderias-admin'].includes(perfil.rol)) {
        document.getElementById('card-barrios').style.display = ''
    }

    document.getElementById('contenido-principal').style.display = ''
    document.body.classList.add('loaded')
}

// ── Navegacion por cards ───────────────────────────────────────────────────────
document.addEventListener('click', (e) => {
    const card = e.target.closest('[data-nav]')
    if (!card) return
    window.parent.postMessage({ type: 'nav-switch', page: card.dataset.nav }, '*')
})

init()
