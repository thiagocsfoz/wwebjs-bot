import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeCacheableSignalKeyStore,
    delay,
    fetchLatestBaileysVersion,
    makeInMemoryStore
} from '@whiskeysockets/baileys';
import { loginToInfinityCRM, sendMessageToInfinityCRM } from './infinityCrmService.js';
import { MongoClient } from 'mongodb';
import { log } from '../utils/logger.js';
import path from "path";
import fs from "fs";

const logger = log.child({});
logger.level = 'trace';

export const clients = {};

const loadStoreForAssistant = (assistantId) => {
    const storeFilePath = `./stores/store_${assistantId}.json`;

    const store = makeInMemoryStore({ logger: console });
    if (fs.existsSync(storeFilePath)) {
        store.readFromFile(storeFilePath);
    } else {
        console.warn(`Store file not found for assistantId: ${assistantId}`);
    }

    // Salvar automaticamente o store em intervalos regulares
    setInterval(() => {
        store.writeToFile(storeFilePath);
    }, 10_000);

    return store;
};

export const initializeClient = async (assistantData) => {
    const { _id: assistantId, name, trainings } = assistantData;

    const store = loadStoreForAssistant(assistantId);
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

    store?.bind(sock.ev);

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
        const store = loadStoreForAssistant(assistantId); // Carrega a store específica do assistente

        // Acessar os chats diretamente da store
        const chats = store.chats.all();

        if (!chats) {
            throw new Error(`No chats found for assistantId: ${assistantId}`);
        }

        return chats.map(chat => {
            let lastMessage = null;
            let lastMessageTimestamp = null;

            const messages = store.messages[chat.id];
            if (messages && messages.length > 0) {
                const lastMsgObj = messages[messages.length - 1];
                if (lastMsgObj) {
                    if(lastMsgObj.key.fromMe) {
                        lastMessage = lastMsgObj.message.extendedTextMessage.text;
                    } else {
                        lastMessage = lastMsgObj.message.conversation;
                    }

                    lastMessageTimestamp = lastMsgObj.messageTimestamp ? format(new Date(lastMsgObj.messageTimestamp * 1000), 'HH:mm:ss') : null;
                }
            }

            return {
                id: chat.id,
                name: chat.name || chat.formattedTitle || chat.id.user, // Nome do contato ou número do WhatsApp
                formattedNumber: chat.id.user, // Número do WhatsApp formatado
                unreadCount: chat.unreadCount, // Contagem de mensagens não lidas
                lastMessage: lastMessage, // Última mensagem enviada ou recebida
                lastMessageTimestamp: lastMessageTimestamp // Hora da última mensagem
            };
        });
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
