import admin from 'firebase-admin';
import { createRequire } from 'module';

// createRequire es necesario para importar archivos JSON en ES Modules
const require = createRequire(import.meta.url);
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const proveedores = [
    { id: "1",  data: { idSupplier: 1,  name: "La Receta" } },
    { id: "2",  data: { idSupplier: 2,  name: "Makro" } },
    { id: "3",  data: { idSupplier: 3,  name: "PriceSmart" } },
    { id: "4",  data: { idSupplier: 4,  name: "Quintero" } },
    { id: "5",  data: { idSupplier: 5,  name: "Juan D Hoyos" } },
    { id: "6",  data: { idSupplier: 6,  name: "Planta Producción" } },
    { id: "7",  data: { idSupplier: 7,  name: "Colanta" } },
    { id: "8",  data: { idSupplier: 8,  name: "Graficas y empaques universal" } },
    { id: "9",  data: { idSupplier: 9,  name: "Harinera del valle" } },
    { id: "10", data: { idSupplier: 10, name: "Víveres villabel" } },
    { id: "11", data: { idSupplier: 11, name: "Suescun" } },
    { id: "12", data: { idSupplier: 12, name: "Carbolsas" } },
    { id: "13", data: { idSupplier: 13, name: "Condimentos Leo" } },
    { id: "14", data: { idSupplier: 14, name: "Otros" } },
    { id: "15", data: { idSupplier: 15, name: "Freska Leche" } },
    { id: "16", data: { idSupplier: 16, name: "Colombo Alemana" } },
    { id: "17", data: { idSupplier: 17, name: "Ramo" } },
    { id: "18", data: { idSupplier: 18, name: "Amazon" } },
    { id: "19", data: { idSupplier: 19, name: "hot brothers" } },
    { id: "20", data: { idSupplier: 20, name: "Gastronomía Paisa" } },
    { id: "21", data: { idSupplier: 21, name: "Ideal" } },
    { id: "22", data: { idSupplier: 22, name: "La muela" } },
    { id: "23", data: { idSupplier: 23, name: "DSAM" } },
    { id: "24", data: { idSupplier: 24, name: "EQUATRO" } },
    { id: "25", data: { idSupplier: 25, name: "Distrilagos" } },
    { id: "26", data: { idSupplier: 26, name: "Coopasan" } },
    { id: "27", data: { idSupplier: 27, name: "Distribuciones Quintero" } },
    { id: "28", data: { idSupplier: 28, name: "Plasti Diaz" } },
    { id: "29", data: { idSupplier: 29, name: "Deli Piña" } },
    { id: "30", data: { idSupplier: 30, name: "YANETH" } },
    { id: "31", data: { idSupplier: 31, name: "Distribuciones Aurora" } },
    { id: "32", data: { idSupplier: 32, name: "Desechables la 33" } },
    { id: "33", data: { idSupplier: 33, name: "Delichicks" } },
    { id: "35", data: { idSupplier: 35, name: "Calipso" } },
    { id: "36", data: { idSupplier: 36, name: "Paloquemado Bogotá" } },
    { id: "37", data: { idSupplier: 37, name: "Ecoplast" } },
];

async function main() {
    console.log(`🚀 Actualizando ${proveedores.length} proveedores en Firestore...`);
    const ref = (id) => db.collection('Planta').doc('principal').collection('Proveedores').doc(id);
    let ok = 0, err = 0;

    for (const { id, data } of proveedores) {
        try {
            await ref(id).set(data);
            console.log(`  ✅ [${id}] ${data.name}`);
            ok++;
        } catch (e) {
            console.error(`  ❌ [${id}] ${e.message}`);
            err++;
        }
    }

    console.log(`\n✔ ${ok} actualizados, ${err} errores`);
    process.exit(0);
}

main().catch((e) => {
    console.error('Error:', e);
    process.exit(1);
});
