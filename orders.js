  document.getElementById('btn_edit').addEventListener('click', function(event) {
  event.preventDefault(); // Evita el comportamiento predeterminado del botón
  history.back(); // Regresa a la página anterior sin refrescar
  console.log("botón editar");
});
  
  document.getElementById('btn_confirm').addEventListener('click', function(event) {
  event.preventDefault();
  window.location.href = 'envioOK.html';
  console.log("botón confirmar pedido")
  });

