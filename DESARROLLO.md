# Guía de Desarrollo — EverestCentral

## Stack
- **Frontend**: JS modular (ES modules), sin frameworks — Firebase Hosting
- **Backend**: Node.js + Fastify + Redis + SQLite + Firebase Admin — VPS Hetzner
- **Base de datos**: Firebase Firestore
- **Auth**: Firebase Authentication + App Check (reCAPTCHA v3)

---

## Repositorios

| Repo | Descripción | URL |
|---|---|---|
| Frontend | HTML/CSS/JS del sistema | rama `feature/pruebas` en el repo principal |
| Backend | API REST + WebSocket | https://github.com/kailu90/DrivePizza.Everest-Central |

---

## Entornos

| Entorno | Frontend | Backend | Firestore |
|---|---|---|---|
| **Desarrollo** | `localhost` (Live Server) | `localhost:3000` | `everest-central-dev` |
| **Producción** | `everest-central.web.app` | `api.everest-central.com` | `everest-central` |

La detección del entorno es automática — `public/Api/config.js` revisa `window.location.hostname` y apunta al backend correcto sin cambios manuales.

---

## Infraestructura

### Hetzner VPS
- **IP**: 65.109.225.149
- **Usuario**: root
- **Acceso**: `ssh hetzner` (requiere SSH key configurada)
- **Backend**: `/root/backend/`
- **Proceso**: PM2 — NUNCA matar el proceso manualmente (tumba Caddy/SSL)
- **SSL**: Caddy — si se cae: `systemctl start caddy`

### Firebase
- **Producción**: proyecto `everest-central`
- **Desarrollo**: proyecto `everest-central-dev`
- **Credenciales backend producción**: `/root/backend/src/firebase-credentials.json` (en Hetzner, nunca en git)
- **Credenciales backend dev**: `src/firebase-credentials.json` en el repo local (nunca en git)
- **Credenciales producción respaldo**: `src/firebase-credentials.PROD.json` (nunca en git)

### Redis
- **Producción**: `localhost:6379` en Hetzner (servicio del sistema)
- **Desarrollo**: `localhost:6379` en tu PC (instalado con Redis for Windows)

---

## Setup inicial (máquina nueva)

### Requisitos
- Node.js (con nvm en Linux, instalador en Windows)
- Git
- Redis for Windows: https://github.com/tporadowski/redis/releases
- VS Code + extensión Live Server

### Frontend
```powershell
# Clonar repo principal
git clone <url-repo-frontend>
cd EverestCentral
```
No requiere `npm install` — usa módulos ES desde CDN.

### Backend
```powershell
# Clonar repo backend
git clone git@github.com:kailu90/DrivePizza.Everest-Central.git
cd DrivePizza.Everest-Central
npm install

# Copiar credenciales (pedirlas al responsable del proyecto — NUNCA van en git)
# Colocar en: src/firebase-credentials.json   (proyecto dev)
# Colocar en: src/firebase-credentials.PROD.json  (proyecto producción, solo referencia)

# Copiar .env (pedirlo al responsable)
# Colocar en: .env
```

### Contenido del `.env` local
```
PORT=3000
REDIS_URL=redis://localhost:6379
AMI_USER=admin
AMI_SECRET=<contraseña AMI>
```
> `ENABLE_PBX=true` solo se agrega en Hetzner (producción). En local no va.

### App Check — debug token (solo primera vez)
1. Arrancar el backend: `npm start`
2. Abrir el frontend con Live Server en `public/index.html`
3. Abrir consola del navegador (F12) — copiar el token que aparece:
   ```
   App Check debug token: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
   ```
4. Ir a Firebase Console → proyecto `everest-central` → App Check → Apps → everest-central-web → Manage debug tokens → Add debug token
5. Pegar el token con nombre `localhost`

---

## Flujo de trabajo diario

### 1. Arrancar entorno de desarrollo
```powershell
# Terminal 1 — backend
cd "D:/Kailu/Programación/Proyectos Web/DrivePizza.Everest-Central"
npm start

# VS Code — frontend
# Abrir public/index.html → clic derecho → Open with Live Server
# URL: http://127.0.0.1:5500/public/index.html
```

### 2. Desarrollar y probar
- Todos los cambios se prueban contra **Firestore DEV** — producción intacta.
- La impresora de comandas NO funciona en dev (escucha producción). Cambiar estados manualmente desde el dashboard.

### 3. Deploy a producción
Solo cuando las pruebas en dev estén completas y confirmadas.

**Si cambiaste el frontend:**
```powershell
cd "D:/Kailu/Programación/Proyectos Web/EverestCentral"
git add .
git commit -m "descripción del cambio"
git push origin feature/pruebas
firebase deploy --only hosting
```

**Si cambiaste el backend:**
```powershell
# Desde tu PC — push a GitHub
cd "D:/Kailu/Programación/Proyectos Web/DrivePizza.Everest-Central"
git add .
git commit -m "descripción del cambio"
git push origin main

# Aplicar en Hetzner
ssh hetzner "cd /root/backend && git pull origin main && source /root/.nvm/nvm.sh && pm2 restart backend --update-env"
```

**Si cambiaste ambos:** ejecutar los dos bloques anteriores.

---

## Migrar datos de producción a dev

Cuando necesites refrescar los datos del entorno dev con datos actuales de producción:

```powershell
cd "D:/Kailu/Programación/Proyectos Web/DrivePizza.Everest-Central"
node scripts/migrar-a-dev.mjs
```

Luego limpiar Redis local para que recargue desde Firestore dev:
```powershell
& "C:\Program Files\Redis\redis-cli.exe" FLUSHALL
npm start
```

---

## Estructura del backend

```
src/
├── config/
│   ├── ami.js        → conexión AMI (Asterisk PBX)
│   ├── firebase.js   → Firebase Admin init
│   ├── redis.js      → conexión Redis
│   └── sqlite.js     → SQLite (histórico movimientos)
├── modules/
│   ├── callcenter/
│   │   ├── listener.js  → carga caché inicial + timers auto-avance
│   │   ├── routes.js    → endpoints HTTP CallCenter
│   │   └── service.js   → lógica caché + escritura Firestore
│   ├── planta/
│   │   ├── listener.js  → carga caché inicial + safety net SQLite
│   │   ├── routes.js    → endpoints HTTP Planta
│   │   └── service.js   → lógica caché + escritura Firestore
│   └── pbx/
│       ├── devstate.js  → sync estado extensiones Asterisk (solo producción)
│       └── routes.js    → endpoints PBX/queue
├── shared/
│   └── ws-notify.js  → broadcast WebSocket
└── index.js          → arranque Fastify
```

### Variables de entorno backend (`.env`)
| Variable | Descripción |
|---|---|
| `PORT` | Puerto del servidor (3000) |
| `REDIS_URL` | URL Redis (`redis://localhost:6379`) |
| `AMI_USER` | Usuario AMI de Asterisk |
| `AMI_SECRET` | Contraseña AMI de Asterisk |
| `ENABLE_PBX` | Solo en Hetzner — activa sync devstate PBX |

---

## Comandos útiles Hetzner

```bash
# Conectar
ssh hetzner

# Ver estado del backend
source /root/.nvm/nvm.sh
pm2 status

# Ver logs en tiempo real
pm2 logs backend

# Reiniciar backend
pm2 restart backend --update-env

# Ver logs de errores
pm2 logs backend --err --lines 50
```

---

## Roles de usuario

| Rol | Acceso |
|---|---|
| `callcenter` | CallCenter |
| `callcenter-admin` | CallCenter + CSV + Liquidación |
| `planta` | Dashboard Planta |
| `planta-admin` | Dashboard + Ajuste Inventario + editar pedidos entregados |
| `admin` | Selector (Planta o CallCenter) |
| `pizzeria` | Panel Pizzerías |
| `pending` / `active: false` | Bloqueado |

---

## Flujo de estados PedidosCallCenter

```
pendiente → recibido → en preparación → despachado → entregado
                                                    → cancelado
```
- **CallCenter**: crea (pendiente)
- **printer.mjs**: imprime → recibido
- **Pizzería**: en preparación → despachado → entregado (o cancelado)

---

## Archivos que NUNCA van a git

```
# Backend
.env
src/firebase-credentials.json
src/firebase-credentials.PROD.json
data/          (SQLite)
node_modules/
```
