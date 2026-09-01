/**
 * Dual-window returns vs benchmark.
 *
 * Theoretical (insider) window: tx_date close → evaluation date.
 * Retail-copy window: first open on/after filing_date + 1 trading day, 10 bps entry slippage.
 *
 * Prices come from a simple PriceProvider interface — Phase 1 ships a synthetic
 * deterministic provider for tests; Polygon EOD provider lands with its API key.
 * These are trade-level statistics, not the member's portfolio.
 */

export const RETAIL_COPY_SLIPPAGE_BPS = 10;
export const RETAIL_COPY_DEFAULT_WINDOW_DAYS = 0; // hold to evaluation date unless overridden

export interface PricePoint {
  date: string; // YYYY-MM-DD
  close: number; // split/dividend adjusted close
}

export interface PriceProvider {
  /** Adjusted closes for [from, to] inclusive, ascending. Empty when unknown ticker/range. */
  closes(ticker: string, from: string, to: string): PricePoint[];
}

export interface WindowReturn {
  entry_date: string;
  exit_date: string;
  entry_price: number;
  exit_price: number;
  simple_return: number;
  benchmark_return: number;
  excess_return: number;
}

export interface DualWindowResult {
  theoretical: WindowReturn | null;
  retail_copy: WindowReturn | null;
  notes: string[];
}

/** First price point with date >= target. */
function firstOnOrAfter(points: PricePoint[], target: string): PricePoint | null {
  for (const p of points) if (p.date >= target) return p;
  return null;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function windowReturn(
  points: PricePoint[],
  bench: PricePoint[],
  entryDate: string,
  exitDate: string,
  entrySlippageBps = 0,
  notes: string[],
  label: string,
): WindowReturn | null {
  const entry = firstOnOrAfter(points, entryDate);
  const exit = firstOnOrAfter(points, exitDate);
  const benchEntry = firstOnOrAfter(bench, entryDate);
  const benchExit = firstOnOrAfter(bench, exitDate);
  if (!entry || !exit || !benchEntry || !benchExit) {
    notes.push(`${label}: insufficient price data for ${entryDate}→${exitDate}`);
    return null;
  }
  const slip = entrySlippageBps / 10_000;
  const entryPrice = entry.close * (1 + slip);
  const simple = exit.close / entryPrice - 1;
  const benchRet = benchExit.close / benchEntry.close - 1;
  return {
    entry_date: entry.date,
    exit_date: exit.date,
    entry_price: entryPrice,
    exit_price: exit.close,
    simple_return: simple,
    benchmark_return: benchRet,
    excess_return: simple - benchRet,
  };
}

export function dualWindowReturns(
  provider: PriceProvider,
  opts: {
    ticker: string;
    tx_date: string;
    filing_date: string;
    as_of: string;
    benchmark_ticker?: string; // e.g. '^SP500TR' — total return index
  },
): DualWindowResult {
  const notes: string[] = [];
  const prices = provider.closes(opts.ticker, opts.tx_date, opts.as_of);
  const bench = provider.closes(opts.benchmark_ticker ?? 'BENCHMARK', opts.tx_date, opts.as_of);

  const theoretical = windowReturn(prices, bench, opts.tx_date, opts.as_of, 0, notes, 'theoretical');

  // Retail: first session on/after filing + 1 day
  const retailEntryTarget = addDays(opts.filing_date, 1);
  const retail = windowReturn(prices, bench, retailEntryTarget, opts.as_of, RETAIL_COPY_SLIPPAGE_BPS, notes, 'retail_copy');

  return { theoretical, retail_copy: retail, notes };
}
