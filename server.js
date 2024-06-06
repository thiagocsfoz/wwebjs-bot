require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');
const { initializeClients } = require('./services/whatsappService');
const { MongoStore } = require('wwebjs-mongo');

const PORT = process.env.PORT || 3000;

    mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(async () => {
        console.log('Connected to MongoDB');

        const store = new MongoStore({ mongoose: mongoose });

        // Inicializar clients para todos os assistentes na lista
        await initializeClients(process.env.MONGO_URI, store);

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error('Failed to connect to MongoDB', err);
    });
