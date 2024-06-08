const express = require('express');
const { generateQr, checkConnection, disconnectPhone } = require('../controllers/whatsappController');

const router = express.Router();

router.post('/generate_qr', generateQr);
router.post('/check_connection', checkConnection);
router.post('/disconnect_phone', disconnectPhone);

module.exports = router;
