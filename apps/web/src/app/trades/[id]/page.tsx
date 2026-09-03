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

interface PerfMeta {
  perf?: {
    entry_date: string;
    exit_date: string;
    entry_price: number;
    exit_price: number;
    raw_return: number;
    benchmark_return: number;
    excess_return: number;
  };
}

export default async function TradeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const handle = getDb();
  if (!handle) return <div className="card p-8 text-center text-sm text-dim">Database not connected.</div>;

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
  const perf = ((t.options ?? {}) as PerfMeta).perf ?? null;
  const mc = monteCarloRange(
    t.range_min !== null ? Number(t.range_min) : null,
    t.range_max !== null ? Number(t.range_max) : null,
  );

  return (
    <div className="mx-auto max-w-2xl">
      {/* Hero */}
      <div className="anim py-6 text-center">
        <div className="text-xs font-medium uppercase tracking-wider text-dim">
          {isBuy ? 'Purchase' : isSell ? 'Sale' : t.trade_type} · {t.owner_type.replace('_', ' ')}
          {asset.gics_sector && ` · ${asset.gics_sector}`}
        </div>
        <h1 className="mt-1 text-4xl font-bold">{asset.ticker ?? asset.name}</h1>
        <div className={`mt-2 text-2xl font-bold ${isBuy ? 'text-green' : isSell ? 'text-red' : 'text-dim'}`}>
          {t.range_label}
        </div>
        {mc && (
          <div className="mt-1 text-xs text-dim">
            est. {fmtUSD(mc.p05)} – {fmtUSD(mc.p95)} (statistical model)
          </div>
        )}
        {perf && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#152219] px-4 py-1.5">
            <span className={`text-lg font-bold ${perf.excess_return >= 0 ? 'text-green' : 'text-red'}`}>
              {perf.excess_return >= 0 ? '+' : ''}
              {perf.excess_return}%
            </span>
            <span className="text-xs text-dim">vs S&amp;P 500 since trade</span>
          </div>
        )}
      </div>

      {/* Performance breakdown */}
      {perf && (
        <div className="card anim-1 mb-4 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-dim">Performance since disclosure</div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className={`text-lg font-bold ${perf.raw_return >= 0 ? 'text-green' : 'text-red'}`}>
                {perf.raw_return >= 0 ? '+' : ''}
                {perf.raw_return}%
              </div>
              <div className="text-[11px] text-dim">{asset.ticker ?? 'Asset'}</div>
            </div>
            <div>
              <div className="text-lg font-bold text-dim">
                {perf.benchmark_return >= 0 ? '+' : ''}
                {perf.benchmark_return}%
              </div>
              <div className="text-[11px] text-dim">S&amp;P 500</div>
            </div>
            <div>
              <div className={`text-lg font-bold ${perf.excess_return >= 0 ? 'text-green' : 'text-red'}`}>
                {perf.excess_return >= 0 ? '+' : ''}
                {perf.excess_return}%
              </div>
              <div className="text-[11px] text-dim">Excess</div>
            </div>
          </div>
          <div className="mt-2 text-center text-[11px] text-dim">
            {perf.entry_date} → {perf.exit_date} · entry ${perf.entry_price.toFixed(2)} · exit $
            {perf.exit_price.toFixed(2)}
          </div>
        </div>
      )}

      {/* Lawmaker strip */}
      <Link
        href={`/lawmakers/${lawmaker.bioguide_id}`}
        className="card card-click anim-2 flex items-center gap-3 p-4"
      >
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white ${
            lawmaker.party === 'democrat' ? 'bg-[#4a7dff]' : lawmaker.party === 'republican' ? 'bg-[#e6544f]' : 'bg-[#5a6b66]'
          }`}
        >
          {lawmaker.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">{lawmaker.name}</div>
          <div className="text-xs text-dim">
            {lawmaker.chamber === 'senate' ? 'Senator' : 'Representative'} · {lawmaker.party} · {lawmaker.state}
          </div>
        </div>
        <span className="text-dim">›</span>
      </Link>

      {/* Key stats */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Transaction date" value={t.tx_date} />
        <Stat label="Filed" value={t.filing_date} />
        <Stat
          label="Disclosure lag"
          value={
            <span className="flex items-center gap-2">
              {t.days_to_file} days
              {t.is_late && <span className="chip chip-late">Late</span>}
            </span>
          }
        />
        <Stat label="Asset type" value={t.asset_type} />
      </div>

      {/* Implied size band */}
      {mc && (
        <div className="card anim-3 mt-4 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-dim">Implied size (log-uniform model)</div>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[#161d1b]">
            <div className="bg-green/20" style={{ width: '5%' }} />
            <div className="bg-green" style={{ width: '90%' }} />
            <div className="bg-green/20" style={{ width: '5%' }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-dim">
            <span>{fmtUSD(mc.p05)}</span>
            <span className="font-semibold text-white">{fmtUSD(mc.p50)} typical</span>
            <span>{fmtUSD(mc.p95)}</span>
          </div>
          <p className="mt-2 text-[11px] text-dim opacity-70">
            Statistical model of the disclosed range — not a known amount.
            {mc.open_ended_range && ' Open-ended bracket capped at 4× lower bound.'}
          </p>
        </div>
      )}

      {/* Provenance */}
      <div className="card anim-4 mt-4 p-4 text-xs text-dim">
        <div className="mb-1 font-bold uppercase tracking-wider">Provenance</div>
        <div>
          Filing {filing.external_doc_id} · parsed by {filing.parser_version}
        </div>
        <a
          href={filing.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block font-semibold text-green hover:underline"
        >
          View original disclosure ↗
        </a>
      </div>

      <p className="mt-6 text-center text-[11px] text-dim opacity-70">
        Amounts are disclosed as ranges, not exact values. Descriptive statistics only — not
        evaluative, not financial advice.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-dim">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}
