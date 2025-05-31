const { google } = require('googleapis');
const GoogleToken = require('@/models/GoogleToken');
const { setupLogger } = require('../utils/logger');
const serverState = require('../utils/serverState');
const connectDB = require('../config/database');

const logger = setupLogger();

const scopes = ['https://www.googleapis.com/auth/contacts.readonly'];

class GoogleContactsService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
    );
    this.initialized = false;
    this.userEmail = null;
    this.pageSize = 100;
  }

  async initialize(googleEmail) {
    if (this.initialized && this.userEmail === googleEmail) return;

    await connectDB();

    const tokenDoc = await GoogleToken.findOne({ lastCode: googleEmail });

    if (!tokenDoc) {
      logger.error('No hay credenciales válidas para:', googleEmail);
      serverState.setAuthenticated(false);
      throw new Error('No hay credenciales válidas. Por favor, autentícate nuevamente.');
    }

    this.oauth2Client.setCredentials(tokenDoc.tokens);
    this.initialized = true;
    this.userEmail = googleEmail;
    serverState.setAuthenticated(true);
    logger.info(`Credenciales cargadas para ${googleEmail}`);
  }

  getAuthUrl() {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
    });
  }

  async getTokens(code) {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);

    const userInfo = await google.oauth2('v2').userinfo.get({ auth: this.oauth2Client });
    const googleEmail = userInfo.data.email;

    await GoogleToken.findOneAndUpdate(
      { lastCode: googleEmail },
      {
        tokens,
        lastCode: googleEmail,
        lastUpdated: new Date(),
      },
      { upsert: true, new: true }
    );

    this.initialized = true;
    this.userEmail = googleEmail;
    serverState.setAuthenticated(true);
    logger.info(`Tokens guardados en MongoDB para ${googleEmail}`);
    return { googleEmail, tokens };
  }

  async getAllContactPages(peopleService, pageToken = null, allContacts = []) {
    const response = await peopleService.people.connections.list({
      resourceName: 'people/me',
      pageToken,
      pageSize: this.pageSize,
      personFields: 'names,phoneNumbers',
    });

    allContacts.push(...(response.data.connections || []));

    if (response.data.nextPageToken) {
      return this.getAllContactPages(peopleService, response.data.nextPageToken, allContacts);
    }

    return allContacts;
  }

  async getContacts(googleEmail) {
    const cached = serverState.getContacts();
    if (cached && this.userEmail === googleEmail) {
      return cached;
    }

    await this.initialize(googleEmail);

    const peopleService = google.people({ version: 'v1', auth: this.oauth2Client });
    const contacts = await this.getAllContactPages(peopleService);

    const formattedContacts = contacts
      .filter(c => c.phoneNumbers?.length > 0)
      .map(c => ({
        id: c.resourceName.split('/')[1],
        googleId: c.resourceName,
        name: c.names?.[0]?.displayName || 'Sin nombre',
        phoneNumber: c.phoneNumbers[0].value.replace(/\s+/g, '').replace(/[-\(\)]/g, ''),
        isValid: false
      }));

    serverState.setContacts(formattedContacts);
    return formattedContacts;
  }

  async logout(googleEmail) {
    await GoogleToken.deleteOne({ lastCode: googleEmail });
    this.initialized = false;
    this.userEmail = null;
    serverState.clearState();
    logger.info(`Sesión cerrada y tokens eliminados para ${googleEmail}`);
  }
}

module.exports = new GoogleContactsService();
