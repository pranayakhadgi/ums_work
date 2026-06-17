const BASE = '/api/monitors'; //grabs the api status, set to constant

export interface Monitor {
  id: string;
  name: string;
  url: string;
  environment: string;
  status: string;
  lastChecked: string | null;
  uptime7Days: number;
  uptime30Days: number;
  createdAt: string;
}

export async function fetchMonitors(): Promise<Monitor[]> {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error('Failed to fetch monitors');
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

export async function discoverMonitors(): Promise<Monitor[]> {
  const res = await fetch('/api/discover', { method: 'POST'});
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || 'Failed to discover monitors');
  }
  return res.json();
}