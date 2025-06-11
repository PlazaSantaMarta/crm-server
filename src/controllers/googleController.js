const googleContactsService = require('../services/googleContacts');
const { setupLogger } = require('../utils/logger');
const User = require('../models/User');

const logger = setupLogger();

const googleController = {
  async getAuthUrl(req, res) {
    try {
      const url = await googleContactsService.getAuthUrl();
      res.json({ url });
    } catch (error) {
      logger.error('Error al obtener URL de autenticación:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async handleCallback(req, res) {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ error: 'Código no proporcionado' });
      }

      const tokens = await googleContactsService.getTokens(code);
      res.json({ tokens });
    } catch (error) {
      logger.error('Error en callback de Google:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async getContacts(req, res) {
    try {
      // Obtener token del usuario autenticado
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        return res.status(401).json({ error: 'Token no proporcionado' });
      }

      // Buscar usuario por token
      const user = await User.findOne({
        'google_credentials.access_token': token
      });

      if (!user) {
        return res.status(401).json({ error: 'Usuario no encontrado' });
      }

      const contacts = await googleContactsService.getContacts(token);
      res.json({ contacts });
    } catch (error) {
      logger.error('Error al obtener contactos:', error);
      res.status(500).json({ error: error.message });
    }
  },

  async logout(req, res) {
    try {
      await googleContactsService.logout();
      res.json({ message: 'Sesión cerrada exitosamente' });
    } catch (error) {
      logger.error('Error al cerrar sesión:', error);
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = googleController; 