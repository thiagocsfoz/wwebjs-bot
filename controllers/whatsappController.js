const { initializeClient, clients } = require('../services/whatsappService');
const qrcode = require('qrcode-terminal');

exports.generateQr = async (req, res) => {
    console.log('generateQr');
    const { assistantId } = req.body;

    if (!clients[assistantId]) {
        const store = req.app.locals.store;
        initializeClient(assistantId, store);
    }

    const client = clients[assistantId];

    client.once('qr', (qr) => {
        console.log(`QR code for ${assistantId}`);
        qrcode.generate(qr, { small: true }, (qrcodeStr) => {
            res.send(`${qrcodeStr}`);
        });
    });
};
