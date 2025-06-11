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
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
    );
    this.initialized = false;
    this.pageSize = 100;
  }

  async initialize() {
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
    logger.info('Credenciales de Google cargadas desde MongoDB');
  }

  getAuthUrl() {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
    });
  }

  async getTokens(code) {
    await connectDB();

    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);

    await GoogleToken.findOneAndUpdate(
      {},
      { tokens, lastCode: code, lastUpdated: new Date() },
      { upsert: true }
    );

    this.initialized = true;
    serverState.setAuthenticated(true);
    logger.info('Tokens guardados en MongoDB correctamente');

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

  async processTextFile(filePath) {
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

      // Combinar con los contactos existentes
      const existingContacts = serverState.getContacts() || [];
      const allContacts = [...existingContacts, ...formatted];
      
      // Eliminar duplicados basados en número de teléfono
      const uniqueContacts = this.removeDuplicates(allContacts);
      serverState.setContacts(uniqueContacts);

      // Limpiar el archivo temporal
      await fs.unlink(filePath);

      logger.info(`Procesados ${formatted.length} contactos desde archivo de texto`);
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

  getTotalContacts() {
    const contacts = serverState.getContacts();
    return contacts ? contacts.length : 0;
  }

  async getContacts() {
    await this.initialize();

    const cached = serverState.getContacts();
    if (cached) return cached;

    const peopleService = google.people({ version: 'v1', auth: this.oauth2Client });
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

    serverState.setContacts(formatted);
    return formatted;
  }

  async logout() {
    await connectDB();
    this.initialized = false;
    serverState.clearState();
    await GoogleToken.deleteMany();
    logger.info('Tokens eliminados de MongoDB y sesión cerrada');
  }
}

module.exports = new GoogleContactsService();