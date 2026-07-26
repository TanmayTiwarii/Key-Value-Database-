import { getConfig } from '../config.js';

/**
 * Broadcasts an operation to all configured followers.
 * @param {string} method - HTTP Method (PUT, DELETE)
 * @param {string} path - The original path (e.g., /api/kv/put/key/val)
 */
export const broadcastToFollowers = (method, path) => {
    const config = getConfig();
    if (config.role !== 'leader' || !config.followers || config.followers.length === 0) {
        return;
    }

    config.followers.forEach(followerUrl => {
        // Strip out double slashes just in case
        const fullUrl = `${followerUrl}${path}`.replace(/([^:]\/)\/+/g, "$1");
        
        fetch(fullUrl, {
            method: method,
            headers: { 'x-replication-source': 'leader' }
        }).catch(err => {
            console.error(`Replication Error: Failed to ${method} ${fullUrl}`, err);
        });
    });
};
