const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const mongoose = require('mongoose');
const { MongoStore } = require('wwebjs-mongo');
const cors = require('cors');
const querystring = require('querystring');

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const clients = {};

const ASSISTANTS = ['664bfd6f092675ef0507c192', '6650d3db035191dbc5059612', '6651cc1766e5aaee0f0bc192']; // Lista de assistentes

// Função para login no InfinityCRM
const loginToInfinityCRM = async () => {
    const username = 'amanda';
    const accessKey = 'sVRRDk21NPm996H0';

    const challengeResponse = await axios.get('https://infinitycrm.com.br/webservice.php', {
        params: {
            operation: 'getchallenge',
            username: username
        }
    });

    console.log(challengeResponse);
    if (!challengeResponse.data.success) {
        throw new Error('Failed to get challenge token');
    }

    const token = challengeResponse.data.result.token;
    const accessKeyHash = require('crypto').createHash('md5').update(token + accessKey).digest('hex');

    const loginResponse = await axios.post('https://infinitycrm.com.br/webservice.php',
        querystring.stringify({
            operation: 'login',
            username: username,
            accessKey: accessKeyHash
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

    if (!loginResponse.data.success) {
        console.log(loginResponse.data);
        throw new Error('Login failed');
    }

    return loginResponse.data.result.sessionName;
};

// Função para enviar mensagem para o InfinityCRM
const sendMessageToInfinityCRM = async (sessionName, message, id, email) => {
    const response = await axios.post('https://infinitycrm.com.br/webservice.php',
        querystring.stringify({
            operation: 'ChatGTPApiSendMessage',
            sessionName: sessionName,
            message: message,
            id: id,
            email: email
        }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

    return response.data;
};

const initializeClient = (assistantId, store) => {
    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: assistantId,
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

    client.on('qr', (qr) => {
        console.log(`QR code for ${assistantId}`);
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log(`Client ${assistantId} is ready!`);
    });

    client.on('remote_session_saved', () => {
        console.log(`Session for client ${assistantId} saved.`);
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

    mongoose.connect('mongodb://localhost:27017/wwebjs-bot', { useNewUrlParser: true, useUnifiedTopology: true }).then(() => {
    console.log('Connected to MongoDB');

    const store = new MongoStore({ mongoose: mongoose });

    // Inicializar clients para todos os assistentes na lista
    ASSISTANTS.forEach(assistantId => {
        initializeClient(assistantId, store);
    });

    app.post('/generate_qr', async (req, res) => {
        const { assistantId } = req.body;

        if (!clients[assistantId]) {
            initializeClient(assistantId, store);
        }

        const client = clients[assistantId];

        client.once('qr', (qr) => {
            qrcode.generate(qr, { small: true }, (qrcodeStr) => {
                res.send(`${qrcodeStr}`);
            });
        });

        client.initialize();
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}).catch(err => {
    console.error('Failed to connect to MongoDB', err);
});
