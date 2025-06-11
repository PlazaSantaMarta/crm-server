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

  async getOAuth2Client() {
    try {
      // Obtener credenciales de Google del primer usuario (temporal)
      await connectDB();
      const user = await User.findOne({ logged: true });
      
      if (!user) {
        throw new Error('No hay usuario autenticado');
      }

      // Si el usuario no tiene credenciales de Google, usar las del entorno
      const clientId = user.google_credentials?.client_id || process.env.GOOGLE_CLIENT_ID;
      const clientSecret = user.google_credentials?.client_secret || process.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = user.google_credentials?.redirect_uri || process.env.GOOGLE_REDIRECT_URI;

      if (!clientId || !clientSecret || !redirectUri) {
        throw new Error('Faltan credenciales de Google');
      }

      const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri
      );

      // Si el usuario tiene tokens, configurarlos
      if (user.google_credentials?.access_token) {
        oauth2Client.setCredentials({
          access_token: user.google_credentials.access_token,
          refresh_token: user.google_credentials.refresh_token,
          expiry_date: user.google_credentials.expiry_date
        });
      }

      return oauth2Client;
    } catch (error) {
      logger.error('Error al obtener cliente OAuth2:', error);
      throw error;
    }
  }

  async getAuthUrl() {
    try {
      const oauth2Client = await this.getOAuth2Client();
      return oauth2Client.generateAuthUrl({
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
      const oauth2Client = await this.getOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code);
      
      // Guardar tokens en el usuario
      const user = await User.findOne({ logged: true });
      if (user) {
        user.google_credentials = {
          ...user.google_credentials,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expiry_date: tokens.expiry_date
        };
        await user.save();
      }
      
      return tokens;
    } catch (error) {
      logger.error('Error al obtener tokens:', error);
      throw error;
    }
  }

  async getContacts() {
    try {
      const oauth2Client = await this.getOAuth2Client();
      const service = google.people({ version: 'v1', auth: oauth2Client });
      
      const response = await service.people.connections.list({
        resourceName: 'people/me',
        pageSize: 1000,
        personFields: 'names,phoneNumbers,emailAddresses',
      });
      
      const contacts = response.data.connections || [];
      return contacts.map(contact => ({
        id: contact.resourceName.split('/')[1],
        name: contact.names?.[0]?.displayName || 'Sin nombre',
        phoneNumber: contact.phoneNumbers?.[0]?.value?.replace(/\D/g, '') || '',
        email: contact.emailAddresses?.[0]?.value || '',
        source: 'google'
      }));
    } catch (error) {
      logger.error('Error al obtener contactos:', error);
      throw error;
    }
  }

  async logout() {
    try {
      const user = await User.findOne({ logged: true });
      if (user) {
        user.google_credentials = {
          client_id: user.google_credentials?.client_id,
          client_secret: user.google_credentials?.client_secret,
          redirect_uri: user.google_credentials?.redirect_uri
        };
        await user.save();
      }
    } catch (error) {
      logger.error('Error al cerrar sesión:', error);
      throw error;
    }
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