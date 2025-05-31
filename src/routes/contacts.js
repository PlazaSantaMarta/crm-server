const express = require('express');
const router = express.Router();
const { setupLogger } = require('../utils/logger');

const logger = setupLogger();

// Endpoint para validar números de teléfono
router.post('/validate', async (req, res) => {
  try {
    const { numbers } = req.body;
    const validationResults = [];

    for (const number of numbers) {
      try {
        // Formatear número para uso general
        let formattedNumber = number.replace(/\D/g, '');
        
        // Asegurar que el número tenga el formato internacional
        if (!formattedNumber.startsWith('54')) {
          formattedNumber = '54' + formattedNumber;
        }

        validationResults.push({
          number: number,
          formattedNumber: formattedNumber,
          isValid: true // En el futuro, aquí irá la validación específica del servicio de mensajería
        });
      } catch (error) {
        logger.error(`Error validando número ${number}:`, error);
        validationResults.push({
          number: number,
          isValid: false,
          error: error.message
        });
      }
    }

    res.json({ results: validationResults });
  } catch (error) {
    logger.error('Error validando números:', error);
    res.status(500).json({ error: 'Error en la validación de números' });
  }
});

// Validar un contacto específico por ID
router.post('/validate/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Se requiere número de teléfono' });
    }

    // Formatear número para uso general
    let formattedNumber = phoneNumber.replace(/\D/g, '');
    
    // Asegurar que el número tenga el formato internacional
    if (!formattedNumber.startsWith('54')) {
      formattedNumber = '54' + formattedNumber;
    }

    res.json({
      id,
      formattedNumber,
      isValid: true // En el futuro, aquí irá la validación específica del servicio de mensajería
    });
  } catch (error) {
    logger.error(`Error validando contacto ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Error validando contacto' });
  }
});

// Enviar mensaje a un contacto
router.post('/:id/send', async (req, res) => {
  try {
    const { id } = req.params;
    const { message, phoneNumber, messageType = 'text' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Se requiere mensaje' });
    }

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Se requiere número de teléfono' });
    }

    // Formatear número para uso general
    let formattedNumber = phoneNumber.replace(/\D/g, '');
    
    // Asegurar que el número tenga el formato internacional
    if (!formattedNumber.startsWith('54')) {
      formattedNumber = '54' + formattedNumber;
    }

    // Aquí iría la lógica de envío según el servicio de mensajería implementado
    // Por ahora solo registramos el intento
    logger.info(`Intento de envío de mensaje a contacto ID ${id} (${formattedNumber})`);
    logger.info(`Tipo de mensaje: ${messageType}`);
    
    res.json({
      success: true,
      status: 'pending',
      messageId: `MSG_${Date.now()}`,
      contactId: id,
      messageType,
      sentAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error enviando mensaje a contacto ID ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Error enviando mensaje',
      message: error.message
    });
  }
});

module.exports = router; 