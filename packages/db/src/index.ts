import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export function makeDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  return { db: drizzle(pool, { schema }), pool };
}

export * from './schema.js';
