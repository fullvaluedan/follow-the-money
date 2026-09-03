// CLI: run live House ingestion (bounded batch)
import { ingestHouseLive } from './ingest-house-live.js';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL required'); process.exit(1); }
const maxFetch = Number(process.argv[2] ?? '15');
const year = process.argv[3] ?? String(new Date().getUTCFullYear());

console.error(JSON.stringify({ msg: 'live house ingest starting', maxFetch, year }));
const t0 = Date.now();
const res = await ingestHouseLive(url, { maxFetch, year });
console.log(JSON.stringify({ msg: 'live house ingest done', duration_ms: Date.now() - t0, ...res }));
