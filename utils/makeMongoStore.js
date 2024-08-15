import { MongoClient } from 'mongodb';
import pkg from '@whiskeysockets/baileys';
import ObjectRepository from './object-repository.js';


const { proto } = pkg;
const makeMongoStore = async (logger, assistantId) => {
    const dbName = 'ChatGpt'; // Altere para o nome do seu banco de dados
    const collectionName = `baileys_store_${assistantId}`;
    const mongoUri = process.env.MONGO_URI;

    const client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db(dbName);
    const storeCollection = db.collection(collectionName);

    const storeData = {
        chats: [],
        contacts: [],
        messages: {},
        labels: [],
        labelAssociations: []
    };

    const initialData = await storeCollection.find({}).toArray();
    if (initialData.length) {
        // Aqui, você transformará `initialData` em `storeData` apropriado
        initialData.forEach(doc => {
            if (doc.type === 'chat') {
                storeData.chats.push(doc);
            } else if (doc.type === 'contact') {
                storeData.contacts.push(doc);
            } else if (doc.type === 'message') {
                if (!storeData.messages[doc.chatId]) {
                    storeData.messages[doc.chatId] = [];
                }
                storeData.messages[doc.chatId].push(doc);
            }
        });
    }

    const store = {
        chats: new Map(storeData.chats.map(chat => [chat.id, chat])),
        contacts: new Map(storeData.contacts.map(contact => [contact.id, contact])),
        messages: new Map(Object.entries(storeData.messages)),
        groupMetadata: new Map(),
        presences: new Map(),
        labels: new Map(),
        labelAssociations: new Map()
    };

    const saveToMongo = async () => {
        // Remover todos os documentos anteriores
        await storeCollection.deleteMany({});

        // Inserir os novos documentos do store
        const docs = [];

        store.chats.forEach(chat => {
            docs.push({ ...chat, type: 'chat' });
        });

        store.contacts.forEach(contact => {
            docs.push({ ...contact, type: 'contact' });
        });

        store.messages.forEach((msgs, chatId) => {
            msgs.forEach(msg => {
                docs.push({ ...msg, type: 'message', chatId });
            });
        });

        if (docs.length) {
            await storeCollection.insertMany(docs);
        }
    };

    setInterval(saveToMongo, 10_000);

    const bind = (ev) => {
        ev.on('connection.update', update => {
            logger.info({ update }, 'Connection updated');
        });

        ev.on('messaging-history.set', async ({ chats: newChats, contacts: newContacts, messages: newMessages }) => {
            newChats.forEach(chat => store.chats.set(chat.id, chat));
            newContacts.forEach(contact => store.contacts.set(contact.id, contact));
            newMessages.forEach(msg => {
                const list = store.messages.get(msg.key.remoteJid) || [];
                list.push(msg);
                store.messages.set(msg.key.remoteJid, list);
            });
            await saveToMongo();
        });

        ev.on('contacts.upsert', async (newContacts) => {
            newContacts.forEach(contact => store.contacts.set(contact.id, contact));
            await saveToMongo();
        });

        ev.on('chats.upsert', async (newChats) => {
            newChats.forEach(chat => store.chats.set(chat.id, chat));
            await saveToMongo();
        });

        ev.on('messages.upsert', async ({ messages: newMessages }) => {
            newMessages.forEach(msg => {
                const list = store.messages.get(msg.key.remoteJid) || [];
                list.push(msg);
                store.messages.set(msg.key.remoteJid, list);
            });
            await saveToMongo();
        });
    };

    const toJSON = () => ({
        chats: Array.from(store.chats.values()),
        contacts: Array.from(store.contacts.values()),
        messages: Object.fromEntries(store.messages),
        labels: store.labels.toJSON(),
        labelAssociations: Array.from(store.labelAssociations.values())
    });

    const fromJSON = (json) => {
        store.chats = new Map(json.chats.map(chat => [chat.id, chat]));
        store.contacts = new Map(json.contacts.map(contact => [contact.id, contact]));
        store.messages = new Map(Object.entries(json.messages).map(([key, value]) => [
            key,
            value.map(msg => proto.WebMessageInfo.fromObject(msg))
        ]));
        store.labels.fromJSON(json.labels);
        store.labelAssociations = new Map(json.labelAssociations.map(la => [la.id, la]));
    };

    return {
        ...store,
        bind,
        toJSON,
        fromJSON,
        saveToMongo
    };
};

export default makeMongoStore;
