const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

/**
 * Creates and initializes a WhatsApp session for a client.
 * 
 * @param {string} clientId - The ID of the tenant client.
 * @param {Function} onMessage - Callback triggered when an incoming message is received.
 * @returns {Promise<object>} The WhatsApp socket connection instance.
 */
async function createSession(clientId, onMessage) {
    const sessionDir = path.join(process.cwd(), 'clients', clientId, 'session');

    // Ensure session directory exists
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }
    
    // Initialize authentication state stored in client-specific folder
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    
    // Set up silent logger to keep console logs clean for the QR code and custom logs
    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
        auth: state,
        browser: ['Chrome', 'Desktop', '120.0.0'],
        printQRInTerminal: true,
        logger: logger
    });

    // Attach clientId to the socket instance for easy identification in callbacks
    sock.clientId = clientId;

    // Save credentials whenever they are updated
    sock.ev.on('creds.update', saveCreds);

    // Monitor connection updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Print QR code in terminal when received
        if (qr) {
            console.log(`[${clientId}] New QR Code received, please scan:`);
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log(`[${clientId}] Connect: Connection is open and ready.`);
        } else if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`[${clientId}] Disconnect: Connection closed. Status code: ${statusCode}`);

            if (statusCode === DisconnectReason.loggedOut) {
                // Permanent — do not reconnect
                console.log(`[${clientId}] Logged out. Not reconnecting.`);

            } else if (statusCode === 515) {
                // 515 = WhatsApp signals "restart with saved credentials" (fires after QR scan)
                // Do NOT clear session files — credentials were just saved and must be preserved
                console.log(`[${clientId}] Status 515 — restarting with saved credentials...`);
                setTimeout(() => createSession(clientId, onMessage), 3000);

            } else if (statusCode === DisconnectReason.connectionClosed) {
                // Normal closure — reconnect after delay
                console.log(`[${clientId}] connectionClosed. Reconnecting in 3s...`);
                setTimeout(() => createSession(clientId, onMessage), 3000);

            } else {
                // All other disconnect reasons — reconnect after delay
                console.log(`[${clientId}] Disconnected with code ${statusCode}. Reconnecting in 3s...`);
                setTimeout(() => createSession(clientId, onMessage), 3000);
            }
        }
    });

    // Handle incoming messages
    sock.ev.on('messages.upsert', async (m) => {
        if (m.type === 'notify') {
            for (const msg of m.messages) {
                const jid = msg.key.remoteJid;
                
                // Ignore group messages (jid must not contain @g.us)
                if (jid && !jid.includes('@g.us')) {
                    // Only process incoming messages (ignore messages sent by the bot/client itself)
                    if (!msg.key.fromMe) {
                        try {
                            await onMessage(msg, sock);
                        } catch (err) {
                            console.error(`[${clientId}] Error processing message callback:`, err);
                        }
                    }
                }
            }
        }
    });

    return sock;
}

module.exports = {
    createSession
};
