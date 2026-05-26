/**
 * centralizar-hetzner-url.mjs
 * Reemplaza las URLs hardcodeadas de Hetzner por imports desde Api/config.js
 *
 * Uso: node scripts/centralizar-hetzner-url.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const PUBLIC = 'public'

// [ archivo, carpetaRelativaAApi, nombreVariableActual, importarWS ]
const archivos = [
  // Planta
  ['Planta/inventoryService.js',  '../Api/config.js', 'HETZNER_URL', false],
  ['Planta/dashboard.js',         '../Api/config.js', 'HETZNER_URL', true ],
  ['Planta/adminProductos.js',    '../Api/config.js', 'HETZNER_URL', true ],
  ['Planta/products.js',          '../Api/config.js', 'HETZNER_URL', false],
  ['Planta/movimientos.js',       '../Api/config.js', 'HETZNER_URL', false],
  ['Planta/informeInventario.js', '../Api/config.js', 'HETZNER_URL', false],
  ['Planta/consultaProducto.js',  '../Api/config.js', 'HETZNER_URL', false],
  // CallCenter
  ['CallCenter/historialPedidos.js', '../Api/config.js', 'HETZNER_URL', true ],
  ['CallCenter/reporteAsesores.js',  '../Api/config.js', 'HETZNER_URL', false],
  // Pizzerias
  ['Pizzerias/historialPlanta.js', '../Api/config.js', 'HETZNER_URL', false],
  ['Pizzerias/pedidosPizzeria.js', '../Api/config.js', 'HETZNER_URL', true ],
  // Shared
  ['Shared/productosService.js', '../Api/config.js', 'HETZNER_URL', false],
]

// pbxPanel.js usa API_BASE en lugar de HETZNER_URL — caso especial
const archivosEspeciales = [
  ['CallCenter/pbxPanel.js', '../Api/config.js', 'API_BASE'],
]

let totalModificados = 0

for (const [archivo, importPath, varName, importarWS] of archivos) {
  const ruta = join(PUBLIC, archivo)
  let contenido = readFileSync(ruta, 'utf8')

  const constLine = `const ${varName} = 'https://api.everest-central.com'`
  if (!contenido.includes(constLine)) {
    console.log(`  SKIP ${archivo} — línea no encontrada`)
    continue
  }

  // Construir el import
  const imports = importarWS
    ? `import { HETZNER_URL, WS_URL } from '${importPath}'`
    : `import { HETZNER_URL } from '${importPath}'`

  // Reemplazar const por import
  contenido = contenido.replace(constLine, imports)

  // Reemplazar URLs wss hardcodeadas
  if (importarWS) {
    contenido = contenido.replaceAll("'wss://api.everest-central.com/ws'", 'WS_URL')
    contenido = contenido.replaceAll('"wss://api.everest-central.com/ws"', 'WS_URL')
  }

  writeFileSync(ruta, contenido, 'utf8')
  console.log(`  OK  ${archivo}${importarWS ? ' (+WS_URL)' : ''}`)
  totalModificados++
}

// pbxPanel.js — API_BASE → HETZNER_URL
for (const [archivo, importPath, varName] of archivosEspeciales) {
  const ruta = join(PUBLIC, archivo)
  let contenido = readFileSync(ruta, 'utf8')

  const constLine = `const ${varName} = 'https://api.everest-central.com'`
  if (!contenido.includes(constLine)) {
    console.log(`  SKIP ${archivo} — línea no encontrada`)
    continue
  }

  contenido = contenido.replace(
    constLine,
    `import { HETZNER_URL as ${varName} } from '${importPath}'`
  )

  writeFileSync(ruta, contenido, 'utf8')
  console.log(`  OK  ${archivo} (API_BASE → HETZNER_URL alias)`)
  totalModificados++
}

// Inventory.js — URLs directas sin const
const inventoryPath = join(PUBLIC, 'Planta/Inventory.js')
let inv = readFileSync(inventoryPath, 'utf8')
let invModificado = false

if (inv.includes("'https://api.everest-central.com/planta/cache/sync-productos'")) {
  inv = inv.replace(
    "fetch('https://api.everest-central.com/planta/cache/sync-productos'",
    "fetch(`${HETZNER_URL}/planta/cache/sync-productos`"
  )
  invModificado = true
}
if (inv.includes("'wss://api.everest-central.com/ws'")) {
  inv = inv.replace("'wss://api.everest-central.com/ws'", 'WS_URL')
  invModificado = true
}

if (invModificado) {
  // Agregar import al inicio (después de otros imports)
  const primeraLinea = inv.split('\n')[0]
  inv = inv.replace(
    primeraLinea,
    `import { HETZNER_URL, WS_URL } from '../Api/config.js'\n${primeraLinea}`
  )
  writeFileSync(inventoryPath, inv, 'utf8')
  console.log('  OK  Planta/Inventory.js (+HETZNER_URL +WS_URL)')
  totalModificados++
}

console.log(`\nTotal modificados: ${totalModificados} archivos`)
