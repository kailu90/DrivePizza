/**
 * overlay.js — Wrapper Las Delicias
 * Re-exporta el overlay compartido pero reemplaza el logo por el de Las Delicias.
 */
export { actualizarOverlay, ocultarOverlay } from '../Shared/overlay.js'
import { mostrarOverlay as _show } from '../Shared/overlay.js'

const _ldLogo = new URL('./Imagenes/Logo.png', import.meta.url).href

function _patchLogo() {
    const logo = document.querySelector('#dp-overlay .dp-overlay__logo')
    if (!logo) return
    logo.src          = _ldLogo
    logo.style.width  = '150px'
    logo.style.height = 'auto'
    logo.style.borderRadius = '0'
    logo.style.background   = 'none'
    logo.style.padding      = '0'
}

// Patch tras DOMContentLoaded (el overlay compartido también escucha ese evento,
// setTimeout 0 asegura que corre después de que lo inyecte)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(_patchLogo, 0))
} else {
    setTimeout(_patchLogo, 0)
}

export function mostrarOverlay(texto = 'Procesando...') {
    _show(texto)
    _patchLogo()
}
