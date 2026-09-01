import { describe, it, expect } from 'vitest';
import { bracketFromLabel, bracketMidpoint, normalizeRangeLabel } from '../src/brackets.js';

describe('bracket mapping', () => {
  const cases: Array<[string, number | null, number | null]> = [
    ['$1,001 - $15,000', 1001, 15000],
    ['$15,001 - $50,000', 15001, 50000],
    ['$50,001 - $100,000', 50001, 100000],
    ['$100,001 - $250,000', 100001, 250000],
    ['$250,001 - $500,000', 250001, 500000],
    ['$500,001 - $1,000,000', 500001, 1000000],
    ['$1,000,001 - $5,000,000', 1000001, 5000000],
    ['$5,000,001 - $25,000,000', 5000001, 25000000],
    ['$25,000,001 - $50,000,000', 25000001, 50000000],
  ];

  it.each(cases)('maps %s', (label, min, max) => {
    const b = bracketFromLabel(label);
    expect(b).not.toBeNull();
    expect(b!.min).toBe(min);
    expect(b!.max).toBe(max);
    expect(b!.open_ended_range).toBe(false);
  });

  it('detects open-ended Over $50,000,000', () => {
    const b = bracketFromLabel('Over $50,000,000');
    expect(b).not.toBeNull();
    expect(b!.open_ended_range).toBe(true);
    expect(b!.min).toBe(50000001);
    expect(b!.max).toBeNull();
  });

  it('normalizes dash and whitespace variants', () => {
    expect(normalizeRangeLabel('$1,001-$15,000')).toBe('$1,001 - $15,000');
    expect(bracketFromLabel('$1,001-$15,000')).not.toBeNull();
    expect(bracketFromLabel('  $50,001  -  $100,000 ')).not.toBeNull();
  });

  it('returns null for unknown labels', () => {
    expect(bracketFromLabel('$42')).toBeNull();
    expect(bracketFromLabel('a lot of money')).toBeNull();
  });

  it('midpoint only when both bounds known', () => {
    expect(bracketMidpoint(bracketFromLabel('$1,001 - $15,000')!)).toBe(8001); // rounded
    expect(bracketMidpoint(bracketFromLabel('Over $50,000,000')!)).toBeNull();
  });
});
