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
  owner_type: string;
  lawmaker_name: string;
  bioguide_id: string;
  party: string;
  chamber: string;
  ticker: string | null;
  asset_name: string;
  source_url: string;
}

const TYPES = ['all', 'purchase', 'sale', 'exchange'] as const;

export default function FeedList({ rows }: { rows: FeedRow[] }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]>('all');
  const [lateOnly, setLateOnly] = useState(false);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (type !== 'all' && r.trade_type !== type) return false;
        if (lateOnly && !r.is_late) return false;
        if (q) {
          const hay = `${r.lawmaker_name} ${r.ticker ?? ''} ${r.asset_name}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [rows, q, type, lateOnly],
  );

  return (
    <div>
      {/* Search + segmented control — Robinhood style */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search lawmakers or tickers"
            className="w-full rounded-xl bg-neutral-100 py-2 pl-9 pr-3 text-sm outline-none placeholder:text-neutral-400 focus:bg-neutral-50 focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>
        <div className="flex rounded-xl bg-neutral-100 p-1 text-sm font-medium">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-lg px-3 py-1 capitalize transition-colors ${
                type === t ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'
              }`}
            >
              {t === 'all' ? 'All' : t === 'purchase' ? 'Buys' : t === 'sale' ? 'Sells' : 'Exch.'}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-neutral-500">
          <input
            type="checkbox"
            checked={lateOnly}
            onChange={(e) => setLateOnly(e.target.checked)}
            className="h-3.5 w-3.5 accent-red-500"
          />
          Late filings only ({rows.filter((r) => r.is_late).length})
        </label>
        <span className="text-xs text-neutral-400">{filtered.length} shown</span>
      </div>

      {/* Card list */}
      <div className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-100">
        {filtered.length === 0 ? (
          <div className="bg-neutral-50 p-8 text-center text-sm text-neutral-500">
            Nothing matches. Try clearing filters.
          </div>
        ) : (
          filtered.map((r) => <TradeCard key={r.id} r={r} />)
        )}
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function TradeCard({ r }: { r: FeedRow }) {
  const isBuy = r.trade_type === 'purchase';
  const isSell = r.trade_type === 'sale';
  return (
    <a
      href={`/trades/${r.id}`}
      className="flex items-center gap-4 bg-white px-4 py-3.5 transition-colors hover:bg-neutral-50"
    >
      {/* Avatar */}
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
          r.party === 'democrat' ? 'bg-blue-500' : r.party === 'republican' ? 'bg-red-500' : 'bg-neutral-400'
        }`}
      >
        {initials(r.lawmaker_name)}
      </div>

      {/* Name + meta */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 truncate text-sm font-semibold">
          {r.ticker ?? <span className="truncate">{r.asset_name}</span>}
          {r.is_late && (
            <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-600">
              Late
            </span>
          )}
        </div>
        <div className="truncate text-xs text-neutral-500">
          {r.lawmaker_name} · {r.chamber === 'senate' ? 'Senate' : 'House'}
          {r.owner_type !== 'filer' && ` · ${r.owner_type.replace('_', ' ')}`}
        </div>
      </div>

      {/* Right side: action + amount */}
      <div className="shrink-0 text-right">
        <div className={`text-sm font-bold ${isBuy ? 'text-emerald-600' : isSell ? 'text-orange-600' : 'text-neutral-600'}`}>
          {isBuy ? 'Buy' : isSell ? 'Sell' : r.trade_type}
        </div>
        <div className="text-xs text-neutral-500">{r.range_label}</div>
      </div>
    </a>
  );
}
