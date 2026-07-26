import express from 'express';
import {
    getkey,
    putkey,
    deletekey
} from '../controllers/kv.controller.js';

const router = express.Router();

router.get('/get/:key',getkey)
router.put('/put/:key/:value',putkey)
router.delete('/delete/:key',deletekey)

export default router;