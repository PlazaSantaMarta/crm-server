const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  googleId: {
    type: String,
    sparse: true
  },
  name: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  email: {
    type: String
  },
  source: {
    type: String,
    enum: ['google', 'manual', 'file'],
    required: true
  },
  isValid: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Índices para búsquedas eficientes
ContactSchema.index({ userId: 1, googleId: 1 });
ContactSchema.index({ userId: 1, phoneNumber: 1 });

module.exports = mongoose.model('Contact', ContactSchema); 