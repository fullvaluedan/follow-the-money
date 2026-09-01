import FeedList from '@/components/FeedFilters';
import type { FeedRow } from '@/components/FeedFilters';
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
          Set <code>DATABASE_URL</code> in <code>.env</code>, run <code>npm run db:push</code> then{' '}
          <code>npm run ingest</code>, and reload.
        </p>
      </div>
    );
  }

  const rows: FeedRow[] = await handle.db
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
    .limit(500);

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">Live Feed</h1>
          <p className="text-sm text-neutral-500">
            Congressional trades from public STOCK Act disclosures
          </p>
        </div>
        <a href="/api/trades" className="text-xs text-neutral-400 hover:text-neutral-600">
          API ↗
        </a>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
          No published trades yet. Run <code className="mx-1">npm run ingest</code> to load fixtures.
        </div>
      ) : (
        <FeedList rows={rows} />
      )}
    </div>
  );
}
