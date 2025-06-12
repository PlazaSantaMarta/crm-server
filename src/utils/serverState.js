const { setupLogger } = require('./logger');
const logger = setupLogger();

class ServerState {
    constructor() {
        this.isAuthenticated = false;
        this.contacts = null;
        this.lastAuthTime = null;
    }

    setAuthenticated(value) {
        this.isAuthenticated = value;
        this.lastAuthTime = value ? new Date() : null;
        logger.info(`Estado de autenticación: ${value ? 'Autenticado' : 'No autenticado'}`);
    }

    setContacts(contacts) {
        this.contacts = contacts;
        logger.info(`Contactos almacenados en memoria: ${contacts ? contacts.length : 0}`);
    }

    getContacts() {
        return this.contacts;
    }

    clearState() {
        this.isAuthenticated = false;
        this.contacts = null;
        this.lastAuthTime = null;
        logger.info('Estado del servidor reiniciado');
    }
}

module.exports = new ServerState(); 