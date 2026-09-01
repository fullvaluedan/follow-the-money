import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { trades, lawmakers, assets, filings } from '@ftm/db';
import { eq } from 'drizzle-orm';
import { monteCarloRange } from '@ftm/domain';

export const dynamic = 'force-dynamic';

const fmtUSD = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
    : n >= 1_000
      ? `$${Math.round(n / 1000)}K`
      : `$${Math.round(n)}`;

export default async function TradeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const handle = getDb();
  if (!handle) return <p className="text-amber-900">Database not connected.</p>;

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) notFound();

  const [row] = await handle.db
    .select({ t: trades, lawmaker: lawmakers, asset: assets, filing: filings })
    .from(trades)
    .innerJoin(lawmakers, eq(trades.lawmaker_id, lawmakers.id))
    .innerJoin(assets, eq(trades.asset_id, assets.id))
    .innerJoin(filings, eq(trades.filing_id, filings.id))
    .where(eq(trades.id, id))
    .limit(1);
  if (!row) notFound();

  const { t, lawmaker, asset, filing } = row;
  const isBuy = t.trade_type === 'purchase';
  const isSell = t.trade_type === 'sale';

  const mc = monteCarloRange(
    t.range_min !== null ? Number(t.range_min) : null,
    t.range_max !== null ? Number(t.range_max) : null,
  );

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header — Robinhood-style big number */}
      <div className="py-6 text-center">
        <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          {isBuy ? 'Purchase' : isSell ? 'Sale' : t.trade_type} · {t.owner_type.replace('_', ' ')}
        </div>
        <h1 className="mt-1 text-3xl font-bold">{asset.ticker ?? asset.name}</h1>
        <div className={`mt-2 text-2xl font-bold ${isBuy ? 'text-emerald-600' : isSell ? 'text-orange-600' : 'text-neutral-600'}`}>
          {t.range_label}
        </div>
        {mc && (
          <div className="mt-1 text-xs text-neutral-400">
            est. {fmtUSD(mc.p05)} – {fmtUSD(mc.p95)} (statistical model)
          </div>
        )}
      </div>

      {/* Lawmaker strip */}
      <Link
        href={`/lawmakers/${lawmaker.bioguide_id}`}
        className="flex items-center gap-3 rounded-2xl border border-neutral-100 p-4 transition-colors hover:bg-neutral-50"
      >
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white ${
            lawmaker.party === 'democrat' ? 'bg-blue-500' : lawmaker.party === 'republican' ? 'bg-red-500' : 'bg-neutral-400'
          }`}
        >
          {lawmaker.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">{lawmaker.name}</div>
          <div className="text-xs text-neutral-500">
            {lawmaker.chamber === 'senate' ? 'Senate' : `House · ${lawmaker.state}`}
          </div>
        </div>
        <span className="text-neutral-300">›</span>
      </Link>

      {/* Key stats grid */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Transaction date" value={t.tx_date} />
        <Stat label="Filed" value={t.filing_date} />
        <Stat
          label="Disclosure lag"
          value={
            <span>
              {t.days_to_file} days
              {t.is_late && <span className="ml-1.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-600">Past 45-day window</span>}
            </span>
          }
        />
        <Stat label="Asset type" value={t.asset_type} />
      </div>

      {/* Implied size band */}
      {mc && (
        <div className="mt-4 rounded-2xl border border-neutral-100 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">
            Implied size (log-uniform model)
          </div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-neutral-100">
            <div className="bg-emerald-500/20" style={{ width: '5%' }} />
            <div className="bg-emerald-500" style={{ width: '90%' }} />
            <div className="bg-emerald-500/20" style={{ width: '5%' }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-neutral-400">
            <span>{fmtUSD(mc.p05)}</span>
            <span className="font-semibold text-neutral-600">{fmtUSD(mc.p50)} typical</span>
            <span>{fmtUSD(mc.p95)}</span>
          </div>
          <p className="mt-2 text-[11px] text-neutral-400">
            Statistical model of the disclosed range only — not a known amount.
            {mc.open_ended_range && ' Open-ended bracket capped at 4× lower bound.'}
          </p>
        </div>
      )}

      {/* Provenance */}
      <div className="mt-4 rounded-2xl border border-neutral-100 p-4 text-xs text-neutral-500">
        <div className="mb-1 font-medium uppercase tracking-wide text-neutral-400">Provenance</div>
        <div>
          Source filing {filing.external_doc_id} · parsed by {filing.parser_version}
        </div>
        <a
          href={filing.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block font-medium text-emerald-600 hover:underline"
        >
          View original disclosure ↗
        </a>
      </div>

      <p className="mt-6 text-center text-[11px] text-neutral-400">
        Amounts are disclosed as ranges, not exact values. Descriptive statistics only — not
        evaluative, not financial advice.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-100 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}
