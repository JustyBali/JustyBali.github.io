require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { detectLanguage, getLanguageInstruction } = require('../utils/lang');

// Check if API key is present
const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

/**
 * Generates a response using the Gemini API based on business configurations, FAQs, conversation history, and the incoming message.
 * 
 * @param {object} config - Business and persona configurations.
 * @param {string} faqContext - Format: "Q: {question}\nA: {answer}\n..."
 * @param {Array} history - Array of {role:'user'|'model', parts:[{text}]}
 * @param {string} incomingMsg - The new user message.
 * @returns {Promise<object>} Response object with text, confidence, shouldEscalate, and language.
 */
async function generateResponse(config, faqContext, history = [], incomingMsg = '') {
    // 1. Check for escalation keywords in incomingMsg
    const escalationKeywords = ['refund', 'complaint', 'accident', 'manager', 'lawsuit', 'emergency'];
    const lowerMsg = String(incomingMsg).toLowerCase();
    const shouldEscalate = escalationKeywords.some(keyword => lowerMsg.includes(keyword));

    // Detect language and retrieve instruction
    const langCode = detectLanguage(incomingMsg);
    const langInstruction = getLanguageInstruction(langCode);

    try {
        if (!genAI) {
            throw new Error("GEMINI_API_KEY is not set in the environment.");
        }

        // 3. Current datetime in the specified timezone
        const now = new Date();
        const formattedDateTime = new Intl.DateTimeFormat('en-US', {
            timeZone: config.timezone || 'UTC',
            dateStyle: 'full',
            timeStyle: 'long'
        }).format(now);

        // 4. Construct the system prompt
        const systemInstruction = `You are ${config.persona_name}, the WhatsApp AI receptionist for the business "${config.business_name}".
Your persona is: ${config.persona}.
Supported languages: ${Array.isArray(config.languages) ? config.languages.join(', ') : 'en'}.
Language Requirement: ${langInstruction}

Here is the FAQ context you should use to answer user queries. Do not make up facts outside of this context unless they are general pleasantries:
---
${faqContext || 'No FAQ context available.'}
---

Current date and time in ${config.timezone || 'UTC'}: ${formattedDateTime}.

Under no circumstances should you handle disputes, accidents, legal matters, or serious complaints directly. If the user mentions topics related to our escalation keywords (refund, complaint, accident, manager, lawsuit, emergency), acknowledge their request politely and inform them that a human manager will get in touch shortly.

You must return your output strictly as a JSON object with the following schema:
{
  "text": "Your helpful response in the appropriate language matching your persona.",
  "confidence": 0.0 to 1.0 (a decimal value representing how confident you are that the provided FAQ context contains the answer to the user's query. If the FAQ does not contain the answer, confidence should be low, e.g., below 0.5)
}`;

        // 5. Setup model configuration
        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: systemInstruction
        });

        // 6. Format content array
        const contents = [
            ...history,
            { role: 'user', parts: [{ text: incomingMsg }] }
        ];

        // 7. Call Gemini API
        const result = await model.generateContent({
            contents: contents,
            generationConfig: {
                temperature: 0.15,
                maxOutputTokens: 1000,
                responseMimeType: "application/json"
            }
        });

        // 8. Process model response
        const responseText = result.response.text();
        let text = null;
        let confidence = 0.85; // Default confidence

        try {
            const parsed = JSON.parse(responseText);
            text = parsed.text || parsed.response || parsed.reply || responseText;
            confidence = parsed.confidence !== undefined ? Number(parsed.confidence) : 0.85;
        } catch (e) {
            // Fallback if model did not return valid JSON despite MIME type restriction
            text = responseText;
        }

        return {
            text,
            confidence,
            shouldEscalate,
            language: langCode
        };

    } catch (err) {
        return {
            text: null,
            confidence: 0,
            shouldEscalate: false,
            language: langCode,
            error: err.message
        };
    }
}

module.exports = {
    generateResponse
};
