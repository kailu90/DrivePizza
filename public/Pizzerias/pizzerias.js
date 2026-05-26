//Escucha evento click de botón pedidos planta direcciona al archivo products.html
const btnPedidosPlanta = document.getElementById("btn_pedidos_sedes");

document.addEventListener("DOMContentLoaded", () => {
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
});