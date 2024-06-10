const express = require('express');
const { generateQr, checkConnection, disconnectPhone } = require('../controllers/whatsappController');
const {healthCheck} = require("../controllers/healthCheckController");

const router = express.Router();

router.post('/generate_qr', generateQr);
router.post('/check_connection', checkConnection);
router.post('/disconnect_phone', disconnectPhone);
router.get('/healthcheck', healthCheck);

module.exports = router;
