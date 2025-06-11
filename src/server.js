require('dotenv').config(); // 👈 Carga las variables del archivo .env

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const connectDB = require('./config/database');
const googleContactsService = require('./services/googleContacts');
const contactsRouter = require('./routes/contacts');
const indexRouter = require('./routes/index');
const kommoRoutes = require('./routes/kommoRoutes');
const authRoutes = require('./routes/authRoutes');
const { setupLogger } = require('./utils/logger');
const { initializeDataDirectory } = require('./utils/init');
const serverState = require('./utils/serverState');
const jwt = require('jsonwebtoken');

const logger = setupLogger();
const app = express();
const PORT = process.env.PORT || 3000;

// Configurar multer para manejar archivos
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos .txt'));
    }
  }
});

// Middleware para parsear JSON
app.use(express.json());

// Logging simple de origen para debugging CORS
app.use((req, res, next) => {
  logger.info(`Request from origin: ${req.headers.origin} | Path: ${req.path}`);
  next();
});

// CORS abierto: permite cualquier origen
app.use(cors({
  origin: true,  // acepta cualquier origen
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// Responder correctamente a peticiones OPTIONS (preflight)
app.options('*', cors());

// Middleware para logging de tokens
app.use((req, res, next) => {
  const token = req.headers.authorization;
  logger.info(`📍 Request path: ${req.path}`);
  logger.info(`🔑 Token presente: ${token ? 'Sí' : 'No'}`);
  next();
});

// --- Rutas ---
app.get('/api/google', (req, res) => {
  try {
    const url = googleContactsService.getAuthUrl();
    logger.info(`🔗 URL de autenticación generada: ${url}`);
    res.json({ authUrl: url });
  } catch (error) {
    logger.error('❌ Error al generar URL de autenticación:', error);
    res.status(500).json({ error: 'Error al iniciar autenticación' });
  }
});

app.get('/api/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  
  if (!code) {
    logger.error('❌ Falta el código de autorización');
    return res.send(`
      <script>
        window.opener.postMessage({ type: 'google-auth-error', error: 'No se recibió código de autorización' }, '*');
        window.close();
      </script>
    `);
  }

  try {
    const tokens = await googleContactsService.getTokens(code);
    logger.info('✅ Tokens de Google obtenidos correctamente');
    
    res.send(`
      <html>
        <body>
          <script>
            window.opener.postMessage({
              type: 'google-auth-success',
              token: '${tokens.access_token}',
              refreshToken: '${tokens.refresh_token}'
            }, '*');
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
    logger.error('❌ Error en callback:', error);
    res.send(`
      <script>
        window.opener.postMessage({ 
          type: 'google-auth-error',
          error: 'Error al procesar la autenticación'
        }, '*');
        window.close();
      </script>
    `);
  }
});

app.post('/api/google/logout', async (req, res) => {
  try {
    // Obtener el userId del token JWT
    const token = req.headers.authorization?.split(' ')[1];
    let userId;
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.userId;
    }

    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    await googleContactsService.logout(userId);
    res.json({ message: 'Sesión de Google cerrada exitosamente' });
  } catch (error) {
    logger.error('Error al cerrar sesión de Google:', error);
    res.status(500).json({ error: 'Error al cerrar sesión de Google' });
  }
});

app.get('/api/auth/status', (req, res) => {
  res.json({
    isAuthenticated: serverState.isAuthenticated,
    lastAuthTime: serverState.lastAuthTime
  });
});

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

app.get('/', (req, res) => {
  res.send('🚀 API de contactos con Google lista!');
});

app.get('/google4dc067070f5d623b.html', (req, res) => {
  res.send('google-site-verification: google4dc067070f5d623b.html');
});

// Montar rutas
app.use('/api/auth', authRoutes);
app.use('/api/kommo', kommoRoutes);
app.use('/api', indexRouter);
app.use('/api/contacts', contactsRouter);

// Asegurarse de que existe el directorio de uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Manejo de errores general
app.use((err, req, res, next) => {
  logger.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Inicialización del servidor y base de datos
async function initialize() {
  try {
    await initializeDataDirectory();
    await connectDB();

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
