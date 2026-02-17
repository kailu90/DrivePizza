const btnPedidosCallCenter = document.getElementById("btn_pedidos_sedes");

function abrirPedidosCallCenter ( ) {
    console.log("abriendo pedidos del call center")
    window.location.href = "./PedidosCallCenter/pedidosCallCenter.html";
}

btnPedidosCallCenter.addEventListener("click", abrirPedidosCallCenter);