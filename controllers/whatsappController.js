import {
    initializeClient,
    clients,
    listAllChats,
    listAllMessagesByChatId,
    markMessagesAsRead, sendMessageToChat, disableAssistantForChat
} from '../services/whatsappService.js';
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
            const { qr} = update;

            if (qr) {
                qrcode.toDataURL(qr, (err, url) => {
                    if (err) {
                        console.error('Error generating QR code:', err);
                        return res.status(500).json({ success: false, message: 'Error generating QR code' });
                    }
                    console.log('QR code generated and sent successfully');
                    return res.json({ qrCodeUrl: url });
                });
            }
        });
    } catch (error) {
        console.error(`Error generating QR code for assistantId: ${assistantId}`, error);
        return res.status(500).json({ success: false, message: 'Error generating QR code', error });
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
            await client.logout();
            delete clients[assistantId];
            console.log(`Client disconnected and removed for assistantId: ${assistantId}`);

            // Connect to MongoDB
            const mongoClient = new MongoClient(process.env.MONGO_URI);
            await mongoClient.connect();

            const db = mongoClient.db(); // Replace with your database name if needed
            const collectionName = `baileys_auth_info_${assistantId}`;

            // Drop the collection
            const result = await db.collection(collectionName).drop();
            console.log(`Collection '${collectionName}' removed for assistantId: ${assistantId}`);

            await mongoClient.close();

            return res.json({ success: true, message: 'Client disconnected successfully and auth collection removed' });
        } catch (error) {
            console.error(`Error disconnecting client for assistantId: ${assistantId}`, error);
            return res.status(500).json({ success: false, message: 'Error disconnecting client', error });
        }
    } else {
        console.log(`No client found for assistantId: ${assistantId}`);
        return res.json({ success: false, message: 'No client found' });
    }
};

export const getAllChats = async (req, res) => {
    console.log('getAllChats');
    const { assistantId } = req.body;

    try {
        console.log('Listing all chats for assistantId:', assistantId);
        const chats = await listAllChats(assistantId);

        return res.json({ success: true, chats });
    } catch (error) {
        console.log(`Error fetching chats for assistantId: ${assistantId}`, error);
        return res.status(500).json({ success: false, message: 'Error fetching chats', error });
    }
};

export const getAllMessagesByChatId = async (req, res) => {
    const { assistantId, chatId } = req.body;

    try {
        console.log(`Listing all messages for chatId: ${chatId} and assistantId: ${assistantId}`);
        const messages = await listAllMessagesByChatId(assistantId, chatId);
        return res.json({ success: true, messages });
    } catch (error) {
        console.log(`Error fetching messages for chatId: ${chatId}`, error);
        return res.status(500).json({ success: false, message: 'Error fetching messages', error });
    }
};

export const markAllMessagesAsRead = async (req, res) => {
    const { assistantId, chatId } = req.body;

    try {
        console.log(`Marking all messages as read for chatId: ${chatId} and assistantId: ${assistantId}`);
        const success = await markMessagesAsRead(assistantId, chatId);
        if (success) {
            return res.json({ success: true, message: 'All messages marked as read' });
        } else {
            return res.status(500).json({ success: false, message: 'Failed to mark messages as read' });
        }
    } catch (error) {
        console.log(`Error marking messages as read for chatId: ${chatId}`, error);
        return res.status(500).json({ success: false, message: 'Error marking messages as read', error });
    }
};

export const sendMessageEndpoint = async (req, res) => {
    const { assistantId, chatId, message } = req.body;

    if (!assistantId || !chatId || !message) {
        return res.status(400).json({ success: false, message: 'Missing required fields: assistantId, chatId, message' });
    }

    try {
        const result = await sendMessageToChat(assistantId, chatId, message);
        return res.json({ success: true, result });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to send message', error: error.message });
    }
};

export const disableAssistant = async (req, res) => {
    const { assistantId, emailOrChatId } = req.body;

    try {
        const result = await disableAssistantForChat(assistantId, emailOrChatId);
        if (result) {
            res.status(200).send(`Assistant ${assistantId} disabled successfully.`);
        } else {
            res.status(400).send(`Failed to disable assistant ${assistantId}.`);
        }
    } catch (error) {
        res.status(500).send(`Error disabling assistant ${assistantId}: ${error.message}`);
    }
};
