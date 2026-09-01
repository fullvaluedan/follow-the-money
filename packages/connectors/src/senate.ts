import type { FilingMeta, FilingsDocument, ParsedTradeRow } from './types.js';
import {
  mapSenateTypeWord,
  mapOwner,
  parseUsDate,
  extractTickerFromName,
} from './parse-helpers.js';
import { filingsDocumentSchema } from './types.js';

/**
 * Senate eFD PTR adapter.
 *
 * Senate eFD records use word-form transaction types ("Purchase", "Sale (Full)", "Sale (Partial)")
 * and an owner column ("Self", "Spouse", "Joint"). Layout differs from House; separate adapter,
 * same canonical output.
 */

const TYPE_RE = /^(Purchase|Sale|Exchange)(\s*\([^)]*\))?$/i;

function parseRow(line: string): ParsedTradeRow | null {
  const cells = line.split('|').map((c) => c.trim());
  if (cells.length < 5) return null;
  const [ownerCell, asset, typeCell, dateRaw, rangeRaw] = cells;
  if (!TYPE_RE.test(typeCell)) return null;
  const txDate = parseUsDate(dateRaw);
  if (!txDate) return null;
  // Amount cell is either "$X - $Y" or "Over $X" (open-ended bucket).
  if (!rangeRaw.includes('$')) return null;
  return {
    owner_raw: ownerCell === '' ? 'Self' : ownerCell,
    asset_name: asset,
    ticker: extractTickerFromName(asset),
    trade_type_raw: typeCell,
    trade_type: mapSenateTypeWord(typeCell),
    tx_date: txDate,
    range_label: rangeRaw,
    owner_type: mapOwner(ownerCell),
    source_excerpt: line.trim().slice(0, 300),
  };
}

export function parseSenatePtr(raw: string, meta: FilingMeta): FilingsDocument {
  const rows: ParsedTradeRow[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const row = parseRow(line);
    if (row) rows.push(row);
  }
  return filingsDocumentSchema.parse({
    chamber: 'senate',
    source: meta.source,
    external_doc_id: meta.external_doc_id,
    filed_at: meta.filed_at,
    source_url: meta.source_url,
    raw_kind: meta.raw_kind,
    filer: meta.filer,
    rows,
  });
}
