// Backend src/services/tomcatScraper.js
const https = require('https');
const fs = require('fs');
const path = require('path');

async function scrapeTomcatStatus() {
    // Test mode: Parse the hybrid test-status.html format
    if (process.env.USE_TEST_FILE === 'true') {
        const filePath = path.join(__dirname, '..','..', 'test-status.html');
        const data = await fs.promises.readFile(filePath, 'utf-8'); // Async, non-blocking
        
        const endpoints = [];
        const lines = data.split('\n').filter(line => line.trim());
        
        for (const line of lines) { 
            // Format A: Pipe-delimited "Name | URL" (your test-status.html reality)
            const pipeMatch = line.match(/^(.+?)\s*\|\s*(https?:\/\/.+)$/);
            if (pipeMatch) {
                endpoints.push({
                    name: pipeMatch[1].trim(),
                    url: pipeMatch[2].trim()
                });
                continue;
            }
            
            // Format B: Raw URL on its own line (first line of your test file)
            const urlMatch = line.match(/^(https?:\/\/\S+)$/);
            if (urlMatch) {
                const url = urlMatch[1];
                // Derive name from URL path or hostname
                const urlObj = new URL(url);
                const name = urlObj.pathname.replace(/^\//, '').replace(/\//g, '-') 
                          || urlObj.hostname;
                endpoints.push({ name, url });
                continue;
            }
            
            // Format C: Tomcat's actual "localhost /path" HTML output
            const tomcatMatch = line.match(/localhost\s+(\/[^\s]+)/);
            if (tomcatMatch) {
                const contextPath = tomcatMatch[1];
                const fullUrl = `${process.env.TOMCAT_SCHEME}://${process.env.TOMCAT_HOST}:${process.env.TOMCAT_PORT}${contextPath}`;
                endpoints.push({
                    name: contextPath,
                    url: fullUrl
                });
            }
        }
        
        if (endpoints.length === 0) {
            throw new Error(
                `No endpoints parsed from test file. ` +
                `Checked ${lines.length} lines. ` +
                `Expected formats: "Name | URL", raw URL, or "localhost /path". ` +
                `File location: ${filePath}`
            );
        }
        return endpoints;
    }
    
    // ── Production mode: Real Tomcat HTTPS scrape ──────────────────────────
    const url = process.env.TOMCAT_STATUS_URL;
    const user = process.env.TOMCAT_USER;
    const pass = process.env.TOMCAT_PASS;
    
    if (!url || !user || !pass) {
        throw new Error('Missing TOMCAT_STATUS_URL, TOMCAT_USER, or TOMCAT_PASS env vars');
    }

    const auth = 'Basic ' + Buffer.from(user + ':' + pass).toString('base64');

    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: { 'Authorization': auth },
            rejectUnauthorized: false,
            timeout: 10000, // 10s hard ceiling
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`Tomcat status page returned ${res.statusCode}`));
                }
                
                const lines = data.split('\n');
                const endpoints = [];
                const contextRegex = /localhost\s+(\/[^\s]+)/;
                
                for (const line of lines) {
                    const match = line.match(contextRegex);
                    if (match) {
                        const contextPath = match[1];
                        const fullUrl = `${process.env.TOMCAT_SCHEME}://${process.env.TOMCAT_HOST}:${process.env.TOMCAT_PORT}${contextPath}`;
                        endpoints.push({ name: contextPath, url: fullUrl });
                    }   
                }

                if (endpoints.length === 0) {
                    return reject(new Error('No context paths found in Tomcat response'));
                }
                resolve(endpoints);
            });
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Tomcat status request timed out after 10s`));
        });
        
        req.on('error', (err) => reject(err));
    });
}

module.exports = { scrapeTomcatStatus };