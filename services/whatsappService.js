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
import { log } from '../utils/logger.js';
import path from "path";
import fs from "fs";

const logger = log.child({});
logger.level = 'trace';

export const clients = {};

export const initializeClient = async (assistantData) => {
    const { _id: assistantId, name, trainings } = assistantData;

    const { state, saveCreds } = await useMultiFileAuthState(`./stores/baileys_auth_info_${assistantId}`);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false,
    });

    sock.ev.on('creds.update', saveCreds);

    console.log('handle connection.update event');
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if(connection === 'close') {
            // reconnect if not logged out
            if((lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
                console.log(`Connection closed for assistantId: ${assistantId}. Reconnecting...`);
                await delay(5000); // Adicionar um delay antes de tentar reconectar
                initializeClient(assistantId);
            } else {
                console.log('Connection closed. You are logged out.')
            }
        } else if (connection === 'open') {
            console.log(`Client ${assistantId} is ready!`);
        }
    });

    console.log('handle messages.upsert event');
    sock.ev.on('messages.upsert', async (m) => {
        console.log(JSON.stringify(m, undefined, 2));
        const msg = m.messages[0];
        if (!msg.message) return;

        if (!msg.key.fromMe && m.type === 'notify') {
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
        }
    });

    clients[assistantId] = sock;
    return sock;
};

export const listAllChats = async (assistantId) => {
    const client = clients[assistantId];
    if (!client) {
        throw new Error(`No client found for assistantId: ${assistantId}`);
    }

    try {
        const chats = client.store.chats.all();
        return chats.map(chat => ({
            id: chat.id,
            name: chat.name,
            unreadCount: chat.unreadCount,
            lastMessage: chat.messages.length > 0 ? chat.messages[chat.messages.length - 1].message.conversation : null
        }));
    } catch (error) {
        console.error(`Error listing chats for assistantId: ${assistantId}`, error);
        throw error;
    }
};

export const initializeClients = async (mongoUri, store) => {
    const client = new MongoClient(mongoUri);

    try {
        await client.connect();
        const db = client.db();
        const assistantsCollection = db.collection('assistants');
        const assistants = await assistantsCollection.find({}).toArray();

        assistants.forEach(assistantData => {
            initializeClient(assistantData);
        });
    } catch (error) {
        console.error('Error initializing clients:', error);
    } finally {
        await client.close();
    }
};
