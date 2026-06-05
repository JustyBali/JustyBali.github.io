const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

// Initialize the platform Telegram Bot instance lazily
const botToken = process.env.TELEGRAM_BOT_TOKEN;
let bot = null;

if (botToken) {
    try {
        bot = new TelegramBot(botToken, { polling: true });
        bot.on('polling_error', (err) => {
            // Log once or suppress to avoid spamming the console
            if (process.env.NODE_ENV !== 'production') {
                console.warn('[handoff] Telegram Bot polling error:', err.message);
            }
        });
        console.log('[handoff] Telegram Bot initialized successfully with polling.');
    } catch (err) {
        console.error('[handoff] Failed to initialize Telegram Bot:', err.message);
    }
} else {
    console.warn('[handoff] TELEGRAM_BOT_TOKEN is not defined in the environment. Handoffs will log but not send Telegram alerts.');
}

// In-memory registries to map client IDs to sockets and pending AI drafts
const clientSockets = new Map();
const pendingResponses = new Map();

/**
 * Registers a client's WhatsApp socket in memory.
 * 
 * @param {string} clientId - The client ID.
 * @param {object} sock - The Baileys socket instance.
 */
function registerSocket(clientId, sock) {
    if (sock) {
        clientSockets.set(clientId, sock);
    }
}

/**
 * Checks if a customer thread is currently in human takeover mode.
 * 
 * @param {string} clientId - The client ID.
 * @param {string} jid - The customer's JID.
 * @returns {boolean} True if human takeover is active and less than 30 minutes old.
 */
function isTakeover(clientId, jid) {
    try {
        const sanitizedJid = String(jid).replace(/[^a-zA-Z0-9]/g, '_');
        const takeoverFile = path.join(process.cwd(), 'clients', clientId, `takeover_${sanitizedJid}`);
        if (!fs.existsSync(takeoverFile)) {
            return false;
        }
        const stat = fs.statSync(takeoverFile);
        const ageMs = Date.now() - stat.mtimeMs;
        const thirtyMinutesMs = 30 * 60 * 1000;
        return ageMs < thirtyMinutesMs;
    } catch (err) {
        console.error(`[handoff] Error checking takeover status for ${clientId}:`, err.message);
        return false;
    }
}

/**
 * Evaluates handoff conditions, sends a Telegram alert if triggered, and registers a human handover request.
 * 
 * @param {object} config - Business configuration parameters.
 * @param {string} incomingMsg - The incoming customer message.
 * @param {object} aiResult - The generated response result from Gemini ({text, confidence, shouldEscalate}).
 * @param {Array} history - Conversational history array.
 * @param {object} sock - Baileys socket instance.
 * @param {string} jid - Customer's WhatsApp JID.
 * @returns {Promise<object>} Status object indicating if handoff was triggered.
 */
async function checkAndHandoff(config, incomingMsg, aiResult, history = [], sock = null, jid = '') {
    const triggerConditions = [];
    if (aiResult.shouldEscalate === true) {
        triggerConditions.push('escalation keyword');
    }
    if (aiResult.confidence < config.confidence_threshold) {
        triggerConditions.push('low confidence');
    }

    if (triggerConditions.length === 0) {
        return { triggered: false };
    }

    const triggerReason = triggerConditions.join(' / ');
    const clientId = config.clientId || process.env.CLIENT_ID || 'default';
    const sanitizedJid = String(jid).replace(/[^a-zA-Z0-9]/g, '_');

    console.log(`[handoff] Handoff triggered for ${clientId} (customer: ${jid}). Reason: ${triggerReason}`);

    // Register socket and pending response draft
    registerSocket(clientId, sock);
    pendingResponses.set(`${clientId}_${jid}`, aiResult.text || '');

    // Set human flag
    const takeoverFile = path.join(process.cwd(), 'clients', clientId, `takeover_${sanitizedJid}`);
    try {
        const dir = path.dirname(takeoverFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(takeoverFile, 'human');
    } catch (err) {
        console.error(`[handoff] Error writing takeover file for ${clientId}:`, err.message);
    }

    // Format last 3 messages
    const last3 = history.slice(-3).map(h => {
        const role = h.role === 'user' ? 'Customer' : 'AI';
        const text = h.parts && h.parts[0] ? h.parts[0].text : '';
        return `${role}: ${text}`;
    }).join('\n');

    // Send Telegram alert
    const messageText = `🚨 [${clientId}] Handoff Required
Customer: ${jid}
Confidence: ${aiResult.confidence}
Trigger: ${triggerReason}

Last 3 messages:
${last3 || 'No recent messages.'}

AI Draft:
${aiResult.text || ''}`;

    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Send AI Response', callback_data: `send_ai_${clientId}_${jid}` },
                    { text: '👤 Take Over', callback_data: `takeover_${clientId}_${jid}` },
                    { text: '❌ Ignore', callback_data: `ignore_${clientId}_${jid}` }
                ]
            ]
        }
    };

    const telegramChatId = process.env.TELEGRAM_CHAT_ID || config.handoff_telegram_id;
    console.log(`[handoff] Attempting to send Telegram notification to ${telegramChatId || 'no-id'}...`);
    if (bot && telegramChatId) {
        try {
            await bot.sendMessage(telegramChatId, messageText, options);
            console.log(`[handoff] Telegram notification successfully sent to ${telegramChatId}`);
        } catch (err) {
            console.error(`[handoff] Telegram API call failed:`, err.message);
        }
    } else {
        console.warn(`[handoff] Skipping Telegram message send (bot or telegramChatId missing).`);
    }

    // Reply to customer via WhatsApp
    if (sock) {
        try {
            await sock.sendMessage(jid, { text: 'One moment — let me connect you with our team. 🙏' });
        } catch (err) {
            console.error(`[handoff] WhatsApp customer notification failed:`, err.message);
        }
    }

    return { triggered: true, reason: triggerReason };
}

// Set up bot callback query handler
if (bot) {
    bot.on('callback_query', async (callbackQuery) => {
        const data = callbackQuery.data;
        if (!data) return;

        let action = '';
        let clientId = '';
        let jid = '';

        if (data.startsWith('send_ai_')) {
            action = 'send_ai';
            const parts = data.replace('send_ai_', '').split('_');
            clientId = parts[0];
            jid = parts.slice(1).join('_');
        } else if (data.startsWith('takeover_')) {
            action = 'takeover';
            const parts = data.replace('takeover_', '').split('_');
            clientId = parts[0];
            jid = parts.slice(1).join('_');
        } else if (data.startsWith('ignore_')) {
            action = 'ignore';
            const parts = data.replace('ignore_', '').split('_');
            clientId = parts[0];
            jid = parts.slice(1).join('_');
        }

        if (!action) return;

        const sanitizedJid = String(jid).replace(/[^a-zA-Z0-9]/g, '_');
        const takeoverFile = path.join(process.cwd(), 'clients', clientId, `takeover_${sanitizedJid}`);
        const responseKey = `${clientId}_${jid}`;

        try {
            if (action === 'send_ai') {
                const pendingText = pendingResponses.get(responseKey);
                const sock = clientSockets.get(clientId);

                if (sock && pendingText) {
                    await sock.sendMessage(jid, { text: pendingText });
                    console.log(`[handoff] AI response sent to ${jid} for client ${clientId}`);
                } else {
                    console.warn(`[handoff] Cannot send AI response: WhatsApp socket or pending response text not found for client ${clientId}`);
                }

                // Clear flag
                if (fs.existsSync(takeoverFile)) {
                    fs.unlinkSync(takeoverFile);
                }
                pendingResponses.delete(responseKey);

                await bot.answerCallbackQuery(callbackQuery.id, { text: 'AI Response Sent!' });
                await bot.editMessageText(`✅ Sent AI response to ${jid}`, {
                    chat_id: callbackQuery.message.chat.id,
                    message_id: callbackQuery.message.message_id
                });

            } else if (action === 'takeover') {
                console.log(`[handoff] takeover active for 30min for client ${clientId}`);
                
                // Write active timestamp
                const dir = path.dirname(takeoverFile);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(takeoverFile, String(Date.now()));

                await bot.answerCallbackQuery(callbackQuery.id, { text: 'Takeover active for 30m' });
                await bot.editMessageText(`👤 Team took over chat with ${jid}`, {
                    chat_id: callbackQuery.message.chat.id,
                    message_id: callbackQuery.message.message_id
                });

            } else if (action === 'ignore') {
                console.log(`[handoff] false positive logged for client ${clientId}`);

                // Clear flag
                if (fs.existsSync(takeoverFile)) {
                    fs.unlinkSync(takeoverFile);
                }
                pendingResponses.delete(responseKey);

                await bot.answerCallbackQuery(callbackQuery.id, { text: 'Request ignored' });
                await bot.editMessageText(`❌ Ignored handoff request for ${jid}`, {
                    chat_id: callbackQuery.message.chat.id,
                    message_id: callbackQuery.message.message_id
                });
            }
        } catch (err) {
            console.error(`[handoff] Callback query handling exception:`, err.message);
            try {
                await bot.answerCallbackQuery(callbackQuery.id, { text: 'Action failed' });
            } catch (_) {}
        }
    });
}

module.exports = {
    checkAndHandoff,
    isTakeover,
    registerSocket
};
