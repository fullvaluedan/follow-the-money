import { describe, it, expect } from 'vitest';
import { extractedFilingSchema, needsHitl } from '../src/schema.js';
import type { ExtractedFiling } from '../src/schema.js';

const validFiling: ExtractedFiling = {
  parser_version: 'ptr_extract_v1',
  filing: {
    chamber: 'house',
    source_url: 'https://disclosures-clerk.house.gov/example',
    external_doc_id: '20012345',
    filed_at: '2024-03-01',
    raw_kind: 'pdf',
  },
  filer: { printed_name: 'PELOSIS, NANCY', bioguide_id: 'P000197', state: 'CA' },
  trades: [
    {
      asset_name: 'Microsoft Corp',
      ticker: 'MSFT',
      asset_type: 'stock',
      trade_type: 'purchase',
      tx_date: '2024-02-15',
      range_label: '$1,001 - $15,000',
      range_min: 1001,
      range_max: 15000,
      open_ended_range: false,
      owner_type: 'filer',
      options: null,
      confidence: { overall: 0.99, ticker: 0.99, tx_date: 0.99, range: 0.99 },
      source_excerpt: 'MSFT Purchase 02/15/2024 $1,001 - $15,000',
    },
  ],
  needs_hitl: false,
  hitl_reasons: [],
};

describe('extractor JSON schema', () => {
  it('accepts a valid document', () => {
    const r = extractedFilingSchema.safeParse(validFiling);
    expect(r.success).toBe(true);
  });

  it('rejects missing tx_date', () => {
    const bad = structuredClone(validFiling) as typeof validFiling;
    // @ts-expect-error intentionally deleting a required field
    delete bad.trades[0].tx_date;
    const r = extractedFilingSchema.safeParse(bad);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(JSON.stringify(r.error.issues)).toContain('tx_date');
    }
  });

  it('rejects malformed tx_date', () => {
    const bad = structuredClone(validFiling);
    bad.trades[0].tx_date = '02/15/2024';
    expect(extractedFilingSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects confidence out of range', () => {
    const bad = structuredClone(validFiling);
    bad.trades[0].confidence.overall = 1.5;
    expect(extractedFilingSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown chamber', () => {
    const bad = structuredClone(validFiling);
    (bad.filing as { chamber: string }).chamber = 'parliament';
    expect(extractedFilingSchema.safeParse(bad).success).toBe(false);
  });
});

describe('needsHitl', () => {
  const good = validFiling.trades[0];

  it('no HITL for high-confidence resolved trade', () => {
    expect(needsHitl(good)).toEqual({ needed: false, reasons: [] });
  });

  it('flags unresolved ticker', () => {
    const r = needsHitl({ ...good, ticker: null });
    expect(r.needed).toBe(true);
    expect(r.reasons).toContain('ticker_unresolved');
  });

  it('flags low confidence', () => {
    const r = needsHitl({ ...good, confidence: { ...good.confidence, overall: 0.5, ticker: 0.5 } });
    expect(r.reasons).toContain('low_overall_confidence');
    expect(r.reasons).toContain('low_ticker_confidence');
  });

  it('flags unrecognized range label', () => {
    const r = needsHitl({ ...good, range_label: '$lots' });
    expect(r.reasons).toContain('unrecognized_range_label');
  });
});
