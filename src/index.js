const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env
dotenv.config();

const { createSession } = require('./whatsapp/session');
const { humanDelay } = require('./whatsapp/jitter');
const { initDb, searchFaq } = require('./db/faq');
const { generateResponse } = require('./ai/gemini');
const { checkAndHandoff, isTakeover } = require('./ai/handoff');
const { initConversations, logConversation } = require('./db/conversations');
const { loadConfig } = require('./utils/config');
const { isWithinHours, getOutOfHoursMessage } = require('./utils/hours');

const CLIENT_ID = 'test_client';

// Load config using the custom loadConfig utility
let config = {};
try {
    config = loadConfig(CLIENT_ID);
    config.clientId = CLIENT_ID;
    console.log(`[index] Loaded config.yaml for ${CLIENT_ID}`);
} catch (err) {
    console.error(`[index] Failed to load config:`, err.message);
    // fallback config
    config = {
        clientId: CLIENT_ID,
        business_name: 'Rumah Bali Spa',
        persona_name: 'Sari',
        persona: 'warm, professional, light Bahasa informality',
        languages: ['id', 'en', 'ru', 'zh', 'fr'],
        confidence_threshold: 0.75,
        handoff_telegram_id: '',
        working_hours: '09:00-21:00',
        timezone: 'Asia/Makassar',
        booking: {
            services: ['60min massage', '90min scrub', 'couples package'],
            deposit_required: true,
            deposit_pct: 30
        }
    };
}

// Initialize databases on startup
console.log(`[index] Initializing database and tables for ${CLIENT_ID}...`);
initDb(CLIENT_ID);
initConversations(CLIENT_ID);

// Conversation history Map: JID -> array of {role, parts}
const historyMap = new Map();

/**
 * Retrieves the history array for a JID, initializing it if empty.
 */
function getHistory(jid) {
    if (!historyMap.has(jid)) {
        historyMap.set(jid, []);
    }
    return historyMap.get(jid);
}

/**
 * Appends an exchange to the conversation history, capping it at the last 10 exchanges (20 messages).
 */
function updateHistory(jid, userText, aiText) {
    const history = getHistory(jid);
    history.push({ role: 'user', parts: [{ text: userText }] });
    history.push({ role: 'model', parts: [{ text: aiText }] });
    while (history.length > 20) {
        history.shift();
    }
}

/**
 * Extracts raw text content from Baileys message structures.
 */
function getMessageText(message) {
    if (!message || !message.message) return '';
    const msg = message.message;
    if (msg.conversation) return msg.conversation;
    if (msg.extendedTextMessage && msg.extendedTextMessage.text) return msg.extendedTextMessage.text;
    if (msg.imageMessage && msg.imageMessage.caption) return msg.imageMessage.caption;
    if (msg.videoMessage && msg.videoMessage.caption) return msg.videoMessage.caption;
    if (msg.templateButtonReplyMessage && msg.templateButtonReplyMessage.selectedId) return msg.templateButtonReplyMessage.selectedId;
    if (msg.buttonsResponseMessage && msg.buttonsResponseMessage.selectedButtonId) return msg.buttonsResponseMessage.selectedButtonId;
    return '';
}

/**
 * Callback handler for incoming WhatsApp messages.
 */
async function onMessage(message, sock) {
    const jid = message.key.remoteJid;
    const text = getMessageText(message);

    if (!text) return;

    // 1. Check isTakeover — if true, skip AI, log and return
    if (isTakeover(CLIENT_ID, jid)) {
        console.log(`[index] Takeover active for ${jid}. Skipping AI receptionist.`);
        return;
    }

    console.log(`[index] Incoming message from ${jid}: "${text}"`);

    // Check working hours
    if (!isWithinHours(config)) {
        console.log(`[index] Client ${CLIENT_ID} is out of hours. Sending closed message.`);
        const oohMessage = getOutOfHoursMessage(config);
        if (sock) {
            try {
                await sock.sendMessage(jid, { text: oohMessage });
            } catch (err) {
                console.error(`[index] Failed to send out-of-hours message:`, err.message);
            }
        }
        
        // Simple language detection heuristic for logging out-of-hours messages
        const bahasaWords = ['apa', 'mau', 'bisa', 'harga', 'terima'];
        const isBahasa = bahasaWords.some(word => text.toLowerCase().includes(word));
        const detectedLang = isBahasa ? 'id' : 'en';
        
        try {
            logConversation(
                CLIENT_ID,
                jid,
                text,
                'OUT_OF_HOURS',
                1.0,
                0,
                detectedLang
            );
        } catch (err) {
            console.error(`[index] Failed to log out of hours conversation:`, err.message);
        }
        return;
    }

    // 2. Call searchFaq for context
    const faqContext = searchFaq(CLIENT_ID, text);

    // 3. Call generateResponse
    const history = getHistory(jid);
    const aiResult = await generateResponse(config, faqContext, history, text);

    // 4. Call checkAndHandoff
    const handoffResult = await checkAndHandoff(config, text, aiResult, history, sock, jid);

    // 5. If not handoff triggered, call humanDelay then send response via sock
    if (!handoffResult.triggered) {
        if (aiResult.text) {
            try {
                await humanDelay(sock, jid, aiResult.text);
                // Update in-memory history on successful response
                updateHistory(jid, text, aiResult.text);
            } catch (err) {
                console.error(`[index] Error sending message via socket:`, err.message);
            }
        }
    }

    // 6. logConversation with all fields
    try {
        logConversation(
            CLIENT_ID,
            jid,
            text,
            aiResult.text || '',
            aiResult.confidence,
            handoffResult.triggered ? 1 : 0,
            aiResult.language || 'en'
        );
    } catch (err) {
        console.error(`[index] Failed to log conversation to database:`, err.message);
    }
}

// Initialize the session for the client
console.log(`Initializing Juru WhatsApp session for '${CLIENT_ID}'...`);
createSession(CLIENT_ID, onMessage).catch(err => {
    console.error("Fatal error starting session:", err);
});
