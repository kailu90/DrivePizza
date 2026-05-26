import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const snap = await db
    .collection('CallCenter').doc('principal')
    .collection('PedidosCallCenter')
    .where('tipo', '==', 'reserva')
    .get();

let actualizadas = 0;
let omitidas = 0;

for (const doc of snap.docs) {
    const data = doc.data();

    if (data.estado === 'recibido' && data.tsRecibido) {
        omitidas++;
        continue;
    }

    const ts = data.tsRecibido ?? data.updatedAt ?? data.fecha ?? admin.firestore.Timestamp.now();
    const update = { estado: 'recibido', tsRecibido: ts };

    await doc.ref.update(update);
    console.log(`✅ #${data.nPedido} (${doc.id}) → estado: recibido, tsRecibido = ${ts.toDate?.() ?? ts}`);
    actualizadas++;
}

console.log(`\nListo: ${actualizadas} actualizadas, ${omitidas} ya estaban correctas.`);
process.exit(0);
