import express from 'express';
import {
    generateQr,
    checkConnection,
    disconnectPhone,
    getAllChats,
    markAllMessagesAsRead,
    getAllMessagesByChatId,
    sendMessageEndpoint,
    disableAssistant
} from '../controllers/whatsappController.js';
import {healthCheck} from "../controllers/healthCheckController.js";

const router = express.Router();

router.post('/generate_qr', generateQr);
router.post('/check_connection', checkConnection);
router.post('/disconnect_phone', disconnectPhone);
router.get('/healthcheck', healthCheck);
router.post('/get-all-chats', getAllChats);
router.post('/get-all-messages', getAllMessagesByChatId);
router.post('/mark-messages-as-read', markAllMessagesAsRead);
router.post('/send-message', sendMessageEndpoint);
router.post('/disable-assistant', disableAssistant);

export default router;
