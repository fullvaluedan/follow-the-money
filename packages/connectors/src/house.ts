import type { FilingMeta, FilingsDocument, ParsedTradeRow } from './types.js';
import { mapHouseTypeCode, mapOwner, parseUsDate, extractTickerFromName } from './parse-helpers.js';
import { filingsDocumentSchema } from './types.js';

/**
 * House Clerk PTR adapter.
 *
 * Real House PTR documents are tables with columns:
 *   Owner | Asset | Transaction Type | Date | Amount
 * This parser handles the text/table layout faithfully; PDF rendering happens upstream.
 */

/** Parse one pipe-delimited table row. Returns null for non-row lines. */
function parseRow(line: string): ParsedTradeRow | null {
  const cells = line.split('|').map((c) => c.trim());
  // Row: [owner?, asset, type P/S/E, date, amount] — owner cell may be empty.
  // Header lines also have 5 cells but fail the type/date/amount checks below.
  if (cells.length < 5) return null;
  const [ownerCell, asset, typeCell, dateRaw, rangeRaw] = cells;
  if (!/^[PSE]$/i.test(typeCell)) return null;
  const txDate = parseUsDate(dateRaw);
  if (!txDate) return null;
  // Amount cell is either "$X - $Y" or "Over $X" (open-ended bucket).
  if (!rangeRaw.includes('$')) return null;
  return {
    owner_raw: ownerCell === '' ? 'Self' : ownerCell,
    asset_name: asset,
    ticker: extractTickerFromName(asset),
    trade_type_raw: typeCell.toUpperCase(),
    trade_type: mapHouseTypeCode(typeCell),
    tx_date: txDate,
    range_label: rangeRaw,
    owner_type: mapOwner(ownerCell),
    source_excerpt: line.trim().slice(0, 300),
  };
}

export function parseHousePtr(raw: string, meta: FilingMeta): FilingsDocument {
  const rows: ParsedTradeRow[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const row = parseRow(line);
    if (row) rows.push(row);
  }
  return filingsDocumentSchema.parse({
    chamber: 'house',
    source: meta.source,
    external_doc_id: meta.external_doc_id,
    filed_at: meta.filed_at,
    source_url: meta.source_url,
    raw_kind: meta.raw_kind,
    filer: meta.filer,
    rows,
  });
}
