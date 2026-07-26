import 'dotenv/config';
import express from 'express';
import kvroutes from './api/routes/kv.routes.js';
import { store } from './kvengine/store.js';

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.json());

app.use('/api/kv', kvroutes);

// Initialize KV store before starting the server
await store.init();

app.listen(PORT, () => {
    console.log(`Server started on port http://localhost:${PORT}`);
});
