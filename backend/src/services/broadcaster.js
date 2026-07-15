"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initWebSocket = initWebSocket;
exports.broadcast = broadcast;
const ws_1 = require("ws");
let wss = null;
function initWebSocket(server) {
    wss = new ws_1.WebSocketServer({ server });
    wss.on("connection", (ws, req) => {
        console.log(`[ws] Client connected from ${req.socket.remoteAddress}`);
        ws.on("error", (err) => {
            console.error("[ws] Client error:", err.message);
        });
        ws.on("close", () => {
            console.log("[ws] Client disconnected");
        });
    });
    console.log("[ws] WebSocket server initialized");
    return wss;
}
function broadcast(data) {
    if (!wss)
        return;
    const message = JSON.stringify(data);
    let sent = 0;
    wss.clients.forEach((client) => {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(message);
            sent++;
        }
    });
    if (sent > 0) {
        const type = typeof data === "object" &&
            data !== null &&
            "type" in data
            ? data.type
            : "unknown";
        console.log(`[ws] Broadcasted to ${sent} client(s):`, type);
    }
}
