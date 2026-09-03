import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { trades, lawmakers, assets, stockPricesDaily } from '@ftm/db';
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import { buildSparkline } from '@/lib/sparkline';

export const dynamic = 'force-dynamic';

const fmtK = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1000)}K` : `$${n}`;

export default async function TickerPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker).toUpperCase();
  const handle = getDb();
  if (!handle) return <div className="card p-8 text-center text-sm text-dim">Database not connected.</div>;

  const [asset] = await handle.db.select().from(assets).where(eq(assets.ticker, ticker)).limit(1);
  if (!asset) notFound();

  // price series (last year)
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 365);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const priceRows = await handle.db
    .select({ date: stockPricesDaily.date, close: stockPricesDaily.adj_close })
    .from(stockPricesDaily)
    .where(and(eq(stockPricesDaily.ticker, ticker), gte(stockPricesDaily.date, cutoffIso)))
    .orderBy(asc(stockPricesDaily.date));
  const series = priceRows.filter((p) => p.close !== null).map((p) => ({ date: p.date, close: Number(p.close) }));
  const spark = buildSparkline(series, 720, 200);

  const first = series[0];
  const last = series[series.length - 1];
  const yearChange = first && last ? ((last.close - first.close) / first.close) * 100 : null;

  // congressional net position on this ticker
  const tradeRows = await handle.db
    .select({
      id: trades.id,
      tx_date: trades.tx_date,
      trade_type: trades.trade_type,
      range_label: trades.range_label,
      range_min: trades.range_min,
      range_max: trades.range_max,
      owner_type: trades.owner_type,
      is_late: trades.is_late,
      lawmaker: lawmakers.name,
      bioguide_id: lawmakers.bioguide_id,
      party: lawmakers.party,
      chamber: lawmakers.chamber,
    })
    .from(trades)
    .innerJoin(lawmakers, eq(trades.lawmaker_id, lawmakers.id))
    .where(and(eq(trades.status, 'published'), sql`${trades.asset_id} = ${asset.id}`))
    .orderBy(desc(trades.tx_date));

  let net = 0;
  let buys = 0;
  let sells = 0;
  const members = new Set<string>();
  for (const t of tradeRows) {
    members.add(t.bioguide_id);
    const mid = t.range_min && t.range_max ? (Number(t.range_min) + Number(t.range_max)) / 2 : 0;
    if (t.trade_type === 'purchase') { net += mid; buys++; }
    else if (t.trade_type === 'sale') { net -= mid; sells++; }
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Hero with chart */}
      <div className="anim py-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-4xl font-extrabold tracking-tight">{ticker}</h1>
          <span className="text-sm text-dim">{asset.name.replace(/\s*\([^)]*\)\s*$/, '')}</span>
        </div>
        <div className="mt-1 text-xs uppercase tracking-wider text-dim">
          {asset.gics_sector ?? 'Unclassified sector'} · {tradeRows.length} congressional trade{tradeRows.length === 1 ? '' : 's'} by {members.size} member{members.size === 1 ? '' : 's'}
        </div>
        {spark && (
          <div className="mt-4">
            <svg viewBox="0 0 720 200" className="h-40 w-full">
              <path d={spark.area} fill={spark.up ? 'rgba(0,200,5,0.08)' : 'rgba(255,80,0,0.08)'} />
              <path d={spark.path} fill="none" stroke={spark.up ? '#00c805' : '#ff5000'} strokeWidth="2" />
            </svg>
            <div className="mt-1 flex justify-between text-[11px] text-dim">
              <span>{first?.date}</span>
              <span className={`font-bold ${spark.up ? 'text-green' : 'text-red'}`}>
                {yearChange !== null && (yearChange >= 0 ? '+' : '')}{yearChange?.toFixed(1)}% 1y · ${last?.close.toFixed(2)}
              </span>
              <span>{last?.date}</span>
            </div>
          </div>
        )}
      </div>

      {/* Net congressional flow */}
      <div className="card anim-1 mb-4 flex items-center justify-between p-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-dim">Net congressional flow</div>
          <div className="mt-1 text-sm text-dim">{buys} buys · {sells} sells</div>
        </div>
        <div className={`text-3xl font-extrabold ${net >= 0 ? 'text-green' : 'text-red'}`}>
          {net >= 0 ? '+' : '−'}{fmtK(Math.abs(net))}
        </div>
      </div>

      {/* Trade list */}
      <div className="card anim-2 divide-y divide-[var(--border)] overflow-hidden">
        {tradeRows.map((t) => {
          const isBuy = t.trade_type === 'purchase';
          const isSell = t.trade_type === 'sale';
          return (
            <Link key={t.id} href={`/trades/${t.id}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                  t.party === 'democrat' ? 'bg-[#4a7dff]' : t.party === 'republican' ? 'bg-[#e6544f]' : 'bg-[#5a6b66]'
                }`}
              >
                {t.lawmaker.split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{t.lawmaker}</div>
                <div className="text-[11px] text-dim">
                  {t.chamber === 'senate' ? 'Senate' : 'House'} · {t.tx_date}
                  {t.owner_type !== 'filer' && ` · ${t.owner_type.replace('_', ' ')}`}
                  {t.is_late && ' · late'}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className={`text-sm font-bold ${isBuy ? 'text-green' : isSell ? 'text-red' : 'text-dim'}`}>
                  {isBuy ? 'Buy' : isSell ? 'Sell' : t.trade_type}
                </div>
                <div className="text-[11px] text-dim">{t.range_label}</div>
              </div>
            </Link>
          );
        })}
        {tradeRows.length === 0 && (
          <div className="p-8 text-center text-sm text-dim">No congressional trades on {ticker} yet.</div>
        )}
      </div>

      <p className="mt-6 text-center text-[11px] text-dim opacity-70">
        Amounts are disclosed ranges, not exact values. Net flow uses range midpoints. Not
        financial advice.
      </p>
    </div>
  );
}
