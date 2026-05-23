const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * Initializes and retrieves the database connection for a specific client, ensuring the conversations table exists.
 * 
 * @param {string} clientId - The client ID.
 * @returns {Database} The SQLite database connection.
 */
function getDb(clientId) {
    const dbDir = path.join(process.cwd(), 'clients', clientId);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'juru.db');
    const db = new Database(dbPath);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT NOT NULL,
        customer_jid TEXT NOT NULL,
        customer_message TEXT,
        ai_response TEXT,
        confidence REAL,
        escalated INTEGER DEFAULT 0,
        language TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    return db;
}

/**
 * Ensures that the conversations table exists in the client's database.
 * 
 * @param {string} clientId - The client ID.
 */
function initConversations(clientId) {
    getDb(clientId);
}

/**
 * Logs a conversation record into the SQLite database.
 * 
 * @param {string} clientId - The client ID.
 * @param {string} customerJid - Customer's WhatsApp JID.
 * @param {string} customerMessage - Customer's incoming message text.
 * @param {string} aiResponse - AI's response text.
 * @param {number} confidence - The AI's response confidence score.
 * @param {number|boolean} escalated - Escalation status indicator.
 * @param {string} language - Detected language.
 * @returns {object} The logged conversation object.
 */
function logConversation(clientId, customerJid, customerMessage, aiResponse, confidence, escalated, language) {
    try {
        const db = getDb(clientId);
        const stmt = db.prepare(`
          INSERT INTO conversations (
            client_id, customer_jid, customer_message, ai_response, confidence, escalated, language
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const isEscalated = (escalated === true || escalated === 1) ? 1 : 0;
        const confValue = confidence !== undefined && confidence !== null ? Number(confidence) : 0.85;

        const result = stmt.run(
            clientId,
            customerJid,
            customerMessage || null,
            aiResponse || null,
            confValue,
            isEscalated,
            language || null
        );

        return {
            id: result.lastInsertRowid,
            client_id: clientId,
            customer_jid: customerJid,
            customer_message: customerMessage,
            ai_response: aiResponse,
            confidence: confValue,
            escalated: isEscalated === 1,
            language
        };
    } catch (err) {
        console.error(`[db/conversations] Error logging conversation for ${clientId}:`, err.message);
        throw err;
    }
}

/**
 * Retrieves the last N conversations for a client, sorted by creation timestamp descending.
 * 
 * @param {string} clientId - The client ID.
 * @param {number} limit - The maximum number of conversations to return.
 * @returns {Array} List of conversations.
 */
function getConversations(clientId, limit = 50) {
    try {
        const db = getDb(clientId);
        const stmt = db.prepare(`
          SELECT * FROM conversations 
          WHERE client_id = ? 
          ORDER BY created_at DESC 
          LIMIT ?
        `);
        return stmt.all(clientId, limit);
    } catch (err) {
        console.error(`[db/conversations] Error fetching conversations for ${clientId}:`, err.message);
        return [];
    }
}

/**
 * Calculates current statistics for a client's message activity and escalation rates.
 * 
 * @param {string} clientId - The client ID.
 * @returns {object} The calculated statistics object.
 */
function getStats(clientId) {
    try {
        const db = getDb(clientId);
        
        // Count today's messages
        const todayCount = db.prepare(`
          SELECT COUNT(*) as count FROM conversations 
          WHERE client_id = ? AND date(created_at) = date('now')
        `).get(clientId).count;

        // Calculate escalation percentage
        const totalCount = db.prepare(`
          SELECT COUNT(*) as count FROM conversations 
          WHERE client_id = ?
        `).get(clientId).count;

        const escalatedCount = db.prepare(`
          SELECT COUNT(*) as count FROM conversations 
          WHERE client_id = ? AND escalated = 1
        `).get(clientId).count;

        const escalation_rate = totalCount > 0 ? (escalatedCount / totalCount) : 0;

        // Fetch top FAQs questions
        db.exec(`
          CREATE TABLE IF NOT EXISTS faqs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question TEXT UNIQUE,
            answer TEXT
          )
        `);
        
        const faqs = db.prepare(`
          SELECT question FROM faqs LIMIT 5
        `).all();
        
        const top_faqs = faqs.map(f => f.question);

        return {
            today_volume: todayCount,
            escalation_rate,
            top_faqs
        };
    } catch (err) {
        console.error(`[db/conversations] Error getting stats for ${clientId}:`, err.message);
        return {
            today_volume: 0,
            escalation_rate: 0,
            top_faqs: []
        };
    }
}

module.exports = {
    initConversations,
    logConversation,
    getConversations,
    getStats
};
