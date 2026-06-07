/**
 * Detects the language of a text message from id, en, ru, zh, fr.
 * 
 * @param {string} text - The input text.
 * @returns {string} Language code string ('id', 'en', 'ru', 'zh', 'fr').
 */
function detectLanguage(text) {
    if (!text) return 'en';
    
    // 1. Chinese (CJK Unified Ideographs block: \u4e00-\u9fff)
    if (/[\u4e00-\u9fff]/.test(text)) {
        return 'zh';
    }
    
    // 2. Russian (Cyrillic block: \u0400-\u04ff)
    if (/[\u0400-\u04ff]/.test(text)) {
        return 'ru';
    }
    
    // Tokenize text into words
    const words = text.toLowerCase().split(/\W+/);
    
    // 3. Bahasa Indonesia (common words list)
    const idWords = ['apa', 'mau', 'bisa', 'harga', 'terima', 'selamat', 'pagi', 'sore', 'malam', 'tolong', 'booking', 'spa', 'berapa', 'jam', 'buka', 'tutup', 'ada', 'tidak', 'ya', 'oke', 'saja', 'yang'];
    const idMatches = idWords.filter(w => words.includes(w)).length;
    if (idMatches >= 2) {
        return 'id';
    }
    
    // 4. French (common words list)
    const frWords = ['bonjour', 'bonsoir', 'merci', 'oui', 'non', 'je', 'vous', 'est', 'une', 'des', 'les', 'pour', 'avec', 'bien', 'votre', 'combien', 'coute', 'comment', 'voulez', 'avez', 'bonne', 'nuit'];
    const frMatches = frWords.filter(w => words.includes(w)).length;
    if (frMatches >= 1) {
        return 'fr';
    }
    
    // 5. English (default fallback)
    return 'en';
}

/**
 * Returns system instructions for a given language code.
 * 
 * @param {string} langCode - Language code.
 * @returns {string} Prompt instructions.
 */
function getLanguageInstruction(langCode) {
    switch (langCode) {
        case 'id':
            return 'Reply in Bahasa Indonesia. Use light, warm informality.';
        case 'en':
            return 'Reply in English.';
        case 'ru':
            return 'Reply in Russian.';
        case 'zh':
            return 'Reply in Simplified Chinese.';
        case 'fr':
            return 'Reply in French.';
        default:
            return 'Reply in English.';
    }
}

module.exports = {
    detectLanguage,
    getLanguageInstruction
};
