const fs = require('fs').promises;
const path = require('path');
const { setupLogger } = require('./logger');

const logger = setupLogger();

async function initializeDataDirectory() {
    const dataDir = path.join(__dirname, '../../../data');
    
    try {
        await fs.access(dataDir);
        logger.info('Directorio data existe');
    } catch (error) {
        if (error.code === 'ENOENT') {
            try {
                await fs.mkdir(dataDir, { recursive: true });
                logger.info('Directorio data creado correctamente');
            } catch (mkdirError) {
                logger.error('Error al crear directorio data:', mkdirError);
                throw mkdirError;
            }
        } else {
            throw error;
        }
    }
}

module.exports = {
    initializeDataDirectory
}; 