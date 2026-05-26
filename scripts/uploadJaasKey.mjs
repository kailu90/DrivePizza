// Ejecutar UNA sola vez: node uploadJaasKey.mjs
// Sube la clave privada de JaaS a Firestore de forma segura.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore }        from 'firebase-admin/firestore';
import { readFileSync }        from 'fs';
import { createRequire }       from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const privateKey = readFileSync('./Key 19_3_2026, 12_12_01 p.m..pk', 'utf8');

await db.collection('Config').doc('jaas').set({
    appId:      'vpaas-magic-cookie-80c6239634934dcfa925dcc496466b3a',
    keyId:      'vpaas-magic-cookie-80c6239634934dcfa925dcc496466b3a/6f700d',
    privateKey: privateKey
});

console.log('✅ JaaS config subida a Firestore correctamente.');
