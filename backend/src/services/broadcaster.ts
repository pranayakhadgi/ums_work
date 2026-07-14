import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from "http";

let wss: WebSocketServer | null = null;

export function initWebSocket(server: Server): WebSocketServer {
  wss = new WebSocketServer({ server });

  wss.on("connection", (ws: WebSocket, req) => {
    console.log(`[ws] Client connected from ${req.socket.remoteAddress}`);

    ws.on("error", (err: Error) => {
      console.error("[ws] Client error:", err.message);
    });

    ws.on("close", () => {
      console.log("[ws] Client disconnected");
    });
  });

  console.log("[ws] WebSocket server initialized");
  return wss;
}

export function broadcast(data: unknown): void {
  if (!wss) return;

  const message = JSON.stringify(data);
  let sent = 0;

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      sent++;
    }
  });

  if (sent > 0) {
    const type =
      typeof data === "object" &&
      data !== null &&
      "type" in data
        ? (data as { type: string }).type
        : "unknown";

    console.log(`[ws] Broadcasted to ${sent} client(s):`, type);
  }
}