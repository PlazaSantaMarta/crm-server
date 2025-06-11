const { setupLogger } = require('../utils/logger');
const Contact = require('../models/Contact');

const logger = setupLogger();

class StorageService {
  async readContacts(userId) {
    try {
      return await Contact.find({ userId }).sort({ createdAt: -1 });
    } catch (error) {
      logger.error('Error al leer contactos:', error);
      throw error;
    }
  }

  async saveContact(userId, contactData) {
    try {
      const contact = new Contact({
        ...contactData,
        userId,
        updatedAt: new Date()
      });

      await contact.save();
      logger.info(`Contacto ${contact.name} guardado correctamente`);
      return contact;
    } catch (error) {
      logger.error('Error al guardar contacto:', error);
      throw error;
    }
  }

  async findContactById(userId, contactId) {
    try {
      return await Contact.findOne({ _id: contactId, userId });
    } catch (error) {
      logger.error('Error al buscar contacto:', error);
      throw error;
    }
  }

  async updateContact(userId, contactId, updates) {
    try {
      const contact = await Contact.findOneAndUpdate(
        { _id: contactId, userId },
        { ...updates, updatedAt: new Date() },
        { new: true }
      );

      if (!contact) {
        return null;
      }

      logger.info(`Contacto ${contactId} actualizado correctamente`);
      return contact;
    } catch (error) {
      logger.error('Error al actualizar contacto:', error);
      throw error;
    }
  }

  async deleteUserContacts(userId, source = null) {
    try {
      const query = { userId };
      if (source) {
        query.source = source;
      }
      await Contact.deleteMany(query);
      logger.info(`Contactos eliminados para usuario ${userId}`);
    } catch (error) {
      logger.error('Error al eliminar contactos:', error);
      throw error;
    }
  }
}

module.exports = new StorageService(); 