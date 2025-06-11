const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    kommo_credentials: {
        client_secret: {
            type: String,
            required: true
        },
        client_id: {
            type: String,
            required: true
        },
        redirect_uri: {
            type: String,
            required: true
        },
        base_url: {
            type: String,
            required: true
        },
        auth_token: {
            type: String,
            required: true
        }
    },
    google_credentials: {
        access_token: String,
        refresh_token: String,
        expiry_date: Number,
        client_id: String,
        client_secret: String,
        redirect_uri: String
    },
    logged: {
        type: Boolean,
        default: false
    },
    refreshToken: {
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Middleware para hashear la contraseña antes de guardar
userSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

// Método para comparar contraseñas
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema); 