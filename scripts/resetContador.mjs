import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

await db.collection('Planta').doc('principal').collection('Contadores').doc('idPedidos').set({ ultimoId: 0 });
console.log('✅ Contador reseteado. El primer pedido será el N° 1.');
process.exit(0);
