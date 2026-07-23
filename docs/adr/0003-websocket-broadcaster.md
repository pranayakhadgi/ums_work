# ADR 0003: WebSocket Broadcaster

Status: Accepted

Context: 
The React dashboard requires near-instant visibility of application state transitions (e.g., when a monitored endpoint goes from UP to DOWN). Relying solely on HTTP polling introduces latency and unnecessary network overhead on the server.

Decision: 
We will implement native WebSocket communication using the `ws` library, attached directly to the Express HTTP server, for broadcasting state changes to connected clients. 

Consequences:
- **Positive:** Enables a bidirectional communication channel (currently used primarily for server-to-client broadcasts).
- **Positive:** Near-zero latency for status transitions, providing a real-time dashboard experience.
- **Positive:** No sticky sessions are required since the application runs as a single instance.
- **Negative:** Requires the frontend to handle WebSocket connections, reconnects, and fall back to REST polling in case of persistent WS disconnections.
