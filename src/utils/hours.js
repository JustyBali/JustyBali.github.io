/**
 * Checks if the current time in the specified timezone is within working hours.
 * 
 * @param {object} config - The client configuration.
 * @returns {boolean} True if within working hours.
 */
function isWithinHours(config) {
    if (!config || !config.working_hours) {
        return true; // default to true if not configured
    }

    try {
        const [start, end] = config.working_hours.split('-');
        if (!start || !end) return true;

        const [startHour, startMin] = start.split(':').map(Number);
        const [endHour, endMin] = end.split(':').map(Number);

        const startTimeVal = startHour * 60 + startMin;
        const endTimeVal = endHour * 60 + endMin;

        // Get current time in client's timezone
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: config.timezone || 'UTC',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });

        const parts = formatter.formatToParts(new Date());
        let currentHour = 0;
        let currentMinute = 0;

        for (const part of parts) {
            if (part.type === 'hour') currentHour = parseInt(part.value, 10);
            if (part.type === 'minute') currentMinute = parseInt(part.value, 10);
        }

        currentHour = currentHour % 24;
        const currentTimeVal = currentHour * 60 + currentMinute;

        if (startTimeVal <= endTimeVal) {
            return currentTimeVal >= startTimeVal && currentTimeVal <= endTimeVal;
        } else {
            // Overnight shift
            return currentTimeVal >= startTimeVal || currentTimeVal <= endTimeVal;
        }
    } catch (err) {
        console.error("[hours] Error parsing hours:", err.message);
        return true; // fallback to true to prevent locking out customers on error
    }
}

/**
 * Returns the natural out-of-hours message for the client.
 * 
 * @param {object} config - The client configuration.
 * @returns {string} The out-of-hours message.
 */
function getOutOfHoursMessage(config) {
    const businessName = config.business_name || 'our business';
    const workingHours = config.working_hours || 'scheduled hours';
    const timezone = config.timezone || 'UTC';
    return `Thanks for reaching out to ${businessName}! We are currently closed. Our hours are ${workingHours} (${timezone}). We will reply when we reopen. 🙏`;
}

module.exports = {
    isWithinHours,
    getOutOfHoursMessage
};
