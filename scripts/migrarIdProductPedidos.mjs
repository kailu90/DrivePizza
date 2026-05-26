// Migración: actualiza idProduct en PedidosPlanta pendientes
// Reemplaza el id_product numérico por el docId real de Firestore
// Uso: node migrarIdProductPedidos.mjs

import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function migrar() {
    // 1. Cargar todos los productos → mapa id_product → docId
    console.log('Cargando productos...');
    const productosSnap = await db.collection('Planta').doc('principal').collection('Productos').get();
    const mapaIdProductADocId = {};
    productosSnap.forEach(d => {
        const { id_product } = d.data();
        if (id_product !== undefined) {
            mapaIdProductADocId[String(id_product)] = d.id;
        }
    });
    console.log(`  ${productosSnap.size} productos cargados en mapa.`);

    // 2. Cargar pedidos pendientes
    console.log('Cargando pedidos pendientes...');
    const pedidosSnap = await db
        .collection('Planta').doc('principal').collection('PedidosPlanta')
        .where('status', '==', 'pendiente')
        .get();
    console.log(`  ${pedidosSnap.size} pedidos pendientes encontrados.`);

    if (pedidosSnap.empty) {
        console.log('No hay pedidos pendientes que migrar.');
        return;
    }

    let actualizados = 0;
    let sinCambios = 0;
    let errores = [];

    for (const pedidoDoc of pedidosSnap.docs) {
        const pedido = pedidoDoc.data();
        const productos = pedido.products || [];
        let necesitaActualizar = false;

        const productosActualizados = productos.map(p => {
            const idActual = String(p.idProduct);
            // Si ya parece un docId de Firestore (no es solo numérico), no tocar
            if (!/^\d+$/.test(idActual)) return p;

            const docId = mapaIdProductADocId[idActual];
            if (!docId) {
                errores.push(`  ⚠️  Pedido #${pedido.idPedido}: producto "${p.name}" (idProduct=${idActual}) no encontrado en mapa`);
                return p;
            }

            necesitaActualizar = true;
            return { ...p, idProduct: docId };
        });

        if (!necesitaActualizar) {
            sinCambios++;
            continue;
        }

        await pedidoDoc.ref.update({ products: productosActualizados });
        console.log(`  ✅ Pedido #${pedido.idPedido} (${pedidoDoc.id}) migrado.`);
        actualizados++;
    }

    console.log('\n── Resumen ─────────────────────────────');
    console.log(`  Actualizados: ${actualizados}`);
    console.log(`  Sin cambios:  ${sinCambios}`);
    if (errores.length > 0) {
        console.log(`  Advertencias:`);
        errores.forEach(e => console.log(e));
    }
    console.log('────────────────────────────────────────');
}

migrar().catch(err => {
    console.error('Error fatal:', err);
    process.exit(1);
});
