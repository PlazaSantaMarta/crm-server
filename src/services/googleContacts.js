const { google } = require('googleapis');
const { setupLogger } = require('../utils/logger');
const serverState = require('../utils/serverState');
const GoogleToken = require('../models/GoogleToken');
const User = require('../models/User');
const connectDB = require('../config/database');
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
    this.userTokens = new Map(); // Almacenar tokens por usuario
  }

  async initialize(userId = null) {
    try {
      if (userId) {
        const token = await GoogleToken.findOne({ userId });
        if (token) {
          this.userTokens.set(userId, token.token);
          this.oauth2Client.setCredentials(token.token);
          this.initialized = true;
          logger.info(`🔐 Servicio de Google Contacts inicializado para usuario ${userId}`);
          return true;
        }
      }
      this.initialized = false;
      return false;
    } catch (error) {
      logger.error('Error al inicializar Google Contacts:', error);
      throw error;
    }
  }

  async saveToken(token, userId) {
    try {
      let tokenDoc = await GoogleToken.findOne({ userId });
      
      if (tokenDoc) {
        tokenDoc.token = token;
        await tokenDoc.save();
      } else {
        tokenDoc = new GoogleToken({
          userId,
          token
        });
        await tokenDoc.save();
      }

      const user = await User.findById(userId);
      if (user) {
        user.google_credentials = {
          access_token: token.access_token,
          refresh_token: token.refresh_token
        };
        await user.save();
      }

      this.userTokens.set(userId, token);
      this.oauth2Client.setCredentials(token);
      this.initialized = true;
      
      logger.info(`Token de Google guardado para usuario ${userId}`);
      return true;
    } catch (error) {
      logger.error('Error al guardar token de Google:', error);
      throw error;
    }
  }

  async listContacts(userId) {
    try {
      if (!this.userTokens.has(userId)) {
        await this.initialize(userId);
      }

      if (!this.initialized) {
        throw new Error('Servicio no inicializado');
      }

      const service = google.people({ version: 'v1', auth: this.oauth2Client });
      const contacts = [];
      let nextPageToken = null;

      do {
        const response = await service.people.connections.list({
          resourceName: 'people/me',
          pageSize: this.pageSize,
          pageToken: nextPageToken,
          personFields: 'names,emailAddresses,phoneNumbers',
        });

        if (response.data.connections) {
          contacts.push(...response.data.connections);
        }

        nextPageToken = response.data.nextPageToken;
      } while (nextPageToken);

      const user = await User.findById(userId);
      if (user) {
        const formattedContacts = contacts.map(c => ({
          id: c.resourceName.split('/')[1],
          googleId: c.resourceName,
          name: c.names?.[0]?.displayName || 'Sin nombre',
          phoneNumber: c.phoneNumbers?.[0]?.value?.replace(/\s+/g, '').replace(/[-\(\)]/g, '') || '',
          email: c.emailAddresses?.[0]?.value || '',
          source: 'google'
        }));
        user.google_contacts = formattedContacts;
        await user.save();
      }

      logger.info(`📞 ${contacts.length} contactos recuperados y actualizados para usuario ${userId}`);
      return contacts;
    } catch (error) {
      logger.error('Error al listar contactos:', error);
      throw error;
    }
  }

  getAuthUrl() {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });
  }

  async getToken(code) {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      return tokens;
    } catch (error) {
      logger.error('Error al obtener token:', error);
      throw error;
    }
  }

  async revokeToken(userId) {
    try {
      if (this.userTokens.has(userId)) {
        await this.oauth2Client.revokeToken(this.userTokens.get(userId).access_token);
        this.userTokens.delete(userId);
        await GoogleToken.deleteOne({ userId });
        this.initialized = false;
        logger.info(`Token revocado para usuario ${userId}`);
      }
    } catch (error) {
      logger.error('Error al revocar token:', error);
      throw error;
    }
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

  async logout(userId) {
    try {
      await connectDB();
      
      await GoogleToken.deleteOne({ userId });
      
      const user = await User.findById(userId);
      if (user) {
        user.google_credentials = {
          access_token: null,
          refresh_token: null
        };
        user.google_contacts = [];
        await user.save();
      }
      
      this.userTokens.delete(userId);
      this.initialized = false;
      serverState.clearState();
      
      logger.info(`Sesión de Google cerrada para usuario ${userId}`);
    } catch (error) {
      logger.error('Error al cerrar sesión:', error);
      throw error;
    }
  }
}

module.exports = new GoogleContactsService();