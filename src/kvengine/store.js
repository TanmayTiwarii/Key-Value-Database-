import { WAL } from './wal.js';
import path from 'path';

class KVStore {
    constructor() {
        this.map = new Map();
        const dataPath = path.join(process.cwd(), 'data', 'wal.log');
        this.wal = new WAL(dataPath);
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        
        await this.wal.init();
        const operations = await this.wal.replay();
        
        for (const op of operations) {
            if (op.op === 'PUT') {
                this.map.set(op.key, op.value);
            } else if (op.op === 'DELETE') {
                this.map.delete(op.key);
            }
        }
        
        this.initialized = true;
        console.log(`KV Store initialized with ${this.map.size} keys from WAL.`);
    }

    async put(key, value) {
        if (!this.initialized) throw new Error("KVStore not initialized");
        
        await this.wal.append({ op: 'PUT', key, value });
        this.map.set(key, value);
    }

    get(key) {
        if (!this.initialized) throw new Error("KVStore not initialized");
        
        return this.map.get(key);
    }

    async delete(key) {
        if (!this.initialized) throw new Error("KVStore not initialized");
        
        await this.wal.append({ op: 'DELETE', key });
        this.map.delete(key);
    }
}

// Export a singleton instance
export const store = new KVStore();
