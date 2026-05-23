const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * Initializes and retrieves the database connection for a specific client, ensuring the bookings table exists.
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
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT NOT NULL,
        customer_name TEXT,
        customer_phone TEXT,
        service TEXT,
        booking_date TEXT,
        booking_time TEXT,
        party_size INTEGER DEFAULT 1,
        deposit_required INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    return db;
}

/**
 * Writes a booking event to SQLite.
 * 
 * @param {string} clientId - The client ID.
 * @param {object} config - Business configuration context.
 * @param {object} bookingData - Extracted booking details ({service, date, time, party_size, deposit_required}).
 * @param {string} customerName - Customer's name.
 * @param {string} customerPhone - Customer's WhatsApp phone number.
 * @returns {Promise<object>} The created booking record.
 */
async function createEvent(clientId, config, bookingData, customerName, customerPhone) {
    try {
        const db = getDb(clientId);
        const stmt = db.prepare(`
          INSERT INTO bookings (
            client_id, customer_name, customer_phone, service, booking_date, booking_time, party_size, deposit_required, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const depositRequiredVal = bookingData.deposit_required ? 1 : 0;
        const partySize = bookingData.party_size !== undefined && bookingData.party_size !== null 
            ? Number(bookingData.party_size) 
            : 1;

        const result = stmt.run(
            clientId,
            customerName || null,
            customerPhone || null,
            bookingData.service || null,
            bookingData.date || null,
            bookingData.time || null,
            partySize,
            depositRequiredVal,
            'pending'
        );

        return {
            id: result.lastInsertRowid,
            client_id: clientId,
            customer_name: customerName || null,
            customer_phone: customerPhone || null,
            service: bookingData.service || null,
            booking_date: bookingData.date || null,
            booking_time: bookingData.time || null,
            party_size: partySize,
            deposit_required: bookingData.deposit_required === true,
            status: 'pending'
        };
    } catch (err) {
        console.error(`[booking/calendar] Error creating event for ${clientId}:`, err.message);
        throw err;
    }
}

/**
 * Checks if a slot is available, and returns +1hr and +2hr alternatives on conflict.
 * 
 * @param {string} clientId - The client ID.
 * @param {string} date - ISO Date (YYYY-MM-DD).
 * @param {string} time - Time string (HH:MM).
 * @returns {Promise<object>} Availability result.
 */
async function getAvailability(clientId, date, time) {
    try {
        const db = getDb(clientId);
        const stmt = db.prepare(`
          SELECT * FROM bookings 
          WHERE client_id = ? AND booking_date = ? AND booking_time = ? AND status != 'cancelled'
        `);
        
        const row = stmt.get(clientId, date, time);
        
        if (row) {
            // Conflict found: compute same-day alternatives (+1hr and +2hr slots)
            const [hoursStr, minutesStr] = time.split(':');
            const hours = parseInt(hoursStr, 10);
            const minutes = parseInt(minutesStr, 10);
            
            const pad = (n) => String(n).padStart(2, '0');
            const alt1 = `${pad((hours + 1) % 24)}:${pad(minutes)}`;
            const alt2 = `${pad((hours + 2) % 24)}:${pad(minutes)}`;
            
            return {
                available: false,
                alternatives: [alt1, alt2]
            };
        }
        
        return { available: true };
    } catch (err) {
        console.error(`[booking/calendar] Error checking availability for ${clientId}:`, err.message);
        throw err;
    }
}

/**
 * Confirms a booking event by status update.
 * 
 * @param {string} clientId - The client ID.
 * @param {number} bookingId - The database booking ID.
 * @returns {Promise<boolean>} True if successfully updated.
 */
async function confirmBooking(clientId, bookingId) {
    try {
        const db = getDb(clientId);
        const stmt = db.prepare(`
          UPDATE bookings SET status = 'confirmed' 
          WHERE client_id = ? AND id = ?
        `);
        
        const result = stmt.run(clientId, bookingId);
        return result.changes > 0;
    } catch (err) {
        console.error(`[booking/calendar] Error confirming booking ${bookingId}:`, err.message);
        throw err;
    }
}

module.exports = {
    createEvent,
    getAvailability,
    confirmBooking
};
