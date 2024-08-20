import {
    delay,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    makeWASocket,
} from '@whiskeysockets/baileys';
import {loginToInfinityCRM, sendMessageToInfinityCRM} from './infinityCrmService.js';
import {MongoClient, ObjectId} from 'mongodb';
import {log} from '../utils/logger.js';
import {useMongoDBAuthState} from 'mongo-baileys';
import makeMongoStore from "../utils/makeMongoStore.js";

const logger = log.child({});
logger.level = 'trace';

export const clients = {};

const stores = [];

async function connectToMongoDB(collectionName) {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    const db = client.db();
    const collection = db.collection(collectionName);
    return { client, collection };
}

export const initializeClient = async (assistantData) => {
    const { _id: assistantId, name, trainings } = assistantData;

    // Criar o store MongoDB específico para o assistente
    const store = await makeMongoStore(logger, assistantId);
    stores[assistantId] = store;

    // Conectar ao MongoDB para salvar o estado do auth
    const { collection } = await connectToMongoDB(`baileys_auth_info_${assistantId}`);
    const { state, saveCreds } = await useMongoDBAuthState(collection);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    // Inicializar o socket
    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false,
    });

    // Associar o store ao socket
    store?.bind(sock.ev);

    // Salvar credenciais quando houver atualização
    sock.ev.on('creds.update', saveCreds);

    console.log('handle connection.update event');
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            // Reconectar se não estiver desconectado manualmente
            if ((lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
                console.log(`Connection closed for assistantId: ${assistantId}. Reconnecting...`);
                await delay(5000); // Adicionar um delay antes de tentar reconectar
                initializeClient(assistantData);
            } else {
                console.log('Connection closed. You are logged out.');
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
                let text = msg.message.conversation;
                console.log(`Mensagem recebida: ${text}`);

                // Verificar se `isSendToIA` está desabilitado para este chat
                const client = new MongoClient(process.env.MONGO_URI);
                try {
                    await client.connect();
                    const db = client.db();
                    const chatsCollection = db.collection('chats');
                    const chat = await chatsCollection.findOne({
                        assistant_id: new ObjectId(assistantId),
                        email: msg.key.remoteJid
                    });

                    if (chat && chat.isSendToIA === true) {
                        console.log('isSendToIA is true. Message will not be sent to the AI.');
                        return;
                    }

                    const sessionName = await loginToInfinityCRM();
                    const response = await sendMessageToInfinityCRM(sessionName, text, assistantId.toString(), msg.key.remoteJid);

                    if (response.result.reply) {
                        console.log(`Msg response ${response.result.reply}`);
                        let msgIa = response.result.reply;
                        if (msgIa.includes('####ATENDENTE####')) {
                            console.log('Palavra chave ####ATENDENTE#### detectada.');

                            // Marcar o chat como isSendToIA: true
                            await chatsCollection.updateOne(
                                {
                                    assistant_id: new ObjectId(assistantId),
                                    email: msg.key.remoteJid
                                },
                                { $set: { isSendToIA: true } }
                            );

                            // Remover '####ATENDENTE####' da mensagem
                            msgIa = msgIa.replace('####ATENDENTE####', '').trim();

                            if(msgIa === "Vou transferir você para um atendente humano agora.") {

                            }
                        }

                        await sock.sendMessage(msg.key.remoteJid, { text: msgIa });
                    } else {
                        console.error('Failed to get a response from the assistant.');
                    }
                } catch (error) {
                    console.error('Error:', error);
                } finally {
                    await client.close();
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
        const store = stores[assistantId];
        // Acessar os chats diretamente da store
        const chats = Array.from(store.chats.values());
        if (!chats) {
            throw new Error(`No chats found for assistantId: ${assistantId}`);
        }

        return chats.filter(chat => chat.conversationTimestamp).map(chat => {
            let lastMessage = null;
            let lastMessageTimestamp = null;

            const messages = store.messages.get(chat.id);
            if (messages && messages.length > 0) {
                const messageMap = new Map();

                // Populate the map with the messages
                messages.forEach(msg => {
                    const msgId = msg.key.id;

                    if (msg.message?.editedMessage?.message?.protocolMessage?.type === 14) {
                        // It's an edited message, replace the original
                        const originalMessageId = msg.message.editedMessage.message.protocolMessage.key.id;
                        if (messageMap.has(originalMessageId)) {
                            const originalMessage = messageMap.get(originalMessageId);
                            msg.messageTimestamp = originalMessage.messageTimestamp;
                            messageMap.set(originalMessageId, msg);
                        } else {
                            messageMap.set(msgId, msg);
                        }
                    } else {
                        // Regular message, add to map
                        messageMap.set(msgId, msg);
                    }
                });

                const sortedMessages = Array.from(messageMap.values()).sort((a, b) => {
                    const timestampA = a.messageTimestamp?.low || a.messageTimestamp;
                    const timestampB = b.messageTimestamp?.low || a.messageTimestamp;
                    return timestampA - timestampB;
                });


                const lastMsgObj = sortedMessages[sortedMessages.length - 1];
                console.log(lastMsgObj)
                if (lastMsgObj) {
                    lastMessage = lastMsgObj.message?.conversation || lastMsgObj.message?.extendedTextMessage?.text || null;

                    lastMessageTimestamp = lastMsgObj.messageTimestamp
                        ? convertTimestamp(lastMsgObj.messageTimestamp)
                        : null;
                }

                return {
                    id: chat.id,
                    name: chat.name || chat.formattedTitle || chat.id.user, // Nome do contato ou número do WhatsApp
                    formattedNumber: chat.id.user, // Número do WhatsApp formatado
                    unreadCount: chat.unreadCount, // Contagem de mensagens não lidas
                    lastMessage: lastMessage, // Última mensagem enviada ou recebida
                    lastMessageTimestamp: lastMessageTimestamp // Hora da última mensagem
                };
            }
        });
    } catch (error) {
        console.error(`Error listing chats for assistantId: ${assistantId}`, error);
        throw error;
    }
};

export const listAllMessagesByChatId = async (assistantId, chatId) => {
    const client = clients[assistantId];
    if (!client) {
        throw new Error(`No client found for assistantId: ${assistantId}`);
    }

    try {
        const store = stores[assistantId];
        const messages = store.messages.get(chatId);
        if (!messages) {
            throw new Error(`No messages found for chatId: ${chatId}`);
        }

        const messageMap = new Map();

        // Populate the map with the messages
        messages.forEach(msg => {
            const msgId = msg.key.id;

            if (msg.message?.editedMessage?.message?.protocolMessage?.type === 14) {
                // It's an edited message, replace the original
                const originalMessageId = msg.message.editedMessage.message.protocolMessage.key.id;
                if (messageMap.has(originalMessageId)) {
                    const originalMessage = messageMap.get(originalMessageId);
                    msg.messageTimestamp = originalMessage.messageTimestamp;
                    messageMap.set(originalMessageId, msg);
                } else {
                    messageMap.set(msgId, msg);
                }
            } else {
                // Regular message, add to map
                messageMap.set(msgId, msg);
            }
        });

        // Convert map back to array and sort by timestamp
        const sortedMessages = Array.from(messageMap.values()).sort((a, b) => {
            const timestampA = a.messageTimestamp?.low || a.messageTimestamp;
            const timestampB = b.messageTimestamp?.low || a.messageTimestamp;
            return timestampA - timestampB;
        });

        // Return formatted messages
        return sortedMessages.filter(msg => msg.message).map(msg => {
            const content = msg.message?.conversation
                || msg.message?.extendedTextMessage?.text
                || msg.message?.editedMessage?.message.protocolMessage.editedMessage.conversation
                || 'Mensagem sem conteúdo';

            const timestamp = msg.messageTimestamp.low ? convertTimestamp(msg.messageTimestamp) : convertTimestamp({low: msg.messageTimestamp});

            return {
                id: msg.key.id,
                fromMe: msg.key.fromMe,
                content: content,
                timestamp: timestamp,
                status: msg.status || 'sent'
            };
        });
    } catch (error) {
        console.error(`Error listing messages for chatId: ${chatId}`, error);
        throw error;
    }
};

export const markMessagesAsRead = async (assistantId, chatId) => {
    const client = clients[assistantId];
    if (!client) {
        throw new Error(`No client found for assistantId: ${assistantId}`);
    }

    try {
        const store = stores[assistantId];
        const messages = store.messages.get(chatId);
        if (!messages) {
            throw new Error(`No messages found for chatId: ${chatId}`);
        }

        const unreadMessages = messages.filter(msg => !msg.key.fromMe && msg.status !== 'read');

        if (unreadMessages.length === 0) {
            console.log(`No unread messages to mark as read for chatId: ${chatId}`);
            return false;
        }

        // Obtenha os keys das mensagens não lidas
        const messageKeys = unreadMessages.map(msg => msg.key);

        // Use o método readMessages para marcar as mensagens como lidas
        await client.readMessages(messageKeys);

        console.log(`All unread messages for chatId: ${chatId} marked as read.`);
        return true;
    } catch (error) {
        console.error(`Error marking messages as read for chatId: ${chatId}`, error);
        throw error;
    }
};

export const sendMessageToChat = async (assistantId, chatId, message) => {
    const client = clients[assistantId];
    if (!client) {
        throw new Error(`No client found for assistantId: ${assistantId}`);
    }

    try {
        const sentMessage = await client.sendMessage(chatId, { text: message });
        console.log(`Message sent to chatId: ${chatId}`, sentMessage);
        return sentMessage;
    } catch (error) {
        console.error(`Error sending message to chatId: ${chatId}`, error);
        throw error;
    }
};

export const disableAssistantForChat = async (assistantId, emailOrChatId) => {
    const client = new MongoClient(process.env.MONGO_URI);
    console.log('assistantId', assistantId);
    console.log('emailOrChatId', emailOrChatId);

    try {
        await client.connect();
        const db = client.db();
        const chatsCollection = db.collection('chats');

        const result = await chatsCollection.updateOne(
            { assistant_id: new ObjectId(assistantId), email: emailOrChatId },
            { $set: { isSendToIA: true } }
        );

        console.log(result)
        if (result.modifiedCount === 1) {
            console.log(`Assistant ${assistantId} disabled for chat ${emailOrChatId} successfully.`);
            return true;
        } else {
            console.log(`No updates made for assistant ${assistantId} and chat ${emailOrChatId}.`);
            return false;
        }
    } catch (error) {
        console.error(`Error disabling assistant for assistantId: ${assistantId} and chatId: ${emailOrChatId}`, error);
        throw error;
    } finally {
        await client.close();
    }
};


export const initializeClients = async (mongoUri) => {
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

function convertTimestamp({ low, high, unsigned }) {
    // Converter o timestamp (considerando apenas a parte "low" que é em segundos)
    const milliseconds = low * 1000;

    // Criar um objeto Date usando o timestamp em milissegundos
    const date = new Date(milliseconds);

    // Converter a data para string no formato desejado
    // Exemplo: toLocaleString() retorna a data e hora local como string
    return date.toLocaleString();
}
