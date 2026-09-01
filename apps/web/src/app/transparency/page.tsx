import { getDb } from '@/lib/db';
import { lawmakers, trades } from '@ftm/db';
import { eq, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/** Transparency scorecard — neutral descriptive stats, Robinhood-style ranked list. */
export default async function TransparencyPage() {
  const handle = getDb();
  if (!handle) return <p className="py-20 text-center text-sm text-neutral-500">Database not connected.</p>;

  const stats = await handle.db
    .select({
      name: lawmakers.name,
      bioguide_id: lawmakers.bioguide_id,
      chamber: lawmakers.chamber,
      party: lawmakers.party,
      state: lawmakers.state,
      n_trades: sql<number>`count(${trades.id})`,
      avg_days_to_file: sql<string>`coalesce(round(avg(${trades.days_to_file})::numeric, 1), 0)`,
      late_count: sql<number>`count(*) filter (where ${trades.is_late})`,
    })
    .from(lawmakers)
    .leftJoin(trades, sql`${trades.lawmaker_id} = ${lawmakers.id} and ${trades.status} = 'published'`)
    .groupBy(lawmakers.id, lawmakers.name, lawmakers.bioguide_id, lawmakers.chamber, lawmakers.party, lawmakers.state)
    .having(sql`count(${trades.id}) > 0`);

  const ranked = [...stats].sort((a, b) => Number(b.avg_days_to_file) - Number(a.avg_days_to_file));
  const maxAvg = Math.max(1, ...ranked.map((r) => Number(r.avg_days_to_file)));

  return (
    <div className="mx-auto max-w-2xl">
      <div className="py-6 text-center">
        <h1 className="text-2xl font-bold">Disclosure Scorecard</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
          Average days between transaction and public filing under the STOCK Act 45-day window.
          Descriptive statistics only — they imply nothing about intent.
        </p>
      </div>

      {ranked.length === 0 ? (
        <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
          No published trades yet.
        </div>
      ) : (
        <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-100">
          {ranked.map((r, i) => {
            const avg = Number(r.avg_days_to_file);
            const overWindow = avg > 45;
            const lateRate = r.n_trades > 0 ? (r.late_count / r.n_trades) * 100 : 0;
            return (
              <a
                key={r.bioguide_id}
                href={`/lawmakers/${r.bioguide_id}`}
                className="flex items-center gap-4 bg-white px-4 py-3.5 hover:bg-neutral-50"
              >
                <div className="w-6 text-center text-sm font-bold text-neutral-300">{i + 1}</div>
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                    r.party === 'democrat' ? 'bg-blue-500' : r.party === 'republican' ? 'bg-red-500' : 'bg-neutral-400'
                  }`}
                >
                  {r.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{r.name}</div>
                  <div className="text-xs text-neutral-500">
                    {r.chamber === 'senate' ? 'Senate' : 'House'} · {r.state} · {r.n_trades} trade
                    {r.n_trades === 1 ? '' : 's'}
                  </div>
                  {/* lag bar: 45-day statutory window marked */}
                  <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className={`h-full rounded-full ${overWindow ? 'bg-red-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, (avg / maxAvg) * 100)}%` }}
                    />
                    <div
                      className="absolute top-0 h-full w-px bg-neutral-400"
                      style={{ left: `${Math.min(100, (45 / maxAvg) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-sm font-bold ${overWindow ? 'text-red-600' : 'text-emerald-600'}`}>
                    {avg}d
                  </div>
                  <div className="text-xs text-neutral-400">
                    {r.late_count > 0 ? `${lateRate.toFixed(0)}% late` : 'on time'}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-neutral-400">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> ≤ 45-day window</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> &gt; 45-day window</span>
      </div>
    </div>
  );
}
