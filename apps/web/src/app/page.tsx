import Link from 'next/link';
import { getDb } from '@/lib/db';
import { trades, lawmakers, assets, stockPricesDaily } from '@ftm/db';
import { desc, eq, and, gte, asc } from 'drizzle-orm';
import FeedList from '@/components/FeedList';
import type { FeedRow } from '@/components/FeedList';
import { buildSparkline } from '@/lib/sparkline';
import lb from '@/data/leaderboard.json';

export const dynamic = 'force-dynamic';

interface PerfMeta {
  perf?: { raw_return: number | null; benchmark_return: number | null; excess_return: number | null; exit_date: string | null; window_days: number };
}

export default async function HomePage() {
  const handle = getDb();
  if (!handle) {
    return <div className="card p-8 text-center text-sm text-dim">Database not connected.</div>;
  }

  // 365-day window, server-side
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 365);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const rows = await handle.db
    .select({
      id: trades.id,
      tx_date: trades.tx_date,
      filing_date: trades.filing_date,
      days_to_file: trades.days_to_file,
      is_late: trades.is_late,
      trade_type: trades.trade_type,
      range_label: trades.range_label,
      range_min: trades.range_min,
      range_max: trades.range_max,
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
    .where(and(eq(trades.status, 'published'), gte(trades.tx_date, cutoffIso)))
    .orderBy(desc(trades.tx_date))
    .limit(400);

  const midOf = (r: { range_min: string | number | null; range_max: string | number | null }) =>
    r.range_min !== null && r.range_max !== null
      ? (Number(r.range_min) + Number(r.range_max)) / 2
      : 0;

  // sparklines for top-40 tickers by traded notional
  const notionalByTicker = new Map<string, number>();
  for (const r of rows) {
    if (!r.ticker) continue;
    notionalByTicker.set(r.ticker, (notionalByTicker.get(r.ticker) ?? 0) + midOf(r));
  }
  const topTickers = [...notionalByTicker.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([t]) => t);
  const seriesByTicker = new Map<string, { path: string; up: boolean } | null>();
  for (const tk of topTickers) {
    const pts = await handle.db
      .select({ date: stockPricesDaily.date, close: stockPricesDaily.adj_close })
      .from(stockPricesDaily)
      .where(and(eq(stockPricesDaily.ticker, tk), gte(stockPricesDaily.date, cutoffIso)))
      .orderBy(asc(stockPricesDaily.date));
    const clean = pts.filter((p) => p.close !== null).map((p) => ({ date: p.date, close: Number(p.close) }));
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
      perf:
        meta.perf && meta.perf.excess_return !== null
          ? { raw_return: meta.perf.raw_return ?? 0, excess_return: meta.perf.excess_return, exit_date: meta.perf.exit_date ?? '' }
          : null,
      spark: r.ticker ? (seriesByTicker.get(r.ticker) ?? null) : null,
    };
  });

  // ===== at-a-glance aggregates (365d) =====
  const totalNotional = feedRows.reduce((s, r) => s + midOf(r), 0);
  const sig = feedRows.filter((r) => midOf(r) >= 100_000); // significant trades
  const sigNotional = sig.reduce((s, r) => s + midOf(r), 0);
  const buys = feedRows.filter((r) => r.trade_type === 'purchase');
  const sells = feedRows.filter((r) => r.trade_type === 'sale');
  const buysNotional = buys.reduce((s, r) => s + midOf(r), 0);
  const sellsNotional = sells.reduce((s, r) => s + midOf(r), 0);
  const netFlow = buysNotional - sellsNotional;
  const lateCount = feedRows.filter((r) => r.is_late).length;

  const fmt = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`);
  const hotSectors = lb.sector_flow.slice(0, 3);
  const coldSector = lb.sector_flow[lb.sector_flow.length - 1];
  const maxSector = Math.max(...lb.sector_flow.map((s) => Math.abs(s.net)), 1);
  const top = lb.members.slice(0, 5);
  const active = [...lb.members].sort((a, b) => b.n - a.n).slice(0, 5);
  const selective = [...lb.members].sort((a, b) => a.n - b.n).slice(0, 5);
  const moves = lb.top_moves.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* ===== HERO: at a glance ===== */}
      <section className="anim overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[#0f1a14] via-[var(--bg-card)] to-[var(--bg-card)] p-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-dim">
          Last 365 days · {lb.cutoff} → today
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <div className="text-5xl font-extrabold tracking-tight">{fmt(totalNotional)}</div>
            <div className="text-xs text-dim">total disclosed volume</div>
          </div>
          <div>
            <div className={`text-3xl font-extrabold ${netFlow >= 0 ? 'text-green' : 'text-red'}`}>
              {netFlow >= 0 ? '+' : '−'}{fmt(Math.abs(netFlow))}
            </div>
            <div className="text-xs text-dim">net flow (buys − sells)</div>
          </div>
          <div>
            <div className="text-3xl font-extrabold text-gold">{sig.length}</div>
            <div className="text-xs text-dim">trades ≥ $100K ({fmt(sigNotional)})</div>
          </div>
          <div className="ml-auto text-right text-xs text-dim">
            <div><span className="font-bold text-white">{lb.members.length}</span> members trading</div>
            <div><span className="font-bold text-white">{lateCount}</span> late filings · <span className="font-bold text-white">528</span> tracked</div>
          </div>
        </div>
        {/* buy vs sell pressure bar */}
        <div className="mt-5">
          <div className="flex h-3 overflow-hidden rounded-full bg-[#161d1b]">
            <div className="bg-green transition-all duration-700" style={{ width: `${(buysNotional / (buysNotional + sellsNotional || 1)) * 100}%` }} />
            <div className="bg-red transition-all duration-700" style={{ width: `${(sellsNotional / (buysNotional + sellsNotional || 1)) * 100}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px]">
            <span className="font-bold text-green">▲ Buys {fmt(buysNotional)} ({buys.length})</span>
            <span className="text-dim">by dollar volume</span>
            <span className="font-bold text-red">Sells {fmt(sellsNotional)} ({sells.length}) ▼</span>
          </div>
        </div>
      </section>

      {/* ===== SECTOR FLOW STRIP ===== */}
      <section className="card anim-1 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-dim">What's moving — sector net flow</h2>
          <a href="/sectors" className="text-xs font-semibold text-green hover:underline">Full map →</a>
        </div>
        <div className="space-y-2.5">
          {[...hotSectors, coldSector].filter(Boolean).map((s) => {
            const up = s.net >= 0;
            return (
              <div key={s.sector} className="flex items-center gap-3">
                <span className="w-44 truncate text-sm font-medium">{s.sector}</span>
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[#161d1b]">
                  <div
                    className={`absolute top-0 h-full rounded-full transition-all duration-700 ${up ? 'left-1/2 bg-green' : 'right-1/2 bg-red'}`}
                    style={{ width: `${(Math.abs(s.net) / maxSector) * 50}%` }}
                  />
                  <div className="absolute left-1/2 top-0 h-full w-px bg-[#3a4a44]" />
                </div>
                <span className={`w-20 text-right text-sm font-bold ${up ? 'text-green' : 'text-red'}`}>
                  {up ? '+' : '−'}{fmt(Math.abs(s.net))}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== MOVES + PERFORMERS ===== */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card anim-2 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-dim">Biggest recent trades</h2>
            <span className="text-[10px] uppercase tracking-wide text-dim">$ size · days ago</span>
          </div>
          <div className="space-y-2.5">
            {moves.map((m) => (
              <Link key={m.trade_id} href={`/trades/${m.trade_id}`} className="flex items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-[var(--bg-hover)]">
                <span className="w-14 text-center font-mono text-xs font-bold text-gold">{m.ticker}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{m.lawmaker}</div>
                  <div className="text-[10px] text-dim">
                    {m.days_ago === 0 ? 'today' : m.days_ago === 1 ? 'yesterday' : `${m.days_ago}d ago`} · {m.sector ?? 'Other'}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-extrabold ${m.trade_id && m.excess !== null && m.excess >= 0 ? 'text-green' : 'text-red'}`}>
                    {m.excess !== null ? `${m.excess >= 0 ? '+' : ''}${m.excess.toFixed(0)}%` : '—'}
                  </div>
                  <div className="text-[10px] text-dim">{fmt(m.notional)}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="card anim-3 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-green">Who's performing well</h2>
            <Link href="/transparency" className="text-xs font-semibold text-green hover:underline">Scorecard →</Link>
          </div>
          <div className="space-y-2.5">
            {top.map((m, i) => (
              <Link key={m.bioguide_id} href={`/lawmakers/${m.bioguide_id}`} className="flex items-center gap-2.5 rounded-xl p-1 transition-colors hover:bg-[var(--bg-hover)]">
                <span className="w-3 text-xs font-bold text-dim">{i + 1}</span>
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${m.party === 'democrat' ? 'bg-[#4a7dff]' : m.party === 'republican' ? 'bg-[#e6544f]' : 'bg-[#5a6b66]'}`}>
                  {m.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{m.name}</div>
                  <div className="text-[10px] text-dim">{m.n} trades · {m.win_rate}% win · {fmt(m.total_notional)}</div>
                </div>
                <span className={`text-xs font-bold ${m.avg_excess_return >= 0 ? 'text-green' : 'text-red'}`}>
                  {m.avg_excess_return >= 0 ? '+' : ''}{m.avg_excess_return}%
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CADENCE ===== */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card anim-4 p-5">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wider text-white">High-frequency traders</h2>
          <p className="mb-3 text-[10px] text-dim">Most trades in the last year</p>
          <div className="space-y-2">
            {active.map((m) => (
              <Link key={m.bioguide_id} href={`/lawmakers/${m.bioguide_id}`} className="flex items-center gap-2.5 rounded-xl p-1 transition-colors hover:bg-[var(--bg-hover)]">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${m.party === 'democrat' ? 'bg-[#4a7dff]' : m.party === 'republican' ? 'bg-[#e6544f]' : 'bg-[#5a6b66]'}`}>
                  {m.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{m.name}</div>
                  <div className="text-[10px] text-dim">{m.buys}B / {m.sells}S · {fmt(m.total_notional)}</div>
                </div>
                <span className="text-xs font-bold">{m.n} trades</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="card anim-5 p-5">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wider text-white">Low-frequency traders</h2>
          <p className="mb-3 text-[10px] text-dim">Fewest, most deliberate trades</p>
          <div className="space-y-2">
            {selective.map((m) => (
              <Link key={m.bioguide_id} href={`/lawmakers/${m.bioguide_id}`} className="flex items-center gap-2.5 rounded-xl p-1 transition-colors hover:bg-[var(--bg-hover)]">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${m.party === 'democrat' ? 'bg-[#4a7dff]' : m.party === 'republican' ? 'bg-[#e6544f]' : 'bg-[#5a6b66]'}`}>
                  {m.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{m.name}</div>
                  <div className="text-[10px] text-dim">{m.buys}B / {m.sells}S · avg {m.avg_excess_return >= 0 ? '+' : ''}{m.avg_excess_return}%</div>
                </div>
                <span className="text-xs font-bold">{m.n} trades</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEED ===== */}
      <section>
        <h2 className="mb-3 px-1 text-sm font-bold uppercase tracking-wider text-dim">
          All trades — filter by size, direction, lateness
        </h2>
        <FeedList rows={feedRows} defaultSize="100k" />
      </section>

      <p className="pt-2 text-center text-[11px] text-dim opacity-70">
        All figures from public STOCK Act disclosures within the last 365 days. Dollar amounts are
        range midpoints, not exact values. Performance is per-trade vs S&amp;P 500 from trade date,
        not portfolio wealth. Not financial advice.
      </p>
    </div>
  );
}
