const mongoose = require('mongoose');

const GoogleTokenSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  provider: { 
    type: String, 
    default: 'google' 
  },
  tokens: { 
    type: Object, 
    required: true 
  },
  lastCode: { 
    type: String 
  },
  lastUpdated: { 
    type: Date, 
    default: Date.now 
  }
});

// Índice compuesto para búsquedas eficientes
GoogleTokenSchema.index({ userId: 1, provider: 1 });

module.exports = mongoose.models.GoogleToken || mongoose.model('GoogleToken', GoogleTokenSchema);
