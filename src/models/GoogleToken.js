const mongoose = require('mongoose');

const googleTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  token: {
    type: Object,
    required: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Middleware para actualizar lastUpdated
googleTokenSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

module.exports = mongoose.model('GoogleToken', googleTokenSchema);
