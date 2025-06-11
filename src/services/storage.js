const fs = require('fs').promises;
const path = require('path');
const { setupLogger } = require('../utils/logger');

const logger = setupLogger();

class StorageService {
  constructor() {
    this.baseDataDir = path.join(__dirname, '../../data');
    this.ensureDataDirectory();
  }

  async ensureDataDirectory() {
    try {
      await fs.mkdir(this.baseDataDir, { recursive: true });
      logger.info('📁 Directorio de datos base creado/verificado');
    } catch (error) {
      logger.error('Error al crear directorio de datos:', error);
      throw error;
    }
  }

  async getUserDataPath(userId) {
    const userDir = path.join(this.baseDataDir, `user_${userId}`);
    await fs.mkdir(userDir, { recursive: true });
    return userDir;
  }

  async saveContacts(contacts, userId) {
    try {
      const userDir = await this.getUserDataPath(userId);
      const contactsFile = path.join(userDir, 'contacts.json');
      await fs.writeFile(contactsFile, JSON.stringify(contacts, null, 2));
      logger.info(`💾 Contactos guardados para usuario ${userId}`);
      return true;
    } catch (error) {
      logger.error('Error al guardar contactos:', error);
      throw error;
    }
  }

  async loadContacts(userId) {
    try {
      const userDir = await this.getUserDataPath(userId);
      const contactsFile = path.join(userDir, 'contacts.json');
      
      try {
        const data = await fs.readFile(contactsFile, 'utf8');
        const contacts = JSON.parse(data);
        logger.info(`📖 Contactos cargados para usuario ${userId}`);
        return contacts;
      } catch (error) {
        if (error.code === 'ENOENT') {
          logger.info(`No hay archivo de contactos para usuario ${userId}, retornando array vacío`);
          return [];
        }
        throw error;
      }
    } catch (error) {
      logger.error('Error al cargar contactos:', error);
      throw error;
    }
  }

  async saveTemporaryFile(data, fileName, userId) {
    try {
      const userDir = await this.getUserDataPath(userId);
      const tempDir = path.join(userDir, 'temp');
      await fs.mkdir(tempDir, { recursive: true });
      
      const filePath = path.join(tempDir, fileName);
      await fs.writeFile(filePath, data);
      logger.info(`📄 Archivo temporal guardado: ${fileName} para usuario ${userId}`);
      return filePath;
    } catch (error) {
      logger.error('Error al guardar archivo temporal:', error);
      throw error;
    }
  }

  async cleanupTemporaryFiles(userId) {
    try {
      const userDir = await this.getUserDataPath(userId);
      const tempDir = path.join(userDir, 'temp');
      
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
        await fs.mkdir(tempDir, { recursive: true });
        logger.info(`🧹 Archivos temporales limpiados para usuario ${userId}`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    } catch (error) {
      logger.error('Error al limpiar archivos temporales:', error);
      throw error;
    }
  }
}

// Exportar una única instancia del servicio
module.exports = new StorageService(); 