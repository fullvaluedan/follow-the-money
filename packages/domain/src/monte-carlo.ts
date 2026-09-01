/**
 * Range model: Monte Carlo over disclosed brackets.
 *
 * Default prior: log-uniform over [min, max] (documented per brief).
 * Open-ended buckets: cap at a documented multiple of the lower bound, flag open_ended.
 * Never present a single number as "portfolio size" — always p05/p50/p95.
 */

export interface MonteCarloResult {
  p05: number;
  p50: number;
  p95: number;
  mean: number;
  draws: number;
  open_ended_range: boolean;
  cap_applied: number | null;
}

/** Deterministic PRNG (mulberry32) so results are reproducible for a given seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Documented cap for open-ended buckets: 4× lower bound. */
export const OPEN_ENDED_CAP_MULTIPLE = 4;

/**
 * Draw `draws` samples log-uniform over [min, max], return percentiles.
 * Deterministic for a given seed. Returns null when the bracket has no numeric bounds.
 */
export function monteCarloRange(
  rangeMin: number | null,
  rangeMax: number | null,
  opts: { draws?: number; seed?: number; openEndedCapMultiple?: number } = {},
): MonteCarloResult | null {
  const draws = opts.draws ?? 10_000;
  const capMultiple = opts.openEndedCapMultiple ?? OPEN_ENDED_CAP_MULTIPLE;

  if (rangeMin === null || rangeMin <= 0) return null;

  const openEnded = rangeMax === null;
  const max = openEnded ? rangeMin * capMultiple : rangeMax;

  if (max === null || max <= rangeMin) return null;

  const rand = mulberry32(opts.seed ?? 42);
  const lnMin = Math.log(rangeMin);
  const lnMax = Math.log(max);

  const samples = new Array<number>(draws);
  for (let i = 0; i < draws; i++) {
    const u = rand();
    samples[i] = Math.exp(lnMin + u * (lnMax - lnMin));
  }
  samples.sort((a, b) => a - b);

  const pct = (q: number) => samples[Math.min(draws - 1, Math.floor(q * draws))];
  return {
    p05: pct(0.05),
    p50: pct(0.5),
    p95: pct(0.95),
    mean: samples.reduce((s, x) => s + x, 0) / draws,
    draws,
    open_ended_range: openEnded,
    cap_applied: openEnded ? max : null,
  };
}
