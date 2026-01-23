//Escucha evento click de botón pedidos planta direcciona al archivo products.html
const btnPedidosPlanta = document.getElementById("btn_pedidos_sedes");

document.addEventListener("DOMContentLoaded", () => {
    if (btnPedidosPlanta) {
        btnPedidosPlanta.addEventListener("click", () => {
            console.log("se ingresa a pedidos planta");
            window.location.href = 'products.html';
        });
    }
});