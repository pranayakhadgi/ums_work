import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export let db: any;

if (process.env.DATABASE_URL) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err) => {
    console.error('[db] Unexpected pool error:', err);
  });

  db = drizzle(pool, { schema });
} else {
  console.warn('[db] WARNING: DATABASE_URL environment variable is not defined. Database operations will be unavailable.');
  db = new Proxy({}, {
    get(target, prop) {
      if (prop === 'then') return undefined;
      return () => {
        throw new Error('Database is not configured. Please set DATABASE_URL in your environment.');
      };
    }
  });
}

export * from './schema';