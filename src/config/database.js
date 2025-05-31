const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://naobregon27:83nMg3x1iTzSKZfG@kommo.xa9nxvx.mongodb.net/';

const connectDB = async () => {
  try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Conexión exitosa a MongoDB Atlas');
  } catch (error) {
        console.error('❌ Error al conectar a MongoDB:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB; 
