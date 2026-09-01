/**
 * Policy Overlap Index (0–100) — deterministic weighted sum.
 *
 * Components (per brief):
 *  - committee jurisdiction tag overlap with issuer sector (max 40)
 *  - bills sponsored/cosponsored within tx_date ± 90 days mentioning issuer/industry (max 30)
 *  - USAspending awards to issuer/parent in prior 24 months (max 20)
 *  - same-committee hearing proximity (max 10)
 *
 * RULE: absence of data is not overlap — missing evidence contributes 0 and
 * the score stays low. This is statistical proximity, not an accusation.
 */

export const OVERLAP_WEIGHTS = {
  committee: 40,
  bills: 30,
  awards: 20,
  hearings: 10,
  billsWindowDays: 90,
  awardsWindowMonths: 24,
} as const;

export interface OverlapInput {
  committee_tags: string[]; // lawmaker committee jurisdiction tags
  issuer_sector_tags: string[]; // issuer GICS/NAICS-derived tags
  bills: Array<{ date: string; mentions_issuer: boolean }>; // sponsorship window candidates
  tx_date: string;
  awards_total_usd: number | null; // to issuer/parent, prior 24 months; null = no data
  hearing_same_committee: boolean | null; // null = no data
}

export interface OverlapResult {
  score: number; // 0–100 clamped
  components: {
    committee: number;
    bills: number;
    awards: number;
    hearings: number;
  };
  rationale: string;
}

/** Jaccard-style overlap of tag sets → 0..1. */
export function tagOverlap(a: string[], b: string[]): number {
  const sa = new Set(a.map((x) => x.toLowerCase().trim()));
  const sb = new Set(b.map((x) => x.toLowerCase().trim()));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / Math.min(sa.size, sb.size);
}

function daysBetween(a: string, b: string): number {
  return Math.abs(
    (new Date(a + 'T00:00:00Z').getTime() - new Date(b + 'T00:00:00Z').getTime()) / 86_400_000,
  );
}

export function policyOverlap(input: OverlapInput): OverlapResult {
  // 1. Committee × issuer sector overlap (max 40)
  const overlap01 = tagOverlap(input.committee_tags, input.issuer_sector_tags);
  const committee = Math.round(overlap01 * OVERLAP_WEIGHTS.committee);

  // 2. Bills in ±90d window mentioning issuer (max 30): 15 each, cap 30
  const inWindow = input.bills.filter(
    (b) => b.mentions_issuer && daysBetween(b.date, input.tx_date) <= OVERLAP_WEIGHTS.billsWindowDays,
  );
  const bills = Math.min(OVERLAP_WEIGHTS.bills, inWindow.length * 15);

  // 3. Awards (max 20): scaled log10; null data = 0 (absence is not overlap)
  const awards =
    input.awards_total_usd && input.awards_total_usd > 0
      ? Math.min(OVERLAP_WEIGHTS.awards, Math.round(Math.log10(input.awards_total_usd) * 3))
      : 0;

  // 4. Hearing proximity (max 10); null = 0
  const hearings = input.hearing_same_committee === true ? OVERLAP_WEIGHTS.hearings : 0;

  const raw = committee + bills + awards + hearings;
  const score = Math.max(0, Math.min(100, raw));

  const parts: string[] = [];
  const sharedTags = input.committee_tags.filter((t) =>
    input.issuer_sector_tags.some((s) => s.toLowerCase().trim() === t.toLowerCase().trim()),
  );
  const tagCite =
    sharedTags.length > 0 ? ` (shared: ${sharedTags.slice(0, 5).join(', ')})` : '';
  parts.push(`committee/sector tag overlap ${(overlap01 * 100).toFixed(0)}%${tagCite} → ${committee}/40`);
  parts.push(`${inWindow.length} issuer-mentioning bill(s) within ±90d → ${bills}/30`);
  parts.push(
    input.awards_total_usd == null
      ? `no federal award data → 0/20`
      : `awards $${Math.round(input.awards_total_usd).toLocaleString()} (24mo) → ${awards}/20`,
  );
  parts.push(
    input.hearing_same_committee == null
      ? `no hearing data → 0/10`
      : `same-committee hearing → ${hearings}/10`,
  );

  return {
    score,
    components: { committee, bills, awards, hearings },
    rationale: `Policy Overlap Index ${score}/100 (statistical proximity, not an accusation): ${parts.join('; ')}.`,
  };
}
