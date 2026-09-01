/**
 * STOCK Act PTR amount brackets.
 *
 * PTR amounts are disclosed as range brackets, never exact notionals.
 * Never treat the midpoint as ground truth — it is a display convenience only.
 * Open-ended buckets ("Over $50,000,000") have max = null and open_ended_range = true.
 */

export interface Bracket {
  label: string;
  min: number | null;
  max: number | null;
  open_ended_range: boolean;
}

const BUCKETS: Array<[string, number | null, number | null]> = [
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

const OVER_50M = 'Over $50,000,000';

const LABEL_TO_BRACKET: Map<string, Bracket> = new Map(
  BUCKETS.map(([label, min, max]) => [
    label,
    { label, min, max, open_ended_range: false },
  ]),
);
LABEL_TO_BRACKET.set(OVER_50M, {
  label: OVER_50M,
  min: 50000001,
  max: null,
  open_ended_range: true,
});

/** Normalize whitespace inside a range label so "$1,001-$15,000" and "$1,001 - $15,000" both match. */
export function normalizeRangeLabel(raw: string): string {
  return raw
    .trim()
    .replace(/\s*[-–—]\s*/g, ' - ')
    .replace(/\s+/g, ' ');
}

/**
 * Resolve a disclosed range label to numeric bounds.
 * Returns null for unrecognized labels (caller decides whether that's a HITL flag).
 */
export function bracketFromLabel(rawLabel: string): Bracket | null {
  const label = normalizeRangeLabel(rawLabel);
  const exact = LABEL_TO_BRACKET.get(label);
  if (exact) return exact;
  if (/^over\s*\$?50,000,000$/i.test(label)) return LABEL_TO_BRACKET.get(OVER_50M)!;
  return null;
}

/** Midpoint of a bracket. Null when either bound is unknown. Display convenience only. */
export function bracketMidpoint(b: Bracket): number | null {
  if (b.min === null || b.max === null) return null;
  return Math.round((b.min + b.max) / 2);
}
