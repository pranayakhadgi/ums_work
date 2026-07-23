/**
 * HTTP ping module.
 * Provides functionality to ping URLs and check their availability.
 */
import http from 'http';
import https from 'https';

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 3000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 3000,
  rejectUnauthorized: false,
});

/**
 * Represents the outcome of an HTTP ping operation.
 */
export interface PingResult {
  status: 'UP' | 'DOWN' | 'UNKNOWN';
  checkedAt: string;
  responseTimeMs: number;
  errorCategory?: 'TIMEOUT' | 'REFUSED' | 'DNS_FAILURE' | 'CERT_EXPIRED' | 'PROBE_FAILURE' | 'UNKNOWN';
  errorMessage?: string;
}

/**
 * Pings a given URL to check its status and response time.
 * @param url
 * @param timeoutMs
 * @returns
 */
export async function pingUrl(url: string, timeoutMs = 5000): Promise<PingResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const agent = url.startsWith('https:') ? httpsAgent : httpAgent;

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseTimeMs = Date.now() - startTime;

    return {
      status: response.ok ? 'UP' : 'DOWN',
      checkedAt: new Date().toISOString(),
      responseTimeMs,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    const responseTimeMs = Date.now() - startTime;

    // error.cause wraps up any node fetch error
    const causeCode = error.cause?.code || error.code;
    
    let errorCategory: PingResult['errorCategory'] = 'UNKNOWN';
    if (error.name === 'AbortError') errorCategory = 'TIMEOUT';
    else if (causeCode === 'ECONNREFUSED') errorCategory = 'REFUSED';
    else if (causeCode === 'ENOTFOUND') errorCategory = 'DNS_FAILURE';
    else if (causeCode === 'CERT_HAS_EXPIRED') errorCategory = 'CERT_EXPIRED';

    return {
      status: 'DOWN',
      checkedAt: new Date().toISOString(),
      responseTimeMs,
      errorCategory,
      errorMessage: error.message,
    };
  }
}