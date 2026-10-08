const express = require('express');
const cors = require('cors');
// Cambiamos 'firebase-admin' por 'firebase-admin/app' y 'firebase-admin/firestore'
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const webpush = require('web-push');

// 1. Cargar las credenciales de Firebase
const serviceAccount = require('./serviceAccountKey.json');

// 2. Inicializar Firebase Admin y Firestore
initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore();

// 3. Configurar las Claves VAPID de Web Push
const PUBLIC_VAPID_KEY = 'BE4rF6useTCDkY7j6e3V0vsK15h4ku7cpGG0-G57Zy3AVM7s86fVLzgl2xY7amTMtxyfoGe9UA3uj5VmzPiPIqs';
const PRIVATE_VAPID_KEY = '-4GUAg2u2AxszgcbXyLDkyDwaAzfY-v5br47VmkdADs';

webpush.setVapidDetails(
  'mailto:tu-email@ejemplo.com',
  PUBLIC_VAPID_KEY,
  PRIVATE_VAPID_KEY
);

// 4. Inicializar Express
const app = express();
app.use(cors());
app.use(express.json());

// Endpoint de prueba
app.get('/', (req, res) => {
  res.json({ mensaje: '¡Servidor Backend con Firestore corriendo correctamente!' });
});

// Endpoint para guardar suscripciones de notificaciones push
app.post('/api/guardar-suscripcion', async (req, res) => {
  try {
    const suscripcion = req.body;

    // Guardar en la colección 'suscripciones' de Firestore
    const docRef = await db.collection('suscripciones').add({
      suscripcion: suscripcion,
      creadoEn: new Date().toISOString()
    });

    console.log('Suscripción guardada en Firestore con ID:', docRef.id);
    res.status(201).json({ status: 'Éxito', id: docRef.id });
  } catch (error) {
    console.error('Error al guardar en Firestore:', error);
    res.status(500).json({ error: 'No se pudo guardar la suscripción' });
  }
});

// Endpoint para enviar una notificación push a TODOS los usuarios guardados
app.post('/api/enviar-notificacion-todos', async (req, res) => {
  const { titulo, mensaje, url } = req.body;

  const payload = JSON.stringify({
    title: titulo || 'Notificación PWA',
    body: mensaje || '¡Tienes un nuevo mensaje!',
    url: url || '/'
  });

  try {
    // Consultar todas las suscripciones en Firestore
    const snapshot = await db.collection('suscripciones').get();
    
    if (snapshot.empty) {
      return res.status(404).json({ mensaje: 'No hay suscripciones guardadas' });
    }

    // Enviar la notificación a cada usuario
    const promesasEnvio = snapshot.docs.map(doc => {
      const datosDoc = doc.data();
      return webpush.sendNotification(datosDoc.suscripcion, payload)
        .catch(err => {
          console.error(`Error enviando a ID ${doc.id}:`, err.message);
          if (err.statusCode === 410 || err.statusCode === 404) {
            db.collection('suscripciones').doc(doc.id).delete();
          }
        });
    });

    await Promise.all(promesasEnvio);

    res.json({ status: 'Notificaciones enviadas a todos los usuarios' });
  } catch (error) {
    console.error('Error enviando notificaciones:', error);
    res.status(500).json({ error: 'Error al procesar el envío' });
  }
});

// Iniciar el servidor en el puerto 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});