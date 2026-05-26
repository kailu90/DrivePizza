import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const BATCH_SIZE = 400;

async function borrarColeccion(colRef) {
    let borrados = 0;
    let snap;
    do {
        snap = await colRef.limit(BATCH_SIZE).get();
        if (snap.empty) break;
        const batch = db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        borrados += snap.docs.length;
        console.log(`  🗑  ${borrados} pedidos eliminados...`);
    } while (snap.docs.length === BATCH_SIZE);
    return borrados;
}

async function main() {
    const pedidosRef = db.collection('Planta').doc('principal').collection('PedidosPlanta');
    const contadorRef = db.collection('Planta').doc('principal').collection('Contadores').doc('idPedidos');

    // 1. Contar antes de borrar
    const preview = await pedidosRef.count().get();
    const total = preview.data().count;
    console.log(`\n📋 PedidosPlanta encontrados: ${total}`);

    if (total === 0) {
        console.log('ℹ️  No hay pedidos que borrar.');
    } else {
        console.log(`🚀 Borrando ${total} pedidos...`);
        const borrados = await borrarColeccion(pedidosRef);
        console.log(`✅ ${borrados} pedidos eliminados.`);
    }

    // 2. Resetear contador
    console.log('\n🔄 Reseteando contador idPedidos a 1499...');
    await contadorRef.set({ idPedido: 1499 });
    console.log('✅ Contador reseteado. El primer pedido real será el 1500.');

    console.log('\n✔ Listo. Sistema preparado para datos reales.\n');
    process.exit(0);
}

main().catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
});
