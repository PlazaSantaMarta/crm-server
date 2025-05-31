require('dotenv').config();

const connectDB = require('./config/database'); // 👈 Importamos la conexión a MongoDB
await connectDB();

const { getContactsByCode } = require('./src/googleContacts');

const code = process.argv[2];

if (!code) {
  console.error('❌ Debes pasar el código como argumento');
  process.exit(1);
}

(async () => {
  try {
    const contacts = await getContactsByCode(code);
    console.log('✅ Contactos obtenidos:', contacts);
  } catch (error) {
    console.error('❌ Error al obtener contactos:', error);
  }
})();
