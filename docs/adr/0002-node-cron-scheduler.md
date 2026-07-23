# ADR 0002: setInterval-based Scheduler

Status: Accepted

Context: 
The monitoring system requires periodic polling at 30- to 60-second intervals for checking uptime monitors, Tomcat app discovery, and JVM health metrics. Initially, `node-cron` was considered, but external scheduling complexities or heavy libraries like BullMQ were overkill.

Decision: 
We will use an in-process `setInterval`-based scheduling system rather than a cron library or external job queue. The originally planned `node-cron` approach was simplified to `setInterval` to maintain tighter, simpler control over periodic tasks.

Consequences:
- **Positive:** No external scheduler dependency or heavy library overhead.
- **Positive:** Bounded concurrency can be managed natively (e.g., via `p-limit`).
- **Negative:** Task schedules only survive while the Node.js process is running.
- **Negative:** No built-in job persistence or retry queues. Missed polls will simply self-heal on the next interval tick, which is acceptable for status polling.
