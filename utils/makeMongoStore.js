import { MongoClient } from 'mongodb';
import pkg from '@whiskeysockets/baileys';

const { proto } = pkg;

const makeMongoStore = async (logger, assistantId) => {
    const dbName = 'ChatGpt'; // Altere para o nome do seu banco de dados
    const mongoUri = process.env.MONGO_URI;

    const client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db(dbName);

    const chatsCollection = db.collection(`baileys_chats_${assistantId}`);
    const contactsCollection = db.collection(`baileys_contacts_${assistantId}`);
    const messagesCollection = db.collection(`baileys_messages_${assistantId}`);
    const labelsCollection = db.collection(`baileys_labels_${assistantId}`);
    const labelAssociationsCollection = db.collection(`baileys_label_associations_${assistantId}`);

    const storeData = {
        chats: new Map(),
        contacts: new Map(),
        messages: new Map(),
        labels: new Map(),
        labelAssociations: new Map(),
    };

    const loadInitialData = async () => {
        console.log('Loading initial data from MongoDB');
        // Carregar chats do MongoDB e inserir no storeData
        const chats = await chatsCollection.find({}).toArray();
        chats.forEach(chat => storeData.chats.set(chat.id, chat));

        // Carregar contatos do MongoDB e inserir no storeData
        const contacts = await contactsCollection.find({}).toArray();
        contacts.forEach(contact => storeData.contacts.set(contact.id, contact));

        // Carregar mensagens do MongoDB e inserir no storeData
        const messages = await messagesCollection.find({}).toArray();
        messages.forEach(msg => {
            if (!storeData.messages.has(msg.chatId)) {
                storeData.messages.set(msg.chatId, []);
            }
            storeData.messages.get(msg.chatId).push(msg);
        });

        // Carregar labels do MongoDB e inserir no storeData
        const labels = await labelsCollection.find({}).toArray();
        labels.forEach(label => storeData.labels.set(label.id, label));

        // Carregar associações de labels do MongoDB e inserir no storeData
        const labelAssociations = await labelAssociationsCollection.find({}).toArray();
        labelAssociations.forEach(assoc => storeData.labelAssociations.set(assoc.id, assoc));
    };

    await loadInitialData();

    const saveToMongo = async () => {
        // Salvar chats no MongoDB
        for (const chat of storeData.chats.values()) {
            const doc = { ...chat, type: 'chat' };
            const filter = { id: chat.id, type: 'chat' };
            delete doc._id;

            await chatsCollection.updateOne(
                filter,
                { $set: doc },
                { upsert: true }
            );
        }

        // Salvar contatos no MongoDB
        for (const contact of storeData.contacts.values()) {
            const doc = { ...contact, type: 'contact' };
            const filter = { id: contact.id, type: 'contact' };
            delete doc._id;

            await contactsCollection.updateOne(
                filter,
                { $set: doc },
                { upsert: true }
            );
        }

        // Save messages
        for (const [chatId, msgs] of storeData.messages.entries()) {
            for (const msg of msgs) {
                await messagesCollection.updateOne(
                    { 'key.id': msg.key.id, chatId: chatId },
                    { $set: { ...msg, chatId } },
                    { upsert: true }
                );
            }
        }

        // Save labels
        for (const label of storeData.labels.values()) {
            await labelsCollection.updateOne(
                { labelId: label.labelId },
                { $set: label },
                { upsert: true }
            );
        }

        // Save label associations
        for (const assoc of storeData.labelAssociations.values()) {
            await labelAssociationsCollection.updateOne(
                { associationId: assoc.associationId },
                { $set: assoc },
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
