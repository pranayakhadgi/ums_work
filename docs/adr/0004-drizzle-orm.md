# ADR 0004: Drizzle ORM

Status: Accepted

Context: 
We require a type-safe database querying mechanism for SQLite that works seamlessly with TypeScript. Traditional ORMs like Prisma involve heavy runtimes and code generation steps, while raw SQL lacks strong typing and compile-time checks.

Decision: 
We will use Drizzle ORM with the `better-sqlite3` driver. Drizzle provides schema-as-code and acts as a lightweight, type-safe abstraction over SQL without requiring a dedicated compilation/codegen step.

Consequences:
- **Positive:** Full TypeScript type safety for database schema and queries.
- **Positive:** No background codegen or heavy runtime overhead compared to Prisma.
- **Positive:** Built-in migration file generation via `drizzle-kit`.
- **Negative:** Smaller community ecosystem and plugin availability compared to mature alternatives like Prisma or TypeORM.
