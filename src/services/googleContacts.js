const { google } = require('googleapis');
const { setupLogger } = require('../utils/logger');
const User = require('../models/User');
const connectDB = require('../config/database');

const logger = setupLogger();

class GoogleContactsService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  async getAuthUrl() {
    try {
      return this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/contacts.readonly'],
        prompt: 'consent'
      });
    } catch (error) {
      logger.error('Error al generar URL de autenticación:', error);
      throw error;
    }
  }

  async getTokens(code) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      logger.info('✅ Tokens obtenidos de Google');
      
      // Buscar usuario activo
      const user = await User.findOne({ logged: true });
      if (user) {
        user.google_credentials = {
          ...user.google_credentials,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expiry_date: tokens.expiry_date
        };
        await user.save();
        logger.info('✅ Tokens guardados en usuario:', user.username);
      }
      
      return tokens;
    } catch (error) {
      logger.error('Error al obtener tokens:', error);
      throw error;
    }
  }

  async getContacts(accessToken) {
    try {
      logger.info('🔍 Iniciando obtención de contactos');
      
      // Configurar cliente con el token proporcionado
      this.oauth2Client.setCredentials({
        access_token: accessToken
      });

      const service = google.people({ version: 'v1', auth: this.oauth2Client });
      
      const response = await service.people.connections.list({
        resourceName: 'people/me',
        pageSize: 1000,
        personFields: 'names,phoneNumbers,emailAddresses',
      });
      
      const contacts = response.data.connections || [];
      logger.info(`✅ ${contacts.length} contactos obtenidos`);
      
      return contacts.map(contact => ({
        id: contact.resourceName.split('/')[1],
        name: contact.names?.[0]?.displayName || 'Sin nombre',
        phoneNumber: contact.phoneNumbers?.[0]?.value?.replace(/\D/g, '') || '',
        email: contact.emailAddresses?.[0]?.value || '',
        source: 'google'
      }));
    } catch (error) {
      logger.error('Error al obtener contactos:', error);
      throw new Error('Error al obtener contactos: ' + error.message);
    }
  }

  async logout() {
    try {
      const user = await User.findOne({ logged: true });
      if (user) {
        // Mantener las credenciales del cliente pero eliminar tokens
        user.google_credentials = {
          client_id: user.google_credentials?.client_id,
          client_secret: user.google_credentials?.client_secret,
          redirect_uri: user.google_credentials?.redirect_uri
        };
        await user.save();
        logger.info('✅ Sesión de Google cerrada para usuario:', user.username);
      }
    } catch (error) {
      logger.error('Error al cerrar sesión:', error);
      throw error;
    }
  }
}

module.exports = new GoogleContactsService();