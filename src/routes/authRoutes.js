const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const User = require('../models/User');

// Middleware para validar los datos de registro
const validateRegistration = (req, res, next) => {
    const { 
        username, 
        password, 
        kommo_client_secret,
        kommo_client_id,
        kommo_redirect_uri,
        kommo_base_url,
        kommo_auth_token
    } = req.body;

    if (!username || !password || !kommo_client_secret || !kommo_client_id || 
        !kommo_redirect_uri || !kommo_base_url || !kommo_auth_token) {
        return res.status(400).json({ 
            error: 'Todos los campos son obligatorios',
            required_fields: [
                'username',
                'password',
                'kommo_client_secret',
                'kommo_client_id',
                'kommo_redirect_uri',
                'kommo_base_url',
                'kommo_auth_token'
            ]
        });
    }
    next();
};

// Middleware para verificar usuario actual
const getCurrentUser = async (req, res, next) => {
    try {
        const user = await User.findOne({ logged: true });
        if (!user) {
            return res.status(401).json({ error: 'No hay usuario autenticado' });
        }
        req.currentUser = user;
        next();
    } catch (error) {
        res.status(500).json({ error: 'Error al verificar usuario actual' });
    }
};

// Ruta de registro
router.post('/register', validateRegistration, async (req, res) => {
    try {
        const result = await authService.register(req.body);
        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Ruta de login
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
        }

        console.log(`🔄 Intentando autenticar usuario: ${username}`);
        const result = await authService.login(username, password);
        console.log('🎉 Autenticación exitosa - Sesión iniciada');
        res.json(result);
    } catch (error) {
        console.log(`❌ Error de autenticación: ${error.message}`);
        res.status(401).json({ error: error.message });
    }
});

// Ruta de logout
router.post('/logout', getCurrentUser, async (req, res) => {
    try {
        console.log(`🔄 Iniciando cierre de sesión para usuario: ${req.currentUser.username}`);
        const result = await authService.logout(req.currentUser._id);
        console.log('🎉 Sesión cerrada exitosamente');
        res.json(result);
    } catch (error) {
        console.log(`❌ Error al cerrar sesión: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Ruta para verificar estado de autenticación
router.get('/status', async (req, res) => {
    try {
        const user = await User.findOne({ logged: true }).select('-password');
        if (!user) {
            return res.json({ 
                authenticated: false,
                message: 'No hay usuario autenticado'
            });
        }

        res.json({
            authenticated: true,
            user: {
                id: user._id,
                username: user.username,
                kommo_base_url: user.kommo_credentials.base_url
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Error al verificar estado de autenticación' });
    }
});

module.exports = router; 