/**
 * Database connection module — initializes SQLite via better-sqlite3 with WAL mode and Drizzle ORM
 */
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

const dbPath = process.env.DATABASE_URL?.replace('sqlite://', '') || './data/uptime.db';

import fs from 'fs';
import path from 'path';
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });
export * from './schema';