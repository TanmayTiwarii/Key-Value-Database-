import fs from 'fs/promises';
import { createReadStream } from 'fs';
import readline from 'readline';
import path from 'path';

export class WAL {
    constructor(dirPath) {
        this.dirPath = dirPath;
        this.currentFilePath = null;
        this.fileHandle = null;
    }

    async init() {
        await fs.mkdir(this.dirPath, { recursive: true });
        
        // Find the latest wal file
        const files = await fs.readdir(this.dirPath);
        const walFiles = files.filter(f => f.startsWith('wal_') && f.endsWith('.log')).sort();
        
        if (walFiles.length > 0) {
            this.currentFilePath = path.join(this.dirPath, walFiles[walFiles.length - 1]);
            // Open a persistent file handle in append mode
            this.fileHandle = await fs.open(this.currentFilePath, 'a');
        } else {
            await this.rotate();
        }
    }

    async append(operation) {
        if (!this.fileHandle) throw new Error("WAL not initialized");
        const line = JSON.stringify(operation) + '\n';
        // Write and flush to physical disk — guarantees durability
        await this.fileHandle.write(line);
        await this.fileHandle.sync();
    }

    async replay() {
        const operations = [];
        const files = await fs.readdir(this.dirPath);
        const walFiles = files.filter(f => f.startsWith('wal_') && f.endsWith('.log')).sort();

        for (const file of walFiles) {
            const filePath = path.join(this.dirPath, file);
            try {
                const fileStream = createReadStream(filePath);
                const rl = readline.createInterface({
                    input: fileStream,
                    crlfDelay: Infinity
                });

                for await (const line of rl) {
                    if (line.trim()) {
                        try {
                            operations.push(JSON.parse(line));
                        } catch (e) {
                            // Skip corrupted/partial lines from interrupted writes
                            console.warn(`Skipping corrupted WAL entry: ${line}`);
                        }
                    }
                }
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }
        }

        return operations;
    }

    async rotate() {
        const oldFilePath = this.currentFilePath;

        // Close the current file handle before switching
        if (this.fileHandle) {
            await this.fileHandle.close();
            this.fileHandle = null;
        }
        
        const newFileName = `wal_${Date.now()}.log`;
        this.currentFilePath = path.join(this.dirPath, newFileName);
        
        // Open a new persistent file handle in append mode
        this.fileHandle = await fs.open(this.currentFilePath, 'a');
        
        return oldFilePath;
    }

    async deleteLog(filePath) {
        if (!filePath) return;
        try {
            await fs.unlink(filePath);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
    }

    async close() {
        if (this.fileHandle) {
            await this.fileHandle.close();
            this.fileHandle = null;
        }
    }
}
