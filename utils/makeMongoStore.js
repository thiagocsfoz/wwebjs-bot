import { MongoClient } from 'mongodb';
import pkg from '@whiskeysockets/baileys';

const { proto } = pkg;

const makeMongoStore = async (logger, assistantId) => {
    const dbName = 'ChatGpt'; // Altere para o nome do seu banco de dados
    const mongoUri = process.env.MONGO_URI;

    const client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db(dbName);

    // Usando coleções únicas para armazenar todos os dados
    const chatsCollection = db.collection('baileys_chats');
    const contactsCollection = db.collection('baileys_contacts');
    const messagesCollection = db.collection('baileys_messages');
    const labelsCollection = db.collection('baileys_labels');
    const labelAssociationsCollection = db.collection('baileys_label_associations');

    // Definindo índices para melhorar a performance das consultas
    await chatsCollection.createIndex({ assistantId: 1 });
    await contactsCollection.createIndex({ assistantId: 1 });
    await messagesCollection.createIndex({ assistantId: 1, chatId: 1, 'key.id': 1 });
    await labelsCollection.createIndex({ assistantId: 1 });
    await labelAssociationsCollection.createIndex({ assistantId: 1 });

    const storeData = {
        chats: new Map(),
        contacts: new Map(),
        messages: new Map(),
        labels: new Map(),
        labelAssociations: new Map(),
    };

    const loadInitialData = async () => {
        console.log('Loading initial data from MongoDB');

        const chats = await chatsCollection.find({ assistantId }).toArray();
        chats.forEach(chat => storeData.chats.set(chat.id, chat));

        const contacts = await contactsCollection.find({ assistantId }).toArray();
        contacts.forEach(contact => storeData.contacts.set(contact.id, contact));

        const messages = await messagesCollection.find({ assistantId }).toArray();
        messages.forEach(msg => {
            if (!storeData.messages.has(msg.chatId)) {
                storeData.messages.set(msg.chatId, []);
            }
            storeData.messages.get(msg.chatId).push(msg);
        });

        const labels = await labelsCollection.find({ assistantId }).toArray();
        labels.forEach(label => storeData.labels.set(label.id, label));

        const labelAssociations = await labelAssociationsCollection.find({ assistantId }).toArray();
        labelAssociations.forEach(assoc => storeData.labelAssociations.set(assoc.id, assoc));
    };

    await loadInitialData();

    const saveToMongo = async () => {
        for (const chat of storeData.chats.values()) {
            console.log(chat);
            const doc = { ...chat, assistantId, type: 'chat' };
            const filter = { id: chat.id, assistantId, type: 'chat' };
            if (doc._id) delete doc._id;

            await chatsCollection.updateOne(
                filter,
                { $set: doc },
                { upsert: true }
            );
        }

        for (const contact of storeData.contacts.values()) {
            const doc = { ...contact, assistantId, type: 'contact' };
            const filter = { id: contact.id, assistantId, type: 'contact' };
            if (doc._id) delete doc._id;

            await contactsCollection.updateOne(
                filter,
                { $set: doc },
                { upsert: true }
            );
        }

        for (const [chatId, msgs] of storeData.messages.entries()) {
            for (const msg of msgs) {
                const doc = { ...msg, assistantId, chatId, type: 'message' };
                const filter = { 'key.id': msg.key.id, chatId, assistantId, type: 'message' };
                if (doc._id) delete doc._id;

                await messagesCollection.updateOne(
                    filter,
                    { $set: doc },
                    { upsert: true }
                );
            }
        }

        for (const label of storeData.labels.values()) {
            const doc = { ...label, assistantId };
            const filter = { labelId: label.labelId, assistantId };
            if (label._id) delete label._id;

            await labelsCollection.updateOne(
                filter,
                { $set: doc },
                { upsert: true }
            );
        }

        for (const assoc of storeData.labelAssociations.values()) {
            const doc = { ...assoc, assistantId };
            const filter = { associationId: assoc.associationId, assistantId };
            if (assoc._id) delete assoc._id;

            await labelAssociationsCollection.updateOne(
                filter,
                { $set: doc },
                { upsert: true }
            );
        }
    };

    setInterval(saveToMongo, 10_000);

    const bind = (ev) => {
        ev.on('connection.update', update => {
            logger.info({ update }, 'Connection updated');
        });

        ev.on('messaging-history.set', async ({ chats: newChats, contacts: newContacts, messages: newMessages }) => {
            newChats.forEach(chat => storeData.chats.set(chat.id, chat));
            newContacts.forEach(contact => storeData.contacts.set(contact.id, contact));
            newMessages.forEach(msg => {
                const list = storeData.messages.get(msg.key.remoteJid) || [];
                list.push(msg);
                storeData.messages.set(msg.key.remoteJid, list);
            });
            await saveToMongo();
        });

        ev.on('contacts.upsert', async (newContacts) => {
            newContacts.forEach(contact => storeData.contacts.set(contact.id, contact));
            await saveToMongo();
        });

        ev.on('chats.upsert', async (newChats) => {
            console.log("newChats", newChats);
            newChats.forEach(chat => storeData.chats.set(chat.id, chat));
            await saveToMongo();
        });

        ev.on('messages.upsert', async ({ messages: newMessages }) => {
            newMessages.forEach(msg => {
                const list = storeData.messages.get(msg.key.remoteJid) || [];
                list.push(msg);
                storeData.messages.set(msg.key.remoteJid, list);
            });
            await saveToMongo();
        });
    };

    const toJSON = () => ({
        chats: Array.from(storeData.chats.values()),
        contacts: Array.from(storeData.contacts.values()),
        messages: Object.fromEntries(storeData.messages),
        labels: Array.from(storeData.labels.values()),
        labelAssociations: Array.from(storeData.labelAssociations.values())
    });

    const fromJSON = (json) => {
        storeData.chats = new Map(json.chats.map(chat => [chat.chatId, chat]));
        storeData.contacts = new Map(json.contacts.map(contact => [contact.contactId, contact]));
        storeData.messages = new Map(Object.entries(json.messages));
        storeData.labels = new Map(json.labels.map(label => [label.labelId, label]));
        storeData.labelAssociations = new Map(json.labelAssociations.map(assoc => [assoc.associationId, assoc]));
    };

    return {
        ...storeData,
        bind,
        toJSON,
        fromJSON,
        saveToMongo
    };
};

export default makeMongoStore;
