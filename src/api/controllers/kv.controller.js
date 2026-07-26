import { store } from '../../kvengine/store.js';

export const putkey = async (req, res) => {
    const { key, value } = req.params;

    try {
        await store.put(key, value);
        return res.json({ message: "success" });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
}

export const getkey = (req, res) => {
    const { key } = req.params;

    try {
        const value = store.get(key);
        if (value === undefined) {
            return res.status(404).json({ message: "Key not found" });
        }
        return res.json({ key, value });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
}

export const deletekey = async (req, res) => {
    const { key } = req.params;

    try {
        await store.delete(key);
        return res.json({ message: "success" });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
}