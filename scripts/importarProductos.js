import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// createRequire es necesario para importar archivos JSON en ES Modules
const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

// __dirname no existe en ES Modules, se reconstruye así
const __dirname = dirname(fileURLToPath(import.meta.url));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function importarProductos() {
    const filePath = join(__dirname, 'Productos.json');
    const productos = JSON.parse(readFileSync(filePath, 'utf8'));

    console.log(`Importando ${productos.length} productos a /Planta/principal/Productos/...`);

    let exitosos = 0;
    let errores = 0;

    for (const producto of productos) {
        const docId = String(producto.id_product);
        try {
            await db
                .collection('Planta').doc('principal')
                .collection('Productos').doc(docId)
                .set(producto);
            console.log(`✅ [${docId}] ${producto.name}`);
            exitosos++;
        } catch (error) {
            console.error(`❌ [${docId}] ${producto.name} — ${error.message}`);
            errores++;
        }
    }

    console.log(`\n🎉 Importación finalizada: ${exitosos} exitosos, ${errores} errores.`);
    process.exit(errores > 0 ? 1 : 0);
}

importarProductos();
