const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Cache database connections per client ID
const dbConnections = new Map();

/**
 * Retrieves or creates a SQLite database connection for a client.
 * 
 * @param {string} clientId - The client ID.
 * @returns {Database} The SQLite database connection.
 */
function getDb(clientId) {
    if (dbConnections.has(clientId)) {
        return dbConnections.get(clientId);
    }

    const dbDir = path.join(process.cwd(), 'clients', clientId);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = path.join(dbDir, 'juru.db');
    const db = new Database(dbPath);

    // Optimize performance settings for SQLite
    db.pragma('journal_mode = WAL');

    // Schema setup
    db.exec(`
        CREATE TABLE IF NOT EXISTS faqs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    dbConnections.set(clientId, db);
    return db;
}

/**
 * Explicitly initializes the database for a client.
 * 
 * @param {string} clientId - The client ID.
 * @returns {Database} The SQLite database connection.
 */
function initDb(clientId) {
    return getDb(clientId);
}

/**
 * Adds a new FAQ entry for a client.
 * 
 * @param {string} clientId - The client ID.
 * @param {string} question - The FAQ question.
 * @param {string} answer - The FAQ answer.
 * @returns {number|string} The ID of the inserted FAQ row.
 */
function addFaq(clientId, question, answer) {
    const db = getDb(clientId);
    const stmt = db.prepare('INSERT INTO faqs (client_id, question, answer) VALUES (?, ?, ?)');
    const info = stmt.run(clientId, question, answer);
    return info.lastInsertRowid;
}

/**
 * Updates an existing FAQ entry.
 * 
 * @param {string} clientId - The client ID.
 * @param {number} id - The FAQ ID.
 * @param {string} question - The updated question.
 * @param {string} answer - The updated answer.
 * @returns {boolean} True if the update succeeded, false otherwise.
 */
function updateFaq(clientId, id, question, answer) {
    const db = getDb(clientId);
    const stmt = db.prepare('UPDATE faqs SET question = ?, answer = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND client_id = ?');
    const info = stmt.run(question, answer, id, clientId);
    return info.changes > 0;
}

/**
 * Deletes an existing FAQ entry.
 * 
 * @param {string} clientId - The client ID.
 * @param {number} id - The FAQ ID.
 * @returns {boolean} True if deletion succeeded, false otherwise.
 */
function deleteFaq(clientId, id) {
    const db = getDb(clientId);
    const stmt = db.prepare('DELETE FROM faqs WHERE id = ? AND client_id = ?');
    const info = stmt.run(id, clientId);
    return info.changes > 0;
}

/**
 * Retrieves all FAQs for a client.
 * 
 * @param {string} clientId - The client ID.
 * @returns {Array} List of FAQ objects.
 */
function getFaqs(clientId) {
    const db = getDb(clientId);
    const stmt = db.prepare('SELECT * FROM faqs WHERE client_id = ? ORDER BY created_at DESC');
    return stmt.all(clientId);
}

/**
 * Searches FAQs for a client using a simple LIKE query on the question.
 * Returns the top 5 matches formatted as a string block.
 * 
 * @param {string} clientId - The client ID.
 * @param {string} query - The search term.
 * @returns {string} The formatted FAQ matches.
 */
function searchFaq(clientId, query) {
    const db = getDb(clientId);

    // Split query into individual words (min 3 chars) so inflected words like
    // "harganya" still match FAQ entries containing "harga".
    const words = query
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length >= 3);

    if (words.length === 0) {
        return '';
    }

    const stmt = db.prepare(
        'SELECT id, question, answer FROM faqs WHERE client_id = ? AND (question LIKE ? OR answer LIKE ?) LIMIT 5'
    );

    // Collect unique rows across all word searches, keyed by id
    const seen = new Map();
    for (const word of words) {
        const pattern = `%${word}%`;
        const rows = stmt.all(clientId, pattern, pattern);
        for (const row of rows) {
            if (!seen.has(row.id)) {
                seen.set(row.id, row);
            }
        }
        if (seen.size >= 5) break;
    }

    let result = '';
    for (const row of seen.values()) {
        result += `Q: ${row.question}\nA: ${row.answer}\n`;
    }
    return result;
}

module.exports = {
    initDb,
    addFaq,
    updateFaq,
    deleteFaq,
    getFaqs,
    searchFaq
};
