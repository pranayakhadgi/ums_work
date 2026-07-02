const https = require('https');
const fs = require('fs');
const path = require('path');

async function scrapeTomcatStatus() {
    // ── Test mode ──
    if (process.env.USE_TEST_FILE === 'true') {
        const filePath = path.join(__dirname, '..', 'test-status.html');
        const data = await fs.promises.readFile(filePath, 'utf-8');
        
        const endpoints = [];
        const lines = data.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
        
        for (const line of lines) { 
            const pipeMatch = line.match(/^(.+?)\s*\|\s*(https?:\/\/.+)$/);
            if (pipeMatch) {
                endpoints.push({ name: pipeMatch[1].trim(), url: pipeMatch[2].trim() });
                continue;
            }
            
            const urlMatch = line.match(/^(https?:\/\/\S+)$/);
            if (urlMatch) {
                const url = urlMatch[1];
                const urlObj = new URL(url);
                const name = urlObj.pathname.replace(/^\//, '').replace(/\//g, '-') || urlObj.hostname;
                endpoints.push({ name, url });
                continue;
            }
            
            const tomcatMatch = line.match(/localhost\s+(\/[^\s]+)/);
            if (tomcatMatch) {
                const contextPath = tomcatMatch[1];
                const fullUrl = `${process.env.TOMCAT_SCHEME}://${process.env.TOMCAT_HOST}:${process.env.TOMCAT_PORT}${contextPath}`;
                endpoints.push({ name: contextPath, url: fullUrl });
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
    
    // ── Production mode ──
    const url = process.env.TOMCAT_STATUS_URL;
    const user = process.env.TOMCAT_USER;
    const pass = process.env.TOMCAT_PASS;
    
    if (!url || !user || !pass) {
        throw new Error('Missing TOMCAT_STATUS_URL, TOMCAT_USER, or TOMCAT_PASS env vars');
    }

    const auth = 'Basic ' + Buffer.from(user + ':' + pass).toString('base64');

    return new Promise((resolve, reject) => {
        const client = url.startsWith('https:') ? https : require('http');
        
        const req = client.get(url, {
            headers: { 'Authorization': auth },
            rejectUnauthorized: false,
            timeout: 10000,
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`Tomcat status page returned ${res.statusCode}`));
                }
                
                const lines = data.split('\n');
                const endpoints = [];
                
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    
                    // Format 1: HTML table / plain text containing "localhost /path"
                    const htmlMatch = trimmed.match(/localhost.*?(\/[^\s<]+)/i);
                    if (htmlMatch) {
                        const contextPath = htmlMatch[1];
                        const fullUrl = `${process.env.TOMCAT_SCHEME}://${process.env.TOMCAT_HOST}:${process.env.TOMCAT_PORT}${contextPath}`;
                        endpoints.push({ name: contextPath, url: fullUrl });
                        continue;
                    }
                    
                    // Format 2: Tomcat text API (/manager/text/list)
                    // Lines like: /manager:running:0:manager
                    const textMatch = trimmed.match(/^\/([^:]+):/);
                    if (textMatch) {
                        const contextPath = '/' + textMatch[1];
                        const fullUrl = `${process.env.TOMCAT_SCHEME}://${process.env.TOMCAT_HOST}:${process.env.TOMCAT_PORT}${contextPath}`;
                        endpoints.push({ name: contextPath, url: fullUrl });
                    }
                }

                if (endpoints.length === 0) {
                    return reject(new Error(
                        'No context paths found in Tomcat response. ' +
                        'Ensure TOMCAT_STATUS_URL points to /manager/status or /manager/text/list'
                    ));
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