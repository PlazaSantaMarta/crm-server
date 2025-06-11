const { google } = require('googleapis');
const GoogleToken = require('../models/GoogleToken');
const connectDB = require('./config/database');
const serverState = require('./utils/serverState');

const SCOPES = ['https://www.googleapis.com/auth/contacts.readonly'];

let oauth2Client = null;

function getOAuth2Client() {
  if (!oauth2Client) {
    const credentials = {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
    };

    oauth2Client = new google.auth.OAuth2(
      credentials.client_id,
      credentials.client_secret,
      credentials.redirect_uri
    );
  }
  return oauth2Client;
}

async function initialize() {
  try {
    await connectDB();
    const tokenDoc = await GoogleToken.findOne({ provider: 'google' });
    if (tokenDoc && tokenDoc.tokens) {
      const oauth2Client = getOAuth2Client();
      oauth2Client.setCredentials(tokenDoc.tokens);
      serverState.isAuthenticated = true;
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error initializing Google service:', error);
    return false;
  }
}

function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
}

async function getTokens(code) {
  const oauth2Client = getOAuth2Client();

  try {
    const { tokens } = await oauth2Client.getToken(code);
    let tokenDoc = await GoogleToken.findOne({ provider: 'google' });

    if (tokenDoc) {
      tokenDoc.tokens = tokens;
      tokenDoc.lastCode = code;
      tokenDoc.lastUpdated = new Date();
      await tokenDoc.save();
    } else {
      tokenDoc = await GoogleToken.create({
        provider: 'google',
        tokens,
        lastCode: code,
        lastUpdated: new Date()
      });
    }

    oauth2Client.setCredentials(tokens);
    serverState.isAuthenticated = true;
    return tokens;
  } catch (error) {
    console.error('Error getting tokens:', error);
    throw error;
  }
}

async function getContacts() {
  const oauth2Client = getOAuth2Client();
  const tokenDoc = await GoogleToken.findOne({ provider: 'google' });

  if (!tokenDoc || !tokenDoc.tokens) {
    throw new Error('No autenticado');
  }

  try {
    oauth2Client.setCredentials(tokenDoc.tokens);

    // Verificar si expira pronto
    if (tokenDoc.tokens.expiry_date && Date.now() > tokenDoc.tokens.expiry_date - 60000) {
      console.log('Refrescando token...');
      const { credentials } = await oauth2Client.refreshAccessToken();
      tokenDoc.tokens = credentials;
      tokenDoc.lastUpdated = new Date();
      await tokenDoc.save();
      oauth2Client.setCredentials(credentials);
    }

    // Usar People API
    const service = google.people({ version: 'v1', auth: oauth2Client });

    const response = await service.people.connections.list({
      resourceName: 'people/me',
      pageSize: 100,
      personFields: 'names,phoneNumbers,emailAddresses',
    });

    const contacts = (response.data.connections || []).map(person => {
      const name = person.names?.[0]?.displayName || 'Sin nombre';
      const phoneNumber = person.phoneNumbers?.[0]?.value || 'Sin número';
      const email = person.emailAddresses?.[0]?.value || 'Sin email';

      return {
        id: person.resourceName,
        name,
        phoneNumber,
        email,
        isValid: false,
      };
    });

    return contacts;
  } catch (error) {
    console.error('Error detallado:', error);

    if (error.message.includes('invalid_grant') || error.message.includes('invalid_token')) {
      await GoogleToken.deleteOne({ provider: 'google' });
      serverState.isAuthenticated = false;
    }

    throw error;
  }
}

async function logout() {
  try {
    await GoogleToken.deleteOne({ provider: 'google' });
    serverState.isAuthenticated = false;
    oauth2Client = null;
  } catch (error) {
    console.error('Error during logout:', error);
    throw error;
  }
}

module.exports = {
  initialize,
  getAuthUrl,
  getTokens,
  getContacts,
  logout
};