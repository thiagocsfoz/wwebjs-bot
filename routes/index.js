import express from 'express';
import { generateQr, checkConnection, disconnectPhone } from '../controllers/whatsappController.js';
import {healthCheck} from "../controllers/healthCheckController.js";

const router = express.Router();

router.post('/generate_qr', generateQr);
router.post('/check_connection', checkConnection);
router.post('/disconnect_phone', disconnectPhone);
router.get('/healthcheck', healthCheck);

export default router;
