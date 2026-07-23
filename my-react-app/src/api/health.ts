const API_BASE = '/api';

/**
 * Build a query string that includes instanceId when provided.
 */
function instanceParam(instanceId?: string): string {
  return instanceId ? `?instanceId=${encodeURIComponent(instanceId)}` : '';
}

export async function fetchLatestHealth(instanceId?: string) {
    const res = await fetch(`${API_BASE}/health/latest${instanceParam(instanceId)}`);
    return res.json();
}

export async function fetchLatestJvm(instanceId?: string) {
    const res = await fetch(`${API_BASE}/jvm/latest${instanceParam(instanceId)}`);
    return res.json();
}

export async function fetchDiscoveryCandidates(instanceId?: string) {
    const res = await fetch(`${API_BASE}/discovery/candidates${instanceParam(instanceId)}`);
    return res.json();
}

export async function promoteToMonitor(app: { id: string; name: string; contextPath: string }) {
    const res = await fetch(`${API_BASE}/monitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: app.name || app.contextPath,
            discoveredAppId: app.id,
        }),
    });
    return res.json();
}