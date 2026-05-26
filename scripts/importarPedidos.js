import admin from 'firebase-admin';
import { createRequire } from 'module';

// createRequire es necesario para importar archivos JSON en ES Modules
const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');
const datosPedidos = require('./DetallePedido.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const LOTE = 100;

async function subirPedidos() {
    console.log(`Iniciando la subida de ${datosPedidos.length} pedidos a Firestore...`);

    let contador = 0;
    let batch = db.batch();

    for (const pedido of datosPedidos) {
        const docRef = db.collection('pedidodetalle').doc();
        batch.set(docRef, pedido);
        contador++;

        if (contador % LOTE === 0) {
            console.log(`Subiendo lote #${contador / LOTE}...`);
            await batch.commit();
            console.log(`Lote #${contador / LOTE} subido con éxito.`);
            batch = db.batch();
        }
    }

    if (contador % LOTE !== 0) {
        await batch.commit();
        console.log(`Último lote de ${contador % LOTE} pedidos subido con éxito.`);
    }

    console.log('¡Importación completa! Todos los pedidos han sido subidos a Firestore.');
    process.exit(0);
}

subirPedidos().catch((e) => {
    console.error('Error durante la importación:', e);
    process.exit(1);
});
