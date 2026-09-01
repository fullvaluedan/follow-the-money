import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHousePtr } from '../src/house.js';
import { parseSenatePtr } from '../src/senate.js';
import {
  mapHouseTypeCode,
  mapSenateTypeWord,
  mapOwner,
  parseUsDate,
  extractTickerFromName,
} from '../src/parse-helpers.js';
import type { FilingMeta } from '../src/types.js';

const fx = (name: string) => readFileSync(join(process.cwd(), '../../fixtures', name), 'utf8');

const houseMeta: FilingMeta = {
  chamber: 'house',
  source: 'house_clerk_yearly',
  external_doc_id: 'FTM-FIX-20012345',
  filed_at: '2024-03-01',
  source_url: 'https://disclosures-clerk.house.gov/example',
  raw_kind: 'pdf',
  filer: { printed_name: 'PELOSIS, NANCY', bioguide_id: 'P000197', state: 'CA', district: null },
};

const senateMeta: FilingMeta = {
  chamber: 'senate',
  source: 'senate_efd',
  external_doc_id: 'FTM-FIX-30012345',
  filed_at: '2024-02-20',
  source_url: 'https://efdsearch.senate.gov/example',
  raw_kind: 'pdf',
  filer: { printed_name: 'TESTER, JON', bioguide_id: 'T000250', state: 'MT', district: null },
};

describe('house adapter', () => {
  it('parses the multi-trade fixture into 3 typed rows', () => {
    const doc = parseHousePtr(fx('house_multitrade_2024.txt'), houseMeta);
    expect(doc.rows).toHaveLength(3);
    expect(doc.rows[0]).toMatchObject({
      asset_name: 'Microsoft Corp (MSFT)',
      ticker: 'MSFT',
      trade_type: 'purchase',
      tx_date: '2024-02-15',
      range_label: '$1,001 - $15,000',
      owner_type: 'filer',
    });
    expect(doc.rows[1].owner_type).toBe('spouse');
    expect(doc.rows[1].trade_type).toBe('sale');
  });

  it('parses open-ended range fixture', () => {
    const doc = parseHousePtr(fx('house_openended_2025.txt'), {
      ...houseMeta,
      external_doc_id: 'X2',
    });
    expect(doc.rows[0].range_label).toBe('Over $50,000,000');
  });

  it('parses no-ticker fixture with ticker null', () => {
    const doc = parseHousePtr(fx('house_noticker_2024.txt'), { ...houseMeta, external_doc_id: 'X3' });
    expect(doc.rows[0].ticker).toBeNull();
    expect(doc.rows[0].asset_name).toBe('NextEra Energy Inc');
  });
});

describe('senate adapter', () => {
  it('parses word-form types and joint owner', () => {
    const doc = parseSenatePtr(fx('senate_efd_2024.txt'), senateMeta);
    expect(doc.rows).toHaveLength(2);
    expect(doc.rows[0]).toMatchObject({
      trade_type: 'purchase',
      ticker: 'MSFT',
      owner_type: 'filer',
    });
    expect(doc.rows[1]).toMatchObject({
      trade_type: 'sale',
      owner_type: 'joint',
      ticker: 'COIN',
    });
  });

  it('handles unlisted/non-ticker assets', () => {
    const doc = parseSenatePtr(fx('senate_unlisted_2024.txt'), {
      ...senateMeta,
      external_doc_id: 'X4',
    });
    expect(doc.rows[0].ticker).toBeNull();
    expect(doc.rows[1].trade_type).toBe('purchase');
  });
});

describe('helpers', () => {
  it('maps type codes and words', () => {
    expect(mapHouseTypeCode('P')).toBe('purchase');
    expect(mapHouseTypeCode('S')).toBe('sale');
    expect(mapHouseTypeCode('E')).toBe('exchange');
    expect(mapHouseTypeCode('Z')).toBe('unknown');
    expect(mapSenateTypeWord('Sale (Full)')).toBe('sale');
    expect(mapSenateTypeWord('Sale (Partial)')).toBe('sale');
    expect(mapSenateTypeWord('Purchase')).toBe('purchase');
  });

  it('maps owners', () => {
    expect(mapOwner('')).toBe('filer');
    expect(mapOwner('Self')).toBe('filer');
    expect(mapOwner('Spouse')).toBe('spouse');
    expect(mapOwner('Joint')).toBe('joint');
    expect(mapOwner('Dependent Child')).toBe('dependent_child');
  });

  it('parses US dates and tickers', () => {
    expect(parseUsDate('02/15/2024')).toBe('2024-02-15');
    expect(parseUsDate('2/5/2024')).toBe('2024-02-05');
    expect(parseUsDate('2024-02-15')).toBeNull();
    expect(extractTickerFromName('Microsoft Corp (MSFT)')).toBe('MSFT');
    expect(extractTickerFromName('NextEra Energy Inc')).toBeNull();
  });
});
