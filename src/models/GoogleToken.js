const mongoose = require('mongoose');

const GoogleTokenSchema = new mongoose.Schema({
  provider: { type: String, default: 'google' },
  userId: { type: String }, // ID del usuario al que pertenece el token
  tokens: { type: Object, required: true },
  lastCode: { type: String },
  lastUpdated: { type: Date, default: Date.now }
});

// Añadir un índice para mejorar la búsqueda por usuario
GoogleTokenSchema.index({ userId: 1 });

module.exports = mongoose.models.GoogleToken || mongoose.model('GoogleToken', GoogleTokenSchema);
