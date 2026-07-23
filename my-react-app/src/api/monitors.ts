const BASE = '/api/monitors'; //grabs the api status, set to constant

export interface Monitor {
  id: string;
  name: string;
  url: string;
  environment: string;
  status: string;
  lastChecked: string | null;
  uptime7days: number;  // FIX: backend sends lowercase 'd' (uptime7days, not uptime7Days)
  uptime30days: number; // FIX: backend sends lowercase 'd' (uptime30days, not uptime30Days)
  errorCategory?: string;  // Optional: returned by pinger.js when a URL check results in DOWN status
  errorMessage?: string;   // Optional: detailed error message from pinger.js on check failure
  createdAt: string;
}

/**
 * Build a query string that includes instanceId when provided.
 * Returns '' if instanceId is undefined/null/empty.
 */
function instanceParam(instanceId?: string): string {
  return instanceId ? `?instanceId=${encodeURIComponent(instanceId)}` : '';
}

export async function fetchMonitors(instanceId?: string): Promise<Monitor[]> {
  const res = await fetch(`${BASE}${instanceParam(instanceId)}`);
  if (!res.ok) throw new Error('Failed to fetch monitors');
  const data = await res.json();
  return Array.isArray(data) ? data : data.monitors ?? [];
}

export async function fetchAggregateHealth(instanceId?: string): Promise<{ data: unknown[] }> {
  const base = `${BASE}/aggregate/health?window=4&bucket=5`;
  const url = instanceId ? `${base}&instanceId=${encodeURIComponent(instanceId)}` : base;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch aggregate health');
  return res.json();
}

export async function addMonitorsBulk(items: { name: string; url: string }[]): Promise<Monitor[]> {
  const res = await fetch(`${BASE}/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ monitors: items }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || 'Failed to add monitors bulk');
  }
  return res.json();
}

export async function discoverMonitors(instanceId?: string): Promise<Monitor[]> {
  const body = instanceId ? JSON.stringify({ instanceId }) : undefined;
  const res = await fetch('/api/discovery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || err.message || 'Failed to discover monitors');
  }
  const data = await res.json();
  return Array.isArray(data) ? data : data.monitors ?? [];
}
