import admin from 'firebase-admin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Palabras que deben permanecer en minúscula (artículos, preposiciones, etc.)
const EXCEPCIONES = new Set(['x', 'de', 'del', 'la', 'las', 'el', 'los', 'y', 'en', 'con', 'sin', 'por']);

function toTitleCase(str) {
    return str
        .toLowerCase()
        .split(' ')
        .map((word, i) => {
            if (i === 0 || !EXCEPCIONES.has(word)) {
                return word.charAt(0).toUpperCase() + word.slice(1);
            }
            return word;
        })
        .join(' ');
}

async function main() {
    const snap = await db.collection('Planta').doc('principal').collection('Productos').get();
    console.log(`🚀 Procesando ${snap.size} productos...\n`);

    const batch = db.batch();
    let cambios = 0;

    snap.forEach(docSnap => {
        const { name } = docSnap.data();
        if (!name) return;
        const nuevo = toTitleCase(name);
        if (nuevo !== name) {
            batch.update(docSnap.ref, { name: nuevo });
            console.log(`  "${name}" → "${nuevo}"`);
            cambios++;
        }
    });

    if (cambios === 0) {
        console.log('✅ Todos los nombres ya están en Title Case. Nada que actualizar.');
        process.exit(0);
    }

    await batch.commit();
    console.log(`\n✔ ${cambios} productos actualizados en un solo batch.`);
    process.exit(0);
}

main().catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
