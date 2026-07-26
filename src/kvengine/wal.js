import fs from 'fs/promises';
import { createReadStream } from 'fs';
import readline from 'readline';
import path from 'path';

export class WAL {
    constructor(dirPath) {
        this.dirPath = dirPath;
        this.currentFilePath = null;
    }

    async init() {
        await fs.mkdir(this.dirPath, { recursive: true });
        
        // Find the latest wal file
        const files = await fs.readdir(this.dirPath);
        const walFiles = files.filter(f => f.startsWith('wal_') && f.endsWith('.log')).sort();
        
        if (walFiles.length > 0) {
            this.currentFilePath = path.join(this.dirPath, walFiles[walFiles.length - 1]);
        } else {
            await this.rotate();
        }
    }

    async append(operation) {
        if (!this.currentFilePath) throw new Error("WAL not initialized");
        const line = JSON.stringify(operation) + '\n';
        await fs.appendFile(this.currentFilePath, line);
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
                        operations.push(JSON.parse(line));
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
        const newFileName = `wal_${Date.now()}.log`;
        this.currentFilePath = path.join(this.dirPath, newFileName);
        
        // Touch the new file
        await fs.writeFile(this.currentFilePath, '');
        
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
}
