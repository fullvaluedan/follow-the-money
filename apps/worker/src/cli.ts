import { ingestOnce } from './ingest.js';

/**
 * One-shot ingest CLI. Works without Redis (direct execution);
 * with REDIS_URL set, a BullMQ worker wraps the same job (Phase 2 wiring).
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required. Set it in .env — see .env.example');
  process.exit(1);
}

console.error(JSON.stringify({ level: 'info', msg: 'one-shot ingest starting' }));
const t0 = Date.now();
const counts = await ingestOnce(url);
console.log(
  JSON.stringify({
    level: 'info',
    msg: 'ingest complete',
    duration_ms: Date.now() - t0,
    ...counts,
  }),
);
if (counts.errors.length > 0) {
  console.error(JSON.stringify({ level: 'warn', errors: counts.errors }));
  process.exit(2);
}
