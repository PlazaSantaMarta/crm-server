const express = require('express');
const router = express.Router();
const {KommoAuthService } = require('../services/kommoService');
const googleContactsService = require('../services/googleContacts');
const GeneratorLeadsService = require('../services/generatorLeads');
const { setupLogger } = require('../utils/logger');
const User = require('../models/User');
const authService = require('../services/authService');

const logger = setupLogger();

// Middleware para verificar autenticación y servicios
const checkAuth = async (req, res, next) => {
    try {
        console.log('\n🔒 Verificando autenticación...');
        
        // Verificar si hay un usuario logueado
        const user = await User.findOne({ logged: true });
        console.log('👤 Usuario encontrado:', user ? user.username : 'ninguno');
        
        if (!user) {
            console.log('❌ No se encontró usuario logueado en la base de datos');
            return res.status(401).json({ error: 'Usuario no autenticado. Por favor, inicie sesión.' });
        }

        // Verificar si los servicios están inicializados
        const services = await authService.getUserServices(user._id);
        console.log('🔧 Servicios obtenidos:', Object.keys(services));
        
        if (!services || !services.kommoService || !services.generatorLeads) {
            console.log('❌ Servicios no inicializados correctamente');
            // Intentar reinicializar los servicios
            await authService.login(user.username, user.password);
            // Obtener los servicios nuevamente
            const refreshedServices = await authService.getUserServices(user._id);
            req.kommoService = refreshedServices.kommoService;
            req.generatorLeads = refreshedServices.generatorLeads;
        } else {
            // Asignar los servicios a la request
            req.kommoService = services.kommoService;
            req.generatorLeads = services.generatorLeads;
        }
        
        req.currentUser = user;
        console.log('✅ Autenticación verificada correctamente');
        
        next();
    } catch (error) {
        console.error('❌ Error en la verificación de autenticación:', error);
        res.status(500).json({ error: 'Error al verificar la autenticación: ' + error.message });
    }
};

// Aplicar middleware de autenticación a todas las rutas
router.use(checkAuth);

// Create a new lead
router.post('/leads', async (req, res) => {
    try {
        const leadData = req.body;
        const result = await req.kommoService.createLead(leadData);
        res.json(result);
    } catch (error) {
        logger.error('Error al crear lead:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all leads
router.get('/leads', async (req, res) => {
    try {
        const leads = await req.kommoService.getLeads();
        res.json(leads);
    } catch (error) {
        logger.error('Error al obtener leads:', error);
        res.status(500).json({ error: error.message });
    }
});

// Sincronizar contactos de Google con Kommo
router.post('/sync-contacts', async (req, res) => {
    try {
        logger.info('Iniciando proceso de sincronización');
        
        // Obtener contactos de Google
        const contacts = await googleContactsService.getContacts();
        
        // Mostrar contactos en la terminal
        console.log('\n📋 Contactos obtenidos de Google:');
        contacts.forEach(contact => {
            console.log(`👤 ${contact.name} - ${contact.phoneNumber}${contact.email ? ` - ${contact.email}` : ''}`);
        });
        console.log('\n🔄 Iniciando sincronización con Kommo...\n');

        // Sincronizar contactos con Kommo
        const results = await req.kommoService.syncContacts(contacts);

        // Mostrar resumen en la terminal
        console.log('\n📊 Resumen de sincronización:');
        console.log(`✨ Total de contactos: ${results.total}`);
        console.log(`✅ Leads creados: ${results.created}`);
        console.log(`❌ Errores: ${results.errors.length}\n`);

        res.json(results);
    } catch (error) {
        logger.error('Error en la sincronización:', error);
        console.log('\n❌ Error en la sincronización:', error.message);
        res.status(500).json({ 
            error: 'Error en la sincronización',
            message: error.message 
        });
    }
});

// Ruta para obtener pipelines
router.get('/pipelines', async (req, res) => {
    try {
        logger.info(`Consultando pipelines para usuario: ${req.currentUser.username}`);
        const pipelines = await req.generatorLeads.getPipelines();
        res.json({ 
            success: true, 
            pipelines
        });
    } catch (error) {
        logger.error('Error al obtener pipelines:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al obtener pipelines',
            error: error.message 
        });
    }
});

// Ruta para obtener los estados de un pipeline específico
router.get('/pipelines/:pipelineId/statuses', async (req, res) => {
    try {
        const { pipelineId } = req.params;
        
        if (!pipelineId) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere especificar el ID del pipeline'
            });
        }

        logger.info(`Consultando estados del pipeline ${pipelineId}`);
        const statuses = await req.generatorLeads.getStatuses(pipelineId);
        
        res.json({ 
            success: true, 
            statuses
        });
    } catch (error) {
        logger.error('Error al obtener estados del pipeline:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al obtener estados del pipeline',
            error: error.message 
        });
    }
});

// Ruta para generar leads desde Google Contacts
router.post('/generate-leads', async (req, res) => {
    try {
        const { pipeline_id, contact_ids } = req.body;
        
        if (!pipeline_id) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere especificar el ID del pipeline (embudo de ventas)'
            });
        }

        logger.info(`Iniciando proceso de generación de leads para pipeline ${pipeline_id}`);
        if (contact_ids) {
            logger.info(`Procesando ${contact_ids.length} contactos seleccionados`);
        } else {
            logger.info('Procesando todos los contactos');
        }
        
        // Obtener contactos y generar leads usando el servicio inicializado
        const results = await req.generatorLeads.processGoogleContacts(pipeline_id, contact_ids);
        
        logger.info('Proceso de generación de leads completado exitosamente');
        res.json({ 
            success: true, 
            message: 'Proceso de generación de leads completado exitosamente',
            results 
        });

    } catch (error) {
        logger.error('Error en la generación de leads:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error en el proceso de generación de leads',
            error: error.message 
        });
    }
});

// Ruta para verificar el estado de la conexión con Kommo
router.get('/connection-status', async (req, res) => {
    try {
        const status = await req.kommoService.verifyConnection();
        res.json({
            success: true,
            message: 'Conexión con Kommo verificada exitosamente',
            account: status.account
        });
    } catch (error) {
        logger.error('Error al verificar conexión con Kommo:', error);
        res.status(401).json({
            success: false,
            message: error.message
        });
    }
});

// Ruta para iniciar sesión
router.post('/login', async (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ error: 'Se requiere el nombre de usuario' });
        }

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ error: 'Usuario no encontrado' });
        }

        // Establecer la sesión
        req.session.username = username;

        // Inicializar servicios
        const kommoService = new KommoAuthService(user.kommo_credentials);
        const generatorLeads = new GeneratorLeadsService(user.kommo_credentials);

        // Guardar los servicios inicializados
        initializedServices.set(username, {
            kommoService,
            generatorLeads
        });

        res.json({ 
            success: true, 
            message: 'Sesión iniciada correctamente',
            username
        });
    } catch (error) {
        logger.error('Error en el login:', error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});

module.exports = router; 