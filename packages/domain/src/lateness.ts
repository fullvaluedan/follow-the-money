import type { Bracket } from './brackets';

import { bracketFromLabel } from './brackets';

export { bracketFromLabel, bracketMidpoint, normalizeRangeLabel } from './brackets';
export type { Bracket } from './brackets';

/** STOCK Act 45-day statutory disclosure window. Versioned so future rule changes are traceable. */
export const RULE_STOCK_ACT_45D = 'stock-act-45d-v1';

/** Calendar days between tx and filing (filing - tx). Documented choice: calendar, not business days. */
export function daysToFile(txDate: string, filingDate: string): number {
  const tx = new Date(txDate + 'T00:00:00Z');
  const filing = new Date(filingDate + 'T00:00:00Z');
  if (Number.isNaN(tx.getTime()) || Number.isNaN(filing.getTime())) {
    throw new Error(`invalid date: tx=${txDate} filing=${filingDate}`);
  }
  return Math.round((filing.getTime() - tx.getTime()) / 86_400_000);
}

/** Statutory window is 45 days; day 46+ is late. */
export function isLate(days: number): boolean {
  return days > 45;
}

export function latenessFor(txDate: string, filingDate: string): {
  days_to_file: number;
  is_late: boolean;
  rule_version: string;
} {
  const d = daysToFile(txDate, filingDate);
  return { days_to_file: d, is_late: isLate(d), rule_version: RULE_STOCK_ACT_45D };
}

export interface CanonicalTrade {
  asset_name: string;
  ticker: string | null;
  asset_type: string;
  trade_type: string;
  tx_date: string;
  filing_date: string;
  range_label: string;
  range_min: number | null;
  range_max: number | null;
  open_ended_range: boolean;
  owner_type: string;
  options: Record<string, unknown> | null;
  source_excerpt?: string;
}

export function buildCanonicalTrade(partial: {
  asset_name: string;
  ticker?: string | null;
  asset_type: string;
  trade_type: string;
  tx_date: string;
  filing_date: string;
  range_label: string;
  owner_type: string;
  options?: Record<string, unknown> | null;
  source_excerpt?: string;
}): CanonicalTrade & { days_to_file: number; is_late: boolean } {
  const bracket: Bracket | null = bracketFromLabel(partial.range_label);
  if (!bracket) {
    throw new Error(`unrecognized range label: "${partial.range_label}"`);
  }
  const lateness = latenessFor(partial.tx_date, partial.filing_date);
  return {
    asset_name: partial.asset_name,
    ticker: partial.ticker ?? null,
    asset_type: partial.asset_type,
    trade_type: partial.trade_type,
    tx_date: partial.tx_date,
    filing_date: partial.filing_date,
    range_label: bracket.label,
    range_min: bracket.min,
    range_max: bracket.max,
    open_ended_range: bracket.open_ended_range,
    owner_type: partial.owner_type,
    options: partial.options ?? null,
    source_excerpt: partial.source_excerpt,
    days_to_file: lateness.days_to_file,
    is_late: lateness.is_late,
  };
}
