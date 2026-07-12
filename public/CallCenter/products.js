/**
 * Drive Pizza — CallCenter products bridge
 * Importa datos desde la fuente única de verdad (Shared/menuData.js)
 * y los expone como globales para compatibilidad con app.js (plain script).
 *
 * Para modificar productos, precios o adiciones: editar Shared/menuData.js
 */
import {
    menuData,
    preciosCalzones,
    preciosStromboli,
    preciosAdiciones,
    preciosBordes,
    preciosPizzas,
    preciosLasañas,
    preciosPastas,
    preciosHamburguesas,
    preciosEnsaladas,
    preciosSandwiches,
    preciosMaicitos,
    preciosEntradas,
    preciosBebidas,
} from '../Shared/menuData.js';

// Exponer al scope global para que app.js (plain script) pueda leerlos
window.menuData          = menuData;
window.preciosCalzones   = preciosCalzones;
window.preciosStromboli  = preciosStromboli;
window.preciosAdiciones  = preciosAdiciones;
window.preciosBordes     = preciosBordes;
window.preciosPizzas     = preciosPizzas;
window.preciosLasañas    = preciosLasañas;
window.preciosPastas     = preciosPastas;
window.preciosHamburguesas = preciosHamburguesas;
window.preciosEnsaladas  = preciosEnsaladas;
window.preciosSandwiches = preciosSandwiches;
window.preciosMaicitos   = preciosMaicitos;
window.preciosEntradas   = preciosEntradas;
window.preciosBebidas    = preciosBebidas;
// Alias legacy usado en algunos lugares de app.js
window.preciosVariedades = preciosCalzones;
