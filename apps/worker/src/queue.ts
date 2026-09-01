import { Queue, Worker } from 'bullmq';

/**
 * Queue scaffolding. When REDIS_URL is unset, callers execute jobs inline
 * (see cli.ts) so the pipeline works offline. Redis wiring activates in Phase 2.
 */
export function makeQueue(name: string) {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  return new Queue(name, { connection: { url } });
}

export function makeWorker(name: string, processor: () => Promise<unknown>) {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  return new Worker(name, processor, { connection: { url } });
}
