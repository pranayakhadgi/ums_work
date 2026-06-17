const {Router} = require('express');
const { scrapeTomcatStatus } = require('../services/tomcatScraper');
const { pingUrl } = require('../services/pinger');
const data = require('../../data/monitors');

const router = Router();

router.post('/', async (req, res) => {
    try {
        //scrape the status page to get the raw endpoints
        const discoveredEndpoints = await scrapeTomcatStatus();

        //ping each endpoint and create monitos
        const results = [];//initialize
        for (const endpoint of discoveredEndpoints) {
            const { status, checkedAt } = await pingUrl(endpoint.url);
            const monitor = data.createMonitor({
                name: endpoint.name,
                url: endpoint.url,
                status,
                checkedAt,
            });
            results.push(monitor);
        }
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;