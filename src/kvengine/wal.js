import fs from 'fs/promises';
import { createReadStream } from 'fs';
import readline from 'readline';
import path from 'path';

export class WAL {
    constructor(filePath) {
        this.filePath = filePath;
    }

    async init() {
        // Ensure the directory exists
        const dir = path.dirname(this.filePath);
        await fs.mkdir(dir, { recursive: true });
        
        // Touch the file if it doesn't exist
        try {
            await fs.access(this.filePath);
        } catch (error) {
            await fs.writeFile(this.filePath, '');
        }
    }

    async append(operation) {
        const line = JSON.stringify(operation) + '\n';
        await fs.appendFile(this.filePath, line);
    }

    async replay() {
        const operations = [];
        
        try {
            const fileStream = createReadStream(this.filePath);
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
            if (error.code !== 'ENOENT') {
                throw error; // Throw if it's not a "file not found" error
            }
        }

        return operations;
    }
}
