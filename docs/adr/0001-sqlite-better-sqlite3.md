# ADR 0001: SQLite and better-sqlite3

Status: Accepted

Context: 
The Uptime Tomcat Monitor is a small internal tool used to monitor Tomcat instances. Given its role, deploying and maintaining a standalone database server (like PostgreSQL or a cloud-hosted DB) introduces unnecessary operational overhead and complexity. The tool needs to be self-contained with minimal external dependencies.

Decision: 
We will use SQLite as the data store, specifically via the `better-sqlite3` driver in Node.js. It operates synchronously, avoids the overhead of a separate database server process, and provides excellent performance for local file-based data storage.

Consequences:
- **Positive:** Zero external dependencies and no database deployment required. Lower cloud/hosting costs. The database is a single portable file.
- **Positive:** The `better-sqlite3` library is extremely fast and synchronous, simplifying the data access layer.
- **Negative:** Single-writer limitation. However, enabling Write-Ahead Logging (WAL) mode mitigates this by allowing concurrent read access during writes, which is well-suited for our scale.
