import { supabase } from '../Api/supabaseConfig.js'
import { CargarHeader, MostrarBotonSelector } from '../Shared/components.js'
import { mostrarSkeleton, ocultarSkeleton } from '../Shared/skeleton.js'

const skeletonType = document.body.dataset.skeleton
if (skeletonType) mostrarSkeleton(skeletonType)

;(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { window.top.location.href = "../index.html"; return }
    try {
        const { data: perfil } = await supabase.from('usuarios').select('sede, rol').eq('id', user.id).single()
        if (perfil) {
            const mostrarSala = ['callcenter', 'callcenter-admin', 'admin'].includes(perfil.rol)
            CargarHeader(perfil.sede, null, mostrarSala)
            if (perfil.rol === 'admin') MostrarBotonSelector()
        }
        ocultarSkeleton('contenido-principal')
        document.body.classList.add('loaded')
    } catch (error) {
        console.error("Error en authCheck:", error)
        document.body.classList.add('loaded')
    }
})()
