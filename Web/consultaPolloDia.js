// Función para obtener los datos de la API
async function obtenerPedidosDeAPI() {
    try {
      const response = await fetch('https://tu-api.com/endpoint-pedidos'); // Reemplaza con la URL de tu API
      const pedidos = await response.json(); // Asumiendo que la API devuelve datos en formato JSON
      return pedidos;
    } catch (error) {
      console.error('Error al obtener los datos de la API:', error);
      return [];
    }
  }
  
  // Función para calcular la cantidad total de pollo por día
  async function calcularPolloPorDia(fecha) {
    // Obtener los pedidos de la API
    const pedidos = await obtenerPedidosDeAPI();
  
    // Filtrar los pedidos que corresponden al producto "pollo" y a la fecha solicitada
    const pedidosPollo = pedidos.filter(pedido => pedido.fecha === fecha && pedido.producto === 'pollo');
  
    // Sumar las cantidades de pollo de los pedidos filtrados
    const totalPollo = pedidosPollo.reduce((total, pedido) => total + pedido.cantidad, 0);
  
    return totalPollo;
  }
  
  // Ejemplo de uso
  const fechaConsulta = '2024-10-15'; // Cambia la fecha según tu necesidad
  calcularPolloPorDia(fechaConsulta).then(polloRequerido => {
    console.log(`Pollo requerido el ${fechaConsulta}: ${polloRequerido} kg`);
  });
  