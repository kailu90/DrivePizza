/**
 * overlay.js — Overlay de procesamiento compartido
 *
 * Uso:
 *   import { mostrarOverlay, actualizarOverlay, ocultarOverlay } from '../Shared/overlay.js';
 *
 *   mostrarOverlay('Procesando...')                         // muestra overlay con texto
 *   actualizarOverlay('Guardando cambios...')               // cambia el texto en vivo
 *   ocultarOverlay()                                        // cierra de inmediato
 *   ocultarOverlay(true)                                    // cierra con fade rápido
 *   ocultarOverlay(true, { asesor, pedidoId, sede })        // éxito con 3 filas + ✅
 */

const ISOTIPO_URL = new URL('../Imagenes/IsotipoDrive.png', import.meta.url).href;

function _inyectar() {
    if (document.getElementById('dp-overlay')) return;
    const el = document.createElement('div');
    el.id = 'dp-overlay';
    el.className = 'dp-overlay';
    el.style.display = 'none';
    el.innerHTML = `
        <div class="dp-overlay__card">
            <div class="dp-overlay__ring-wrap">
                <svg class="dp-overlay__ring" viewBox="0 0 88 88">
                    <circle cx="44" cy="44" r="38"/>
                </svg>
                <img src="${ISOTIPO_URL}" class="dp-overlay__logo" alt="">
            </div>
            <p class="dp-overlay__texto" id="dp-overlay-texto">Procesando...</p>
            <div class="dp-overlay__success-body">
                <p class="dp-overlay__line dp-overlay__line--asesor" id="dp-line-asesor"></p>
                <p class="dp-overlay__line dp-overlay__line--pedido" id="dp-line-pedido"></p>
                <p class="dp-overlay__line dp-overlay__line--sede"   id="dp-line-sede"></p>
                <span class="dp-overlay__check">✅</span>
            </div>
        </div>`;
    document.body.appendChild(el);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _inyectar);
} else {
    _inyectar();
}

export function mostrarOverlay(texto = 'Procesando...') {
    _inyectar();
    const el = document.getElementById('dp-overlay');
    el.classList.remove('dp-overlay--success', 'dp-overlay--fadeout');
    document.getElementById('dp-overlay-texto').textContent = texto;
    el.style.display = 'flex';
}

export function actualizarOverlay(texto) {
    const el = document.getElementById('dp-overlay-texto');
    if (el) el.textContent = texto;
}

export function ocultarOverlay(exito = false, datos = null) {
    const el = document.getElementById('dp-overlay');
    if (!el) return;

    if (exito && datos && typeof datos === 'object') {
        // Éxito estructurado: 3 filas de texto + ✅ (usado en CallCenter)
        document.getElementById('dp-line-asesor').textContent = datos.asesor || '';
        document.getElementById('dp-line-pedido').textContent = `N° ${datos.pedidoId}`;
        document.getElementById('dp-line-sede').textContent   = `Ha sido enviado a la sede ${datos.sede}`;
        el.classList.add('dp-overlay--success');
        setTimeout(() => {
            el.classList.add('dp-overlay--fadeout');
            setTimeout(() => {
                el.style.display = 'none';
                el.classList.remove('dp-overlay--success', 'dp-overlay--fadeout');
            }, 380);
        }, 2500);

    } else if (exito) {
        // Éxito simple: fade rápido sin mensaje (usado en Planta)
        el.classList.add('dp-overlay--fadeout');
        setTimeout(() => {
            el.style.display = 'none';
            el.classList.remove('dp-overlay--fadeout');
        }, 380);

    } else {
        // Error o cancelación: cierre inmediato
        el.style.display = 'none';
    }
}
