import { getConfig } from '../config.js';
import { broadcastToFollowers } from './replicator.js';

export const replicationMiddleware = (req, res, next) => {
    // Only intercept mutations
    if (req.method !== 'PUT' && req.method !== 'DELETE') {
        return next();
    }

    const config = getConfig();

    // 1. Follower Protection: Block direct writes to followers
    if (config.role === 'follower') {
        if (req.headers['x-replication-source'] !== 'leader') {
            return res.status(403).json({ 
                message: "Forbidden: Writes are only allowed on the leader node." 
            });
        }
        // It's a valid replication request, let the controller handle it
        return next();
    }

    // 2. Leader Replication: Let the controller handle it, and listen for success
    if (config.role === 'leader') {
        res.on('finish', () => {
            // Only replicate if the local write was actually successful
            if (res.statusCode >= 200 && res.statusCode < 300) {
                // req.originalUrl contains the full path including the router prefix (e.g., /api/kv/put/key/val)
                broadcastToFollowers(req.method, req.originalUrl);
            }
        });
        
        return next();
    }
    
    // Fallback
    next();
};
