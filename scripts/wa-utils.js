// Utilidades compartidas entre whatsapp.service.js y whatsapp.routes.js

// Normaliza teléfono colombiano a 10 dígitos (sin prefijo país).
// Acepta: '3XXXXXXXXX' · '573XXXXXXXXX' · '+573XXXXXXXXX'
// Devuelve el valor tal cual si no coincide con ningún patrón conocido.
export function normalizarTelefono(raw) {
  if (!raw) return null
  let t = String(raw).trim().replace(/\s+/g, '')
  if (t.startsWith('+')) t = t.slice(1)                           // +573... → 573...
  if (t.length === 12 && t.startsWith('57')) t = t.slice(2)       // 573...  → 3...
  if (t.length === 10 && t.startsWith('3')) return t
  return t
}
