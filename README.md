# Uptime Tomcat Monitor

A real-time dashboard for monitoring the uptime and health of Tomcat-hosted applications. Checks registered endpoints on a schedule, surfaces DOWN and degraded services immediately, and exposes JVM and connector-level metrics for deeper investigation.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Running Tests](#running-tests)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Live status** — checks each endpoint on a schedule and records `UP` / `DOWN` / `UNKNOWN`; pushes updates over WebSocket so the UI never needs a manual refresh.
- **Health scoring** — per-bucket 0–100 score derived from p95 latency, degraded-but-up rate, and down rate.
- **Trend chart** — stacked area chart showing up/down/unknown percentages over a configurable time window.
- **Compact monitor list** — grid-row layout with a per-endpoint SVG sparkline (last 10 checks), latency, and relative timestamps.
- **App discovery** — scans a Tomcat instance and lets you promote discovered apps to monitored status in one click.
- **Environment sidebar** — switch between named application contexts without leaving the dashboard.
- **JVM metrics** — threads, heap memory, and GC data for each connected Tomcat instance.
- **Severity sorting** — DOWN first, then UNKNOWN, then stable, so problems surface at the top immediately.

---

## Architecture

```
┌─────────────────────┐        WebSocket / REST        ┌──────────────────────┐
│   React 19 (Vite)   │ ◄──────────────────────────── │  Express + Node.js   │
│   TypeScript        │                                 │  TypeScript          │
│   Zustand · Recharts│                                 │  Drizzle ORM         │
└─────────────────────┘                                 │  better-sqlite3      │
                                                        │  node-cron           │
                                                        └──────────┬───────────┘
                                                                   │
                                                        ┌──────────▼───────────┐
                                                        │    SQLite (local)    │
                                                        │    uptime.db         │
                                                        └──────────────────────┘
```

The backend polls each registered monitor on a cron schedule, writes results to SQLite, and broadcasts status changes to all connected WebSocket clients. The frontend subscribes on load and falls back to HTTP polling when the socket is unavailable.

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 18 or later |
| npm | 9 or later |

No external services or cloud infrastructure required — SQLite runs locally.

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/pranayakhadgi/ums_work.git
cd ums_work
```

### 2. Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../my-react-app
npm install
```

### 3. Configure environment variables

```bash
cd backend
cp .env.example .env   # then edit as needed — see Configuration below
```

### 4. Run database migrations

```bash
cd backend
npm run db:migrate
```

### 5. Seed demo data (optional)

Generates 30 minutes of synthetic check history with a staged failure pattern so the dashboard has realistic data on first run. Safe to skip in production — the seeder skips automatically when live data is present.

```bash
npm run db:seed
```

### 6. Start the application

Open two terminals:

```bash
# Terminal 1 — backend (port 3001)
cd backend
npm run dev

# Terminal 2 — frontend (port 5173)
cd my-react-app
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

---

## Configuration

All backend configuration is in `backend/.env`.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP and WebSocket server port |
| `DB_PATH` | `./data/uptime.db` | Path to the SQLite database file |
| `MONITOR_INTERVAL_MS` | `30000` | How often each endpoint is checked (ms) |
| `TOMCAT_BASE_URL` | — | Base URL of the Tomcat Manager API for discovery |
| `TOMCAT_USER` | — | Tomcat Manager username |
| `TOMCAT_PASSWORD` | — | Tomcat Manager password |

---

## Project Structure

```
uptime-system-monitor-demo/
├── backend/
│   ├── src/
│   │   ├── db/             # Drizzle schema and client
│   │   ├── routes/         # Express route handlers (monitors, discovery, instances)
│   │   ├── services/       # Business logic (pinger, healthScore, scheduler)
│   │   └── server.ts       # Entry point, WebSocket broadcaster
│   ├── scripts/
│   │   ├── seed.ts         # Demo data generator
│   │   └── check-instance.ts
│   ├── drizzle/            # Migration SQL files
│   └── package.json
│
├── my-react-app/
│   └── src/
│       ├── components/     # UI components (MonitorList, HeartbeatChart, DiscoveryPanel, …)
│       ├── api/            # HTTP client functions and polling intervals
│       └── store/          # Zustand state stores (monitors, discovery)
│
└── docs/                   # Additional documentation
```

---

## API Reference

### Monitors

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/monitors` | List all monitors |
| `POST` | `/api/monitors` | Create a monitor |
| `PATCH` | `/api/monitors/:id/enable` | Enable or disable a monitor |
| `GET` | `/api/monitors/:id/history` | Recent check results for a monitor |
| `GET` | `/api/monitors/aggregate/health` | Bucketed health data across all monitors |

**`GET /api/monitors/aggregate/health` query params:**

| Param | Default | Description |
|---|---|---|
| `window` | `4` | Look-back period in hours (max 24) |
| `bucket` | `5` | Bucket width in minutes (max 60) |

### Discovery

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/discovery` | List discovered Tomcat apps |
| `POST` | `/api/discovery` | Trigger a new scan |
| `POST` | `/api/discovery/:id/promote` | Promote a discovered app to a monitor |

### Instances

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/instances` | List Tomcat instances and connector metrics |
| `GET` | `/api/instances/:id/jvm` | JVM metrics for a specific instance |

---

## Running Tests

```bash
cd backend
npm test
```

Tests use Node's built-in test runner (`node --test`). The `healthScore` service has unit test coverage in `src/services/healthScore.test.ts`.

---

## Contributing

1. Fork the repository and create a feature branch from `main`.
2. Make your changes and add or update tests where appropriate.
3. Run `npm test` and ensure all tests pass.
4. Open a pull request against `main` with a clear description of what changed and why.

---

## License

This project is licensed under the ISC License.
