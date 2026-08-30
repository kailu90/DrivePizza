import { initVersionBanner, revelarSplash } from '../Shared/components.js';
import { supabase } from '../Api/supabaseConfig.js';
initVersionBanner();

document.addEventListener("DOMContentLoaded", async () => {

    // Detectar rol para filtrar cards
    let rolUsuario = null;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        const { data: perfil } = await supabase
            .from('usuarios').select('rol, ciudad').eq('id', user.id).single();
        rolUsuario = perfil?.rol ?? null;
        if ((perfil?.ciudad || '').toLowerCase() === 'cartago') {
            ['btn_pedidos_sedes', 'btn_historial_planta'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        }
    }

    const esGastrofusion = rolUsuario === 'gastrofusion';

    // Cards exclusivas de pizzeria
    const cardsSoloPizzeria = ['btn_liquidacion', 'btn_reservas'];
    if (esGastrofusion) {
        cardsSoloPizzeria.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const btnTomarGF = document.getElementById('btn_tomar_gf');
        if (btnTomarGF) btnTomarGF.style.display = '';
        const btnCierreGF = document.getElementById('btn_cierre_gf');
        if (btnCierreGF) btnCierreGF.style.display = '';
        const cardHistorial = document.querySelector('#btn_historial_cc .card__text');
        if (cardHistorial) cardHistorial.textContent = 'Historial Pedidos';
    }

    // ── Listeners de navegación ────────────────────────────────────────────────
    const btnPedidosPlanta = document.getElementById("btn_pedidos_sedes");
    if (btnPedidosPlanta) {
        btnPedidosPlanta.addEventListener("click", () => {
            window.location.href = '../Planta/products.html';
        });
    }

    const btnHistorialCC = document.getElementById("btn_historial_cc");
    if (btnHistorialCC) {
        btnHistorialCC.addEventListener("click", () => {
            window.location.href = '../CallCenter/historialPedidos.html';
        });
    }

    const btnPedidosCC = document.getElementById("btn_pedidos_cc");
    if (btnPedidosCC) {
        btnPedidosCC.addEventListener("click", () => {
            window.location.href = '../CallCenter/historialPedidos.html';
        });
    }

    const btnHistorialPlanta = document.getElementById("btn_historial_planta");
    if (btnHistorialPlanta) {
        btnHistorialPlanta.addEventListener("click", () => {
            window.location.href = './historialPlanta.html';
        });
    }

    const btnLiquidacion = document.getElementById("btn_liquidacion");
    if (btnLiquidacion) {
        btnLiquidacion.addEventListener("click", () => {
            window.location.href = './liquidacionPizzeria.html';
        });
    }

    const btnReservas = document.getElementById("btn_reservas");
    if (btnReservas) {
        btnReservas.addEventListener("click", () => {
            window.location.href = '../CallCenter/historialPedidos.html?tipo=reserva';
        });
    }

    const btnTomarGF = document.getElementById("btn_tomar_gf");
    if (btnTomarGF) {
        btnTomarGF.addEventListener("click", () => {
            window.location.href = '../Gastrofusion/gastrofusion.html';
        });
    }

    const btnCierreGF = document.getElementById("btn_cierre_gf");
    if (btnCierreGF) {
        btnCierreGF.addEventListener("click", () => {
            window.location.href = '../Gastrofusion/cierreCaja.html';
        });
    }

    document.body.classList.add('loaded');
    revelarSplash();
});