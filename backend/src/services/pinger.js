const http = require('http');
const https = require('https');
      
//      maxSockets: 50 prevents connection exhaustion (default is Infinity)
//      maxFreeSockets: 10 limits idle connections in the pool
const httpAgent = new http.Agent({ 
    keepAlive: true, 
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 3000,
    freeSocketTimeout: 30000 
});

const httpsAgent = new https.Agent({ 
    keepAlive: true, 
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 3000,
    freeSocketTimeout: 30000,
    rejectUnauthorized: false // For internal self-signed certs
});

async function pingUrl(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const agent = url.startsWith('https:') ? httpsAgent : httpAgent;

    try {
        const response = await fetch(url, { method: 'GET', signal: controller.signal, agent });
        clearTimeout(timeoutId);
        return {
            status: response.ok ? 'UP' : 'DOWN',
            checkedAt: new Date().toISOString(),
        };
    } catch (error) {
        clearTimeout(timeoutId);

        let errorCategory = 'UNKNOWN';
        if (error.name === 'AbortError') errorCategory = 'TIMEOUT';
        else if (error.code === 'ECONNREFUSED') errorCategory = 'REFUSED';
        else if (error.code === 'ENOTFOUND') errorCategory = 'DNS_FAILURE';
        else if (error.code === 'CERT_HAS_EXPIRED') errorCategory = 'CERT_EXPIRED';

        return {
            status: 'DOWN',
            checkedAt: new Date().toISOString(),
            errorCategory,
            errorMessage: error.message,
        };
    }
}

module.exports = { pingUrl};


