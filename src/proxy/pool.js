const fs = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');

/**
 * Reads the active session ID for a client, defaulting to the clientId itself if not rotated.
 * 
 * @param {string} clientId - The client ID.
 * @returns {string} The active proxy session ID.
 */
function getActiveSessionId(clientId) {
    const sessionFile = path.join(process.cwd(), 'clients', clientId, 'proxy_session');
    try {
        if (fs.existsSync(sessionFile)) {
            return fs.readFileSync(sessionFile, 'utf8').trim();
        }
    } catch (err) {
        console.error(`[proxy] Error reading proxy session file for ${clientId}:`, err.message);
    }
    return clientId;
}

/**
 * Returns an HttpsProxyAgent configured with residential proxy credentials and a unique session ID.
 * 
 * @param {string} clientId - The client ID.
 * @returns {HttpsProxyAgent} The configured agent instance.
 */
function getProxyAgent(clientId) {
    try {
        const username = process.env.PROXY_USERNAME || '';
        const password = process.env.PROXY_PASSWORD || '';
        const sessionId = getActiveSessionId(clientId);
        
        // Construct the proxy URL using the session-based username format
        const proxyUrl = `http://${username}-session-${sessionId}:${password}@brd.superproxy.io:22225`;
        
        return new HttpsProxyAgent(proxyUrl);
    } catch (err) {
        console.error(`[proxy] Error generating HttpsProxyAgent for ${clientId}:`, err.message);
        throw err;
    }
}

/**
 * Marks a client's proxy session as banned by writing a proxy_banned state file.
 * 
 * @param {string} clientId - The client ID.
 */
function markProxyBanned(clientId) {
    try {
        console.log(`[proxy] ${clientId} marked banned, rotation required`);
        const bannedFile = path.join(process.cwd(), 'clients', clientId, 'proxy_banned');
        
        // Ensure parent directory exists
        const dir = path.dirname(bannedFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(bannedFile, 'true');
    } catch (err) {
        console.error(`[proxy] Error marking proxy banned for ${clientId}:`, err.message);
    }
}

/**
 * Rotates a client's proxy session by deleting the banned flag and generating a new session identifier.
 * 
 * @param {string} clientId - The client ID.
 * @returns {string} The new session ID string.
 */
function rotateProxy(clientId) {
    try {
        const bannedFile = path.join(process.cwd(), 'clients', clientId, 'proxy_banned');
        if (fs.existsSync(bannedFile)) {
            fs.unlinkSync(bannedFile);
        }
        
        const newSession = `${clientId}-${Date.now()}`;
        const sessionFile = path.join(process.cwd(), 'clients', clientId, 'proxy_session');
        
        // Ensure parent directory exists
        const dir = path.dirname(sessionFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(sessionFile, newSession);
        console.log(`[proxy] ${clientId} rotated to new session`);
        
        return newSession;
    } catch (err) {
        console.error(`[proxy] Error rotating proxy for ${clientId}:`, err.message);
        throw err;
    }
}

module.exports = {
    getProxyAgent,
    markProxyBanned,
    rotateProxy
};
