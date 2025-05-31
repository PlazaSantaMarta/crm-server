const mongoose = require("mongoose");

const kommoSchema = new mongoose.Schema({
  client_secret: {
    type: String,
    required: true,
  },
  client_id: {
    type: String,
    required: true,
  },
  redirect_uri: {
    type: String,
    required: true,
  },
  base_url: {
    type: String,
    required: true,
  },
  auth_token: {
    type: String,
    required: true,
  },
  logged: {
    type: Boolean,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model("Kommo", kommoSchema);
