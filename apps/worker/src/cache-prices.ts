// Populate price cache for all tickers in trades, plus benchmark.
import { makeDb } from '@ftm/db';
import { assets, trades } from '@ftm/db';
import { eq, min, max } from 'drizzle-orm';
import { cacheTickerPrices } from './prices.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const { db, pool } = makeDb(url);
try {
  const rows = await db
    .select({ ticker: assets.ticker, minTx: min(trades.tx_date), maxFiling: max(trades.filing_date) })
    .from(trades)
    .innerJoin(assets, eq(trades.asset_id, assets.id))
    .where(eq(trades.status, 'published'))
    .groupBy(assets.ticker);

  // pad range ±60 days for entry/exit flexibility
  const pad = (d: string, days: number) => {
    const x = new Date(d + 'T00:00:00Z');
    x.setUTCDate(x.getUTCDate() + days);
    return x.toISOString().slice(0, 10);
  };

  const tickers = rows.map((r) => r.ticker).filter((t): t is string => Boolean(t));
  const unique = [...new Set([...tickers, 'SPY'])]; // SPY as S&P 500 total-return proxy

  let ok = 0;
  let failed = 0;
  for (const t of unique) {
    const mine = rows.find((r) => r.ticker === t);
    const from = pad(mine?.minTx ?? '2024-01-01', -30);
    const to = pad(mine?.maxFiling ?? '2025-01-01', 400);
    try {
      const n = await cacheTickerPrices(url, t, from, to);
      console.log(JSON.stringify({ ticker: t, cached: n }));
      ok++;
      await new Promise((r) => setTimeout(r, 700)); // polite rate
    } catch (e) {
      console.error(JSON.stringify({ ticker: t, error: String(e).slice(0, 120) }));
      failed++;
    }
  }
  console.log(JSON.stringify({ msg: 'price cache done', ok, failed }));
} finally {
  await pool.end();
}
