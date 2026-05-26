// Configuración del módulo Planta

export const UNIDADES_MEDIDA = [
  'unidad',
  'kg',
  'gramo',
  'libra',
  'mililitro',
  'bolsa',
  'caja',
  'paquete',
  'rollo',
  'frasco',
  'lata',
  'bandeja',
  'bloque',
  'bolsa',
];

export const ESTADOS_PEDIDO = [
  'Recibido',
  'Despachado',
  'Entregado',
  'Cancelado',
];

// Productos que no tienen límite de stock al pedir
export const PRODUCTOS_SIN_LIMITE_STOCK = [
  'MASA x 140gr',
  'MASA x 250gr',
  'MASA x 350gr',
  'MASA x 450gr',
  'MASA x 700gr',
  'POLLO',
];

// Recargo de servicio (15%)
export const RECARGO_SERVICIO = 0.15;

// ID inicial para el contador de pedidos
export const ID_PEDIDO_INICIAL = 1500;
