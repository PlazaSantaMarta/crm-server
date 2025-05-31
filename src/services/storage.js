const fs = require('fs').promises;
const path = require('path');
const { setupLogger } = require('../utils/logger');

const logger = setupLogger();
const CONTACTS_FILE = path.join(__dirname, '../../data/contacts.json');

class StorageService {
  constructor() {
    this.ensureDataDirectory();
  }

  async ensureDataDirectory() {
    try {
      const dataDir = path.dirname(CONTACTS_FILE);
      await fs.mkdir(dataDir, { recursive: true });
    } catch (error) {
      logger.error('Error al crear directorio de datos:', error);
    }
  }

  async readContacts() {
    try {
      const data = await fs.readFile(CONTACTS_FILE, 'utf8');
      return JSON.parse(data || '[]');
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Si el archivo no existe, retornar un array vacío
        return [];
      }
      logger.error('Error al leer contactos:', error);
      throw error;
    }
  }

  async saveContact(contact) {
    try {
      const contacts = await this.readContacts();
      const existingIndex = contacts.findIndex(c => c.googleId === contact.googleId);

      if (existingIndex >= 0) {
        // Actualizar contacto existente manteniendo algunos campos
        contacts[existingIndex] = {
          ...contacts[existingIndex],
          ...contact,
          updatedAt: new Date().toISOString()
        };
      } else {
        // Agregar nuevo contacto
        contacts.push({
          ...contact,
          id: contact.googleId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      await fs.writeFile(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
      logger.info(`Contacto ${contact.name} guardado correctamente`);
      return contact;
    } catch (error) {
      logger.error('Error al guardar contacto:', error);
      throw error;
    }
  }

  async findContactById(id) {
    try {
      const contacts = await this.readContacts();
      return contacts.find(contact => contact.id === id || contact.googleId === id);
    } catch (error) {
      logger.error('Error al buscar contacto:', error);
      throw error;
    }
  }

  async updateContact(id, updates) {
    try {
      const contacts = await this.readContacts();
      const index = contacts.findIndex(contact => contact.id === id || contact.googleId === id);
      
      if (index === -1) {
        return null;
      }

      contacts[index] = {
        ...contacts[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await fs.writeFile(CONTACTS_FILE, JSON.stringify(contacts, null, 2));
      logger.info(`Contacto ${id} actualizado correctamente`);
      return contacts[index];
    } catch (error) {
      logger.error('Error al actualizar contacto:', error);
      throw error;
    }
  }
}

module.exports = new StorageService(); 