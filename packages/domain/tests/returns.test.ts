import { describe, it, expect } from 'vitest';
import { dualWindowReturns, RETAIL_COPY_SLIPPAGE_BPS, addDays } from '../src/returns.js';
import type { PriceProvider, PricePoint } from '../src/returns.js';

/** Deterministic synthetic provider: closes rise 1%/day for the ticker, flat benchmark. */
function makeProvider(): PriceProvider {
  const series = (start: number, drift: number) => (from: string, to: string): PricePoint[] => {
    const out: PricePoint[] = [];
    let d = new Date(from + 'T00:00:00Z');
    const end = new Date(to + 'T00:00:00Z');
    let price = start;
    while (d <= end) {
      // skip weekends
      const day = d.getUTCDay();
      if (day !== 0 && day !== 6) {
        out.push({ date: d.toISOString().slice(0, 10), close: price });
        price *= 1 + drift;
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  };
  return {
    closes(ticker, from, to) {
      if (ticker === 'MSFT') return series(100, 0.01)(from, to);
      if (ticker === 'BENCHMARK') return series(1000, 0.0005)(from, to);
      return [];
    },
  };
}

const base = {
  ticker: 'MSFT',
  tx_date: '2024-02-15', // Thursday
  filing_date: '2024-03-01', // Friday
  as_of: '2024-04-01',
};

describe('dual-window returns', () => {
  it('theoretical window enters on tx_date, no slippage', () => {
    const r = dualWindowReturns(makeProvider(), base);
    expect(r.theoretical).not.toBeNull();
    expect(r.theoretical!.entry_date).toBe('2024-02-15');
    expect(r.theoretical!.entry_price).toBe(100);
    expect(r.theoretical!.simple_return).toBeGreaterThan(0);
    expect(r.theoretical!.excess_return).toBeGreaterThan(0); // drift > benchmark drift
  });

  it('retail window enters on/after filing+1 with 10bps slippage', () => {
    const r = dualWindowReturns(makeProvider(), base);
    expect(r.retail_copy).not.toBeNull();
    expect(r.retail_copy!.entry_date).toBe('2024-03-04'); // Sat → Monday
    const expectEntry = 100 * 1.01 ** 12 * (1 + RETAIL_COPY_SLIPPAGE_BPS / 10_000);
    expect(r.retail_copy!.entry_price).toBeCloseTo(expectEntry, 5);
    // retail window is shorter → smaller simple return than theoretical
    expect(r.retail_copy!.simple_return).toBeLessThan(r.theoretical!.simple_return);
  });

  it('unknown ticker yields null windows with notes, never throws', () => {
    const r = dualWindowReturns(makeProvider(), { ...base, ticker: 'NOPE' });
    expect(r.theoretical).toBeNull();
    expect(r.retail_copy).toBeNull();
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it('addDays crosses months correctly', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });
});
