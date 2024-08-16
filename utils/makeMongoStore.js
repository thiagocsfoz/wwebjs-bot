import { MongoClient, ObjectId } from 'mongodb';
import pkg from '@whiskeysockets/baileys';

const { proto } = pkg;

const makeMongoStore = async (logger, assistantIdStr) => {
    const dbName = 'ChatGpt';
    const mongoUri = process.env.MONGO_URI;

    const client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db(dbName);

    const assistantId = new ObjectId(assistantIdStr);

    const chatsCollection = db.collection('baileys_chats');
    const contactsCollection = db.collection('baileys_contacts');
    const messagesCollection = db.collection('baileys_messages');
    const labelsCollection = db.collection('baileys_labels');
    const labelAssociationsCollection = db.collection('baileys_label_associations');

    const storeData = {
        chats: new Map(),
        contacts: new Map(),
        messages: new Map(),
        labels: new Map(),
        labelAssociations: new Map(),
    };

    const loadInitialData = async () => {
        console.log('Loading initial data from MongoDB');

        // Carregar apenas campos essenciais inicialmente
        const [chats, contacts, messages, labels, labelAssociations] = await Promise.all([
            chatsCollection.find({ assistantId }, { projection: { id: 1, conversationTimestamp: 1, unreadCount: 1, name: 1, formattedTitle: 1 } }).toArray(),
            contactsCollection.find({ assistantId }).toArray(),
            messagesCollection.find({ assistantId }).toArray(),
            labelsCollection.find({ assistantId }).toArray(),
            labelAssociationsCollection.find({ assistantId }).toArray()
        ]);

        chats.forEach(chat => storeData.chats.set(chat.id, chat));
        contacts.forEach(contact => storeData.contacts.set(contact.id, contact));
        messages.forEach(msg => {
            if (!storeData.messages.has(msg.chatId)) {
                storeData.messages.set(msg.chatId, []);
            }
            storeData.messages.get(msg.chatId).push(msg);
        });
        labels.forEach(label => storeData.labels.set(label.id, label));
        labelAssociations.forEach(assoc => storeData.labelAssociations.set(assoc.id, assoc));

        console.log(`Loaded ${chats.length} chats, ${contacts.length} contacts, and messages for ${messages.length} chats`);
    };

    await loadInitialData();

    const saveToMongo = async () => {
        const savePromises = [];

        for (const chat of storeData.chats.values()) {
            const doc = { ...chat, assistantId, type: 'chat' };
            const filter = { id: chat.id, assistantId, type: 'chat' };
            if (doc._id) delete doc._id;

            savePromises.push(chatsCollection.updateOne(filter, { $set: doc }, { upsert: true }));
        }

        for (const contact of storeData.contacts.values()) {
            const doc = { ...contact, assistantId, type: 'contact' };
            const filter = { id: contact.id, assistantId, type: 'contact' };
            if (doc._id) delete doc._id;

            savePromises.push(contactsCollection.updateOne(filter, { $set: doc }, { upsert: true }));
        }

        for (const [chatId, msgs] of storeData.messages.entries()) {
            for (const msg of msgs) {
                const doc = { ...msg, assistantId, chatId, type: 'message' };
                const filter = { 'key.id': msg.key.id, chatId, assistantId, type: 'message' };
                if (doc._id) delete doc._id;

                savePromises.push(messagesCollection.updateOne(filter, { $set: doc }, { upsert: true }));
            }
        }

        for (const label of storeData.labels.values()) {
            const doc = { ...label, assistantId };
            const filter = { labelId: label.labelId, assistantId };
            if (label._id) delete label._id;

            savePromises.push(labelsCollection.updateOne(filter, { $set: doc }, { upsert: true }));
        }

        for (const assoc of storeData.labelAssociations.values()) {
            const doc = { ...assoc, assistantId };
            const filter = { associationId: assoc.associationId, assistantId };
            if (assoc._id) delete assoc._id;

            savePromises.push(labelAssociationsCollection.updateOne(filter, { $set: doc }, { upsert: true }));
        }

        await Promise.all(savePromises);
    };

    setInterval(saveToMongo, 10_000);

    return {
        ...storeData,
        bind: (ev) => {
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
        }
    };
};

export default makeMongoStore;
