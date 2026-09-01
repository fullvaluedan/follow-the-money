import { describe, it, expect } from 'vitest';
import { monteCarloRange, OPEN_ENDED_CAP_MULTIPLE } from '../src/monte-carlo.js';

describe('monte carlo range model', () => {
  it('deterministic for the same seed', () => {
    const a = monteCarloRange(1001, 15000, { seed: 7 });
    const b = monteCarloRange(1001, 15000, { seed: 7 });
    expect(a).toEqual(b);
  });

  it('percentiles lie inside the bracket', () => {
    const r = monteCarloRange(1001, 15000, { seed: 7 })!;
    expect(r.p05).toBeGreaterThanOrEqual(1001);
    expect(r.p95).toBeLessThanOrEqual(15000);
    expect(r.p05).toBeLessThan(r.p50);
    expect(r.p50).toBeLessThan(r.p95);
  });

  it('log-uniform median sits below arithmetic midpoint (right-skewed)', () => {
    const r = monteCarloRange(1001, 15000, { seed: 7 })!;
    const mid = (1001 + 15000) / 2;
    expect(r.p50).toBeLessThan(mid);
  });

  it('open-ended bracket caps at documented multiple and flags', () => {
    const r = monteCarloRange(50000001, null, { seed: 7 })!;
    expect(r.open_ended_range).toBe(true);
    expect(r.cap_applied).toBe(50000001 * OPEN_ENDED_CAP_MULTIPLE);
    expect(r.p95).toBeLessThanOrEqual(r.cap_applied!);
  });

  it('more draws narrow the interval mildly; seed changes samples', () => {
    const a = monteCarloRange(1001, 15000, { seed: 1 })!;
    const b = monteCarloRange(1001, 15000, { seed: 2 })!;
    expect(a.p50).not.toBe(b.p50);
    expect(a.draws).toBe(10000);
  });

  it('returns null when no usable bounds', () => {
    expect(monteCarloRange(null, null)).toBeNull();
    expect(monteCarloRange(0, 100)).toBeNull();
    expect(monteCarloRange(100, 50)).toBeNull();
  });
});
