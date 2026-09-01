import { describe, it, expect } from 'vitest';
import { tradeFingerprint, contentHash } from '../src/fingerprint.js';

const base = {
  tx_date: '2024-02-15',
  asset_name: 'Microsoft Corp',
  trade_type: 'purchase',
  range_label: '$1,001 - $15,000',
  owner_type: 'filer',
};

describe('dedup fingerprint', () => {
  it('identical input → identical hash', () => {
    expect(tradeFingerprint(base)).toBe(tradeFingerprint({ ...base }));
  });

  it('invariant under case/whitespace differences', () => {
    expect(tradeFingerprint(base)).toBe(
      tradeFingerprint({
        ...base,
        asset_name: '  microsoft   CORP ',
        trade_type: ' Purchase ',
      }),
    );
  });

  it('differs on date', () => {
    expect(tradeFingerprint(base)).not.toBe(tradeFingerprint({ ...base, tx_date: '2024-02-16' }));
  });

  it('differs on asset', () => {
    expect(tradeFingerprint(base)).not.toBe(tradeFingerprint({ ...base, asset_name: 'Apple Inc' }));
  });

  it('differs on trade type', () => {
    expect(tradeFingerprint(base)).not.toBe(tradeFingerprint({ ...base, trade_type: 'sale' }));
  });

  it('differs on range', () => {
    expect(tradeFingerprint(base)).not.toBe(
      tradeFingerprint({ ...base, range_label: '$15,001 - $50,000' }),
    );
  });

  it('differs on owner', () => {
    expect(tradeFingerprint(base)).not.toBe(tradeFingerprint({ ...base, owner_type: 'spouse' }));
  });

  it('content hash is stable sha256 of bytes', () => {
    expect(contentHash('hello')).toBe(contentHash('hello'));
    expect(contentHash('hello')).not.toBe(contentHash('hellp'));
  });
});
