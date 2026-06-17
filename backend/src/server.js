require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const app     = express();

// ── Data store & services ─────────────────────────────────────────────────────
const { getAll, getMultiple, createMonitor } = require('../data/monitors');
const { pingUrl }      = require('./services/pinger');
const discoverRouter   = require('./routes/discover');

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());                   // allow cross-origin requests from Vite dev server
app.use(express.json());           // parse JSON request bodies

// ── Serve test-status.html at GET /test-status ────────────────────────────────
app.get('/test-status', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'test-status.html'));
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/discover', discoverRouter);

// GET /api/monitors – return all monitors from the in-memory store
app.get('/api/monitors', (req, res) => {
    const monitors = getAll();
    res.json(monitors);
});

// POST /api/monitors/bulk – ping a list of URLs and store results
app.post('/api/monitors/bulk', async (req, res) => {
    const { monitors } = req.body;
    if (!Array.isArray(monitors) || monitors.length === 0) {
        return res.status(400).json({ error: 'monitors array is required' });
    }

    const results = [];
    for (const item of monitors) {
        const { name, url } = item;
        if (!name || !url) continue;

        const { status, checkedAt } = await pingUrl(url);
        const monitor = createMonitor({ name, url, status, checkedAt });
        results.push(monitor);
    }
    res.status(201).json(results);
});

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Backend listening on http://localhost:${PORT}`);
    console.log(`Test status page: http://localhost:${PORT}/test-status`);
    console.log('Press Ctrl+C to quit.');
});