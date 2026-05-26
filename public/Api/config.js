const esLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

export const HETZNER_URL = esLocal
  ? 'http://localhost:3000'
  : 'https://api.everest-central.com'

export const WS_URL = esLocal
  ? 'ws://localhost:3000/ws'
  : 'wss://api.everest-central.com/ws'

// PBX siempre apunta a producción — solo hay un servidor de llamadas
export const PBX_URL = 'https://api.everest-central.com'

export const config = {
//Configuración del sistema de la planta
 everestCentralDB : {
  apiKey: "AIzaSyBINsuCknfDR0TxapYd0ujDxx9kF8TSdts",
  authDomain: "everest-central.firebaseapp.com",
  projectId: "everest-central",
  storageBucket: "everest-central.firebasestorage.app",
  messagingSenderId: "999219357353",
  appId: "1:999219357353:web:516ac6a89e751723716bb8",
  measurementId: "G-H8ZEHPHBMZ"
},
};

