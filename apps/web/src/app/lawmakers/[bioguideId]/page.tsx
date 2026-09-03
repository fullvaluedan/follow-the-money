import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { trades, lawmakers, assets } from '@ftm/db';
import { and, desc, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

interface PerfMeta {
  perf?: { excess_return: number; raw_return: number };
}

export default async function LawmakerPage({
  params,
}: {
  params: Promise<{ bioguideId: string }>;
}) {
  const { bioguideId } = await params;
  const handle = getDb();
  if (!handle) return <div className="card p-8 text-center text-sm text-dim">Database not connected.</div>;

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
      days_to_file: trades.days_to_file,
      is_late: trades.is_late,
      trade_type: trades.trade_type,
      range_label: trades.range_label,
      owner_type: trades.owner_type,
      ticker: assets.ticker,
      asset_name: assets.name,
      sector: assets.gics_sector,
      options: trades.options,
    })
    .from(trades)
    .innerJoin(assets, eq(trades.asset_id, assets.id))
    .where(and(eq(trades.lawmaker_id, lm.id), eq(trades.status, 'published')))
    .orderBy(desc(trades.tx_date));

  const n = rows.length;
  const avgDelay = n > 0 ? rows.reduce((s, r) => s + r.days_to_file, 0) / n : 0;
  const lateCount = rows.filter((r) => r.is_late).length;
  const buys = rows.filter((r) => r.trade_type === 'purchase').length;
  const sells = rows.filter((r) => r.trade_type === 'sale').length;
  const perfRows = rows.map((r) => ({ ...r, perf: ((r.options ?? {}) as PerfMeta).perf ?? null }));
  const withPerf = perfRows.filter((r) => r.perf);
  const avgExcess =
    withPerf.length > 0
      ? withPerf.reduce((s, r) => s + r.perf!.excess_return, 0) / withPerf.length
      : null;

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="anim flex items-center gap-4 py-6">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white ${
            lm.party === 'democrat' ? 'bg-[#4a7dff]' : lm.party === 'republican' ? 'bg-[#e6544f]' : 'bg-[#5a6b66]'
          }`}
        >
          {lm.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{lm.name}</h1>
          <div className="text-sm text-dim">
            {lm.chamber === 'senate' ? 'Senator' : 'Representative'} · {lm.party} · {lm.state}
            {lm.district ? `-${lm.district}` : ''}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <StatPill label="Trades" value={String(n)} />
        <StatPill label="Buys" value={String(buys)} accent="text-green" />
        <StatPill label="Sells" value={String(sells)} accent="text-red" />
        <StatPill
          label="Avg lag"
          value={`${avgDelay.toFixed(0)}d`}
          accent={lateCount > 0 ? 'text-red' : 'text-green'}
        />
      </div>
      {avgExcess !== null && (
        <div className="card anim-1 mt-3 flex items-center justify-between p-4">
          <span className="text-sm text-dim">Avg excess return vs S&amp;P 500 (per-trade)</span>
          <span className={`text-xl font-bold ${avgExcess >= 0 ? 'text-green' : 'text-red'}`}>
            {avgExcess >= 0 ? '+' : ''}
            {avgExcess.toFixed(2)}%
          </span>
        </div>
      )}

      {/* Trades */}
      <h2 className="mb-2 mt-8 px-1 text-sm font-bold uppercase tracking-wider text-dim">
        Disclosed trades
      </h2>
      {n === 0 ? (
        <div className="card p-8 text-center text-sm text-dim">No published trades yet.</div>
      ) : (
        <div className="space-y-2">
          {perfRows.map((r, i) => {
            const isBuy = r.trade_type === 'purchase';
            const isSell = r.trade_type === 'sale';
            return (
              <a
                key={r.id}
                href={`/trades/${r.id}`}
                className="card card-click anim flex items-center gap-4 px-4 py-3.5"
                style={{ animationDelay: `${Math.min(i * 0.05, 0.35)}s` }}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1a2120] text-[11px] font-bold text-gold">
                  {(r.ticker ?? r.asset_name).slice(0, 4).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {r.ticker ?? r.asset_name}
                    {r.is_late && <span className="chip chip-late ml-2">Late</span>}
                  </div>
                  <div className="text-xs text-dim">
                    {r.tx_date} · {r.sector ?? 'Disclosed asset'}
                    {r.owner_type !== 'filer' && ` · ${r.owner_type.replace('_', ' ')}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {r.perf && (
                    <div className={`text-sm font-bold ${r.perf.excess_return >= 0 ? 'text-green' : 'text-red'}`}>
                      {r.perf.excess_return >= 0 ? '+' : ''}
                      {r.perf.excess_return}%
                    </div>
                  )}
                  <div className={`text-xs font-semibold ${isBuy ? 'text-green' : isSell ? 'text-red' : 'text-dim'}`}>
                    {isBuy ? 'Buy' : isSell ? 'Sell' : r.trade_type} · {r.range_label}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-center text-[11px] text-dim opacity-70">
        Disclosure-timing and per-trade performance statistics describe public filings only —
        they are not a portfolio and imply nothing about intent. Not financial advice.
      </p>
    </div>
  );
}

function StatPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card p-3 text-center">
      <div className={`text-lg font-bold ${accent ?? ''}`}>{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-dim">{label}</div>
    </div>
  );
}
