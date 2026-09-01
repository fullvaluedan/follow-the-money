import { getDb } from '@/lib/db';
import { lawmakers, trades } from '@ftm/db';
import { sql as psql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * Transparency scorecard — neutral descriptive stats only.
 * Copy rule: "Disclosure lag", never accusatory framing.
 */
export default async function TransparencyPage() {
  const handle = getDb();
  if (!handle) return <p className="text-amber-900">Database not connected.</p>;

  const stats = await handle.db
    .select({
      name: lawmakers.name,
      bioguide_id: lawmakers.bioguide_id,
      chamber: lawmakers.chamber,
      party: lawmakers.party,
      state: lawmakers.state,
      n_trades: psql<number>`count(${trades.id})`,
      avg_days_to_file: psql<string>`coalesce(round(avg(${trades.days_to_file})::numeric, 1), 0)`,
      late_count: psql<number>`count(*) filter (where ${trades.is_late})`,
    })
    .from(lawmakers)
    .leftJoin(trades, psql`${trades.lawmaker_id} = ${lawmakers.id} and ${trades.status} = 'published'`)
    .groupBy(lawmakers.id, lawmakers.name, lawmakers.bioguide_id, lawmakers.chamber, lawmakers.party, lawmakers.state)
    .having(psql`count(${trades.id}) > 0`);

  const mostDelayed = [...stats].sort((a, b) => Number(b.avg_days_to_file) - Number(a.avg_days_to_file));
  const mostPrompt = [...stats].sort((a, b) => Number(a.avg_days_to_file) - Number(b.avg_days_to_file));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Transparency Scorecard</h1>
      <p className="mb-6 max-w-2xl text-sm text-neutral-600">
        Descriptive statistics about statutory disclosure timing under the STOCK Act 45-day
        window. These numbers describe filing behavior only and imply nothing about intent.
      </p>

      <div className="grid gap-8 lg:grid-cols-2">
        <Table title="Longest average disclosure lag" rows={mostDelayed} />
        <Table title="Shortest average disclosure lag" rows={mostPrompt} />
      </div>
    </div>
  );
}

type Row = {
  name: string;
  bioguide_id: string;
  chamber: string;
  party: string;
  state: string;
  n_trades: number;
  avg_days_to_file: string;
  late_count: number;
};

function Table({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No published trades yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2">Lawmaker</th>
                <th className="px-4 py-2">Trades</th>
                <th className="px-4 py-2">Avg lag (d)</th>
                <th className="px-4 py-2">Late</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => (
                <tr key={r.bioguide_id}>
                  <td className="px-4 py-2">
                    {r.name}
                    <span className="ml-2 text-xs text-neutral-400">
                      {r.chamber === 'senate' ? 'Senate' : 'House'} · {r.party}
                    </span>
                  </td>
                  <td className="px-4 py-2">{r.n_trades}</td>
                  <td className="px-4 py-2 font-medium">{r.avg_days_to_file}</td>
                  <td className="px-4 py-2">{r.late_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
