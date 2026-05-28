const esLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

export const HETZNER_URL = esLocal
  ? 'http://localhost:3000'
  : 'https://api.everest-central.com'

// ── Supabase ──────────────────────────────────────────────────────────────────
// Dev:  acceso directo al puerto Kong en Hetzner (HTTP válido desde Live Server)
// Prod: subdominio HTTPS — se configura en Caddy antes del deploy final
export const SUPABASE_URL = esLocal
  ? 'http://65.109.225.149:8000'
  : 'https://supabase.everest-central.com'

export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNjQxNzY5MjAwLCJleHAiOjE3OTk1MzU2MDB9.QaBczoJojpVAXG--Xtg0mE-3yu0dg-AvIIWLq7WvvgU'

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

