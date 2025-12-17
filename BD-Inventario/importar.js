const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ⚠️ Cambia el nombre de este archivo por el de tu clave de seguridad
const serviceAccount = require('./serviceAccountKey.json');

const jsonDataPath = './';

// ⚠️ Lista de los nombres de tus 7 archivos JSON. ¡Asegúrate que coincidan exactamente!
const jsonFiles = [
    'PedidosDetalle.json',
];

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Esta función sube los datos de cada archivo en lotes para evitar errores de cuota.
// La variable 'db' se mantiene de tu código anterior

// ... (código anterior)

async function uploadData() {
    try {
        for (const fileName of jsonFiles) {
            const filePath = path.join(jsonDataPath, fileName);
            const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            console.log(`Subiendo datos del archivo: ${fileName}...`);

            const collectionName = fileName.replace('.json', '');

            let count = 0;
            for (const data of jsonData) {
                try {
                    const docRef = db.collection(collectionName).doc();
                    await docRef.set(data);
                    console.log(`✅ Documento con ID ${data.idOrderDetail} subido.`);
                    count++;
                } catch (error) {
                    console.error(`❌ Error al subir el documento con ID: ${data.idOrderDetail}`);
                    console.error('❌ Detalles del error:', error);
                    // Aquí el script se detendrá
                    process.exit(1);
                }
            }

            console.log(`🎉 ¡${count} documentos de ${fileName} importados exitosamente!`);
        }
        console.log('🎉 ¡Todos los datos han sido importados a Firestore!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error general:', error);
        process.exit(1);
    }
}

uploadData();