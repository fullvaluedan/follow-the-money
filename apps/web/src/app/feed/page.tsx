import FeedList from '@/components/FeedList';
import type { FeedRow } from '@/components/FeedList';
import { getDb } from '@/lib/db';
import { trades, lawmakers, assets, stockPricesDaily } from '@ftm/db';
import { desc, eq, and, gte, asc } from 'drizzle-orm';
import { buildSparkline } from '@/lib/sparkline';
import lb from '@/data/leaderboard.json';

export const dynamic = 'force-dynamic';

interface PerfMeta {
  perf?: { raw_return: number; benchmark_return: number; excess_return: number; exit_date: string };
}

export default async function HomePage() {
  const handle = getDb();
  if (!handle) {
    return <div className="card p-8 text-center text-sm text-dim">Database not connected.</div>;
  }

  const rows = await handle.db
    .select({
      id: trades.id,
      tx_date: trades.tx_date,
      filing_date: trades.filing_date,
      days_to_file: trades.days_to_file,
      is_late: trades.is_late,
      trade_type: trades.trade_type,
      range_label: trades.range_label,
      owner_type: trades.owner_type,
      lawmaker_name: lawmakers.name,
      bioguide_id: lawmakers.bioguide_id,
      party: lawmakers.party,
      chamber: lawmakers.chamber,
      ticker: assets.ticker,
      asset_name: assets.name,
      sector: assets.gics_sector,
      options: trades.options,
    })
    .from(trades)
    .innerJoin(lawmakers, eq(trades.lawmaker_id, lawmakers.id))
    .innerJoin(assets, eq(trades.asset_id, assets.id))
    .where(eq(trades.status, 'published'))
    .orderBy(desc(trades.tx_date))
    .limit(80);

  // sparkline data: one series per distinct ticker (cached in this render)
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 180);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const tickers = [...new Set(rows.map((r) => r.ticker).filter((t): t is string => Boolean(t)))];
  const seriesByTicker = new Map<string, { path: string; up: boolean } | null>();
  for (const tk of tickers.slice(0, 40)) {
    const pts = await handle.db
      .select({ date: stockPricesDaily.date, close: stockPricesDaily.adj_close })
      .from(stockPricesDaily)
      .where(and(eq(stockPricesDaily.ticker, tk), gte(stockPricesDaily.date, cutoffIso)))
      .orderBy(asc(stockPricesDaily.date));
    const clean = pts.filter((p) => p.close !== null).map((p) => ({ date: p.date, close: Number(p.close) }));
    // weekly sampling to keep sparklines readable
    const weekly = clean.filter((_, i) => i % 5 === 0 || i === clean.length - 1);
    const spark = buildSparkline(weekly.length >= 2 ? weekly : clean, 72, 28);
    seriesByTicker.set(tk, spark ? { path: spark.path, up: spark.up } : null);
  }

  const feedRows: FeedRow[] = rows.map((r) => {
    const meta = (r.options ?? {}) as PerfMeta;
    const { options, ...rest } = r as typeof r & Record<string, unknown>;
    void options;
    return {
      ...(rest as Omit<FeedRow, 'perf' | 'spark'>),
      perf: meta.perf
        ? { raw_return: meta.perf.raw_return, excess_return: meta.perf.excess_return, exit_date: meta.perf.exit_date }
        : null,
      spark: r.ticker ? (seriesByTicker.get(r.ticker) ?? null) : null,
    };
  });

  const totalNotional = lb.sector_flow.reduce((s, f) => s + f.buy + f.sell, 0);
  void totalNotional;

  return <FeedList rows={feedRows} />;
}
