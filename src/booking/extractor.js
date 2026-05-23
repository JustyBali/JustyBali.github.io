require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

/**
 * Extracts booking fields from a user's raw message.
 * 
 * @param {string} message - The customer's message.
 * @param {object} config - Business configuration including booking details and timezone.
 * @returns {Promise<object>} Extracted booking fields.
 */
async function extractBookingIntent(message, config) {
    try {
        if (!genAI) {
            throw new Error("GEMINI_API_KEY is not set in the environment.");
        }

        const now = new Date();
        const formattedDateTime = new Intl.DateTimeFormat('en-US', {
            timeZone: config.timezone || 'UTC',
            dateStyle: 'full',
            timeStyle: 'long'
        }).format(now);

        const servicesList = (config.booking && config.booking.services) 
            ? config.booking.services.join(', ') 
            : 'None';

        const systemInstruction = `You are a booking extraction agent. Your job is to extract booking details from user text.
Analyze the user's message and extract the following booking fields. Return your output STRICTLY as a JSON object, with no markdown code blocks, no preamble, and no explanation.

JSON Schema:
{
  "service": string or null (must match one of the available services listed below, or be null if not specified or not matching),
  "date": string or null (ISO8601 date format YYYY-MM-DD. Use the current date context to resolve relative dates like "this Saturday", "tomorrow", etc.),
  "time": string or null (HH:MM 24-hour format, e.g., "15:00" for 3pm, "09:30" for 9:30am),
  "party_size": number or null (the number of people, default to null if not specified),
  "deposit_required": boolean (true if a deposit is required, false otherwise),
  "confidence": number (a float between 0.0 and 1.0 representing how confident you are in the extracted details),
  "clarification_needed": string or null (If any of service, date, or time is missing/null, AND your confidence is less than 0.8, write a single natural, friendly question to ask the customer to clarify the missing fields. Otherwise, set this to null)
}

Available Services:
[ ${servicesList} ]

Current Date Context (in timezone ${config.timezone || 'UTC'}):
${formattedDateTime}

Rules:
1. Never guess. If you are uncertain about a field, set it to null.
2. Deposit requirement is: ${config.booking && config.booking.deposit_required ? 'true' : 'false'}. Set "deposit_required" accordingly.
3. Your output must be parseable via JSON.parse. Do not include markdown code block formatting (e.g. \`\`\`json).`;

        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: systemInstruction
        });

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: message }] }],
            generationConfig: {
                temperature: 0.05,
                responseMimeType: "application/json"
            }
        });

        const responseText = result.response.text().trim();
        let parsed;
        try {
            parsed = JSON.parse(responseText);
        } catch (e) {
            // Fallback parse if JSON was wrapped in markdown despite instructions
            const cleaned = responseText.replace(/```json|```/g, '').trim();
            parsed = JSON.parse(cleaned);
        }

        // Enforce clarification_needed checks in case the LLM did not apply them perfectly
        const hasMissingFields = !parsed.service || !parsed.date || !parsed.time;
        const confidence = parsed.confidence !== undefined ? Number(parsed.confidence) : 0.0;
        
        if (hasMissingFields && confidence < 0.8 && !parsed.clarification_needed) {
            parsed.clarification_needed = "Could you please confirm the date, time, and service you would like to book?";
        }

        return {
            service: parsed.service || null,
            date: parsed.date || null,
            time: parsed.time || null,
            party_size: parsed.party_size !== undefined ? Number(parsed.party_size) : null,
            deposit_required: parsed.deposit_required === true,
            confidence: confidence,
            clarification_needed: parsed.clarification_needed || null
        };

    } catch (err) {
        console.error("[booking/extractor] Extraction failed:", err.message);
        return {
            service: null,
            date: null,
            time: null,
            party_size: null,
            deposit_required: false,
            confidence: 0,
            clarification_needed: "Sorry, I had trouble processing that booking request. Could you please specify the service, date, and time?"
        };
    }
}

module.exports = {
    extractBookingIntent
};
