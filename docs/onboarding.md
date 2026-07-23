# Onboarding Guide

Welcome to the Uptime Tomcat Monitor! This guide provides the "First 30 minutes" path to get the project running locally.

## First 30 Minutes

1. **Read `README.md`** for an overview of the project and its goals.
2. **Configure Environment Variables:** 
   Copy the example environment files to create your own configuration.
   - In `backend/`: copy `.env.example` to `.env` and fill in the necessary Tomcat connection values.
   - In `my-react-app/`: copy `.env.example` to `.env`.
3. **Install Dependencies:**
   Run `npm install` at the root of the project. This project uses npm workspaces to handle dependencies for both `backend/` and `my-react-app/`.
4. **Migrate the Database:**
   Run `npm run db:migrate` from the root to set up the SQLite schema.
5. **Seed the Database:**
   Run `npm run db:seed` from the root to populate initial data.
6. **Start the Development Servers:**
   Run the backend and frontend simultaneously:
   - `npm run dev:backend` (runs the API on port 3001)
   - `npm run dev:frontend` (runs Vite on port 5173)
7. **Open the App:**
   Navigate to [http://localhost:5173](http://localhost:5173) in your browser.
8. **Deepen Your Context:**
   Read `docs/architecture.md` and the ADRs in `docs/adr/` to understand the architectural decisions.

## What to Read Next

To understand why certain tools were chosen over others, please review the Architecture Decision Records:
- [ADR 0001: SQLite and better-sqlite3](adr/0001-sqlite-better-sqlite3.md)
- [ADR 0002: setInterval-based Scheduler](adr/0002-node-cron-scheduler.md)
- [ADR 0003: WebSocket Broadcaster](adr/0003-websocket-broadcaster.md)
- [ADR 0004: Drizzle ORM](adr/0004-drizzle-orm.md)
