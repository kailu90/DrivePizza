import { supabase } from '../Api/supabaseConfig.js'
import { MostrarBotonSelector } from '../Shared/components.js'

const ROLES_PLANTA = ['planta', 'admin', 'planta-admin']
const LOGIN_URL    = '../index.html'

/**
 * Verifica que el usuario tenga sesión activa y rol permitido.
 * Lee el perfil desde public.usuarios en Supabase.
 *
 * @param {Function} onSuccess  Callback que recibe { uid, username, sede, rol }
 * @param {string[]} [roles]    Roles permitidos. Por defecto ['planta', 'admin', 'planta-admin']
 */
export function verificarAccesoPlanta(onSuccess, roles = ROLES_PLANTA) {
    supabase.auth.getUser().then(async ({ data: { user }, error }) => {
        if (error || !user) { window.location.href = LOGIN_URL; return }
        try {
            const { data: perfil, error: perfilError } = await supabase
                .from('usuarios')
                .select('username, sede, rol')
                .eq('id', user.id)
                .single()

            if (perfilError || !perfil)     { window.location.href = LOGIN_URL; return }
            if (!roles.includes(perfil.rol)) { window.location.href = LOGIN_URL; return }

            onSuccess({ uid: user.id, username: perfil.username, sede: perfil.sede, rol: perfil.rol })
            if (perfil.rol === 'admin') MostrarBotonSelector()
        } catch (err) {
            console.error('plantaAuth — error verificando acceso:', err)
            window.location.href = LOGIN_URL
        }
    })
}
