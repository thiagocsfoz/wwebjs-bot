const express = require('express');
const { generateQr } = require('../controllers/whatsappController');

const router = express.Router();

router.post('/generate_qr', generateQr);

module.exports = router;
