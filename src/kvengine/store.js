import { WAL } from './wal.js';
import path from 'path';
import fs from 'fs/promises';

class KVStore {
    constructor() {
        this.map = new Map();
        const dataDir = path.join(process.cwd(), 'data');
        this.wal = new WAL(dataDir);
        
        this.snapshotPath = path.join(dataDir, 'snapshot.bin');
        this.snapshotTmpPath = path.join(dataDir, 'snapshot.tmp');
        
        // Clean up paths from older versions
        this.oldSnapshotPath = path.join(dataDir, 'snapshot.json');
        this.oldWalPath = path.join(dataDir, 'wal.log');
        
        this.operationsCount = 0;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        
        await this.wal.init();

        // Cleanup any failed temp snapshots or old v1 files
        try { await fs.unlink(this.snapshotTmpPath); } catch (e) {}
        try { await fs.unlink(this.oldSnapshotPath); } catch (e) {}
        try { await fs.unlink(this.oldWalPath); } catch (e) {}

        // 1. Try to load snapshot.bin
        try {
            const snapshotData = await fs.readFile(this.snapshotPath, 'utf8');
            const entries = JSON.parse(snapshotData);
            this.map = new Map(entries);
            console.log(`Loaded ${this.map.size} keys from snapshot.`);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }

        // 2. Replay all remaining WAL operations across any existing active logs
        const operations = await this.wal.replay();
        
        for (const op of operations) {
            if (op.op === 'PUT') {
                this.map.set(op.key, op.value);
            } else if (op.op === 'DELETE') {
                this.map.delete(op.key);
            }
        }
        
        this.operationsCount = operations.length;
        this.initialized = true;
        console.log(`KV Store initialized. Total keys: ${this.map.size}, Un-snapshotted operations: ${this.operationsCount}`);
    }

    async _takeSnapshot() {
        const entries = Array.from(this.map.entries());
        const data = JSON.stringify(entries);
        
        // 1. Write to snapshot.tmp
        const fileHandle = await fs.open(this.snapshotTmpPath, 'w');
        await fileHandle.write(data);
        // 2. Flush to disk to ensure data integrity
        await fileHandle.sync();
        await fileHandle.close();
        
        // 3. Atomically rename to snapshot.bin
        await fs.rename(this.snapshotTmpPath, this.snapshotPath);
        
        // 4 & 5. Create new WAL and switch to it
        const oldWal = await this.wal.rotate();
        
        // 6. Delete old WAL
        await this.wal.deleteLog(oldWal);
        
        this.operationsCount = 0;
        console.log(`Atomic snapshot complete. Rotated WAL logs.`);
    }

    async put(key, value) {
        if (!this.initialized) throw new Error("KVStore not initialized");
        
        await this.wal.append({ op: 'PUT', key, value });
        this.map.set(key, value);
        this.operationsCount++;

        if (this.operationsCount >= 100) {
            try {
                await this._takeSnapshot();
            } catch (err) {
                console.error('Snapshot failed, will retry on next write:', err);
            }
        }
    }

    get(key) {
        if (!this.initialized) throw new Error("KVStore not initialized");
        
        return this.map.get(key);
    }

    async delete(key) {
        if (!this.initialized) throw new Error("KVStore not initialized");
        
        await this.wal.append({ op: 'DELETE', key });
        this.map.delete(key);
        this.operationsCount++;

        if (this.operationsCount >= 100) {
            try {
                await this._takeSnapshot();
            } catch (err) {
                console.error('Snapshot failed, will retry on next write:', err);
            }
        }
    }
}

// Export a singleton instance
export const store = new KVStore();
