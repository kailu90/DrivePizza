document.getElementById('btn_pedidos_sedes').addEventListener('click', () => {
    window.location.href = './pedidosCallCenter.html';
});

document.getElementById('btn_historial').addEventListener('click', () => {
    window.location.href = './historialPedidos.html';
});

document.getElementById('btn_reporte_asesores').addEventListener('click', () => {
    window.location.href = './reporteAsesores.html';
});

document.getElementById('btn_reservas').addEventListener('click', () => {
    window.location.href = './historialPedidos.html?tipo=reserva';
});

document.getElementById('btn_pbx').addEventListener('click', () => {
    window.location.href = './pbx.html';
});

document.getElementById('btn_clientes').addEventListener('click', () => {
    window.location.href = './clientesCall.html';
});
