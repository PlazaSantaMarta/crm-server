const express = require('express');
const router = express.Router();
const googleContactsService = require('../services/googleContacts');
const storageService = require('../services/storage');
const { setupLogger } = require('../utils/logger');

const logger = setupLogger();

// Ruta para iniciar autenticación con Google
router.get('/auth/google', (req, res) => {
  const authUrl = googleContactsService.getAuthUrl();
  res.json({ authUrl });
});

// Callback de Google OAuth
router.get('/auth/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const tokens = await googleContactsService.getTokens(code);
    const contacts = await googleContactsService.getContacts();
    
    // Guardar contactos en el archivo JSON
    for (const contact of contacts) {
      await storageService.saveContact(contact);
    }

    // Redireccionar al frontend con un mensaje de éxito
    res.redirect(`${process.env.BACK_URI}?auth=success`);
  } catch (error) {
    logger.error('Error en callback de Google:', error);
    // Redireccionar al frontend con un mensaje de error
    res.redirect(`${process.env.BACK_URI}auth=error`);
  }
});

// Obtener todos los contactos
router.get('/contacts', async (req, res) => {
  try {
    const contacts = await storageService.readContacts();
    res.json(contacts);
  } catch (error) {
    logger.error('Error al obtener contactos:', error);
    res.status(500).json({ error: 'Error al obtener contactos' });
  }
});

// Obtener un contacto específico
router.get('/contacts/:id', async (req, res) => {
  try {
    const contact = await storageService.findContactById(req.params.id);
    if (!contact) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }
    res.json(contact);
  } catch (error) {
    logger.error('Error al obtener contacto:', error);
    res.status(500).json({ error: 'Error al obtener contacto' });
  }
});

// Actualizar un contacto
router.put('/contacts/:id', async (req, res) => {
  try {
    const updatedContact = await storageService.updateContact(req.params.id, req.body);
    if (!updatedContact) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }
    res.json(updatedContact);
  } catch (error) {
    logger.error('Error al actualizar contacto:', error);
    res.status(500).json({ error: 'Error al actualizar contacto' });
  }
});

router.get('/acc', async (req,res) => {
  return console.log("llegaron aca")
})

module.exports = router; 