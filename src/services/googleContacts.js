const { google } = require('googleapis');
const { setupLogger } = require('../utils/logger');
const serverState = require('../utils/serverState');
const GoogleToken = require('../models/GoogleToken'); // Ruta relativa
const connectDB = require('../config/database'); // Conexión a MongoDB
const fs = require('fs').promises;

const logger = setupLogger();

const SCOPES = ['https://www.googleapis.com/auth/contacts.readonly'];

class GoogleContactsService {
  constructor() {
    // Mapa para almacenar clientes OAuth2 por usuario
    this.oauth2Clients = new Map();
    
    // Cliente por defecto para compatibilidad
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
    );
    
    this.initialized = false;
    this.pageSize = 100;
  }

  // Obtener cliente OAuth2 específico para un usuario
  getOAuth2Client(userId) {
    if (!userId) {
      logger.warn('Se intentó acceder al cliente OAuth sin userId');
      return this.oauth2Client; // Fallback al cliente por defecto
    }
    
    if (!this.oauth2Clients.has(userId)) {
      const newClient = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
      );
      this.oauth2Clients.set(userId, newClient);
      logger.info(`Creado nuevo cliente OAuth2 para usuario: ${userId}`);
    }
    
    return this.oauth2Clients.get(userId);
  }

  // Inicialización específica por usuario
  async initialize(userId) {
    // Si no hay userId, usar la inicialización tradicional
    if (!userId) {
    if (this.initialized) return;

    await connectDB();
    const tokenDoc = await GoogleToken.findOne();

    if (!tokenDoc || !tokenDoc.tokens) {
      logger.error('No hay credenciales válidas para Google');
      serverState.setAuthenticated(false);
      throw new Error('No hay credenciales válidas. Por favor, autentícate nuevamente.');
    }

    this.oauth2Client.setCredentials(tokenDoc.tokens);
    this.initialized = true;
    serverState.setAuthenticated(true);
      logger.info('Credenciales de Google cargadas desde MongoDB (global)');
      return;
    }
    
    // Inicialización específica para un usuario
    await connectDB();
    const tokenDoc = await GoogleToken.findOne({ userId });

    if (!tokenDoc || !tokenDoc.tokens) {
      logger.error(`No hay credenciales válidas para Google del usuario ${userId}`);
      serverState.setUserAuthenticated(userId, false);
      throw new Error('No hay credenciales válidas. Por favor, autentícate nuevamente.');
    }

    const oauth2Client = this.getOAuth2Client(userId);
    oauth2Client.setCredentials(tokenDoc.tokens);
    serverState.setUserAuthenticated(userId, true);
    logger.info(`Credenciales de Google cargadas para usuario: ${userId}`);
  }

  // URL de autorización específica para un usuario
  getAuthUrl(userId) {
    const oauth2Client = userId ? this.getOAuth2Client(userId) : this.oauth2Client;
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      // Incluir el userId como estado para identificar al usuario en el callback
      state: userId ? userId : undefined
    });
  }

  // Obtener tokens específicos para un usuario
  async getTokens(code, userId) {
    await connectDB();

    const oauth2Client = userId ? this.getOAuth2Client(userId) : this.oauth2Client;
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    if (userId) {
      await GoogleToken.findOneAndUpdate(
        { userId },
        { tokens, userId, lastCode: code, lastUpdated: new Date() },
        { upsert: true }
      );
      serverState.setUserAuthenticated(userId, true);
      logger.info(`Tokens guardados para usuario ${userId}`);
    } else {
    await GoogleToken.findOneAndUpdate(
      {},
      { tokens, lastCode: code, lastUpdated: new Date() },
      { upsert: true }
    );
    this.initialized = true;
    serverState.setAuthenticated(true);
      logger.info('Tokens guardados en MongoDB correctamente (global)');
    }

    return tokens;
  }

  async getAllContactPages(peopleService, pageToken = null, allContacts = []) {
    const response = await peopleService.people.connections.list({
      resourceName: 'people/me',
      pageToken,
      pageSize: this.pageSize,
      personFields: 'names,phoneNumbers',
    });

    const contacts = response.data.connections || [];
    allContacts.push(...contacts);

    if (response.data.nextPageToken) {
      return this.getAllContactPages(peopleService, response.data.nextPageToken, allContacts);
    }

    return allContacts;
  }

  async processTextFile(filePath, userId) {
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      // Manejar diferentes tipos de saltos de línea (Windows y Unix)
      const lines = fileContent.split(/\r?\n/);
      
      const formatted = lines
        .filter(line => line.trim()) // Ignorar líneas vacías
        .map(line => {
          // Limpiar la línea de espacios extras y caracteres especiales
          const cleanLine = line.trim().replace(/\s+/g, '');
          const [name, phoneNumber] = cleanLine.split(',');
          
          // Validar que tengamos tanto nombre como número
          if (!name || !phoneNumber) {
            logger.warn(`Línea inválida ignorada: ${line}`);
            return null;
          }

          return {
            id: `txt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: name.trim(),
            phoneNumber: phoneNumber.replace(/[^0-9]/g, ''), // Solo mantener números
            isValid: false,
            source: 'text_file'
          };
        })
        .filter(contact => contact !== null && contact.phoneNumber); // Filtrar contactos nulos o sin número

      // Obtener contactos (específicos del usuario o globales)
      let existingContacts;
      if (userId) {
        existingContacts = serverState.getUserContacts(userId) || [];
      } else {
        existingContacts = serverState.getContacts() || [];
      }
      
      const allContacts = [...existingContacts, ...formatted];
      
      // Eliminar duplicados basados en número de teléfono
      const uniqueContacts = this.removeDuplicates(allContacts);
      
      // Guardar los contactos (específicos del usuario o globales)
      if (userId) {
        serverState.setUserContacts(userId, uniqueContacts);
      } else {
      serverState.setContacts(uniqueContacts);
      }

      // Limpiar el archivo temporal
      await fs.unlink(filePath);

      logger.info(`Procesados ${formatted.length} contactos desde archivo de texto${userId ? ` para usuario ${userId}` : ''}`);
      return formatted;
    } catch (error) {
      logger.error('Error al procesar archivo de texto:', error);
      throw new Error('Error al procesar el archivo de contactos: ' + error.message);
    }
  }

  removeDuplicates(contacts) {
    const seen = new Map();
    return contacts.filter(contact => {
      const normalizedPhone = contact.phoneNumber.replace(/\D/g, '');
      if (seen.has(normalizedPhone)) {
        return false;
      }
      seen.set(normalizedPhone, true);
      return true;
    });
  }

  getTotalContacts(userId) {
    if (userId) {
      const contacts = serverState.getUserContacts(userId);
      return contacts ? contacts.length : 0;
    } else {
    const contacts = serverState.getContacts();
    return contacts ? contacts.length : 0;
  }
  }

  async getContacts(userId) {
    // Inicializar con el usuario específico o en modo global
    await this.initialize(userId);

    // Buscar en caché específica del usuario o global
    let cached;
    if (userId) {
      cached = serverState.getUserContacts(userId);
    } else {
      cached = serverState.getContacts();
    }
    
    if (cached) return cached;

    // Obtener cliente OAuth y servicio People específico para el usuario
    const oauth2Client = userId ? this.getOAuth2Client(userId) : this.oauth2Client;
    const peopleService = google.people({ version: 'v1', auth: oauth2Client });
    const contacts = await this.getAllContactPages(peopleService);

    const formatted = contacts
      .filter(c => c.phoneNumbers && c.phoneNumbers.length > 0)
      .map(c => ({
        id: c.resourceName.split('/')[1],
        googleId: c.resourceName,
        name: c.names?.[0]?.displayName || 'Sin nombre',
        phoneNumber: c.phoneNumbers[0].value.replace(/\s+/g, '').replace(/[-\(\)]/g, ''),
        isValid: false,
        source: 'google'
      }));

    // Guardar en caché específica del usuario o global
    if (userId) {
      serverState.setUserContacts(userId, formatted);
    } else {
    serverState.setContacts(formatted);
    }
    
    return formatted;
  }

  async logout(userId) {
    await connectDB();
    
    if (userId) {
      // Eliminar tokens específicos del usuario
      await GoogleToken.deleteOne({ userId });
      // Limpiar el cliente OAuth
      if (this.oauth2Clients.has(userId)) {
        this.oauth2Clients.delete(userId);
      }
      // Limpiar estado del usuario
      serverState.clearUserState(userId);
      logger.info(`Tokens eliminados y sesión cerrada para usuario ${userId}`);
    } else {
      // Modo compatible con versión anterior
    this.initialized = false;
    serverState.clearState();
    await GoogleToken.deleteMany();
      logger.info('Tokens eliminados de MongoDB y sesión cerrada (global)');
    }
  }
}

module.exports = new GoogleContactsService();