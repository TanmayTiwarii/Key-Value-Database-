import fs from 'fs/promises';
import path from 'path';

let config = {
    role: "leader",
    followers: []
};

export const loadConfig = async () => {
    try {
        const configPath = path.join(process.cwd(), 'configuration.json');
        const data = await fs.readFile(configPath, 'utf8');
        const parsed = JSON.parse(data);
        
        config.role = parsed.role || "leader";
        config.followers = parsed.followers || [];
        
        console.log(`Node running as ${config.role}. ${config.role === 'leader' ? `Followers: ${config.followers.length}` : ''}`);
    } catch (error) {
        console.log("No configuration.json found. Defaulting to leader role.");
    }
}

export const getConfig = () => config;
