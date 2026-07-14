# Uptime Tomcat Monitor

A dashboard for monitoring the uptime and health of Tomcat-hosted applications.

## What it does

- Checks each registered endpoint on a schedule and records UP / DOWN / UNKNOWN status.
- Discovers apps running on Tomcat and lets you promote them to monitored status.
- Shows live status per monitor as a small trend line (health over recent checks), not just a static dot.
- Sorts monitors by severity — down first, then unknown, then stable — so problems surface immediately.
- Shows JVM and connector-level metrics (threads, memory, GC) for deeper investigation.
- Updates in real time over WebSocket; no manual refresh needed.

## Stack

- React 19 + TypeScript (frontend)
- Zustand (state)
- Recharts (charts)
- Node/Express-style backend with WebSocket broadcast (check `server/`)


## Project structure

```
src/
├── components/     # MonitorList, StatusRail, DiscoveryPanel, JvmMetrics, etc.
├── api/            # API client functions
└── store/          # Zustand stores
server/             # backend + WebSocket broadcaster
```

