const API_BASE = '/api';

export async function fetchLatestHealth() {
    const res = await fetch(`${API_BASE}/health/latest`);
    return res.json();
}

export async function fetchLatestJvm() {
    const res = await fetch(`${API_BASE}/jvm/latest`);
    return res.json();
}

export async function fetchDiscoveryCandidates() {
    const res = await fetch(`${API_BASE}/discovery/candidates`);
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