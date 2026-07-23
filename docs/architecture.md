# System Architecture

This document provides a high-level overview of the Uptime Tomcat Monitor architecture.

## Architecture Flow

The system runs a continuous cycle of scheduling tasks, polling external Tomcat instances, saving state to SQLite, and broadcasting changes to the frontend.

```mermaid
flowchart TD
    subgraph Backend
        Scheduler[Scheduler (setInterval)]
        Pinger[Tomcat Pinger / Health Checks]
        API[Express API Server]
        WS[WebSocket Broadcaster]
        DB[(SQLite DB)]
    end

    subgraph Frontend
        React[React Dashboard]
    end

    subgraph External
        Tomcat[Tomcat Instances]
    end

    Scheduler -->|Triggers| Pinger
    Pinger -->|Polls| Tomcat
    Pinger -->|Writes Results| DB
    Pinger -->|Notifies| WS
    
    API <-->|Reads/Writes| DB
    React <-->|HTTP Polling/REST| API
    WS -->|State Transitions| React
```

## Component Map

- `backend/` - The Express API, SQLite database connection, Drizzle ORM schemas, WebSocket broadcasting, and recurring status pollers.
- `my-react-app/` - The React 19 frontend application. Built with Vite, styled with Tailwind, state managed by Zustand, and charts rendered via Recharts.

## Data Flow Narrative

1. **Poll:** In-process schedulers (`setInterval`) trigger the monitoring services to query external Tomcat instances.
2. **Write:** Results from uptime checks, JVM metrics, and application discovery are written to the local SQLite database via Drizzle ORM.
3. **Broadcast:** If a state transition occurs (e.g., an app goes offline), the backend pushes the event via WebSocket to the React Dashboard. The frontend consumes this event to update its Zustand state and trigger UI re-renders, falling back to HTTP polling if disconnected.
