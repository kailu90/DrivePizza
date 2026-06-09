# Módulo PBX — EverestCentral

## Objetivo (v1)

Que los asesores del CallCenter puedan recibir llamadas del IVR directamente en el navegador, integrado en la interfaz del CallCenter, mostrando el número del cliente automáticamente.

---

## Arquitectura

```
[Cliente llama]
      ↓
[Issabel / IVR] → enruta a cola de asesores
      ↓ SIP (túnel SSH)
[Kamailio / Hetzner] → proxy SIP + WebSocket
      ↓ WSS
[Browser asesor] → JsSIP embebido en callcenter-shell.html
```

**Media (audio)** requiere RTPEngine porque Asterisk 11 no soporta WebRTC nativo:

```
[Asterisk] ── RTP ──► [RTPEngine / Hetzner] ── SRTP/WebRTC ──► [Browser]
                Kamailio le indica a RTPEngine qué convertir
```

---

## Estado actual

| | |
|---|---|
| ✅ | Browser se registra como extensión SIP en Kamailio |
| ✅ | INVITE de Asterisk llega al browser (badge "llamada entrante") |
| ✅ | Túnel SSH Issabel ↔ Hetzner funcionando |
| ❌ | Audio (requiere RTPEngine) |
| ❌ | Softphone integrado en callcenter-shell.html |
| ❌ | Número del cliente visible al recibir la llamada |
| ❌ | Extensiones por asesor (hoy solo existe 8001 de prueba) |

---

## Plan v1 — Paso a paso

### Paso 1 — RTPEngine (audio) ← PRÓXIMO
Instalar RTPEngine en Hetzner en modo userspace (sin módulo kernel).
Configurar Kamailio para que transforme el SDP de Asterisk a WebRTC.
**Resultado**: llamada con audio funcional entre Asterisk y el browser.

### Paso 2 — Extensiones por asesor
Crear extensiones SIP (8001, 8002, 8003...) en Issabel, una por asesor.
Agregar campo `extension` al documento del usuario en Firestore.
**Resultado**: cada asesor se registra con su propia extensión.

### Paso 3 — Integración en CallCenter
Crear `public/CallCenter/pbx.js` con la lógica JsSIP.
Integrar en `callcenter-shell.html`: panel de softphone con estado, botón contestar/colgar.
Al recibir llamada → mostrar número del cliente (desde SIP `From` header).
**Resultado**: asesor recibe llamada y ve el número sin salir del CallCenter.

### Paso 4 — Cola de llamadas en Issabel
Configurar una cola (`Queue`) en Issabel donde se registren los asesores.
El asesor "entra" a la cola desde el CallCenter → comienza a recibir llamadas.
El asesor "sale" de la cola al cerrar sesión o desconectarse.
**Resultado**: distribución de llamadas entre asesores disponibles.

---

## Integración con CallCenter

El PBX es un módulo independiente pero vive dentro del CallCenter:

- El softphone va embebido en `callcenter-shell.html` (no en una página aparte)
- Al recibir llamada → aparece el número del cliente, el asesor crea el pedido normalmente
- El pedido se guarda con `canal: 'ivr'` para distinguirlo de pedidos por WhatsApp
- Planta y Pizzerías **no tienen integración** con el módulo PBX

---

## Archivos clave

| Archivo | Descripción |
|---|---|
| `public/CallCenter/pbx.js` | Lógica JsSIP (a crear en Paso 3) |
| `public/CallCenter/callcenter-shell.html` | Integra el softphone |
| `public/Estilos/pbx.css` | Estilos del panel softphone (a crear) |
| `/etc/kamailio/kamailio.cfg` | Proxy SIP en Hetzner |
| `/etc/rtpengine/rtpengine.conf` | Media bridge en Hetzner (a instalar) |
| `/etc/asterisk/sip_custom.conf` | Peers de enrutamiento en Issabel |
| `/etc/systemd/system/tunnel-vps.service` | Túnel autossh en Issabel |
| `scripts/softphone.html` | Softphone de prueba (temporal) |
