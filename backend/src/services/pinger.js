"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pingUrl = pingUrl;
// backend/src/services/pinger.ts
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const httpAgent = new http_1.default.Agent({
    keepAlive: true,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 3000,
});
const httpsAgent = new https_1.default.Agent({
    keepAlive: true,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 3000,
    rejectUnauthorized: false,
});
async function pingUrl(url, timeoutMs = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const agent = url.startsWith('https:') ? httpsAgent : httpAgent;
    const startTime = Date.now();
    try {
        const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            // @ts-ignore — Node 18+ fetch
            // dispatcher: agent,
        });
        clearTimeout(timeoutId);
        const responseTimeMs = Date.now() - startTime;
        return {
            status: response.ok ? 'UP' : 'DOWN',
            checkedAt: new Date().toISOString(),
            responseTimeMs,
        };
    }
    catch (error) {
        clearTimeout(timeoutId);
        const responseTimeMs = Date.now() - startTime;
        // error.cause wraps up any node fetch error
        const causeCode = error.cause?.code || error.code;
        let errorCategory = 'UNKNOWN';
        if (error.name === 'AbortError')
            errorCategory = 'TIMEOUT';
        else if (causeCode === 'ECONNREFUSED')
            errorCategory = 'REFUSED';
        else if (causeCode === 'ENOTFOUND')
            errorCategory = 'DNS_FAILURE';
        else if (causeCode === 'CERT_HAS_EXPIRED')
            errorCategory = 'CERT_EXPIRED';
        return {
            status: 'DOWN',
            checkedAt: new Date().toISOString(),
            responseTimeMs,
            errorCategory,
            errorMessage: error.message,
        };
    }
}
