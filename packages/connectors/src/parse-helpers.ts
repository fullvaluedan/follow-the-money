import type { ParsedTradeRow } from './types';

/**
 * Shared row-table parsing helpers. House PTR tables and Senate eFD exports
 * use similar column layouts; these helpers normalize the messy parts.
 */

/** House PTRs print type as single letter: P (purchase), S (sale), E (exchange). */
export function mapHouseTypeCode(code: string): 'purchase' | 'sale' | 'exchange' | 'unknown' {
  const c = code.trim().toUpperCase();
  if (c.startsWith('P')) return 'purchase';
  if (c.startsWith('S')) return 'sale';
  if (c.startsWith('E')) return 'exchange';
  return 'unknown';
}

/** Senate eFD prints words. */
export function mapSenateTypeWord(word: string): 'purchase' | 'sale' | 'exchange' | 'unknown' {
  const w = word.trim().toLowerCase();
  if (w.startsWith('purch') || w === 'buy') return 'purchase';
  if (w.startsWith('sale') || w === 'sell') return 'sale';
  if (w.startsWith('exch')) return 'exchange';
  return 'unknown';
}

/** Owner inference from the "owner" column text. */
export function mapOwner(raw: string): ParsedTradeRow['owner_type'] {
  const o = raw.trim().toLowerCase();
  if (o === '' || o.startsWith('self') || o === 'filer' || o === 'n/a') return 'filer';
  if (o.startsWith('spous')) return 'spouse';
  if (o.startsWith('joint')) return 'joint';
  if (o.includes('child') || o.includes('depend')) return 'dependent_child';
  return 'other';
}

/** Dates appear as MM/DD/YYYY in both portals. */
export function parseUsDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/** Try to pull a ticker out of an asset description like "Microsoft Corp (MSFT)". */
export function extractTickerFromName(assetName: string): string | null {
  const m = assetName.match(/\(([A-Z]{1,5})\)/);
  return m ? m[1] : null;
}
