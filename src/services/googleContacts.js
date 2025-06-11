const { google } = require('googleapis');
const { setupLogger } = require('../utils/logger');
const serverState = require('../utils/serverState');
const GoogleToken = require('../models/GoogleToken');
const connectDB = require('../config/database');
const fs = require('fs').promises;
const User = require('../models/User');

const logger = setupLogger();

const SCOPES = ['https://www.googleapis.com/auth/contacts.readonly'];

class GoogleContactsService {
  constructor() {
    // Mapa para almacenar clientes OAuth2 por usuario
    this.oauth2Clients = new Map();
  }

  // Obtener cliente OAuth2 específico para un usuario
  getOAuth2Client(userId) {
    if (!userId) {
      logger.error('Se intentó acceder al cliente OAuth sin userId');
      throw new Error('Se requiere userId para acceder al cliente OAuth');
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
    if (!userId) {
      logger.error('Se requiere userId para inicializar Google Contacts');
      throw new Error('Se requiere userId para inicializar Google Contacts');
    }

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
    if (!userId) {
      logger.error('Se requiere userId para la autenticación de Google');
      throw new Error('Se requiere iniciar sesión para conectar con Google');
    }

    const oauth2Client = this.getOAuth2Client(userId);
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state: userId // Pasar el userId como state para recuperarlo en el callback
    });
  }

  // Obtener tokens específicos para un usuario
  async getTokens(code, state) {
    if (!state) {
      logger.error('Se requiere state para obtener tokens de Google');
      throw new Error('Se requiere state para obtener tokens de Google');
    }

    await connectDB();
    const oauth2Client = this.getOAuth2Client(state);
    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
      
      // Guardar tokens para el usuario específico si hay state
      if (state && state !== 'anonymous') {
        await User.findByIdAndUpdate(state, {
          'google_credentials.access_token': tokens.access_token,
          'google_credentials.refresh_token': tokens.refresh_token,
          'google_credentials.expiry_date': tokens.expiry_date
        });
      }
      
      await GoogleToken.findOneAndUpdate(
        { userId: state },
        { 
          tokens, 
          userId: state, 
          lastCode: code, 
          lastUpdated: new Date(),
          provider: 'google'
        },
        { upsert: true }
      );

      serverState.setUserAuthenticated(state, true);
      logger.info(`Tokens guardados para usuario ${state}`);
      return {
        token: tokens.access_token,
        refreshToken: tokens.refresh_token
      };
    } catch (error) {
      logger.error('Error obteniendo tokens:', error);
      throw error;
    }
  }

  async getContacts(token) {
    if (!token) {
      logger.error('Se requiere token para obtener contactos de Google');
      throw new Error('Se requiere token para obtener contactos de Google');
    }

    await this.initialize(token);
    const cached = serverState.getUserContacts(token);
    if (cached) return cached;

    const oauth2Client = this.getOAuth2Client(token);
    try {
      // Si se proporciona un token, usarlo
      if (token) {
        oauth2Client.setCredentials({ access_token: token });
      }
      
      const service = google.people({ version: 'v1', auth: oauth2Client });
      const response = await service.people.connections.list({
        resourceName: 'people/me',
        pageSize: 1000,
        personFields: 'names,phoneNumbers,emailAddresses',
      });
      
      const contacts = response.data.connections || [];

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

      serverState.setUserContacts(token, formatted);
      return formatted;
    } catch (error) {
      logger.error('Error obteniendo contactos:', error);
      throw error;
    }
  }

  async logout(userId) {
    if (!userId) {
      logger.error('Se requiere userId para cerrar sesión de Google');
      throw new Error('Se requiere iniciar sesión para cerrar sesión de Google');
    }

    await connectDB();
    await GoogleToken.deleteOne({ userId });
    
    if (this.oauth2Clients.has(userId)) {
      this.oauth2Clients.delete(userId);
    }
    
    serverState.clearUserState(userId);
    logger.info(`Tokens eliminados y sesión cerrada para usuario ${userId}`);
  }

  // Método auxiliar para obtener todos los contactos paginados
  async getAllContactPages(peopleService) {
    let contacts = [];
    let nextPageToken;

    do {
      const response = await peopleService.people.connections.list({
        resourceName: 'people/me',
        pageSize: 1000,
        pageToken: nextPageToken,
        personFields: 'names,phoneNumbers,emailAddresses',
      });

      contacts = contacts.concat(response.data.connections || []);
      nextPageToken = response.data.nextPageToken;
    } while (nextPageToken);

    return contacts;
  }
}

module.exports = new GoogleContactsService();