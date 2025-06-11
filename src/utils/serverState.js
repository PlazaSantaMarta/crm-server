const { setupLogger } = require('./logger');
const logger = setupLogger();

class ServerState {
    constructor() {
        this.userStates = new Map();
    }

    getUserState(userId) {
        if (!this.userStates.has(userId)) {
            this.userStates.set(userId, {
                isAuthenticated: false,
                contacts: null,
                lastAuthTime: null
            });
        }
        return this.userStates.get(userId);
    }

    setAuthenticated(userId, value) {
        const state = this.getUserState(userId);
        state.isAuthenticated = value;
        state.lastAuthTime = value ? new Date() : null;
        logger.info(`Estado de autenticación para usuario ${userId}: ${value ? 'Autenticado' : 'No autenticado'}`);
    }

    setContacts(userId, contacts) {
        const state = this.getUserState(userId);
        state.contacts = contacts;
        logger.info(`Contactos almacenados en memoria para usuario ${userId}: ${contacts ? contacts.length : 0}`);
    }

    getContacts(userId) {
        const state = this.getUserState(userId);
        return state.contacts;
    }

    clearUserState(userId) {
        if (this.userStates.has(userId)) {
            this.userStates.delete(userId);
            logger.info(`Estado del servidor reiniciado para usuario ${userId}`);
        }
    }

    clearAllStates() {
        this.userStates.clear();
        logger.info('Estado del servidor reiniciado para todos los usuarios');
    }

    isUserAuthenticated(userId) {
        const state = this.getUserState(userId);
        return state.isAuthenticated;
    }

    getLastAuthTime(userId) {
        const state = this.getUserState(userId);
        return state.lastAuthTime;
    }
}

module.exports = new ServerState(); 