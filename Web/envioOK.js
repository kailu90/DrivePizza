document.getElementById("form").addEventListener("submit", function(event) {
    event.preventDefault();  // Evitar que el formulario se envíe
    window.location.href = "envioOK.html";  // Redirigir a la página de confirmación
});