const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { setupLogger } = require('../utils/logger');

const logger = setupLogger();

// Middleware para verificar token JWT
const verifyJWT = async (req, res, next) => {
  try {
    // Extraer el token
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
    }

    // Verificar y decodificar el token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret');
    
    // Buscar el usuario
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'Usuario no encontrado.' });
    }

    // Añadir el usuario a la request
    req.user = {
      id: user._id,
      username: user.username
    };

    // Para compatibilidad con código existente
    req.currentUser = user;
    
    next();
  } catch (error) {
    logger.error('Error en autenticación JWT:', error);
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
};

// Middleware para verificar usuario actual (compatibilidad)
const getCurrentUser = async (req, res, next) => {
  try {
    // Si ya tenemos usuario de JWT, lo usamos
    if (req.user) {
      next();
      return;
    }
    
    // Fallback a modo anterior
    const user = await User.findOne({ logged: true });
    if (!user) {
      return res.status(401).json({ error: 'No hay usuario autenticado' });
    }
    req.currentUser = user;
    req.user = {
      id: user._id,
      username: user.username
    };
    next();
  } catch (error) {
    res.status(500).json({ error: 'Error al verificar usuario actual' });
  }
};

module.exports = { verifyJWT, getCurrentUser }; 