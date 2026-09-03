// Compute performance, leaderboards, sector flow, top moves — ALL within a 365-day window.
// Perf window: trade date → today, capped at 365d. Moves ranked by notional, not stale returns.
import { makeDb } from '@ftm/db';
import { assets, trades, lawmakers, stockPricesDaily } from '@ftm/db';
import { and, eq, gte, asc } from 'drizzle-orm';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL required'); process.exit(1); }

const WINDOW_DAYS = 365;
const cutoffDate = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - WINDOW_DAYS);
  return d.toISOString().slice(0, 10);
};
const CUTOFF = cutoffDate();
const TODAY = new Date().toISOString().slice(0, 10);

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'fixtures');
const sectorsAll: Record<string, Record<string, string>> = JSON.parse(
  readFileSync(join(fixturesDir, 'sectors.json'), 'utf8'),
);
const tickerSector: Record<string, string> = {};
for (const m of Object.values(sectorsAll)) for (const [tk, s] of Object.entries(m)) tickerSector[tk] = s;

const { db, pool } = makeDb(url);
try {
  const spy = await db
    .select({ date: stockPricesDaily.date, close: stockPricesDaily.adj_close })
    .from(stockPricesDaily)
    .where(eq(stockPricesDaily.ticker, 'SPY'))
    .orderBy(asc(stockPricesDaily.date));
  const spyPoints = spy.filter((r) => r.close !== null).map((r) => ({ date: r.date, close: Number(r.close) }));
  const spyOn = (target: string) => spyPoints.find((p) => p.date >= target) ?? null;

  // sector mapping onto assets
  for (const [tk, sector] of Object.entries(tickerSector)) {
    await db.update(assets).set({ gics_sector: sector }).where(eq(assets.ticker, tk));
  }

  // ONLY trades with tx_date within the window
  const rows = await db
    .select({
      id: trades.id,
      tx_date: trades.tx_date,
      filing_date: trades.filing_date,
      trade_type: trades.trade_type,
      range_min: trades.range_min,
      range_max: trades.range_max,
      range_label: trades.range_label,
      lawmaker_id: trades.lawmaker_id,
      options: trades.options,
      ticker: assets.ticker,
      sector: assets.gics_sector,
      lawmaker_name: lawmakers.name,
      bioguide_id: lawmakers.bioguide_id,
      party: lawmakers.party,
    })
    .from(trades)
    .innerJoin(assets, eq(trades.asset_id, assets.id))
    .innerJoin(lawmakers, eq(trades.lawmaker_id, lawmakers.id))
    .where(and(eq(trades.status, 'published'), gte(trades.tx_date, CUTOFF)));

  // asset price reader from cache
  const priceCache = new Map<string, Array<{ date: string; close: number }>>();
  const getCached = async (ticker: string) => {
    if (priceCache.has(ticker)) return priceCache.get(ticker)!;
    const pts = await db
      .select({ date: stockPricesDaily.date, close: stockPricesDaily.close })
      .from(stockPricesDaily)
      .where(and(eq(stockPricesDaily.ticker, ticker), gte(stockPricesDaily.date, CUTOFF)))
      .orderBy(asc(stockPricesDaily.date));
    const clean = pts.filter((p) => p.close !== null).map((p) => ({ date: p.date, close: Number(p.close) }));
    priceCache.set(ticker, clean);
    return clean;
  };

  const memberPerf = new Map<string, { rets: number[]; buys: number; sells: number; txs: string[]; notional: number }>();
  const sectorFlow = new Map<string, { buy: number; sell: number }>();
  const moves: Array<{
    trade_id: string; ticker: string; lawmaker: string; bioguide_id: string; party: string;
    sector: string | null; range: string; notional: number; excess: number | null; raw: number | null;
    tx_date: string; days_ago: number;
  }> = [];

  let computed = 0;
  for (const t of rows) {
    if (!t.ticker) continue;
    const series = await getCached(t.ticker);
    const entry = series.find((p) => p.date >= t.tx_date);
    const exit = series[series.length - 1];
    let rawRet: number | null = null;
    let benchRet: number | null = null;
    if (entry && exit && exit.date > entry.date) {
      rawRet = exit.close / entry.close - 1;
      const be = spyOn(t.tx_date);
      const bx = spyOn(exit.date);
      benchRet = be && bx ? bx.close / be.close - 1 : 0;
    }
    const dir = t.trade_type === 'purchase' ? 1 : t.trade_type === 'sale' ? -1 : 0;
    const mid = t.range_min && t.range_max ? (Number(t.range_min) + Number(t.range_max)) / 2 : null;
    const excess = rawRet !== null && benchRet !== null ? (rawRet - benchRet) * 100 : null;

    await db
      .update(trades)
      .set({
        options: {
          perf: {
            entry_date: entry?.date ?? null,
            exit_date: exit?.date ?? null,
            raw_return: rawRet !== null ? Number((rawRet * 100).toFixed(2)) : null,
            benchmark_return: benchRet !== null ? Number((benchRet * 100).toFixed(2)) : null,
            excess_return: excess !== null ? Number(excess.toFixed(2)) : null,
            window_days: WINDOW_DAYS,
          },
        },
      })
      .where(eq(trades.id, t.id));
    computed++;

    if (mid !== null && memberPerf.has(t.lawmaker_id) === false) {
      memberPerf.set(t.lawmaker_id, { rets: [], buys: 0, sells: 0, txs: [], notional: 0 });
    }
    const agg = memberPerf.get(t.lawmaker_id);
    if (agg && mid !== null) {
      agg.rets.push(excess !== null ? (dir !== 0 ? dir * excess : excess) : 0);
      agg.txs.push(t.tx_date);
      agg.notional += mid;
      if (t.trade_type === 'purchase') agg.buys++;
      if (t.trade_type === 'sale') agg.sells++;
    }

    if (mid !== null) {
      const sec = t.sector ?? 'Other';
      if (!sectorFlow.has(sec)) sectorFlow.set(sec, { buy: 0, sell: 0 });
      if (t.trade_type === 'purchase') sectorFlow.get(sec)!.buy += mid;
      else if (t.trade_type === 'sale') sectorFlow.get(sec)!.sell += mid;
    }

    if (mid !== null && mid >= 50000) {
      moves.push({
        trade_id: t.id, ticker: t.ticker!, lawmaker: t.lawmaker_name, bioguide_id: t.bioguide_id,
        party: t.party, sector: t.sector, range: t.range_label,
        notional: Math.round(mid), excess, raw: rawRet !== null ? Number((rawRet * 100).toFixed(2)) : null,
        tx_date: t.tx_date,
        days_ago: Math.round((Date.now() - new Date(t.tx_date + 'T00:00:00Z').getTime()) / 86400000),
      });
    }
  }

  const summary = [];
  for (const [lawmakerId, agg] of memberPerf) {
    const avgExcess = agg.rets.length ? agg.rets.reduce((s, x) => s + x, 0) / agg.rets.length : 0;
    const winRate = agg.rets.length ? (agg.rets.filter((r) => r > 0).length / agg.rets.length) * 100 : 0;
    const [lm] = await db
      .select({ biog_id: lawmakers.bioguide_id, name: lawmakers.name, party: lawmakers.party, chamber: lawmakers.chamber, state: lawmakers.state })
      .from(lawmakers)
      .where(eq(lawmakers.id, lawmakerId))
      .limit(1);
    const recent = agg.txs.sort().reverse()[0] ?? null;
    summary.push({
      bioguide_id: lm?.biog_id ?? null,
      name: lm?.name ?? 'Unknown',
      party: lm?.party ?? 'other',
      chamber: lm?.chamber ?? 'house',
      state: lm?.state ?? '',
      n: agg.rets.length,
      buys: agg.buys,
      sells: agg.sells,
      avg_excess_return: Number(avgExcess.toFixed(2)),
      win_rate: Number(winRate.toFixed(0)),
      total_notional: Math.round(agg.notional),
      last_trade_date: recent,
      cadence: agg.txs.length >= 5 ? 'active' : agg.txs.length <= 2 ? 'selective' : 'regular',
    });
  }
  summary.sort((a, b) => b.avg_excess_return - a.avg_excess_return);

  const flow = [...sectorFlow.entries()].map(([sector, v]) => ({ sector, ...v, net: v.buy - v.sell })).sort((a, b) => b.net - a.net);

  // Top moves: biggest notionals first, most recent wins ties
  moves.sort((a, b) => b.notional - a.notional || (a.days_ago - b.days_ago));

  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'web', 'src', 'data');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'leaderboard.json'),
    JSON.stringify({
      computed_at: new Date().toISOString(),
      window_days: WINDOW_DAYS,
      cutoff: CUTOFF,
      members: summary,
      sector_flow: flow,
      top_moves: moves.slice(0, 15),
    }, null, 1),
  );
  console.log(JSON.stringify({ msg: 'perf computed (365d)', trades: computed, members: summary.length, sectors: flow.length, bigMoves: moves.length }));
} finally {
  await pool.end();
}
