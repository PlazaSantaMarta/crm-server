const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { setupLogger } = require('../utils/logger');

const logger = setupLogger();

// Middleware para verificar token JWT o token de Google
const verifyJWT = async (req, res, next) => {
  try {
    // Extraer el token
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
    }

    try {
      // Primero intentar verificar como JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret');
      const user = await User.findById(decoded.userId);
      
      if (user) {
        req.user = {
          id: user._id,
          username: user.username
        };
        req.currentUser = user;
        return next();
      }
    } catch (jwtError) {
      logger.info('Token no es JWT válido, intentando como token de Google');
    }

    // Si no es JWT válido, buscar usuario con token de Google
    const user = await User.findOne({
      'google_credentials.access_token': token
    });

    if (!user) {
      // Intentar buscar usuario con logged: true como fallback
      const loggedUser = await User.findOne({ logged: true });
      if (!loggedUser) {
        return res.status(401).json({ error: 'Usuario no encontrado.' });
      }
      
      // Actualizar token de Google del usuario
      loggedUser.google_credentials = {
        ...loggedUser.google_credentials,
        access_token: token
      };
      await loggedUser.save();
      
      req.user = {
        id: loggedUser._id,
        username: loggedUser.username
      };
      req.currentUser = loggedUser;
    } else {
      req.user = {
        id: user._id,
        username: user.username
      };
      req.currentUser = user;
    }

    next();
  } catch (error) {
    logger.error('Error en autenticación:', error);
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