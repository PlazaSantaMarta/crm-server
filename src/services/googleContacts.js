const { google } = require('googleapis');
const { setupLogger } = require('../utils/logger');
const serverState = require('../utils/serverState');
const fs = require('fs').promises;
const path = require('path');

const logger = setupLogger();

// Configuración de Google OAuth
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
);

const scopes = [
  'https://www.googleapis.com/auth/contacts.readonly'
];

const TOKEN_PATH = path.join(__dirname, '../../../data/google_token.json');

class GoogleContactsService {
  constructor() {
    this.oauth2Client = oauth2Client;
    this.initialized = false;
    this.pageSize = 100; // Google's recommended page size
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      const tokenContent = await fs.readFile(TOKEN_PATH);
      const tokens = JSON.parse(tokenContent);
      this.oauth2Client.setCredentials(tokens);
      this.initialized = true;
      serverState.setAuthenticated(true);
      logger.info('Credenciales de Google cargadas correctamente');
    } catch (error) {
      serverState.setAuthenticated(false);
      logger.error('Error al cargar credenciales de Google:', error);
      throw new Error('No hay credenciales válidas. Por favor, autentícate nuevamente.');
    }
  }

  getAuthUrl() {
    const url = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
    });
    
    logger.info('URL de autenticación de Google generada');
    return url;
  }

  async getTokens(code) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);
      
      await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
      
      this.initialized = true;
      serverState.setAuthenticated(true);
      logger.info('Tokens de Google obtenidos y guardados correctamente');
      return tokens;
    } catch (error) {
      serverState.setAuthenticated(false);
      logger.error('Error al obtener tokens de Google:', error);
      throw error;
    }
  }

  async getAllContactPages(peopleService, pageToken = null, allContacts = []) {
    const response = await peopleService.people.connections.list({
      resourceName: 'people/me',
      pageToken: pageToken,
      pageSize: this.pageSize,
      personFields: 'names,phoneNumbers',
    });

    const contacts = response.data.connections || [];
    allContacts.push(...contacts);

    if (response.data.nextPageToken) {
      logger.info(`Obteniendo siguiente página de contactos. Total actual: ${allContacts.length}`);
      return this.getAllContactPages(peopleService, response.data.nextPageToken, allContacts);
    }

    return allContacts;
  }

  async getContacts() {
    try {
      // Si ya tenemos contactos en memoria, los devolvemos
      const cachedContacts = serverState.getContacts();
      if (cachedContacts) {
        logger.info('Devolviendo contactos almacenados en memoria');
        return cachedContacts;
      }

      await this.initialize();
      
      const peopleService = google.people({ version: 'v1', auth: this.oauth2Client });
      
      logger.info('Iniciando obtención de contactos de Google');
      const contacts = await this.getAllContactPages(peopleService);
      
      const formattedContacts = contacts
        .filter(contact => contact.phoneNumbers && contact.phoneNumbers.length > 0)
        .map(contact => ({
          id: contact.resourceName.split('/')[1],
          googleId: contact.resourceName,
          name: contact.names?.[0]?.displayName || 'Sin nombre',
          phoneNumber: contact.phoneNumbers[0].value
            .replace(/\s+/g, '')
            .replace(/[-\(\)]/g, ''),
          isValid: false
        }));
      
      // Almacenar en memoria
      serverState.setContacts(formattedContacts);
      logger.info(`Total de contactos procesados: ${formattedContacts.length}`);
      
      return formattedContacts;
    } catch (error) {
      logger.error('Error al obtener contactos de Google:', error);
      throw error;
    }
  }

  async logout() {
    try {
      this.initialized = false;
      serverState.clearState();
      await fs.unlink(TOKEN_PATH);
      logger.info('Sesión cerrada y tokens eliminados');
    } catch (error) {
      logger.error('Error al cerrar sesión:', error);
      throw error;
    }
  }
}

module.exports = new GoogleContactsService(); 