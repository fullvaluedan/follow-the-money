import { describe, it, expect } from 'vitest';
import { daysToFile, isLate, latenessFor, RULE_STOCK_ACT_45D } from '../src/lateness.js';

describe('45-day late flag', () => {
  it('day 0 (same day) is not late', () => {
    expect(daysToFile('2024-03-01', '2024-03-01')).toBe(0);
    expect(isLate(0)).toBe(false);
  });

  it('day 45 is not late (statutory window inclusive)', () => {
    expect(daysToFile('2024-01-15', '2024-02-29')).toBe(45);
    expect(isLate(45)).toBe(false);
  });

  it('day 46 is late', () => {
    expect(daysToFile('2024-01-15', '2024-03-01')).toBe(46);
    expect(isLate(46)).toBe(true);
  });

  it('crosses year boundary correctly', () => {
    expect(daysToFile('2023-12-31', '2024-01-01')).toBe(1);
  });

  it('rejects invalid dates', () => {
    expect(() => daysToFile('not-a-date', '2024-01-01')).toThrow();
  });

  it('carries rule version', () => {
    expect(latenessFor('2024-01-01', '2024-03-01').rule_version).toBe(RULE_STOCK_ACT_45D);
    expect(RULE_STOCK_ACT_45D).toBe('stock-act-45d-v1');
  });
});
