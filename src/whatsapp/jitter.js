const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Splits text into 2 or 3 parts if it exceeds 200 characters.
 * Attempts to split on sentence boundaries, falling back to word counts.
 * 
 * @param {string} text - The response text to chunk.
 * @returns {string[]} An array of text chunks.
 */
function chunkText(text) {
    if (!text) return [];
    text = String(text).trim();
    if (text.length <= 200) {
        return [text];
    }
    
    // Choose to chunk into 2 or 3 parts. 
    // If it's very long (> 400 chars), split into 3 parts. Otherwise 2.
    const numChunks = text.length > 400 ? 3 : 2;
    
    // Match sentences ending with punctuation and followed by whitespace or end-of-string
    const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [text];
    
    if (sentences.length <= 1) {
        // Fallback: split by words to distribute evenly
        return splitByWords(text, numChunks);
    }
    
    const chunks = [];
    const totalLen = text.length;
    const targetLen = totalLen / numChunks;
    
    let currentChunk = '';
    for (const sentence of sentences) {
        // If currentChunk is not empty and adding this sentence exceeds targetLen,
        // and we haven't reached the last chunk limit (numChunks - 1)
        if (currentChunk && (currentChunk.length + sentence.length > targetLen) && chunks.length < numChunks - 1) {
            chunks.push(currentChunk.trim());
            currentChunk = sentence;
        } else {
            currentChunk += sentence;
        }
    }
    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }
    
    return chunks.filter(c => c.length > 0);
}

/**
 * Splits text by word count into a specified number of chunks.
 * 
 * @param {string} text - The input text.
 * @param {number} numChunks - Target number of chunks.
 * @returns {string[]}
 */
function splitByWords(text, numChunks) {
    const words = text.split(/\s+/);
    const targetWords = Math.ceil(words.length / numChunks);
    const chunks = [];
    for (let i = 0; i < numChunks; i++) {
        const start = i * targetWords;
        const end = Math.min(start + targetWords, words.length);
        if (start < words.length) {
            chunks.push(words.slice(start, end).join(' '));
        }
    }
    return chunks.filter(c => c.length > 0);
}

/**
 * Simulates human typing behavior by adding realistic delays and presence updates.
 * 
 * @param {object} sock - The Baileys WhatsApp socket instance.
 * @param {string} jid - Remote user JID.
 * @param {string} responseText - Text response to send.
 * @returns {Promise<string[]>} List of chunks sent.
 */
async function humanDelay(sock, jid, responseText) {
    if (!responseText) return [];
    
    // 1. Read delay: 800-2000ms before doing anything
    const readDelay = Math.floor(Math.random() * (2000 - 800 + 1)) + 800;
    console.log(`[Jitter] Simulating read delay of ${readDelay}ms before typing.`);
    await sleep(readDelay);
    
    // 2. Chunk the response text
    const chunks = chunkText(responseText);
    
    // 3. Send each chunk with realistic typing simulation and gap
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        // Show composing/typing presence
        await sock.sendPresenceUpdate('composing', jid);
        
        // Calculate typing duration (4.5 chars/sec)
        const baseDurationMs = (chunk.length / 4.5) * 1000;
        
        // Add 30% random variance (-30% to +30%)
        const variance = (Math.random() * 0.6) - 0.3;
        let typingDuration = baseDurationMs * (1 + variance);
        
        // Cap typing duration at 8000ms and ensure non-negative
        typingDuration = Math.min(typingDuration, 8000);
        typingDuration = Math.max(typingDuration, 0);
        
        console.log(`[Jitter] Sending chunk ${i + 1}/${chunks.length} ("${chunk.slice(0, 30)}...")`);
        console.log(`[Jitter] Typing duration: ${typingDuration.toFixed(0)}ms (base: ${baseDurationMs.toFixed(0)}ms, variance: ${(variance * 100).toFixed(1)}%)`);
        
        await sleep(typingDuration);
        
        // Send message chunk
        await sock.sendMessage(jid, { text: chunk });
        
        // If there are more chunks, wait 1000-2000ms gap before typing next
        if (i < chunks.length - 1) {
            const gap = Math.floor(Math.random() * (2000 - 1000 + 1)) + 1000;
            console.log(`[Jitter] Simulating gap between chunks of ${gap}ms.`);
            await sleep(gap);
        }
    }
    
    return chunks;
}

module.exports = {
    humanDelay
};
