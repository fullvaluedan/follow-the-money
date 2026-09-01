import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { trades, lawmakers, assets, filings } from '@ftm/db';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export default async function TradeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const handle = getDb();
  if (!handle) return <p className="text-amber-900">Database not connected.</p>;

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) notFound();

  const [row] = await handle.db
    .select({
      t: trades,
      lawmaker: lawmakers,
      asset: assets,
      filing: filings,
    })
    .from(trades)
    .innerJoin(lawmakers, eq(trades.lawmaker_id, lawmakers.id))
    .innerJoin(assets, eq(trades.asset_id, assets.id))
    .innerJoin(filings, eq(trades.filing_id, filings.id))
    .where(eq(trades.id, id))
    .limit(1);
  if (!row) notFound();

  const { t, lawmaker, asset, filing } = row;

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold">
        {asset.ticker ?? asset.name} · {t.trade_type}
      </h1>
      <p className="mb-6 text-sm text-neutral-500">
        <Link href={`/lawmakers/${lawmaker.bioguide_id}`} className="hover:underline">
          {lawmaker.name}
        </Link>{' '}
        · {lawmaker.chamber === 'senate' ? 'Senate' : 'House'}
      </p>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
        <Field label="Transaction date" value={t.tx_date} />
        <Field label="Filing date" value={t.filing_date} />
        <Field
          label="Disclosure lag"
          value={`${t.days_to_file} calendar days${t.is_late ? ' — LATE (past 45-day window)' : ''}`}
        />
        <Field label="Rule version" value={t.rule_version} />
        <Field label="Amount (disclosed range)" value={t.range_label} />
        <Field
          label="Range bounds"
          value={
            t.open_ended_range
              ? `≥ $${Number(t.range_min).toLocaleString()} (open-ended)`
              : `$${Number(t.range_min ?? 0).toLocaleString()} – $${Number(t.range_max ?? 0).toLocaleString()}`
          }
        />
        <Field label="Owner" value={t.owner_type} />
        <Field label="Asset type" value={t.asset_type} />
        <Field label="Status" value={t.status} />
        <Field label="Parser version" value={filing.parser_version} />
        <Field label="Filing ID" value={filing.external_doc_id} />
        <Field label="Confidence" value={t.confidence ?? '—'} />
      </dl>

      {t.source_excerpt && (
        <div className="mt-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Raw excerpt
          </h2>
          <pre className="overflow-x-auto rounded-lg bg-neutral-100 p-4 text-xs text-neutral-700">
            {t.source_excerpt}
          </pre>
        </div>
      )}

      <div className="mt-6">
        <a
          href={filing.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          View original filing ↗
        </a>
      </div>

      <p className="mt-8 text-xs text-neutral-500">
        Amounts are disclosed as ranges, not exact values. Disclosed transactions are not a
        portfolio. Statistics shown are descriptive, not evaluative.
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="font-medium">{value ?? '—'}</dd>
    </div>
  );
}
