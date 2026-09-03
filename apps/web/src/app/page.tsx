import FeedList from '@/components/FeedList';
import type { FeedRow } from '@/components/FeedList';
import { getDb } from '@/lib/db';
import { trades, lawmakers, assets } from '@ftm/db';
import { desc, eq } from 'drizzle-orm';
import leaderboard from '@/data/leaderboard.json';

export const dynamic = 'force-dynamic';

interface PerfMeta {
  perf?: { raw_return: number; benchmark_return: number; excess_return: number; exit_date: string };
}

export default async function FeedPage() {
  const handle = getDb();
  if (!handle) {
    return (
      <div className="card p-8 text-center text-sm text-dim">
        Database not connected. Set <code>DATABASE_URL</code>, run <code>npm run db:push</code> +{' '}
        <code>npm run ingest</code>.
      </div>
    );
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
    .limit(500);

  const feedRows: FeedRow[] = rows.map((r) => {
    const meta = (r.options ?? {}) as PerfMeta;
    const { options, ...rest } = r as typeof r & Record<string, unknown>;
    void options;
    return {
      ...(rest as Omit<FeedRow, 'perf'>),
      perf: meta.perf
        ? {
            raw_return: meta.perf.raw_return,
            excess_return: meta.perf.excess_return,
            exit_date: meta.perf.exit_date,
          }
        : null,
    };
  });

  const totalTrades = leaderboard.members.reduce((s, m) => s + m.n, 0);

  return (
    <div>
      {/* Hero stats — Robinhood portfolio header vibe */}
      <div className="anim mb-6 rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[#101b16] to-[var(--bg-card)] p-5">
        <div className="text-xs font-medium uppercase tracking-wider text-dim">Tracked disclosure flow</div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-4xl font-bold">{totalTrades}</span>
          <span className="text-sm text-dim">published trades · {leaderboard.members.length} members · 528 tracked</span>
        </div>
        <div className="mt-3 flex gap-2">
          <a href="/sectors" className="rounded-lg bg-[#152219] px-3 py-1.5 text-xs font-semibold text-green transition-colors hover:bg-[#1a2c20]">
            Sector heat →
          </a>
          <a href="/transparency" className="rounded-lg bg-[#1c1c14] px-3 py-1.5 text-xs font-semibold text-gold transition-colors hover:bg-[#24241a]">
            Scorecard →
          </a>
        </div>
      </div>

      <FeedList rows={feedRows} />
    </div>
  );
}
