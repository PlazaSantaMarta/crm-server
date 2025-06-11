const express = require('express');
const router = express.Router();
const googleContactsService = require('../services/googleContacts');
const Contact = require('../models/Contact');
const { setupLogger } = require('../utils/logger');
const User = require('../models/User');

const logger = setupLogger();

// Middleware para verificar autenticación
const checkAuth = async (req, res, next) => {
  try {
    const user = await User.findOne({ logged: true });
    if (!user) {
      return res.status(401).json({ error: 'No hay usuario autenticado' });
    }
    req.user = user;
    next();
  } catch (error) {
    logger.error('Error en middleware de autenticación:', error);
    res.status(500).json({ error: 'Error de autenticación' });
  }
};

// Ruta para iniciar autenticación con Google
router.get('/auth/google', checkAuth, (req, res) => {
  const authUrl = googleContactsService.getAuthUrl(req.user._id);
  res.json({ authUrl });
});

// Callback de Google OAuth
router.get('/auth/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!state) {
      throw new Error('No se proporcionó ID de usuario');
    }

    const user = await User.findById(state);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    await googleContactsService.getTokens(code, user._id);
    const contacts = await googleContactsService.getContacts(user._id);
    
    // Redireccionar al frontend con un mensaje de éxito
    res.redirect(`${process.env.BACK_URI}?auth=success`);
  } catch (error) {
    logger.error('Error en callback de Google:', error);
    // Redireccionar al frontend con un mensaje de error
    res.redirect(`${process.env.BACK_URI}?auth=error`);
  }
});

// Obtener todos los contactos del usuario actual
router.get('/contacts', checkAuth, async (req, res) => {
  try {
    const contacts = await googleContactsService.getUserContacts(req.user._id);
    res.json(contacts);
  } catch (error) {
    logger.error('Error al obtener contactos:', error);
    res.status(500).json({ error: 'Error al obtener contactos' });
  }
});

// Obtener un contacto específico
router.get('/contacts/:id', checkAuth, async (req, res) => {
  try {
    const contact = await Contact.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    
    if (!contact) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }
    res.json(contact);
  } catch (error) {
    logger.error('Error al obtener contacto:', error);
    res.status(500).json({ error: 'Error al obtener contacto' });
  }
});

// Cerrar sesión de Google
router.post('/auth/google/logout', checkAuth, async (req, res) => {
  try {
    await googleContactsService.clearUserContacts(req.user._id);
    res.json({ message: 'Sesión de Google cerrada y contactos eliminados' });
  } catch (error) {
    logger.error('Error al cerrar sesión de Google:', error);
    res.status(500).json({ error: 'Error al cerrar sesión de Google' });
  }
});

module.exports = router; 