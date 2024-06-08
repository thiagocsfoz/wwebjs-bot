const { initializeClient, clients } = require('../services/whatsappService');
const QRCode = require('qrcode');
const {MongoClient, ObjectId} = require("mongodb");

exports.generateQr = async (req, res) => {
    console.log('request qrcode');
    const { assistantId } = req.body;

    const store = req.app.locals.store;
    console.log('assistantId: ', assistantId);
    const client = clients[assistantId];
    console.log('client found: ', client);
    client.destroy()
    console.log('client destrod');
    delete clients[assistantId];
    console.log('client deleted successfully');

    const mongoClient = new MongoClient(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

    try {
        await mongoClient.connect();
        const db = mongoClient.db();
        const assistantsCollection = db.collection('assistants');
        const assistant = await assistantsCollection.find({_id: ObjectId(assistantId)}).toArray();

        initializeClient(assistant, store);
        console.log('client initialized successfully');

        const newClient = clients[assistantId];
        const qrListener = async (qr) => {
            console.log(`QR code for ${assistantId}`);
            const qrCodeDataUrl = await QRCode.toDataURL(qr);
            res.json({ qrCodeUrl: qrCodeDataUrl });
            // Remova o listener após usar o evento qr uma vez
            newClient.removeListener('qr', qrListener);
        };

        newClient.on('qr', qrListener);
    } catch (error) {
        console.error('Error initializing clients:', error);
    } finally {
        await client.close();
    }
};

exports.checkConnection = (req, res) => {
    console.log('checkConnection');
    const { assistantId } = req.body;
    console.log(assistantId.$oid)
    const client = clients[assistantId.$oid];

    if (client) {
        if (client.info && client.info.wid) {
            console.log(`Client is connected with number: ${client.info.wid.user}`);
            return res.json({ connected: true, phoneNumber: client.info.wid.user });
        } else {
            console.log(`Client is not connected for assistantId: ${assistantId.$oid}`);
            return res.json({ connected: false, phoneNumber: null });
        }
    } else {
        console.log(`No client found for assistantId: ${assistantId.$oid}`);
        return res.json({ connected: false, phoneNumber: null });
    }
};

exports.disconnectPhone = async (req, res) => {
    console.log('disconnectPhone');
    const { assistantId } = req.body;
    console.log("assistantId", assistantId);
    const client = clients[assistantId];
    console.log("client", client);
    if (client) {
        try {
            await client.logout();
            delete clients[assistantId];
            console.log(`Client disconnected and removed for assistantId: ${assistantId}`);
            return res.json({ success: true, message: 'Client disconnected successfully' });
        } catch (error) {
            console.error(`Error disconnecting client for assistantId: ${assistantId}`, error);
            return res.status(500).json({ success: false, message: 'Error disconnecting client', error });
        }
    } else {
        console.log(`No client found for assistantId: ${assistantId}`);
        return res.json({ success: false, message: 'No client found' });
    }
};
