require('dotenv').config();
// Demo default: use local test-status.html when Tomcat credentials are not configured
if (!process.env.USE_TEST_FILE && !process.env.TOMCAT_STATUS_URL) {
    process.env.USE_TEST_FILE = 'true';
}
process.env.TOMCAT_SCHEME = process.env.TOMCAT_SCHEME || 'http';
process.env.TOMCAT_HOST = process.env.TOMCAT_HOST || 'localhost';
process.env.TOMCAT_PORT = process.env.TOMCAT_PORT || '8080';
const express = require('express');
const app = express();
app.use(express.json()); // Middleware parsing JSON body from requests

// Choose routers based on DATABASE_URL configuration
if (process.env.DATABASE_URL) {
    console.log('[server] DATABASE_URL found. Running in PostgreSQL/Drizzle DB mode.');
    const { discoveryRouter } = require('./routes/discovery');
    const { monitorsRouter } = require('./routes/monitors');
    app.use('/api/discover', discoveryRouter);
    app.use('/api/monitors', monitorsRouter);
} else {
    console.log('[server] DATABASE_URL not found. Running in in-memory fallback/demo mode.');
    const { scrapeTomcatStatus } = require('./services/tomcatScraper');
    const { getAll, createMonitor } = require('../data/monitors');
    const { pingUrl } = require('./services/pinger');

    // In-memory fallback discovery route
    app.post('/api/discover', async (req, res) => {
        try {
            const endpoints = await scrapeTomcatStatus();
            const results = [];
            for (const endpoint of endpoints) {
                const pingResult = await pingUrl(endpoint.url);
                const monitor = createMonitor({
                    name: endpoint.name,
                    url: endpoint.url,
                    status: pingResult.status,
                    checkedAt: pingResult.checkedAt
                });
                results.push(monitor);
            }
            res.json({
                meta: {
                    discovered: endpoints.length,
                    registered: results.length,
                    failed: 0,
                    durationMs: 0
                },
                monitors: results,
                failures: []
            });
        } catch (error) {
            console.error('[server] In-memory discovery failed:', error);
            res.status(502).json({ error: 'Discovery failed', message: error.message });
        }
    });

    // In-memory fallback monitors routes
    app.get('/api/monitors', (req, res) => {
        const monitors = getAll();
        res.json({ monitors });
    });

    app.post('/api/monitors/bulk', async (req, res) => {
        const { monitors: items } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'monitors array is required'});
        }

        const results = [];
        for (const item of items) {
            const { name, url } = item;
            if (!name || !url) continue;

            const { status, checkedAt } = await pingUrl(url);
            const monitor = createMonitor({ name, url, status, checkedAt });
            results.push(monitor);
        }
        res.status(201).json(results);  
    });
}

app.use((req, res) => {
    res.status(404).json({ error: 'Not found'});
});

const PORT = process.env.PORT || 3001; 
app.listen(PORT, () => {
    console.log(`App listening on port ${PORT}`);
    console.log('Press Ctrl+C to quit.');
});