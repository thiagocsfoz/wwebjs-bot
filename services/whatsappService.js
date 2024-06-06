const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { loginToInfinityCRM, sendMessageToInfinityCRM } = require('./infinityCrmService');
const { MongoClient } = require('mongodb');

const clients = {};

const initializeClient = (assistantData, store) => {
    const { _id: assistantId, name, trainings } = assistantData;

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: assistantId.toString(),
            store: store,
            backupSyncIntervalMs: 300000
        }),
        puppeteer: {
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
        webVersionCache: {
            type: "remote",
            remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
        },
    });

    // Event listeners
    client.on('ready', () => {
        console.log(`Client ${assistantId} (${name}) is ready!`);
    });

    client.on('remote_session_saved', () => {
        console.log(`Session for client ${assistantId} (${name}) saved.`);
    });

    client.on('message_create', async (message) => {
        try {
            const sessionName = await loginToInfinityCRM();
            const response = await sendMessageToInfinityCRM(sessionName, message.body, assistantId, 'email@example.com');

            if (response.result.reply) {
                await client.sendMessage(message.from, response.result.reply);
            } else {
                await client.sendMessage(message.from, 'Failed to get a response from the assistant.');
            }
        } catch (error) {
            console.error('Error:', error);
            await client.sendMessage(message.from, 'An error occurred while processing your request.');
        }
    });

    client.initialize();
    clients[assistantId] = client;
};

const initializeClients = async (mongoUri, store) => {
    const client = new MongoClient(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

    try {
        await client.connect();
        const db = client.db();
        const assistantsCollection = db.collection('assistants');
        const assistants = await assistantsCollection.find({}).toArray();

        assistants.forEach(assistantData => {
            initializeClient(assistantData, store);
        });
    } catch (error) {
        console.error('Error initializing clients:', error);
    } finally {
        await client.close();
    }
};

module.exports = {
    initializeClient,
    initializeClients,
    clients
};