import Link from 'next/link';
import { getDb } from '@/lib/db';
import { trades, lawmakers, assets } from '@ftm/db';
import { desc, eq, sql } from 'drizzle-orm';
import FeedList from '@/components/FeedList';
import type { FeedRow } from '@/components/FeedList';
import lb from '@/data/leaderboard.json';

export const dynamic = 'force-dynamic';

const fmtK = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}K`;

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
    .limit(400);

  const feedRows: FeedRow[] = rows.map((r) => {
    const meta = (r.options ?? {}) as PerfMeta;
    const { options, ...rest } = r as typeof r & Record<string, unknown>;
    void options;
    return {
      ...(rest as Omit<FeedRow, 'perf'>),
      perf: meta.perf
        ? { raw_return: meta.perf.raw_return, excess_return: meta.perf.excess_return, exit_date: meta.perf.exit_date }
        : null,
    };
  });

  const totalNotional = lb.sector_flow.reduce((s, f) => s + f.buy + f.sell, 0);
  const buysCount = rows.filter((r) => r.trade_type === 'purchase').length;
  const sellsCount = rows.filter((r) => r.trade_type === 'sale').length;
  const lateCount = rows.filter((r) => r.is_late).length;
  const hotSectors = lb.sector_flow.slice(0, 3);
  const coldSector = lb.sector_flow[lb.sector_flow.length - 1];
  const top = lb.members.slice(0, 5);
  const activeTraders = [...lb.members].sort((a, b) => b.n - a.n).slice(0, 5);
  const selective = [...lb.members].filter((m) => m.cadence === 'selective').slice(0, 5);
  const moves = lb.top_moves.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* ===== Hero ===== */}
      <section className="anim overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[#0f1a14] via-[var(--bg-card)] to-[var(--bg-card)] p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-dim">
              Congressional disclosure flow · live ledger
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-5xl font-extrabold tracking-tight">{fmtK(totalNotional)}</span>
              <span className="text-sm text-dim">estimated traded volume</span>
            </div>
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <div className="text-2xl font-bold text-green">{rows.length}</div>
              <div className="text-[11px] uppercase tracking-wide text-dim">trades</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{lb.members.length}</div>
              <div className="text-[11px] uppercase tracking-wide text-dim">members</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gold">528</div>
              <div className="text-[11px] uppercase tracking-wide text-dim">tracked</div>
            </div>
          </div>
        </div>
        {/* buy/sell split bar */}
        <div className="mt-5">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-[#161d1b]">
            <div className="bg-green transition-all duration-700" style={{ width: `${(buysCount / (buysCount + sellsCount || 1)) * 100}%` }} />
            <div className="bg-red transition-all duration-700" style={{ width: `${(sellsCount / (buysCount + sellsCount || 1)) * 100}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-dim">
            <span><span className="font-bold text-green">{buysCount} buys</span></span>
            <span>{lateCount} late filings</span>
            <span><span className="font-bold text-red">{sellsCount} sells</span></span>
          </div>
        </div>
      </section>

      {/* ===== Row: Sector flow + Top movers ===== */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Sector heat mini */}
        <div className="card anim-1 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-dim">Sector flow</h2>
            <Link href="/sectors" className="text-xs font-semibold text-green hover:underline">Full map →</Link>
          </div>
          <div className="space-y-3">
            {hotSectors.map((s) => (
              <div key={s.sector}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{s.sector}</span>
                  <span className="font-bold text-green">+{fmtK(s.net)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#161d1b]">
                  <div className="h-full rounded-full bg-green/80" style={{ width: `${(s.net / (hotSectors[0].net || 1)) * 100}%` }} />
                </div>
              </div>
            ))}
            {coldSector && coldSector.net < 0 && (
              <div>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{coldSector.sector}</span>
                  <span className="font-bold text-red">−{fmtK(Math.abs(coldSector.net))}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#161d1b]">
                  <div className="h-full rounded-full bg-red/80" style={{ width: `${(Math.abs(coldSector.net) / (hotSectors[0].net || 1)) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Biggest moves */}
        <div className="card anim-2 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-dim">Biggest moves</h2>
            <span className="text-[10px] uppercase tracking-wide text-dim">excess vs S&amp;P</span>
          </div>
          <div className="space-y-2.5">
            {moves.map((m) => (
              <Link key={m.trade_id} href={`/trades/${m.trade_id}`} className="flex items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-[var(--bg-hover)]">
                <span className="w-12 text-center font-mono text-xs font-bold text-gold">{m.ticker}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{m.lawmaker}</div>
                  <div className="text-[10px] text-dim">{m.range} · {m.sector}</div>
                </div>
                <span className={`text-sm font-bold ${m.excess >= 0 ? 'text-green' : 'text-red'}`}>
                  {m.excess >= 0 ? '+' : ''}{m.excess.toFixed(0)}%
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Row: Who's killing it / Most active / Selective ===== */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card anim-3 p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-green">Killing it</h2>
          <div className="space-y-2.5">
            {top.map((m, i) => (
              <Link key={m.bioguide_id} href={`/lawmakers/${m.bioguide_id}`} className="flex items-center gap-2.5 rounded-xl p-1 transition-colors hover:bg-[var(--bg-hover)]">
                <span className="w-3 text-xs font-bold text-dim">{i + 1}</span>
                <Avatar name={m.name} party={m.party} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{m.name}</div>
                  <div className="text-[10px] text-dim">{m.n} trades · {m.win_rate}% win</div>
                </div>
                <span className="text-xs font-bold text-green">+{m.avg_excess_return}%</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card anim-4 p-5">
          <h2 className="mb-4 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-white">
            Most active <span className="rounded bg-[#1c2a22] px-1.5 py-0.5 text-[9px] font-bold text-green">HIGH FREQUENCY</span>
          </h2>
          <div className="space-y-2.5">
            {activeTraders.map((m) => (
              <Link key={m.bioguide_id} href={`/lawmakers/${m.bioguide_id}`} className="flex items-center gap-2.5 rounded-xl p-1 transition-colors hover:bg-[var(--bg-hover)]">
                <Avatar name={m.name} party={m.party} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{m.name}</div>
                  <div className="text-[10px] text-dim">{m.buys}B / {m.sells}S</div>
                </div>
                <span className="text-xs font-bold">{m.n} trades</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card anim-5 p-5">
          <h2 className="mb-4 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-white">
            Selective <span className="rounded bg-[#2a2416] px-1.5 py-0.5 text-[9px] font-bold text-gold">LOW FREQUENCY</span>
          </h2>
          <div className="space-y-2.5">
            {selective.map((m) => (
              <Link key={m.bioguide_id} href={`/lawmakers/${m.bioguide_id}`} className="flex items-center gap-2.5 rounded-xl p-1 transition-colors hover:bg-[var(--bg-hover)]">
                <Avatar name={m.name} party={m.party} />
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

      {/* ===== Latest trades feed ===== */}
      <section className="anim-5">
        <h2 className="mb-3 px-1 text-sm font-bold uppercase tracking-wider text-dim">Latest trades</h2>
        <FeedList rows={feedRows} />
      </section>

      <p className="pt-2 text-center text-[11px] text-dim opacity-70">
        All figures derive from public STOCK Act disclosures. Amounts are range midpoints, not
        exact values. Performance is per-trade vs S&amp;P 500, not portfolio wealth, and implies
        nothing about intent. Not financial advice.
      </p>
    </div>
  );
}

function Avatar({ name, party }: { name: string; party: string }) {
  return (
    <div
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
        party === 'democrat' ? 'bg-[#4a7dff]' : party === 'republican' ? 'bg-[#e6544f]' : 'bg-[#5a6b66]'
      }`}
    >
      {name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
    </div>
  );
}
