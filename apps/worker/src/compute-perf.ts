// Attach GICS sector to each asset (from fixtures/sectors.json) and compute
// per-trade performance using cached prices. Run after cache-prices.
import { makeDb } from '@ftm/db';
import { assets, trades, lawmakers, filings, stockPricesDaily } from '@ftm/db';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL required'); process.exit(1); }

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'fixtures');
const sectors: Record<string, Record<string, string>> = JSON.parse(
  readFileSync(join(fixturesDir, 'sectors.json'), 'utf8'),
);
// flatten: ticker → sector
const tickerSector: Record<string, string> = {};
for (const m of Object.values(sectors)) for (const [tk, s] of Object.entries(m)) tickerSector[tk] = s;

// benchmark series
const { db, pool } = makeDb(url);
try {
  const spy = await db
    .select({ date: stockPricesDaily.date, close: stockPricesDaily.adj_close })
    .from(stockPricesDaily)
    .where(eq(stockPricesDaily.ticker, 'SPY'))
    .orderBy(asc(stockPricesDaily.date));
  const spyPoints = spy.filter((r) => r.close !== null).map((r) => ({ date: r.date, close: Number(r.close) }));
  const spyOn = (target: string) => spyPoints.find((p) => p.date >= target) ?? null;

  // set asset sectors
  for (const [tk, sector] of Object.entries(tickerSector)) {
    await db.update(assets).set({ gics_sector: sector }).where(eq(assets.ticker, tk));
  }

  // per-trade performance
  const rows = await db
    .select({
      id: trades.id,
      tx_date: trades.tx_date,
      filing_date: trades.filing_date,
      trade_type: trades.trade_type,
      range_min: trades.range_min,
      range_max: trades.range_max,
      lawmaker_id: trades.lawmaker_id,
      ticker: assets.ticker,
      asset_id: assets.id,
    })
    .from(trades)
    .innerJoin(assets, eq(trades.asset_id, assets.id))
    .where(eq(trades.status, 'published'));

  let computed = 0;
  const memberPerf = new Map<string, { rets: number[]; buys: number; sells: number }>();
  const sectorFlow = new Map<string, { buy: number; sell: number }>();

  for (const t of rows) {
    if (!t.ticker) continue;
    const pts = await db
      .select({ date: stockPricesDaily.date, close: stockPricesDaily.adj_close })
      .from(stockPricesDaily)
      .where(and(eq(stockPricesDaily.ticker, t.ticker), gte(stockPricesDaily.date, t.tx_date), lte(stockPricesDaily.date, '2025-12-31')))
      .orderBy(asc(stockPricesDaily.date));
    const series = pts.filter((p) => p.close !== null).map((p) => ({ date: p.date, close: Number(p.close) }));
    if (series.length < 2) continue;
    const entry = series[0];
    const exit = series[series.length - 1];
    const rawRet = exit.close / entry.close - 1;
    const be = spyOn(t.tx_date);
    const bx = spyOn(exit.date);
    const benchRet = be && bx ? bx.close / be.close - 1 : 0;
    const excess = rawRet - benchRet;

    // store on the trade row via options jsonb (no schema change needed)
    await db
      .update(trades)
      .set({
        options: {
          perf: {
            entry_date: entry.date,
            exit_date: exit.date,
            entry_price: entry.close,
            exit_price: exit.close,
            raw_return: Number((rawRet * 100).toFixed(2)),
            benchmark_return: Number((benchRet * 100).toFixed(2)),
            excess_return: Number((excess * 100).toFixed(2)),
          },
        },
      })
      .where(eq(trades.id, t.id));
    computed++;

    // member aggregates
    const dir = t.trade_type === 'purchase' ? 1 : t.trade_type === 'sale' ? -1 : 0;
    if (!memberPerf.has(t.lawmaker_id)) memberPerf.set(t.lawmaker_id, { rets: [], buys: 0, sells: 0 });
    const agg = memberPerf.get(t.lawmaker_id)!;
    agg.rets.push(dir !== 0 ? dir * excess : excess);
    if (t.trade_type === 'purchase') agg.buys++;
    if (t.trade_type === 'sale') agg.sells++;

    // sector flow (midpoint notional)
    const mid = t.range_min && t.range_max ? (Number(t.range_min) + Number(t.range_max)) / 2 : null;
    if (mid) {
      const sec = tickerSector[t.ticker] ?? 'Other';
      if (!sectorFlow.has(sec)) sectorFlow.set(sec, { buy: 0, sell: 0 });
      if (t.trade_type === 'purchase') sectorFlow.get(sec)!.buy += mid;
      else if (t.trade_type === 'sale') sectorFlow.get(sec)!.sell += mid;
    }
  }

  // persist member aggregates to lawmakers via audit-free update of a jsonb column? Use options-free approach:
  // write a summary table row set in audit_log? Simplest: store in lawmakers via image_url? No.
  // → Return JSON to file for the API to read; DB view computes on demand later.
  const summary = [];
  for (const [lawmakerId, agg] of memberPerf) {
    const avgExcess = agg.rets.reduce((s, x) => s + x, 0) / agg.rets.length;
    const [lm] = await db.select({ bioguide_id: lawmakers.bioguide_id, name: lawmakers.name, party: lawmakers.party, chamber: lawmakers.chamber, state: lawmakers.state }).from(lawmakers).where(eq(lawmakers.id, lawmakerId)).limit(1);
    summary.push({ ...lm, n: agg.rets.length, buys: agg.buys, sells: agg.sells, avg_excess_return: Number(avgExcess.toFixed(2)) });
  }
  summary.sort((a, b) => b.avg_excess_return - a.avg_excess_return);
  const flow = [...sectorFlow.entries()].map(([sector, v]) => ({ sector, ...v, net: v.buy - v.sell })).sort((a, b) => b.net - a.net);

  const { writeFileSync } = await import('node:fs');
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'web', 'src', 'data');
  writeFileSync(join(outDir, 'leaderboard.json'), JSON.stringify({ computed_at: new Date().toISOString(), members: summary, sector_flow: flow }, null, 1));
  console.log(JSON.stringify({ msg: 'performance computed', trades: computed, members: summary.length, sectors: flow.length }));
} finally {
  await pool.end();
}
