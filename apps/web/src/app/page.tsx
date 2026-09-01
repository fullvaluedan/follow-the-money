import Link from 'next/link';
import { getDb } from '@/lib/db';
import { trades, lawmakers, assets, filings } from '@ftm/db';
import { desc, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export default async function FeedPage() {
  const handle = getDb();
  if (!handle) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-amber-900">
        <p className="font-semibold">Database not connected.</p>
        <p className="mt-2 text-sm">
          Set <code>DATABASE_URL</code> in <code>.env</code>, run{' '}
          <code>npm run db:push</code> then <code>npm run ingest</code>, and reload.
        </p>
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
      source_url: filings.source_url,
    })
    .from(trades)
    .innerJoin(lawmakers, eq(trades.lawmaker_id, lawmakers.id))
    .innerJoin(assets, eq(trades.asset_id, assets.id))
    .innerJoin(filings, eq(trades.filing_id, filings.id))
    .where(eq(trades.status, 'published'))
    .orderBy(desc(trades.tx_date))
    .limit(100);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Live Feed — Published Trades</h1>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-neutral-600">
          No published trades yet. Run <code>npm run ingest</code> to load fixture filings,
          then approve pending rows in <Link href="/admin/review" className="underline">Admin Review</Link>.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">Lawmaker</th>
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Lag (d)</th>
                <th className="px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link href={`/lawmakers/${r.bioguide_id}`} className="font-medium hover:underline">
                      {r.lawmaker_name}
                    </Link>
                    <span className="ml-2 text-xs text-neutral-500">
                      {r.chamber === 'senate' ? 'Senate' : 'House'} · {r.party}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.ticker ? (
                      <span className="font-mono font-semibold">{r.ticker}</span>
                    ) : (
                      <span className="text-neutral-500">{r.asset_name}</span>
                    )}
                    <span className="ml-2 text-xs text-neutral-400">{r.owner_type}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        r.trade_type === 'purchase'
                          ? 'text-emerald-700'
                          : r.trade_type === 'sale'
                            ? 'text-red-700'
                            : 'text-neutral-600'
                      }
                    >
                      {r.trade_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">{r.tx_date}</td>
                  <td className="px-4 py-3">{r.range_label}</td>
                  <td className="px-4 py-3">
                    {r.days_to_file}
                    {r.is_late && <span className="ml-1 text-xs font-semibold text-red-600">LATE</span>}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={r.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      filing ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
