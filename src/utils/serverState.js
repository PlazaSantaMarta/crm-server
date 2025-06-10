const { setupLogger } = require('./logger');
const logger = setupLogger();

class ServerState {
    constructor() {
        // Mapa para almacenar estado por usuario
        this.userStates = new Map();
        // Mantener el estado global para compatibilidad
        this.isAuthenticated = false;
        this.contacts = null;
        this.lastAuthTime = null;
    }

    // Métodos para estado por usuario
    getUserState(userId) {
        if (!userId) {
            logger.warn('Se intentó obtener estado sin userId');
            return null;
        }
        
        if (!this.userStates.has(userId)) {
            this.userStates.set(userId, {
                isAuthenticated: false,
                contacts: null,
                lastAuthTime: null
            });
            logger.info(`Creado nuevo estado para usuario: ${userId}`);
        }
        
        return this.userStates.get(userId);
    }

    setUserAuthenticated(userId, value) {
        if (!userId) {
            logger.warn('Se intentó actualizar autenticación sin userId');
            return;
        }
        
        const userState = this.getUserState(userId);
        userState.isAuthenticated = value;
        userState.lastAuthTime = value ? new Date() : null;
        logger.info(`Estado de autenticación para usuario ${userId}: ${value ? 'Autenticado' : 'No autenticado'}`);
    }

    setUserContacts(userId, contacts) {
        if (!userId) {
            logger.warn('Se intentó actualizar contactos sin userId');
            return;
        }
        
        const userState = this.getUserState(userId);
        userState.contacts = contacts;
        logger.info(`Contactos almacenados en memoria para usuario ${userId}: ${contacts ? contacts.length : 0}`);
    }

    getUserContacts(userId) {
        if (!userId) {
            logger.warn('Se intentó obtener contactos sin userId');
            return null;
        }
        
        const userState = this.getUserState(userId);
        return userState ? userState.contacts : null;
    }

    clearUserState(userId) {
        if (!userId) {
            logger.warn('Se intentó limpiar estado sin userId');
            return;
        }
        
        this.userStates.set(userId, {
            isAuthenticated: false,
            contacts: null,
            lastAuthTime: null
        });
        logger.info(`Estado del usuario ${userId} reiniciado`);
    }

    // Mantener métodos originales para compatibilidad
    setAuthenticated(value) {
        this.isAuthenticated = value;
        this.lastAuthTime = value ? new Date() : null;
        logger.info(`Estado de autenticación global: ${value ? 'Autenticado' : 'No autenticado'}`);
    }

    setContacts(contacts) {
        this.contacts = contacts;
        logger.info(`Contactos almacenados en memoria global: ${contacts ? contacts.length : 0}`);
    }

    getContacts() {
        return this.contacts;
    }

    clearState() {
        this.isAuthenticated = false;
        this.contacts = null;
        this.lastAuthTime = null;
        logger.info('Estado global del servidor reiniciado');
    }
}

module.exports = new ServerState(); 