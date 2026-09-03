// CLI: run live Senate ingestion (bounded batch)
import { ingestSenateLive } from './ingest-senate-live.js';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL required'); process.exit(1); }
const maxReports = Number(process.argv[2] ?? '20');

console.error(JSON.stringify({ msg: 'live senate ingest starting', maxReports }));
const t0 = Date.now();
const res = await ingestSenateLive(url, { maxReports });
console.log(JSON.stringify({ msg: 'live senate ingest done', duration_ms: Date.now() - t0, ...res }));
