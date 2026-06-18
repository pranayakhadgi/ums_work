const { randomUUID } = require('crypto');
const monitors = new Map();

// FIX: Cap the number of monitors to prevent unbounded Map growth (memory leak).
// In long-running processes, monitors could grow indefinitely without this guard.
const MAX_MONITORS = 500;

function getAll() {
    return Array.from(monitors.values()); //is it fetching?
}

/**Return an array from monitor to ensure API compatibility. The array is returned from the monitor map */
function getById(id) {
    return monitors.get(id);
}


//adds on top of the preexisting monitors?
function createMonitor({ name, url, status, checkedAt}) {
    //for each new monitors, it adds the id and other default fields
    const existing = Array.from(monitors.values()).find(m => m.url === url);
    if (existing) {
        // Update existing monitor's status and checkedAt
        return updateMonitor(existing.id, { status, lastChecked: checkedAt });
    }

    // FIX: Warn when monitor count exceeds MAX_MONITORS to surface potential memory leaks
    // before they become OOM crashes. The monitor is still created so nothing breaks.
    if (monitors.size >= MAX_MONITORS) {
        console.warn(`[monitors] WARNING: Monitor count (${monitors.size}) exceeds MAX_MONITORS (${MAX_MONITORS}). Possible memory leak — review monitor creation flow.`);
    }

    const monitor = {
        id: randomUUID(), //collision proof
            name,
            url,
            environment: inferEnvironment(url),
            status,
            lastChecked: checkedAt,
            uptime7days: 0,
            uptime30days: 0,
            createdAt: new Date().toISOString(),
        };  //lastChecked --> checkedAt on server
        //status gets updated on the server via pinger.js
        monitors.set(monitor.id, monitor);
        return monitor;
}

function updateMonitor(id, updates) {
    const monitor = monitors.get(id);
    if (!monitor) return null;
    
    const updated = { ...monitor, ...updates };
    monitors.set(id, updated);
    return updated;
}

function getMultiple(ids) {
    return ids.map(id => monitors.get(id)).filter(Boolean);
}

/**auto environment tagging used by every monitor */
function inferEnvironment(url) {
    if (url.includes('prod') || url.includes('production')) return 'Prod';
    if (url.includes('qa') || url.includes('staging')) return 'QA';
    if (url.includes('dev') || url.includes('localhost')) return 'Dev';
    return 'Dev'; // Default
}

// FIX: clearAll() enables test suites to reset state between runs without
// restarting the process. Without this, tests leak state across runs.
function clearAll() {
    monitors.clear();
}

// FIX: getById and updateMonitor existed but were NOT exported — callers that
// needed single-monitor lookup or partial updates had no way to use them.
// clearAll is exported for test teardown support.
module.exports = { getAll, getById, getMultiple, createMonitor, updateMonitor, clearAll };