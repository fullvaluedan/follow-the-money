import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { trades, lawmakers, assets } from '@ftm/db';
import { and, desc, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export default async function LawmakerPage({
  params,
}: {
  params: Promise<{ bioguideId: string }>;
}) {
  const { bioguideId } = await params;
  const handle = getDb();
  if (!handle) return <CenterNotice text="Database not connected." />;

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

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4 py-6">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white ${
            lm.party === 'democrat' ? 'bg-blue-500' : lm.party === 'republican' ? 'bg-red-500' : 'bg-neutral-400'
          }`}
        >
          {lm.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{lm.name}</h1>
          <div className="text-sm text-neutral-500">
            {lm.chamber === 'senate' ? 'Senator' : 'Representative'} · {lm.party} · {lm.state}
            {lm.district ? `-${lm.district}` : ''}
          </div>
        </div>
      </div>

      {/* Stats — horizontal pills like Robinhood's portfolio stats */}
      <div className="grid grid-cols-4 gap-2">
        <StatPill label="Trades" value={String(n)} />
        <StatPill label="Buys" value={String(buys)} accent="text-emerald-600" />
        <StatPill label="Sells" value={String(sells)} accent="text-orange-600" />
        <StatPill
          label="Avg lag"
          value={`${avgDelay.toFixed(0)}d`}
          accent={lateCount > 0 ? 'text-red-600' : undefined}
        />
      </div>

      {/* Trade list — same card pattern as feed */}
      <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Disclosed trades
      </h2>
      {n === 0 ? (
        <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
          No published trades yet.
        </div>
      ) : (
        <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-100">
          {rows.map((r) => {
            const isBuy = r.trade_type === 'purchase';
            const isSell = r.trade_type === 'sale';
            return (
              <a
                key={r.id}
                href={`/trades/${r.id}`}
                className="flex items-center gap-4 bg-white px-4 py-3.5 hover:bg-neutral-50"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-[11px] font-bold text-neutral-600">
                  {(r.ticker ?? r.asset_name).slice(0, 4).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{r.ticker ?? r.asset_name}</div>
                  <div className="text-xs text-neutral-500">
                    {r.tx_date}
                    {r.owner_type !== 'filer' && ` · ${r.owner_type.replace('_', ' ')}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-sm font-bold ${isBuy ? 'text-emerald-600' : isSell ? 'text-orange-600' : 'text-neutral-600'}`}>
                    {isBuy ? 'Buy' : isSell ? 'Sell' : r.trade_type}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {r.range_label}
                    {r.is_late && <span className="ml-1 text-red-500">· late</span>}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-center text-[11px] text-neutral-400">
        Disclosure-timing statistics describe filing behavior only — they imply nothing about
        intent. Not financial advice.
      </p>
    </div>
  );
}

function StatPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-100 p-3 text-center">
      <div className={`text-lg font-bold ${accent ?? ''}`}>{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">{label}</div>
    </div>
  );
}

function CenterNotice({ text }: { text: string }) {
  return <div className="py-20 text-center text-sm text-neutral-500">{text}</div>;
}
