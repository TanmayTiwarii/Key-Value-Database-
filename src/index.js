import 'dotenv/config';
import express from 'express';
import kvroutes from './api/routes/kv.routes.js';
import { store } from './kvengine/store.js';

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.json());

import { replicationMiddleware } from './replication/middleware.js';

app.use('/api/kv', replicationMiddleware);
app.use('/api/kv', kvroutes);

import { loadConfig } from './config.js';

// Initialize Config and KV store before starting the server
await loadConfig();
await store.init();

app.listen(PORT, () => {
    console.log(`Server started on port http://localhost:${PORT}`);
});
