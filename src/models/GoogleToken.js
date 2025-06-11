const mongoose = require('mongoose');

const GoogleTokenSchema = new mongoose.Schema({
  provider: { type: String, default: 'google' },
  tokens: { type: Object, required: true },
  lastCode: { type: String },
  lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.models.GoogleToken || mongoose.model('GoogleToken', GoogleTokenSchema);
