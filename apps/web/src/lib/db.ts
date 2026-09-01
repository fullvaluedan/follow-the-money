import { makeDb } from '@ftm/db';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { lawmakers, trades, assets, filings, hitlReviewQueue } from '@ftm/db';

type Schema = {
  lawmakers: typeof lawmakers;
  trades: typeof trades;
  assets: typeof assets;
  filings: typeof filings;
  hitlReviewQueue: typeof hitlReviewQueue;
};

let cached: { db: NodePgDatabase<Schema>; pool: Pool } | null = null;

/** Shared DB handle for Server Components. Returns null when DATABASE_URL is unset. */
export function getDb(): { db: NodePgDatabase<Schema>; pool: Pool } | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!cached) {
    const pool = new Pool({ connectionString: url, max: 5 });
    cached = { db: makeDb(url).db as unknown as NodePgDatabase<Schema>, pool };
  }
  return cached;
}

export const FOOTER_DISCLAIMER =
  'Follow the Money is an educational and data-aggregation platform. Content does not constitute financial, investment, tax, or legal advice. Trade records come from public government disclosures. Amounts are disclosed as ranges, not exact values.';
