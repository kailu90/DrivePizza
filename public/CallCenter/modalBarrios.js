/**
 * modalBarrios.js
 * Modal reutilizable de consulta de domicilios por barrio.
 * Se puede abrir desde cualquier página del CallCenter.
 *
 * Uso:
 *   import { openBarriosModal } from './modalBarrios.js';
 *   openBarriosModal();
 */

import { domicilios } from './domicilios.js';

let _sede = null;
let _initialized = false;

const MODAL_HTML = `
<div id="modal-barrios-shared" class="modal-overlay" style="display:none; align-items:center; justify-content:center;">
    <div class="modal-content" style="max-width:480px; max-height:90vh; display:flex; flex-direction:column;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h3 style="margin:0;">Consultar domicilios</h3>
            <button id="btn-cerrar-barrios-shared" style="background:none;border:none;font-size:22px;cursor:pointer;color:#666;">&times;</button>
        </div>
        <div class="sede-toggle" id="barrios-sede-toggle" style="margin-bottom:12px;">
            <button type="button" class="sede-btn" data-sede="cabecera">Cabecera</button>
            <button type="button" class="sede-btn" data-sede="ca\u00f1averal">Ca\u00f1averal</button>
            <button type="button" class="sede-btn" data-sede="acropolis">Acr\u00f3polis</button>
            <button type="button" class="sede-btn" data-sede="piedecuesta">Piedecuesta</button>
            <button type="button" class="sede-btn" data-sede="megamall">Megamall</button>
            <button type="button" class="sede-btn" data-sede="unico">\u00danico</button>
        </div>
        <input type="text" id="barrios-buscador"
            placeholder="\uD83D\uDD0D Escribe el barrio..."
            style="padding:10px 14px; border:2px solid #ddd; border-radius:8px; font-size:15px; width:100%; box-sizing:border-box; margin-bottom:10px;"
            autocomplete="off">
        <div id="barrios-resultados"
            style="overflow-y:auto; flex:1; border:1px solid #eee; border-radius:8px;">
            <p style="text-align:center; color:#aaa; padding:20px; margin:0;">Selecciona una sede para comenzar</p>
        </div>
    </div>
</div>`;

function _filtrar() {
    const contenedor = document.getElementById('barrios-resultados');
    if (!_sede) return;

    const q       = document.getElementById('barrios-buscador').value.toLowerCase().trim();
    const barrios = domicilios[_sede] || {};
    const entradas = Object.entries(barrios).filter(([nombre]) =>
        !q || nombre.toLowerCase().includes(q)
    );

    if (!entradas.length) {
        contenedor.innerHTML = `
            <p style="text-align:center;padding:20px;margin:0;color:#e74c3c;font-weight:600;">
                \u26a0\ufe0f Barrio no encontrado \u2014 verificar con la pizzer\u00eda valor domi
            </p>`;
        return;
    }

    contenedor.innerHTML = entradas.map(([nombre, valor]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:10px 14px;border-bottom:1px solid #f0f0f0;">
            <span style="font-size:14px;">${nombre}</span>
            <span style="font-weight:700;color:#27ae60;white-space:nowrap;margin-left:12px;">
                $${valor.toLocaleString('es-CO')}
            </span>
        </div>
    `).join('');
}

function _close() {
    const modal = document.getElementById('modal-barrios-shared');
    if (modal) modal.style.display = 'none';
}

function _init() {
    if (_initialized) return;
    _initialized = true;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = MODAL_HTML.trim();
    document.body.appendChild(wrapper.firstElementChild);

    document.getElementById('btn-cerrar-barrios-shared')
        .addEventListener('click', _close);

    document.getElementById('barrios-buscador')
        .addEventListener('input', _filtrar);

    document.getElementById('barrios-sede-toggle')
        .querySelectorAll('.sede-btn')
        .forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#barrios-sede-toggle .sede-btn')
                    .forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                _sede = btn.dataset.sede;
                _filtrar();
                document.getElementById('barrios-buscador').focus();
            });
        });

    document.getElementById('modal-barrios-shared')
        .addEventListener('click', e => {
            if (e.target.id === 'modal-barrios-shared') _close();
        });
}

export function openBarriosModal() {
    _init();
    const modal = document.getElementById('modal-barrios-shared');
    modal.style.display = 'flex';
    document.getElementById('barrios-buscador').value = '';
    document.getElementById('barrios-resultados').innerHTML =
        '<p style="text-align:center;color:#aaa;padding:20px;margin:0;">Selecciona una sede para comenzar</p>';
    _sede = null;
    document.querySelectorAll('#barrios-sede-toggle .sede-btn')
        .forEach(b => b.classList.remove('active'));
}
