const { google } = require('googleapis');
const { setupLogger } = require('../utils/logger');
const GoogleToken = require('../models/GoogleToken');
const Contact = require('../models/Contact');
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
  }

  getAuthUrl(userId) {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state: userId // Pasamos el userId en el state para recuperarlo en el callback
    });
  }

  async getTokens(code, userId) {
    const { tokens } = await this.oauth2Client.getToken(code);
    
    // Guardar o actualizar tokens para este usuario
    await GoogleToken.findOneAndUpdate(
      { userId, provider: 'google' },
      { 
        tokens,
        lastCode: code,
        lastUpdated: new Date()
      },
      { upsert: true, new: true }
    );

    return tokens;
  }

  async initialize(userId) {
    const tokenDoc = await GoogleToken.findOne({ userId, provider: 'google' });
    if (!tokenDoc) {
      throw new Error('Usuario no autenticado con Google');
    }

    // Verificar si el token está por expirar
    if (tokenDoc.tokens.expiry_date && Date.now() > tokenDoc.tokens.expiry_date - 60000) {
      this.oauth2Client.setCredentials(tokenDoc.tokens);
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      // Actualizar tokens
      tokenDoc.tokens = credentials;
      tokenDoc.lastUpdated = new Date();
      await tokenDoc.save();
      
      this.oauth2Client.setCredentials(credentials);
    } else {
      this.oauth2Client.setCredentials(tokenDoc.tokens);
    }
  }

  async getAllContactPages(peopleService, userId, pageToken = null, allContacts = []) {
    const response = await peopleService.people.connections.list({
      resourceName: 'people/me',
      pageToken,
      pageSize: 100,
      personFields: 'names,phoneNumbers,emailAddresses',
    });

    const contacts = response.data.connections || [];
    allContacts.push(...contacts);

    if (response.data.nextPageToken) {
      return this.getAllContactPages(peopleService, userId, response.data.nextPageToken, allContacts);
    }

    return allContacts;
  }

  async getContacts(userId) {
    await this.initialize(userId);

    const peopleService = google.people({ version: 'v1', auth: this.oauth2Client });
    const contacts = await this.getAllContactPages(peopleService, userId);

    const formatted = contacts
      .filter(c => c.phoneNumbers && c.phoneNumbers.length > 0)
      .map(c => ({
        userId,
        googleId: c.resourceName,
        name: c.names?.[0]?.displayName || 'Sin nombre',
        phoneNumber: c.phoneNumbers[0].value.replace(/\s+/g, '').replace(/[-\(\)]/g, ''),
        email: c.emailAddresses?.[0]?.value || null,
        isValid: false,
        source: 'google'
      }));

    // Guardar contactos en la base de datos
    await Contact.deleteMany({ userId, source: 'google' }); // Eliminar contactos antiguos de Google
    await Contact.insertMany(formatted); // Insertar nuevos contactos

    return formatted;
  }

  async clearUserContacts(userId) {
    await Contact.deleteMany({ userId, source: 'google' });
    await GoogleToken.deleteOne({ userId, provider: 'google' });
  }

  async processTextFile(filePath, userId) {
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const lines = fileContent.split(/\r?\n/);
      
      const formatted = lines
        .filter(line => line.trim())
        .map(line => {
          const cleanLine = line.trim().replace(/\s+/g, '');
          const [name, phoneNumber] = cleanLine.split(',');
          
          if (!name || !phoneNumber) {
            logger.warn(`Línea inválida ignorada: ${line}`);
            return null;
          }

          return {
            userId,
            name: name.trim(),
            phoneNumber: phoneNumber.replace(/[^0-9]/g, ''),
            isValid: false,
            source: 'file'
          };
        })
        .filter(contact => contact !== null && contact.phoneNumber);

      // Guardar nuevos contactos
      await Contact.insertMany(formatted);

      // Limpiar archivo temporal
      await fs.unlink(filePath);

      logger.info(`Procesados ${formatted.length} contactos desde archivo de texto para usuario ${userId}`);
      return formatted;
    } catch (error) {
      logger.error('Error al procesar archivo de texto:', error);
      throw new Error('Error al procesar el archivo de contactos: ' + error.message);
    }
  }

  async getUserContacts(userId) {
    return await Contact.find({ userId }).sort({ createdAt: -1 });
  }
}

module.exports = new GoogleContactsService();