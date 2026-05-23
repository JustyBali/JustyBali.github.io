const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const path = require('path');
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
            
            // Auto-reconnect on DisconnectReason.connectionClosed only
            if (statusCode === DisconnectReason.connectionClosed) {
                console.log(`[${clientId}] Auto-reconnecting on DisconnectReason.connectionClosed...`);
                createSession(clientId, onMessage);
            } else if (statusCode === DisconnectReason.loggedOut) {
                console.log(`[${clientId}] Logged out. Stopping. Will not reconnect.`);
            } else {
                console.log(`[${clientId}] Disconnected with code ${statusCode}. Not reconnecting per requirements.`);
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
