const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { loginToInfinityCRM, sendMessageToInfinityCRM } = require('./infinityCrmService');
const { MongoClient } = require('mongodb');

const clients = {};

const initializeClient = (assistantData, store) => {
    console.log(assistantData);
    const { _id: assistantId, name, trainings } = assistantData;

    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: assistantId.toString(),
            store: store,
            backupSyncIntervalMs: 300000
        }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
        webVersionCache: {
            type: "remote",
            remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014680956-alpha.html",
        },
    });

    // Event listeners
    client.on('ready', () => {
        console.log(`Client ${assistantId} (${name}) is ready!`);
    });

    client.on('remote_session_saved', () => {
        console.log(`Session for client ${assistantId} (${name}) saved.`);
    });

    client.on('disconnected', async () => {
        await client.logout();
        delete clients.filter((c) => c === client);
        console.log(`client ${assistantId} disconnected`);
    });

    client.on('message_create', async (message) => {
        try {
            if(!message.fromMe) {
                console.log(`Starting event to send msg`);
                const sessionName = await loginToInfinityCRM();
                const response = await sendMessageToInfinityCRM(sessionName, message.body, assistantId.toString(), message.from);

                if (response.result.reply) {
                    console.log(`Msg response ${response.result.reply}`);
                    await client.sendMessage(message.from, response.result.reply);
                } else {
                    console.error('Failed to get a response from the assistant.');
                    //await client.sendMessage(message.from, 'Failed to get a response from the assistant.');
                }
            }
        } catch (error) {
            console.error('Error:', error);
            //await client.sendMessage(message.from, 'An error occurred while processing your request.');
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
