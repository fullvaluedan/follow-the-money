import { createHash } from 'node:crypto';

/**
 * Dedup fingerprint for trade rows within a filing.
 * Normalized so case/whitespace differences in source text don't create duplicates.
 */
export function tradeFingerprint(t: {
  tx_date: string;
  asset_name: string;
  trade_type: string;
  range_label: string;
  owner_type: string;
}): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const key = [
    t.tx_date,
    norm(t.asset_name),
    norm(t.trade_type),
    norm(t.range_label),
    norm(t.owner_type),
  ].join('|');
  return createHash('sha256').update(key).digest('hex');
}

/** Content hash for a filing document — used for idempotent ingestion. */
export function contentHash(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
