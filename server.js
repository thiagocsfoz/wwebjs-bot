import 'dotenv/config';
import mongoose from 'mongoose';
import app from './app.js';
import { initializeClients } from './services/whatsappService.js';
import { MongoStore } from 'wwebjs-mongo';

const PORT = process.env.PORT || 3000;

    mongoose.connect(process.env.MONGO_URI)
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
