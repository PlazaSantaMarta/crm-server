require('dotenv').config(); // 👈 Carga las variables del archivo .env

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database'); // 👈 Importamos la conexión a MongoDB
const googleContactsService = require('./services/googleContacts');
const contactsRouter = require('./routes/contacts');
const indexRouter = require('./routes/index');
const kommoRoutes = require('./routes/kommoRoutes');
const authRoutes = require('./routes/authRoutes'); // 👈 Importamos las rutas de autenticación
const { setupLogger } = require('./utils/logger');
const { initializeDataDirectory } = require('./utils/init');
const serverState = require('./utils/serverState');
const path = require('path');
const fs = require('fs/promises');

const logger = setupLogger();
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para parsear JSON
app.use(express.json());

// Configure CORS to allow requests from the frontend
app.use(cors({
  origin: [process.env.BACK_URI,'http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

// Ruta para iniciar autenticación con Google
app.get('/api/google', (req, res) => {
  try {
    const url = googleContactsService.getAuthUrl();
    res.json({ authUrl: url });
  } catch (error) {
    logger.error('Error al generar URL de autenticación:', error);
    res.status(500).json({ error: 'Error al iniciar autenticación' });
  }
});

// Ruta de callback de Google
app.get('/api/auth/google/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    logger.error('Falta el código de autorización');
    return res.send(`
      <script>
        window.opener.postMessage('google-auth-error', '*');
        window.close();
      </script>
    `);
  }

  try {
    await googleContactsService.getTokens(code);
    res.send(`
      <html>
        <body>
          <script>
            window.opener.postMessage('google-auth-success', '*');
            window.close();
          </script>
          <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: Arial, sans-serif;">
            <div style="text-align: center;">
              <h2>Autenticación Exitosa</h2>
              <p>Puedes cerrar esta ventana.</p>
            </div>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    logger.error('Error en callback:', error);
    res.send(`
      <script>
        window.opener.postMessage('google-auth-error', '*');
        window.close();
      </script>
    `);
  }
});

// Ruta para cerrar sesión de Google
app.post('/api/google/logout', async (req, res) => {
  try {
    await googleContactsService.logout();
    res.json({ message: 'Sesión de Google cerrada exitosamente' });
  } catch (error) {
    logger.error('Error al cerrar sesión de Google:', error);
    res.status(500).json({ error: 'Error al cerrar sesión de Google' });
  }
});

// Ruta para obtener estado de autenticación
app.get('/api/auth/status', (req, res) => {
  res.json({
    isAuthenticated: serverState.isAuthenticated,
    lastAuthTime: serverState.lastAuthTime
  });
});

// Ruta para obtener contactos
app.get('/api/contacts', async (req, res) => {
  try {
    if (!serverState.isAuthenticated) {
      return res.status(401).json({
        error: 'No autenticado',
        message: 'Por favor, inicia sesión con Google.'
      });
    }

    const contacts = await googleContactsService.getContacts();
    res.json(contacts);
  } catch (error) {
    logger.error('Error al obtener contactos:', error);
    res.status(500).json({ 
      error: 'Error al obtener contactos',
      message: error.message
    });
  }
});

// Ruta raíz opcional
app.get('/', (req, res) => {
  res.send('🚀 API de contactos con Google lista!');
});

// Montar las rutas
app.use('/api/auth', authRoutes);     // 👈 Rutas de autenticación (incluye login, logout y status)
app.use('/api/kommo', kommoRoutes);   // Rutas de Kommo
app.use('/api', indexRouter);         // Rutas generales
app.use('/api/contacts', contactsRouter);

// Inicialización
async function initialize() {
    try {
        await initializeDataDirectory();
        
        // Conectar a MongoDB
        await connectDB();
        
        // Verificar estado inicial de autenticación
        try {
            await googleContactsService.initialize();
            logger.info('🔐 Servidor iniciado con sesión activa');
        } catch (error) {
            logger.info('🔓 Servidor iniciado. Esperando autenticación...');
        }
        
    } catch (error) {
        logger.error('Error en la inicialización:', error);
        process.exit(1);
    }
}

// Manejo de errores
app.use((err, req, res, next) => {
    logger.error('Error no manejado:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

initialize().then(() => {
    app.listen(PORT, () => {
        logger.info(`
🚀 Servidor CRM iniciado
📍 Puerto: ${PORT}
🔒 Estado: ${serverState.isAuthenticated ? 'Autenticado' : 'Esperando autenticación'}
📱 Contactos en memoria: ${serverState.getContacts()?.length || 0}
        `);
    });
});
