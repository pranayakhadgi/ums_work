// Backend src/services/tomcatScraper.js
// Purpose: Fetch and parse the Tomcat status page to extract deployed application context paths.

const https = require('https');   // Node's native HTTPS module

/**

- Fetches the Tomcat status page and extracts context paths.
- Uses Basic Authentication and Node's https module (no external libs needed).
- @returns {Promise<Array<{ name: string, url: string }>>}
*/
async function scrapeTomcatStatus() {
    const url = process.env.TOMCAT_STATUS_URL;
    const user = process.env.TOMCAT_USER;
    const pass = process.env.TOMCAT_PASS;

    // Prepare the Basic Auth header
    const auth = 'Basic ' + Buffer.from(user + ':' + pass).toString('base64');

    // Return a promise wrapping the HTTPS request
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: { 'Authorization': auth },
             rejectUnauthorized: false,  // Only for internal self-signed certs – remove in strict production
            }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`Tomcat status page returned ${res.statusCode}`));
                }
                // Step 1: Split the response into lines
                const lines = data.split('\n');
                const endpoints = [];

                // Step 2: Regex to capture "localhost /somepath" – adjust if needed
                const contextRegex = /localhost\s+(\/[^\s]+)/;

                for (const line of lines) {
                    const match = line.match(contextRegex);
                    if (match) {
                         const contextPath = match[1];

                        // Step 3: Construct full URL using configured host/port/scheme
                        const fullUrl = `${process.env.TOMCAT_SCHEME}://${process.env.TOMCAT_HOST}:${process.env.TOMCAT_PORT}${contextPath}`;
                         endpoints.push({
                            name: contextPath,        // Use the path as display name
                            url: fullUrl,
                        });
                    }   
                }

                if (endpoints.length === 0) {
                    return reject(new Error('No context paths found. Check the regex or page format.'));
                }
                resolve(endpoints);
            });
        });

        req.on('error', (err) => reject(err));
        req.end();
    });
}

module.exports = { scrapeTomcatStatus };