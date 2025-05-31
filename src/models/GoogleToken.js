const mongoose = require('mongoose');

const GoogleTokenSchema = new mongoose.Schema({
  code: String,
  tokens: Object,
  lastUpdated: Date
});

module.exports = mongoose.models.GoogleToken || mongoose.model('GoogleToken', GoogleTokenSchema);
