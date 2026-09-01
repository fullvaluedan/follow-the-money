import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { trades, lawmakers, assets, filings } from '@ftm/db';
import { and, desc, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export default async function LawmakerPage({
  params,
}: {
  params: Promise<{ bioguideId: string }>;
}) {
  const { bioguideId } = await params;
  const handle = getDb();
  if (!handle) {
    return <DbNotice />;
  }

  const [lm] = await handle.db
    .select()
    .from(lawmakers)
    .where(eq(lawmakers.bioguide_id, bioguideId))
    .limit(1);
  if (!lm) notFound();

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
      ticker: assets.ticker,
      asset_name: assets.name,
      source_url: filings.source_url,
    })
    .from(trades)
    .innerJoin(assets, eq(trades.asset_id, assets.id))
    .innerJoin(filings, eq(trades.filing_id, filings.id))
    .where(and(eq(trades.lawmaker_id, lm.id), eq(trades.status, 'published')))
    .orderBy(desc(trades.tx_date));

  const n = rows.length;
  const avgDelay = n > 0 ? rows.reduce((s, r) => s + r.days_to_file, 0) / n : 0;
  const lateCount = rows.filter((r) => r.is_late).length;

  return (
    <div>
      <div className="mb-6 flex items-baseline gap-4">
        <h1 className="text-2xl font-bold">{lm.name}</h1>
        <span className="text-sm text-neutral-500">
          {lm.chamber === 'senate' ? 'Senate' : `House · District ${lm.district ?? '—'}`} ·{' '}
          {lm.party} · {lm.state}
        </span>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <Stat label="Published trades" value={String(n)} />
        <Stat label="Avg disclosure lag" value={`${avgDelay.toFixed(1)} days`} />
        <Stat label="Late filings" value={`${lateCount}${n > 0 ? ` (${((lateCount / n) * 100).toFixed(0)}%)` : ''}`} />
      </div>

      <h2 className="mb-3 text-lg font-semibold">Trades</h2>
      {n === 0 ? (
        <p className="text-sm text-neutral-500">No published trades.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2">Asset</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Lag</th>
                <th className="px-4 py-2">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">
                    {r.ticker ?? r.asset_name}
                    <span className="ml-2 text-xs text-neutral-400">{r.owner_type}</span>
                  </td>
                  <td className="px-4 py-2">{r.trade_type}</td>
                  <td className="px-4 py-2">{r.tx_date}</td>
                  <td className="px-4 py-2">{r.range_label}</td>
                  <td className="px-4 py-2">
                    {r.days_to_file} {r.is_late && <span className="text-xs font-semibold text-red-600">LATE</span>}
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/trades/${r.id}`} className="text-blue-600 hover:underline">
                      view
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-2 mt-8 text-lg font-semibold">Committees</h2>
      <p className="text-sm text-neutral-500">Committee data arrives in Phase 2.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
    </div>
  );
}

function DbNotice() {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-amber-900">
      <p className="font-semibold">Database not connected.</p>
    </div>
  );
}
