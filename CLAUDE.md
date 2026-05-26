# EverestCentral — Instrucciones de Proyecto

## Stack
- Firebase Hosting, Firestore, Authentication
- JS modular (ES modules), sin frameworks frontend
- Rama activa: `feature/pruebas`
- Proyecto Firebase: `everest-central` (everest-central.web.app)

## Estructura de carpetas (`public/`)
```
public/
├── Api/          → firebaseConfig.js, config.js
├── Auth/         → login.js, authCheck.js, plantaAuth.js
├── CallCenter/   → callcenter-shell.html (entrada), callcenter.html/js, pedidosCallCenter.html,
│                   app.js, products.js, domicilios.js, historialPedidos.html/js
├── Estilos/      → styles.css, skeleton.css, login.css, historialPedidos.css,
│                   pedidosPizzeria.css, movimientos.css, adminProductos.css
├── Imagenes/     → assets
├── Pizzerias/    → pizzerias.html/js, pedidosPizzeria.html/js
├── Planta/       → dashboard.html/js, Inventory.html/js, inventoryService.js,
│                   products.html/js, adminProductos.html/js, movimientos.html/js,
│                   planta.config.js, sidebar.html
├── Shared/       → components.js, skeleton.js
└── index.html    → Login
scripts/          → scripts de importación (NO se despliegan)
```

## firebaseConfig.js
- Exporta `plantaDB = { db, auth }` — un solo proyecto Firebase
- Todos los JS hacen: `import { plantaDB } from '../Api/firebaseConfig.js'` y luego `const db = plantaDB.db`

## Estructura Firestore

### Globales
- `/Usuarios/{uid}` — lectura pública (login por username), escritura propia
- `/Sedes/{sedeId}` — todos leen, solo planta escribe

### Planta (doc fijo "principal")
- `/Planta/principal/Productos/{productoId}`
- `/Planta/principal/Proveedores/{provId}`
- `/Planta/principal/Movimientos/{movId}`
- `/Planta/principal/Categorias/{catId}`
- `/Planta/principal/Contadores/idPedidos`
- `/Planta/principal/PedidosPlanta/{pedidoId}`

### CallCenter (doc fijo "principal")
- `/CallCenter/principal/PedidosCallCenter/{pedidoId}`
- `/CallCenter/principal/Contadores/ultimoIdPedidos` → campo `ultimoId`
- `/CallCenter/principal/Clientes/{clienteId}` ← proyección futura

### Pizzerías
- Lee PedidosCallCenter y PedidosPlanta, crea PedidosPlanta

## Roles de usuario
| Rol | Redirección |
|---|---|
| `planta` | Planta/dashboard.html |
| `callcenter` | CallCenter/callcenter-shell.html |
| `pizzeria` | Pizzerias/pizzerias.html |
| `admin` | Planta/dashboard.html |
| `pending` / `active: false` | Bloqueado hasta aprobación |

## Documento Usuarios — campos
`uid, username, email, sede, rol, active, status, createdAt`
- No hay campo `name`, el nombre visible es `username`
- `/Usuarios/{uid}` en raíz (global, no anidado) — decisión confirmada

## Flujo de estados PedidosCallCenter
`pendiente → recibido → en preparación → despachado → entregado | cancelado`
- CallCenter: crea (pendiente)
- printer.mjs: imprime → recibido
- Pizzería: en preparación → despachado → entregado (o cancelado)
- Nadie elimina

## Datos en Firestore
- 166 productos en `/Planta/principal/Productos/`
- 7 Sedes en `/Sedes/`
- 27 Proveedores (IDs 21,23,27,28,31,32,35 con nombres genéricos pendientes)
- 12 Categorías
- Contadores inicializados

## Reglas Firestore
- Archivo: `firestore.rules` en raíz
- `firebase.json` configurado para desplegarlas
- Roles verificados con `get()` desde `/Usuarios/{uid}.rol`

## Clientes CallCenter (futuro)
- Clave única: teléfono
- Direcciones: array `{ alias, direccion, barrio, ciudad, sedeId, predeterminada }`
- `sedeId` del pedido viene de la dirección elegida

## PedidosCallCenter — campos actuales
`nPedido, nombre, telefono, direccion, sede, pago, obs, productos, total, impreso, asesor, fecha, estado, canal, domicilio`
- `asesor` = username del agente
- `productos[].obs`: observación por producto (string, opcional)
- `domicilio`: `{ barrio, valor }` o `{ tipo: 'recoger', valor: 0 }`
- `canal`: 'whatsapp' | 'ivr'
- `motivoCancelacion`: campo opcional cuando estado = 'cancelado'
- Contador: campo `ultimoIdPedidos` en `/CallCenter/principal/Contadores/ultimoIdPedidos`

## Script impresión local
- `scripts/printer.mjs` — Node.js con firebase-admin + puppeteer + pdf-to-printer
- Listener en tiempo real por sede, imprime 2 copias, actualiza estado en Firestore
- Configurar `MI_SEDE` y `NOMBRE_IMPRESORA` al inicio del archivo

## Historial de Pedidos
- `public/CallCenter/historialPedidos.html` + `historialPedidos.js`
- `public/Estilos/historialPedidos.css`
- Filtros: fecha, sede, estado — Exportar CSV — Modal de detalle
- Pendiente: mejorar diseño en próxima sesión

## Pendientes
1. Mejorar historial de pedidos (diseño y funcionalidades)
2. Actualizar nombres reales de proveedores 21, 23, 27, 28, 31, 32, 35
3. Agregar campo `idUser` en Sedes al crear usuarios de pizzerías
4. Implementar App Check con reCAPTCHA v3
