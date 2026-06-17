async function pingServer(server) {
    const controller = AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
        const response = await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        return {
            status: response.ok ? 'UP' : 'DOWN',
            checkedAt: new Date().toISOString(),
        };
    } catch (error) {
        clearTimeout(timeoutId);
        return {
            status: 'DOWN',
            checkedAt: new Date().toISOString(),
        }
    }
}

module.exports = { pingUrl};


