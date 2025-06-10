const express = require('express');
const router = express.Router();
const {KommoAuthService } = require('../services/kommoService');
const googleContactsService = require('../services/googleContacts');
const GeneratorLeadsService = require('../services/generatorLeads');
const { setupLogger } = require('../utils/logger');
const User = require('../models/User');
const authService = require('../services/authService');
const jwt = require('jsonwebtoken');

const logger = setupLogger();

// Middleware para verificar autenticación JWT y servicios
const checkAuth = async (req, res, next) => {
    try {
        console.log('\n🔒 Verificando autenticación...');
        
        // Extraer token del header Authorization
        const authHeader = req.headers.authorization;
        let token;
        let user;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            // Formato: "Bearer TOKEN"
            token = authHeader.substring(7);
            
            try {
                // Verificar JWT token
                const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret');
                
                // Buscar usuario por ID
                user = await User.findById(decoded.userId);
                console.log('👤 Usuario encontrado por JWT:', user ? user.username : 'ninguno');
            } catch (jwtError) {
                console.error('❌ Error al verificar JWT:', jwtError.message);
            }
        }
        
        // Compatibilidad con el sistema antiguo (buscar usuario logueado)
        if (!user) {
            user = await User.findOne({ logged: true });
            console.log('👤 Usuario encontrado por logged=true:', user ? user.username : 'ninguno');
        }
        
        if (!user) {
            console.log('❌ No se encontró usuario autenticado');
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
        
        // Verificar el estado de la conexión con Kommo primero
        try {
            await req.kommoService.verifyConnection();
        } catch (connectionError) {
            logger.error('Error en la conexión con Kommo:', connectionError);
            return res.status(401).json({
                success: false,
                message: 'Error en la conexión con Kommo. Por favor, vuelve a iniciar sesión.',
                error: connectionError.message
            });
        }
        
        // Obtener contactos y generar leads usando el servicio inicializado
        const results = await req.generatorLeads.processGoogleContacts(pipeline_id, contact_ids);
        
        // Verificar si hay un error general
        if (results.error) {
            logger.error('Error en la generación de leads:', results.error);
            return res.status(500).json({
                success: false,
                message: 'Error en el proceso de generación de leads',
                error: results.error,
                results // Incluimos los resultados parciales que podrían existir
            });
        }
        
        logger.info('Proceso de generación de leads completado exitosamente');
        res.json({ 
            success: true, 
            message: 'Proceso de generación de leads completado exitosamente',
            results 
        });

    } catch (error) {
        logger.error('Error en la generación de leads:', error);
        
        // Determinar el código de estado apropiado según el tipo de error
        let statusCode = 500;
        let errorMessage = error.message;
        
        if (error.response) {
            statusCode = error.response.status;
            if (error.response.status === 401) {
                errorMessage = 'Sesión expirada o no autorizada. Por favor, vuelve a iniciar sesión.';
            } else if (error.response.status === 402) {
                errorMessage = 'Cuenta con restricciones de pago. Verifica tu suscripción de Kommo.';
            } else if (error.response.status === 403) {
                errorMessage = 'No tienes permiso para realizar esta operación.';
            } else if (error.response.status === 404) {
                errorMessage = 'Recurso no encontrado. Verifica el ID del pipeline.';
            } else if (error.response.status === 429) {
                errorMessage = 'Has excedido el límite de peticiones a la API. Espera unos minutos y vuelve a intentarlo.';
            }
        }
        
        res.status(statusCode).json({ 
            success: false, 
            message: 'Error en el proceso de generación de leads',
            error: errorMessage,
            details: error.response?.data
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

// Ruta para iniciar sesión con JWT
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username) {
            return res.status(400).json({ error: 'Se requiere el nombre de usuario' });
        }
        
        // Usar authService para el login
        const loginResult = await authService.login(username, password);
        
        // Enviar respuesta con token JWT
        res.json({
            success: true,
            message: 'Sesión iniciada correctamente',
            token: loginResult.token,
            refreshToken: loginResult.refreshToken,
            username: loginResult.user.username,
            userId: loginResult.user._id
        });
    } catch (error) {
        logger.error('Error en el login:', error);
        res.status(401).json({ 
            success: false,
            error: 'Error al iniciar sesión: ' + error.message
        });
    }
});

// Ruta para renovar token JWT
router.post('/refresh-token', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(400).json({ 
                success: false,
                error: 'Token de renovación no proporcionado' 
            });
        }
        
        const result = await authService.refreshToken(refreshToken);
        
        res.json({
            success: true,
            token: result.token
        });
    } catch (error) {
        logger.error('Error al renovar token:', error);
        res.status(401).json({ 
            success: false,
            error: error.message 
        });
    }
});

module.exports = router; 