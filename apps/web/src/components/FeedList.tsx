'use client';

import { useMemo, useState } from 'react';

export interface FeedRow {
  id: string;
  tx_date: string;
  filing_date: string;
  days_to_file: number;
  is_late: boolean;
  trade_type: string;
  range_label: string;
  range_min: number | null;
  range_max: number | null;
  owner_type: string;
  lawmaker_name: string;
  bioguide_id: string;
  party: string;
  chamber: string;
  ticker: string | null;
  asset_name: string;
  sector: string | null;
  perf: { raw_return: number; excess_return: number; exit_date: string } | null;
  spark?: { path: string; up: boolean } | null;
}

const TYPES = ['all', 'purchase', 'sale'] as const;
const SIZE_FILTERS = [
  { key: '100k', label: '$100K+', min: 100_000 },
  { key: '50k', label: '$50K+', min: 50_000 },
  { key: '15k', label: '$15K+', min: 15_000 },
  { key: 'all', label: 'All', min: 0 },
] as const;

/** Midpoint of the disclosed range, for filtering. */
function midOf(r: FeedRow): number {
  if (r.range_min === null || r.range_max === null) return 0;
  return (r.range_min + r.range_max) / 2;
}

export default function FeedList({ rows, defaultSize = '100k' }: { rows: FeedRow[]; defaultSize?: string }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]>('all');
  const [size, setSize] = useState<string>(defaultSize);
  const [lateOnly, setLateOnly] = useState(false);

  const filtered = useMemo(() => {
    const min = SIZE_FILTERS.find((s) => s.key === size)?.min ?? 0;
    return rows
      .filter((r) => midOf(r) >= min)
      .filter((r) => (type === 'all' ? true : r.trade_type === type))
      .filter((r) => (lateOnly ? r.is_late : true))
      .filter((r) => {
        if (!q) return true;
        const hay = `${r.lawmaker_name} ${r.ticker ?? ''} ${r.asset_name} ${r.sector ?? ''}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      })
      .sort((a, b) => midOf(b) - midOf(a)); // biggest first within the feed
  }, [rows, q, type, size, lateOnly]);

  const totalShown = filtered.reduce((s, r) => s + midOf(r), 0);
  const fmt = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <svg className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-dim" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search lawmaker, ticker, sector…"
            className="w-full rounded-xl bg-[var(--bg-card)] py-2.5 pl-10 pr-3 text-sm text-white outline-none placeholder:text-dim focus:ring-2 focus:ring-[var(--green)]/40"
          />
        </div>
        {/* trade type */}
        <div className="flex rounded-xl bg-[var(--bg-card)] p-1 text-sm font-semibold">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-lg px-4 py-1.5 transition-all duration-200 ${type === t ? 'bg-[#1f2f28] text-green' : 'text-dim hover:text-white'}`}
            >
              {t === 'all' ? 'All' : t === 'purchase' ? 'Buys' : 'Sells'}
            </button>
          ))}
        </div>
        {/* significance */}
        <div className="flex rounded-xl bg-[var(--bg-card)] p-1 text-xs font-semibold">
          {SIZE_FILTERS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSize(s.key)}
              className={`rounded-lg px-3 py-1.5 transition-all duration-200 ${size === s.key ? 'bg-[#2a2416] text-gold' : 'text-dim hover:text-white'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-dim">
          <input type="checkbox" checked={lateOnly} onChange={(e) => setLateOnly(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--red)]" />
          Late
        </label>
      </div>

      <div className="mb-3 flex items-center justify-between px-1 text-xs">
        <span className="text-dim">
          <span className="font-bold text-white">{filtered.length}</span> trades ·{' '}
          <span className="font-bold text-gold">{fmt(totalShown)}</span> total size
        </span>
        <span className="text-dim">sorted by size</span>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="card p-8 text-center text-sm text-dim">Nothing matches — lower the size filter or clear search.</div>
        ) : (
          filtered.slice(0, 60).map((r, i) => <TradeCard key={r.id} r={r} idx={i} />)
        )}
      </div>
      {filtered.length > 60 && (
        <p className="mt-3 text-center text-xs text-dim">Showing 60 largest of {filtered.length} — refine filters to see more.</p>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function TradeCard({ r, idx }: { r: FeedRow; idx: number }) {
  const isBuy = r.trade_type === 'purchase';
  const isSell = r.trade_type === 'sale';
  const mid = midOf(r);
  const fmt = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`);
  return (
    <div
      className="card card-click anim flex items-center gap-4 px-4 py-3.5"
      style={{ animationDelay: `${Math.min(idx * 0.03, 0.35)}s` }}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
          r.party === 'democrat' ? 'bg-[#4a7dff]' : r.party === 'republican' ? 'bg-[#e6544f]' : 'bg-[#5a6b66]'
        }`}
      >
        {initials(r.lawmaker_name)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[15px] font-semibold">
          {r.ticker ? (
            <a href={`/tickers/${r.ticker}`} className="hover:text-green hover:underline">{r.ticker}</a>
          ) : (
            <span className="truncate">{r.asset_name}</span>
          )}
          {r.is_late && <span className="chip chip-late">Late</span>}
          {r.perf && (
            <span className={`text-[13px] font-bold ${r.perf.excess_return >= 0 ? 'text-green' : 'text-red'}`}>
              {r.perf.excess_return >= 0 ? '+' : ''}{r.perf.excess_return}%
            </span>
          )}
        </div>
        <div className="truncate text-xs text-dim">
          <a href={`/lawmakers/${r.bioguide_id}`} className="hover:text-white hover:underline">{r.lawmaker_name}</a>
          {' · '}{r.chamber === 'senate' ? 'Senate' : 'House'}
          {r.sector && ` · ${r.sector}`}
          {' · '}{r.tx_date}
        </div>
      </div>

      {r.spark && (
        <svg viewBox="0 0 72 28" className="h-7 w-[72px] shrink-0">
          <path d={r.spark.path} fill="none" stroke={r.spark.up ? '#00c805' : '#ff5000'} strokeWidth="1.5" />
        </svg>
      )}

      <div className="shrink-0 text-right">
        <div className={`text-base font-extrabold ${isBuy ? 'text-green' : isSell ? 'text-red' : 'text-dim'}`}>
          ~{fmt(mid)}
        </div>
        <div className="text-xs text-dim">{isBuy ? 'Buy' : isSell ? 'Sell' : r.trade_type}</div>
      </div>
    </div>
  );
}
