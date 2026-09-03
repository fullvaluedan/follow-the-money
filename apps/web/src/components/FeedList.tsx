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
  sector: string | null;
  perf: { raw_return: number; excess_return: number; exit_date: string } | null;
}

const TYPES = ['all', 'purchase', 'sale'] as const;

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
          const hay = `${r.lawmaker_name} ${r.ticker ?? ''} ${r.asset_name} ${r.sector ?? ''}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [rows, q, type, lateOnly],
  );

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-dim" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search lawmakers, tickers, sectors"
            className="w-full rounded-xl bg-[var(--bg-card)] py-2.5 pl-10 pr-3 text-sm text-white outline-none placeholder:text-dim focus:ring-2 focus:ring-[var(--green)]/40"
          />
        </div>
        <div className="flex rounded-xl bg-[var(--bg-card)] p-1 text-sm font-semibold">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`rounded-lg px-4 py-1.5 transition-all duration-200 ${
                type === t ? 'bg-[#1f2f28] text-green' : 'text-dim hover:text-white'
              }`}
            >
              {t === 'all' ? 'All' : t === 'purchase' ? 'Buys' : 'Sells'}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between px-1">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-dim">
          <input type="checkbox" checked={lateOnly} onChange={(e) => setLateOnly(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--red)]" />
          Late only
        </label>
        <span className="text-xs text-dim">{filtered.length} trades</span>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="card p-8 text-center text-sm text-dim">Nothing matches. Clear filters.</div>
        ) : (
          filtered.map((r, i) => (
            <a
              key={r.id}
              href={`/trades/${r.id}`}
              className="card card-click anim flex items-center gap-4 px-4 py-3.5"
              style={{ animationDelay: `${Math.min(i * 0.04, 0.4)}s` }}
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
                  {r.ticker ?? <span className="truncate">{r.asset_name}</span>}
                  {r.is_late && <span className="chip chip-late">Late</span>}
                  {r.perf && (
                    <span className={`text-[13px] font-bold ${r.perf.excess_return >= 0 ? 'text-green' : 'text-red'}`}>
                      {r.perf.excess_return >= 0 ? '+' : ''}
                      {r.perf.excess_return}%
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-dim">
                  {r.lawmaker_name} · {r.chamber === 'senate' ? 'Senate' : 'House'}
                  {r.sector && ` · ${r.sector}`}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className={`text-sm font-bold ${r.trade_type === 'purchase' ? 'text-green' : r.trade_type === 'sale' ? 'text-red' : 'text-dim'}`}>
                  {r.trade_type === 'purchase' ? 'Buy' : r.trade_type === 'sale' ? 'Sell' : r.trade_type}
                </div>
                <div className="text-xs text-dim">{r.range_label}</div>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
