import fetch from 'node-fetch';
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

export interface PingResult {
  status: 'UP' | 'DOWN'| 'UNKNOWN';
  checkedAt: string;
  responseTimeMs: number;
  errorCategory?: 'TIMEOUT' | 'REFUSED' | 'DNS_FAILURE' | 'CERT_EXPIRED' | 'PROBE_FAILURE' | 'UNKNOWN';
  errorMessage?: string;
}

export async function pingUrl(url: string, timeoutMs = 3000): Promise<PingResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const agent = url.startsWith('https:') ? httpsAgent : httpAgent;

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      agent,
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

    let errorCategory: PingResult['errorCategory'] = 'UNKNOWN';
    if (error.name === 'AbortError') errorCategory = 'TIMEOUT';
    else if (error.code === 'ECONNREFUSED') errorCategory = 'REFUSED';
    else if (error.code === 'ENOTFOUND') errorCategory = 'DNS_FAILURE';
    else if (error.code === 'CERT_HAS_EXPIRED') errorCategory = 'CERT_EXPIRED';

    return {
      status: 'DOWN',
      checkedAt: new Date().toISOString(),
      responseTimeMs,
      errorCategory,
      errorMessage: error.message,
    };
  }
}