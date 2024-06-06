const { initializeClient, clients } = require('../services/whatsappService');
const QRCode = require('qrcode')

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
        // qrcode.generate(qr, { small: true }, (qrcodeStr) => {
        //     res.send(`${qrcodeStr}`);
        // });
        // r
        const qrCodeDataUrl = await QRCode.toDataURL(qr);
        return res.json({ qrCodeUrl: qrCodeDataUrl });
    });
};
