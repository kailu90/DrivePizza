import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function resetStock() {
    const colRef = db.collection('Planta/principal/Productos');
    const snapshot = await colRef.get();

    if (snapshot.empty) {
        console.log('No se encontraron productos.');
        return;
    }

    const BATCH_SIZE = 500;
    let batch = db.batch();
    let count = 0;
    let total = 0;

    for (const doc of snapshot.docs) {
        batch.update(doc.ref, { stock: 0 });
        count++;
        total++;

        if (count === BATCH_SIZE) {
            await batch.commit();
            console.log(`Batch enviado: ${total} productos procesados...`);
            batch = db.batch();
            count = 0;
        }
    }

    if (count > 0) {
        await batch.commit();
    }

    console.log(`✅ Listo. ${total} productos actualizados a stock: 0`);
}

resetStock().catch(console.error);
