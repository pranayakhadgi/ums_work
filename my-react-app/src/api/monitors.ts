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

export async function fetchMonitors(): Promise<Monitor[]> {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error('Failed to fetch monitors');
  const data = await res.json();
  return Array.isArray(data) ? data : data.monitors ?? [];
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

export async function discoverMonitors(): Promise<Monitor[]> {
  const res = await fetch('/api/discovery', { method: 'POST'});
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || err.message || 'Failed to discover monitors');
  }
  const data = await res.json();
  return Array.isArray(data) ? data : data.monitors ?? [];
}
