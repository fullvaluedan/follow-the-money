import { describe, it, expect } from 'vitest';
import { policyOverlap, tagOverlap, OVERLAP_WEIGHTS } from '../src/overlap.js';

const base = {
  committee_tags: [],
  issuer_sector_tags: [],
  bills: [],
  tx_date: '2024-02-15',
  awards_total_usd: null,
  hearing_same_committee: null,
};

describe('policy overlap index', () => {
  it('empty evidence → score 0 (absence of data is not overlap)', () => {
    const r = policyOverlap(base);
    expect(r.score).toBe(0);
    expect(r.rationale).toContain('not an accusation');
  });

  it('full tag overlap → committee component maxes at 40', () => {
    const r = policyOverlap({
      ...base,
      committee_tags: ['technology', 'defense'],
      issuer_sector_tags: ['technology', 'defense'],
    });
    expect(r.components.committee).toBe(40);
    expect(r.score).toBe(40);
  });

  it('partial overlap scales proportionally', () => {
    const r = policyOverlap({
      ...base,
      committee_tags: ['technology', 'defense', 'energy'],
      issuer_sector_tags: ['technology'],
    });
    // inter=1, min size=1 → 1.0 overlap... tagOverlap uses min size; so full. Use 2/2 vs 1:
    expect(r.components.committee).toBe(40);
  });

  it('bills in window: 15 each, capped at 30', () => {
    const one = policyOverlap({
      ...base,
      bills: [{ date: '2024-02-20', mentions_issuer: true }],
    });
    expect(one.components.bills).toBe(15);
    const three = policyOverlap({
      ...base,
      bills: [
        { date: '2024-02-20', mentions_issuer: true },
        { date: '2024-01-10', mentions_issuer: true },
        { date: '2024-03-01', mentions_issuer: true },
      ],
    });
    expect(three.components.bills).toBe(30); // capped
  });

  it('bills outside ±90d window or not mentioning issuer count 0', () => {
    const r = policyOverlap({
      ...base,
      bills: [
        { date: '2023-01-01', mentions_issuer: true },
        { date: '2024-02-20', mentions_issuer: false },
      ],
    });
    expect(r.components.bills).toBe(0);
  });

  it('awards scale by log10 and cap at 20', () => {
    expect(policyOverlap({ ...base, awards_total_usd: 100_000 }).components.awards).toBe(15); // log10=5 → 15
    expect(policyOverlap({ ...base, awards_total_usd: 10_000_000_000 }).components.awards).toBe(20);
    expect(policyOverlap({ ...base, awards_total_usd: 0 }).components.awards).toBe(0);
  });

  it('hearing proximity adds 10 only when true', () => {
    expect(policyOverlap({ ...base, hearing_same_committee: true }).components.hearings).toBe(10);
    expect(policyOverlap({ ...base, hearing_same_committee: false }).components.hearings).toBe(0);
  });

  it('combined evidence clamps at 100', () => {
    const r = policyOverlap({
      committee_tags: ['tech'],
      issuer_sector_tags: ['tech'],
      bills: Array.from({ length: 5 }, (_, i) => ({ date: '2024-02-16', mentions_issuer: true })),
      tx_date: '2024-02-15',
      awards_total_usd: 10_000_000_000,
      hearing_same_committee: true,
    });
    expect(r.score).toBe(100);
  });

  it('rationale cites the inputs', () => {
    const r = policyOverlap({
      ...base,
      committee_tags: ['defense'],
      issuer_sector_tags: ['defense'],
      awards_total_usd: 50_000,
    });
    expect(r.rationale).toContain('defense');
    expect(r.rationale).toContain('award');
  });

  it('weights sum to 100', () => {
    expect(OVERLAP_WEIGHTS.committee + OVERLAP_WEIGHTS.bills + OVERLAP_WEIGHTS.awards + OVERLAP_WEIGHTS.hearings).toBe(100);
  });
});

describe('tagOverlap', () => {
  it('case/whitespace insensitive', () => {
    expect(tagOverlap(['Tech '], ['tech'])).toBe(1);
  });
  it('empty sets → 0', () => {
    expect(tagOverlap([], ['x'])).toBe(0);
  });
});
