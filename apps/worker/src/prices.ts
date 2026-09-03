/**
 * Yahoo Finance price provider (no API key) + DB persistence.
 * Pulls daily closes for a ticker range, caches into stock_prices_daily.
 * Free/unofficial — documented as Phase 2 stopgap until Polygon key lands.
 */
import { makeDb } from '@ftm/db';
import { stockPricesDaily } from '@ftm/db';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { PricePoint } from '@ftm/domain';

const YAHOO_HOST = 'query1.finance.yahoo.com';

export async function fetchYahooCloses(
  ticker: string,
  from: string,
  to: string,
): Promise<PricePoint[]> {
  const p1 = Math.floor(new Date(from + 'T00:00:00Z').getTime() / 1000) - 86400;
  const p2 = Math.floor(new Date(to + 'T00:00:00Z').getTime() / 1000) + 86400;
  const url = `https://${YAHOO_HOST}/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${p1}&period2=${p2}&interval=1d&events=div%2Csplit`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  });
  if (!res.ok) throw new Error(`yahoo ${ticker}: HTTP ${res.status}`);
  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: (number | null)[] }> };
      }>;
    };
  };
  const r = json.chart?.result?.[0];
  if (!r?.timestamp) return [];
  const closes = r.indicators?.quote?.[0]?.close ?? [];
  const out: PricePoint[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const c = closes[i];
    if (c == null) continue;
    out.push({ date: new Date(r.timestamp[i] * 1000).toISOString().slice(0, 10), close: c });
  }
  return out;
}

/** Persist closes for one ticker; returns rows written. */
export async function cacheTickerPrices(
  databaseUrl: string,
  ticker: string,
  from: string,
  to: string,
): Promise<number> {
  const { db, pool } = makeDb(databaseUrl);
  try {
    const points = await fetchYahooCloses(ticker, from, to);
    let n = 0;
    for (const p of points) {
      await db
        .insert(stockPricesDaily)
        .values({ ticker, date: p.date, close: String(p.close), adj_close: String(p.close) })
        .onConflictDoNothing();
      n++;
    }
    return n;
  } finally {
    await pool.end();
  }
}

/** Read cached closes. */
export async function readCachedCloses(
  databaseUrl: string,
  ticker: string,
  from: string,
  to: string,
): Promise<PricePoint[]> {
  const { db, pool } = makeDb(databaseUrl);
  try {
    const rows = await db
      .select({ date: stockPricesDaily.date, close: stockPricesDaily.adj_close })
      .from(stockPricesDaily)
      .where(
        and(
          eq(stockPricesDaily.ticker, ticker),
          gte(stockPricesDaily.date, from),
          lte(stockPricesDaily.date, to),
        ),
      )
      .orderBy(asc(stockPricesDaily.date));
    return rows
      .filter((r) => r.close !== null)
      .map((r) => ({ date: r.date, close: Number(r.close) }));
  } finally {
    await pool.end();
  }
}

export { YAHOO_HOST };
