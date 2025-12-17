// Asegúrate de haber instalado firebase-admin: npm install firebase-admin
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Reemplaza esto con la ruta a tu archivo de credenciales del SDK de Admin
const serviceAccount = require('./key.json'); 
const datosPedidos = require('./DetallePedido.json');

// Inicializa la app de Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const batch = db.batch();

// Sube los datos por lotes de 100
const lote = 100;
let contador = 0;

async function subirPedidos() {
  console.log(`Iniciando la subida de ${datosPedidos.length} pedidos a Firestore...`);

  for (const pedido of datosPedidos) {
    const docRef = db.collection("pedidodetalle").doc(); // Crea un ID de documento automático
    batch.set(docRef, pedido);

    contador++;

    if (contador % lote === 0) {
      console.log(`Subiendo lote #${contador / lote}...`);
      await batch.commit();
      console.log(`Lote #${contador / lote} subido con éxito.`);
      batch = db.batch(); // Reinicia el lote
    }
  }

  // Sube los documentos restantes en el último lote
  if (contador % lote !== 0) {
    await batch.commit();
    console.log(`Último lote de ${contador % lote} pedidos subido con éxito.`);
  }

  console.log("¡Importación completa! Todos los pedidos han sido subidos a Firestore.");
}

subirPedidos().catch(error => {
  console.error("Error durante la importación:", error);
});