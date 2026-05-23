const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/**
 * Loads the client configuration from config.yaml.
 * 
 * @param {string} clientId - The client ID.
 * @returns {object} The parsed configuration.
 */
function loadConfig(clientId) {
    try {
        const configPath = path.join(process.cwd(), 'clients', clientId, 'config.yaml');
        if (!fs.existsSync(configPath)) {
            throw new Error(`Config file not found at ${configPath}`);
        }
        const fileContent = fs.readFileSync(configPath, 'utf8');
        const parsed = yaml.load(fileContent);
        if (!parsed) {
            throw new Error("YAML file parsed as empty/invalid.");
        }
        return parsed;
    } catch (err) {
        throw new Error(`[config] Failed to load config for ${clientId}: ${err.message}`);
    }
}

/**
 * Saves and merges configuration updates back to config.yaml.
 * 
 * @param {string} clientId - The client ID.
 * @param {object} updates - The incoming configurations.
 * @returns {object} The updated configuration.
 */
function saveConfig(clientId, updates) {
    try {
        const config = loadConfig(clientId);
        
        // Merge allowed updates only
        if (updates.confidence_threshold !== undefined && updates.confidence_threshold !== null) {
            config.confidence_threshold = Number(updates.confidence_threshold);
        }
        if (updates.working_hours !== undefined && updates.working_hours !== null) {
            config.working_hours = String(updates.working_hours);
        }
        
        const configPath = path.join(process.cwd(), 'clients', clientId, 'config.yaml');
        const yamlStr = yaml.dump(config);
        fs.writeFileSync(configPath, yamlStr, 'utf8');
        return config;
    } catch (err) {
        throw new Error(`[config] Failed to save config for ${clientId}: ${err.message}`);
    }
}

module.exports = {
    loadConfig,
    saveConfig
};
