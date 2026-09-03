import { getDb } from '@/lib/db';
import { lawmakers, trades, assets } from '@ftm/db';
import { desc, eq, sql } from 'drizzle-orm';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const fmtK = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}K`;

/** Sector heat map: where is Congress money flowing, and which sectors are selling off. */
export default async function SectorsPage() {
  const handle = getDb();
  if (!handle) return <div className="card p-8 text-center text-sm text-dim">Database not connected.</div>;

  const rows = await handle.db
    .select({
      sector: assets.gics_sector,
      trade_type: trades.trade_type,
      range_min: trades.range_min,
      range_max: trades.range_max,
      tx_date: trades.tx_date,
      ticker: assets.ticker,
      bioguide_id: lawmakers.bioguide_id,
      lawmaker: lawmakers.name,
    })
    .from(trades)
    .innerJoin(assets, eq(trades.asset_id, assets.id))
    .innerJoin(lawmakers, eq(trades.lawmaker_id, lawmakers.id))
    .where(eq(trades.status, 'published'));

  type SectorAgg = { buy: number; sell: number; buys: number; sells: number; tickers: Map<string, number> };
  const agg = new Map<string, SectorAgg>();
  let total = 0;

  for (const r of rows) {
    const sector = r.sector ?? 'Other';
    const mid = r.range_min && r.range_max ? (Number(r.range_min) + Number(r.range_max)) / 2 : 0;
    total += mid;
    if (!agg.has(sector)) agg.set(sector, { buy: 0, sell: 0, buys: 0, sells: 0, tickers: new Map() });
    const a = agg.get(sector)!;
    if (r.trade_type === 'purchase') {
      a.buy += mid;
      a.buys++;
      if (r.ticker) a.tickers.set(r.ticker, (a.tickers.get(r.ticker) ?? 0) + mid);
    } else if (r.trade_type === 'sale') {
      a.sell += mid;
      a.sells++;
      if (r.ticker) a.tickers.set(r.ticker, (a.tickers.get(r.ticker) ?? 0) - mid);
    }
  }

  const sectors = [...agg.entries()]
    .map(([sector, a]) => ({
      sector,
      buy: a.buy,
      sell: a.sell,
      net: a.buy - a.sell,
      buys: a.buys,
      sells: a.sells,
      top_tickers: [...a.tickers.entries()].sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 3),
    }))
    .sort((x, y) => y.net - x.net);

  const maxAbs = Math.max(1, ...sectors.map((s) => Math.abs(s.net)));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="anim py-6 text-center">
        <div className="text-xs font-medium uppercase tracking-wider text-dim">
          Estimated net flow (range midpoints) · {fmtK(total)} total
        </div>
        <h1 className="mt-1 text-3xl font-bold">Sector Heat</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-dim">
          Where disclosed congressional money is flowing. Green = net buying, orange = net selling.
          Midpoint estimates of disclosed ranges — not exact amounts.
        </p>
      </div>

      <div className="space-y-2">
        {sectors.map((s, i) => {
          const buying = s.net >= 0;
          const width = (Math.abs(s.net) / maxAbs) * 100;
          return (
            <div key={s.sector} className="card anim p-4" style={{ animationDelay: `${Math.min(i * 0.05, 0.4)}s` }}>
              <div className="flex items-center justify-between">
                <div className="text-[15px] font-semibold">{s.sector}</div>
                <div className={`text-sm font-bold ${buying ? 'text-green' : 'text-red'}`}>
                  {buying ? '+' : '−'}
                  {fmtK(Math.abs(s.net))}
                  <span className="ml-1 text-xs font-medium text-dim">net</span>
                </div>
              </div>
              {/* flow bar: buys vs sells from center */}
              <div className="mt-2.5 flex h-2 w-full gap-px overflow-hidden rounded-full bg-[#161d1b]">
                <div className="flex flex-1 justify-end">
                  <div className="h-full rounded-l-full bg-green transition-all duration-500" style={{ width: `${(s.buy / maxAbs) * 100}%` }} />
                </div>
                <div className="w-px bg-[#2a3833]" />
                <div className="flex flex-1">
                  <div className="h-full rounded-r-full bg-red transition-all duration-500" style={{ width: `${(s.sell / maxAbs) * 100}%` }} />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-dim">
                <span>
                  {s.buys} buys · {s.sells} sells
                </span>
                <span className="flex gap-1.5 font-mono text-[11px]">
                  {s.top_tickers.map(([tk, v]) => (
                    <span key={tk} className={v >= 0 ? 'text-green/80' : 'text-red/80'}>
                      {tk} {v >= 0 ? '+' : ''}
                      {fmtK(Math.abs(v))}
                    </span>
                  ))}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-[11px] text-dim opacity-70">
        Sector attribution uses issuer GICS classification. Aggregated from public STOCK Act
        disclosures. Not financial advice.
      </p>
    </div>
  );
}
