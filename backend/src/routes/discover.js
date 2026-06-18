const {Router} = require('express');
const { scrapeTomcatStatus } = require('../services/tomcatScraper');
const { pingUrl } = require('../services/pinger');
const data = require('../../data/monitors');
const pLimit = require('p-limit'); // npm install p-limit

const router = Router();

// Architectural decision: Bounded concurrency
// WHY: Promise.all with 100 endpoints creates 100 simultaneous TCP connections.
//      This exhausts file descriptors and triggers rate limiting on target servers.
//      p-limit(5) means max 5 concurrent pings, queueing the rest.
const limit = pLimit(5);

router.post('/', async (req, res) => {
    const startTime = Date.now();
    
    // ── Phase 1: Discovery ─────────────────────────────────────────────────
    let discoveredEndpoints;
    try {
        discoveredEndpoints = await scrapeTomcatStatus();
    } catch (error) {
        return res.status(502).json({ 
            error: 'Discovery failed',
            source: 'tomcat-scraper',
            message: error.message,
            results: []
        });
    }

    // ── Phase 2: Parallel Health Check with Bounded Concurrency ────────────
    const checkPromises = discoveredEndpoints.map(endpoint => 
        limit(async () => {
            try {
                const pingResult = await pingUrl(endpoint.url);
                const monitor = data.createMonitor({
                    name: endpoint.name,
                    url: endpoint.url,
                    status: pingResult.status,
                    checkedAt: pingResult.checkedAt,
                });
                return { success: true, monitor };
            } catch (error) {
                return { 
                    success: false, 
                    endpoint,
                    error: error.message,
                    errorCategory: error.code || 'UNKNOWN'
                };
            }
        })
    );

    const checkResults = await Promise.all(checkPromises);
    
    // ── Phase 3: Result Aggregation ────────────────────────────────────────
    const monitors = checkResults.filter(r => r.success).map(r => r.monitor);
    const failures = checkResults.filter(r => !r.success).map(r => ({
        name: r.endpoint.name,
        url: r.endpoint.url,
        error: r.error,
        category: r.errorCategory
    }));

    // ── Phase 4: Response ──────────────────────────────────────────────────
    // Architectural decision: 200 with partial results + metadata
    // WHY: The frontend can immediately render successful monitors and show
    //      a "X of Y discovered" summary. The timing metadata enables
    //      performance monitoring of the discovery operation itself.
    res.status(200).json({
        meta: {
            discovered: discoveredEndpoints.length,
            registered: monitors.length,
            failed: failures.length,
            durationMs: Date.now() - startTime
        },
        monitors,
        failures
    });
});

module.exports = router;