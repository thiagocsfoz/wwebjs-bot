import { initializeClient, clients } from '../services/whatsappService.js';
import qrcode from 'qrcode';
import {MongoClient, ObjectId} from "mongodb";
import path from "path";
import fs from "fs";

export const generateQr = async (req, res) => {
    console.log('request qrcode');
    const { assistantId } = req.body;

    const mongoClient = new MongoClient(process.env.MONGO_URI);

    try {
        await mongoClient.connect();
        const db = mongoClient.db();
        const assistantsCollection = db.collection('assistants');
        const assistant = await assistantsCollection.find({_id: new ObjectId(assistantId)}).toArray();

        const client = await initializeClient(assistant[0]);
        console.log('client initialized successfully');

        client.ev.on('connection.update', (update) => {
            const { qr } = update;
            if (qr) {
                qrcode.toDataURL(qr, (err, url) => {
                    if (err) {
                        console.error('Error generating QR code:', err);
                        return res.status(500).json({ success: false, message: 'Error generating QR code' });
                    }
                    return res.json({ qrCodeUrl: url });
                });
            }
        });
    } catch (error) {
        console.error(`Error generating QR code for assistantId: ${assistantId}`, error);
        return res.status(500).json({ success: false, message: 'Error generating QR code', error });
    } finally {
        await mongoClient.close();
    }
};

export const checkConnection = (req, res) => {
    console.log('checkConnection');
    const { assistantId } = req.body;
    console.log(assistantId.$oid)
    const client = clients[assistantId.$oid];

    if (client) {
        if (client.user && client.user.id) {
            console.log(`Client is connected with number:  ${client.user.id}`);
            return res.json({ connected: true, phoneNumber: client.user.id });
        } else {
            console.log(`Client is not connected for assistantId: ${assistantId.$oid}`);
            return res.json({ connected: false, phoneNumber: null });
        }
    } else {
        console.log(`No client found for assistantId: ${assistantId.$oid}`);
        return res.json({ connected: false, phoneNumber: null });
    }
};

export const disconnectPhone = async (req, res) => {
    console.log('disconnectPhone');
    const { assistantId } = req.body;
    console.log("assistantId", assistantId);
    const client = clients[assistantId];
    if (client) {
        try {
            //await client.logout();
            delete clients[assistantId];
            console.log(`Client disconnected and removed for assistantId: ${assistantId}`);

            // Remove the authentication folder
            const authPath = path.resolve(`./stores/baileys_auth_info_${assistantId}`);
            fs.rm(authPath, { recursive: true, force: true }, (err) => {
                if (err) {
                    console.error(`Error removing auth folder for assistantId: ${assistantId}`, err);
                } else {
                    console.log(`Auth folder removed for assistantId: ${assistantId}`);
                }
            });

            return res.json({ success: true, message: 'Client disconnected successfully' });
        } catch (error) {
            console.error(`Error disconnecting client for assistantId: ${assistantId}`, error);
            return res.status(500).json({ success: false, message: 'Error disconnecting client', error });
        }
    } else {
        console.log(`No client found for assistantId: ${assistantId}`);
        return res.json({ success: false, message: 'No client found' });
    }
};
