const { WebSocketServer } = require('ws');

let wss = null;

function initWebSocket(server) {
  wss = new WebSocketServer({ server });
  
  wss.on('connection', (ws, req) => {
    console.log(`[ws] Client connected from ${req.socket.remoteAddress}`);
    ws.on('error', (err) => console.error('[ws] Client error:', err.message));
    ws.on('close', () => console.log('[ws] Client disconnected'));
  });
  
  console.log('[ws] WebSocket server initialized');
  return wss;
}

function broadcast(data) {
  if (!wss) return;
  const message = JSON.stringify(data);
  let sent = 0;
  
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
      sent++;
    }
  });
  
  if (sent > 0) {
    console.log(`[ws] Broadcasted to ${sent} client(s):`, data.type);
  }
}

module.exports = { initWebSocket, broadcast };