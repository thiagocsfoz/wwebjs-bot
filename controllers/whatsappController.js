const { initializeClient, clients } = require('../services/whatsappService');
const QRCode = require('qrcode');

exports.generateQr = async (req, res) => {
    console.log('generateQr');
    const { assistantId } = req.body;

    if (!clients[assistantId]) {
        const store = req.app.locals.store;
        initializeClient({_id: assistantId}, store);
    }

    const client = clients[assistantId];

    client.once('qr', async (qr) => {
        console.log(`QR code for ${assistantId}`);
        const qrCodeDataUrl = await QRCode.toDataURL(qr);
        return res.json({ qrCodeUrl: qrCodeDataUrl });
    });
};

exports.checkConnection = (req, res) => {
    console.log('checkConnection');
    const { assistantId } = req.body;

    const client = clients[assistantId];

    if (client) {
        if (client.info && client.info.wid) {
            console.log(`Client is connected with number: ${client.info.wid.user}`);
            return res.json({ connected: true, phoneNumber: client.info.wid.user });
        } else {
            console.log(`Client is not connected for assistantId: ${assistantId}`);
            return res.json({ connected: false, phoneNumber: null });
        }
    } else {
        console.log(`No client found for assistantId: ${assistantId}`);
        return res.json({ connected: false, phoneNumber: null });
    }
};

exports.disconnectPhone = async (req, res) => {
    console.log('disconnectPhone');
    const { assistantId } = req.body;

    const client = clients[assistantId];

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
