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
//add temp js store
const { getAll, createMonitor } = require('../data/monitors');
const { pingUrl } = require('./services/pinger');
const discoverRouter = require('./routes/discovery');

app.use(express.json());//middle parsing json body from requests

app.use('/api/discover', discoverRouter);

//GET /monitors
app.get('/api/monitors', (req, res) => {
    const monitors = getAll();//add data from the js store
    res.json({ monitors });
});

//middleware tester
app.post('/api/monitors/bulk', async (req, res) => {
    const { monitors } = req.body;
    if (!Array.isArray(monitors) || monitors.length === 0) {
        return res.status(400).json({ error: 'monitors array is required'});
    }

    //initialize result array first
    const results = [];
    for (const item of monitors) {
        const { name, url } = item;
        if (!name || !url) continue;

        const { status, checkedAt } = await pingUrl(url);
        //fetched url updates the status and checkedAt
        const monitor = createMonitor({ name, url, status, checkedAt});
        results.push(monitor);
    }
    res.status(201).json(results);  

});

app.use((req, res) => {
    res.status(404).json({ error: 'Not found'});
});

const PORT = process.env.PORT || 3001; 
app.listen(PORT, () => {
    console.log(`App listening on port ${PORT}`);
    console.log('Press Ctrl+C to quit.');
});