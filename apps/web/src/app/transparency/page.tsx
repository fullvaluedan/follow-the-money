import { getDb } from '@/lib/db';
import { lawmakers, trades } from '@ftm/db';
import { eq, sql } from 'drizzle-orm';
import leaderboard from '@/data/leaderboard.json';

export const dynamic = 'force-dynamic';

/** Scorecard: performance leaderboard + disclosure-lag ranking. Neutral stats. */
export default async function TransparencyPage() {
  const handle = getDb();
  if (!handle) return <div className="card p-8 text-center text-sm text-dim">Database not connected.</div>;

  const lagStats = await handle.db
    .select({
      bioguide_id: lawmakers.bioguide_id,
      name: lawmakers.name,
      party: lawmakers.party,
      chamber: lawmakers.chamber,
      state: lawmakers.state,
      n_trades: sql<number>`count(${trades.id})`,
      avg_days_to_file: sql<string>`coalesce(round(avg(${trades.days_to_file})::numeric, 1), 0)`,
      late_count: sql<number>`count(*) filter (where ${trades.is_late})`,
    })
    .from(lawmakers)
    .leftJoin(trades, sql`${trades.lawmaker_id} = ${lawmakers.id} and ${trades.status} = 'published'`)
    .groupBy(lawmakers.id, lawmakers.name, lawmakers.bioguide_id, lawmakers.chamber, lawmakers.party, lawmakers.state)
    .having(sql`count(${trades.id}) > 0`);

  const byLag = [...lagStats].sort((a, b) => Number(b.avg_days_to_file) - Number(a.avg_days_to_file));
  const best = leaderboard.members.slice(0, 5);
  const worst = [...leaderboard.members].reverse().slice(0, 5);
  const maxAvg = Math.max(1, ...byLag.map((r) => Number(r.avg_days_to_file)));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="anim py-6 text-center">
        <h1 className="text-3xl font-bold">Scorecard</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-dim">
          Who&apos;s performing well (excess return since disclosed buys vs S&amp;P 500) and
          disclosure timing under the 45-day STOCK Act window. Descriptive statistics only.
        </p>
      </div>

      {/* Performance leaderboard */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card anim p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-green">
            <span className="h-2 w-2 rounded-full bg-green" /> Top excess returns
          </div>
          <div className="space-y-2">
            {best.map((m, i) => (
              <a key={m.bioguide_id} href={`/lawmakers/${m.bioguide_id}`} className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-[var(--bg-hover)]">
                <span className="w-4 text-xs font-bold text-dim">{i + 1}</span>
                <Avatar name={m.name} party={m.party} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{m.name}</div>
                  <div className="text-[11px] text-dim">{m.n} trades · {m.buys}B/{m.sells}S</div>
                </div>
                <div className={`text-sm font-bold ${m.avg_excess_return >= 0 ? 'text-green' : 'text-red'}`}>
                  {m.avg_excess_return >= 0 ? '+' : ''}
                  {m.avg_excess_return}%
                </div>
              </a>
            ))}
          </div>
        </div>

        <div className="card anim-1 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red">
            <span className="h-2 w-2 rounded-full bg-red" /> Underperforming S&amp;P
          </div>
          <div className="space-y-2">
            {worst.map((m, i) => (
              <a key={m.bioguide_id} href={`/lawmakers/${m.bioguide_id}`} className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-[var(--bg-hover)]">
                <span className="w-4 text-xs font-bold text-dim">{i + 1}</span>
                <Avatar name={m.name} party={m.party} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{m.name}</div>
                  <div className="text-[11px] text-dim">{m.n} trades · {m.buys}B/{m.sells}S</div>
                </div>
                <div className={`text-sm font-bold ${m.avg_excess_return >= 0 ? 'text-green' : 'text-red'}`}>
                  {m.avg_excess_return >= 0 ? '+' : ''}
                  {m.avg_excess_return}%
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Disclosure lag ranking */}
      <h2 className="mb-3 mt-8 px-1 text-sm font-bold uppercase tracking-wider text-gold">Disclosure lag</h2>
      <div className="card anim-2 divide-y divide-[var(--border)] overflow-hidden">
        {byLag.map((r) => {
          const avg = Number(r.avg_days_to_file);
          const over = avg > 45;
          const lateRate = Number(r.n_trades) > 0 ? (Number(r.late_count) / Number(r.n_trades)) * 100 : 0;
          return (
            <a key={r.bioguide_id} href={`/lawmakers/${r.bioguide_id}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]">
              <Avatar name={r.name} party={r.party} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{r.name}</div>
                <div className="text-[11px] text-dim">
                  {r.chamber === 'senate' ? 'Senate' : 'House'} · {r.state} · {r.n_trades} trade{Number(r.n_trades) === 1 ? '' : 's'}
                </div>
                <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#161d1b]">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${over ? 'bg-red' : 'bg-green'}`}
                    style={{ width: `${Math.min(100, (avg / maxAvg) * 100)}%` }}
                  />
                  <div className="absolute top-0 h-full w-px bg-gold/70" style={{ left: `${Math.min(100, (45 / maxAvg) * 100)}%` }} />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className={`text-sm font-bold ${over ? 'text-red' : 'text-green'}`}>{avg}d</div>
                <div className="text-[11px] text-dim">{Number(r.late_count) > 0 ? `${lateRate.toFixed(0)}% late` : 'on time'}</div>
              </div>
            </a>
          );
        })}
      </div>

      <p className="mt-6 text-center text-[11px] text-dim opacity-70">
        Gold marker = 45-day statutory window. Excess return = buy-date to today vs S&amp;P 500
        over the same window. Disclosed trades are not a portfolio; performance is attributed
        per-trade, not per-person wealth. Not financial advice.
      </p>
    </div>
  );
}

function Avatar({ name, party }: { name: string; party: string }) {
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
        party === 'democrat' ? 'bg-[#4a7dff]' : party === 'republican' ? 'bg-[#e6544f]' : 'bg-[#5a6b66]'
      }`}
    >
      {name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
    </div>
  );
}
