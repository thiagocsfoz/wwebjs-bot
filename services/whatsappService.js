import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    delay,
    fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { loginToInfinityCRM, sendMessageToInfinityCRM } from './infinityCrmService.js';
import { MongoClient } from 'mongodb';
import { unlinkSync } from 'fs';
import { log } from '../utils/logger.js';

const logger = log.child({});
logger.level = 'trace';

export const clients = {};

export const initializeClient = async (assistantData, store) => {
    console.log(assistantData);
    const { _id: assistantId, name, trainings } = assistantData;

    const { state, saveState } = await useMultiFileAuthState(`./stores/baileys_auth_info_${assistantId}`);
    console.log('state:', state);
    console.log('saveState:', saveState);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false,
    });

    console.log('saveState:', saveState);
    sock.ev.on('creds.update', saveState);

    console.log('handle messages.upsert event');
    sock.ev.on('messages.upsert', async (m) => {
        console.log(JSON.stringify(m, undefined, 2));

        const msg = m.messages[0];
        if (!msg.message) return;

        const messageType = Object.keys(msg.message)[0];
        if (messageType === 'conversation') {
            const text = msg.message.conversation;
            console.log(`Mensagem recebida: ${text}`);

            try {
                const sessionName = await loginToInfinityCRM();
                const response = await sendMessageToInfinityCRM(sessionName, text, assistantId.toString(), msg.key.remoteJid);

                if (response.result.reply) {
                    console.log(`Msg response ${response.result.reply}`);
                    await sock.sendMessage(msg.key.remoteJid, { text: response.result.reply });
                } else {
                    console.error('Failed to get a response from the assistant.');
                }
            } catch (error) {
                console.error('Error:', error);
            }
        }
    });

    console.log('handle connection.update event');
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexão fechada devido a', lastDisconnect.error, ', reconectando!', shouldReconnect);
            if (shouldReconnect) {
                await delay(5000);
                initializeClient(assistantData, store);
            } else {
                unlinkSync(`./auth_info_${assistantId}.json`);
            }
        } else if (connection === 'open') {
            console.log(`Client ${assistantId} (${name}) is ready!`);
        }
    });

    clients[assistantId] = sock;
};

export const initializeClients = async (mongoUri, store) => {
    const client = new MongoClient(mongoUri);

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
