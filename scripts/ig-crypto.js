// ig-crypto.js — AES-256-GCM encrypt/decrypt para tokens de Instagram
// Formato: base64(nonce[12] || authTag[16] || ciphertext)
// Clave: IG_TOKEN_ENCRYPTION_KEY — 64 hex chars (32 bytes)

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

function _key() {
  const hex = process.env.IG_TOKEN_ENCRYPTION_KEY
  if (!hex || hex.length !== 64)
    throw new Error('IG_TOKEN_ENCRYPTION_KEY no configurada o invalida (requiere 64 hex chars)')
  return Buffer.from(hex, 'hex')
}

export function encryptToken(plaintext) {
  const key    = _key()
  const nonce  = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  const ct     = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag    = cipher.getAuthTag()
  return Buffer.concat([nonce, tag, ct]).toString('base64')
}

export function decryptToken(enc) {
  const buf    = Buffer.from(enc, 'base64')
  const nonce  = buf.subarray(0, 12)
  const tag    = buf.subarray(12, 28)
  const ct     = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', _key(), nonce)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
