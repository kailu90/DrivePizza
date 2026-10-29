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

// Sedes que reciben masas CC (aparecen en el informe de producción)
export const SEDES_MASA = ['megamall', 'acropolis', 'gastrofusion'];

// Recargo de servicio (15%)
export const RECARGO_SERVICIO = 0.15;

// ID inicial para el contador de pedidos
export const ID_PEDIDO_INICIAL = 1500;

// ── Informe de Producción — IDs de productos (tabla `productos` en Supabase) ──
// ATENCIÓN: si se recrea un producto en BD su ID numérico cambia — actualizar aquí.
export const INFORME_PROD_CATEGORIAS = [
    { label: 'Pollo Desmechado',  ids: new Set(['46']),        factor: 5, unidad: 'libras'  },
    { label: 'Salami Zenú',       ids: new Set(['89', '186']), factor: 2, unidad: 'barras'  },
    { label: 'Tártara',           ids: new Set(['144']),       factor: 1, unidad: 'frascos' },
];

export const INFORME_PROD_SIROPES = [
    { label: 'Frutos Rojos',     id: '154', thLabel: 'Frutos<br><small>Rojos</small>'     },
    { label: 'Frutos Amarillos', id: '155', thLabel: 'Frutos<br><small>Amarillos</small>' },
    { label: 'Tamarindo',        id: '156', thLabel: 'Tama&shy;rindo'                     },
];

export const INFORME_PROD_MASAS = {
    '160': 'MASA x 140gr',
    '2':   'MASA x 350gr',
    '13':  'MASA x 450gr',
    '24':  'MASA x 700gr',
};

export const INFORME_PROD_CARNES = [
    { label: 'Carne para moler (Murillo)',   id: '55', thLabel: 'Moler<br><small>(Murillo)</small>'   },
    { label: 'Carne para desmechar (Aleta)', id: '56', thLabel: 'Desmechar<br><small>(Aleta)</small>' },
    { label: 'Carne para hamburguesa',       id: '58', thLabel: 'Hambur&shy;guesa'                    },
];
