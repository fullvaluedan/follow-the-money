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

const PARTIES = ['all', 'democrat', 'republican', 'independent', 'other'] as const;
const TYPES = ['all', 'purchase', 'sale', 'exchange'] as const;

export default function FeedFilters({ rows }: { rows: FeedRow[] }) {
  const [q, setQ] = useState('');
  const [party, setParty] = useState<(typeof PARTIES)[number]>('all');
  const [type, setType] = useState<(typeof TYPES)[number]>('all');
  const [chamber, setChamber] = useState<'all' | 'house' | 'senate'>('all');
  const [lateOnly, setLateOnly] = useState(false);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (party !== 'all' && r.party !== party) return false;
        if (type !== 'all' && r.trade_type !== type) return false;
        if (chamber !== 'all' && r.chamber !== chamber) return false;
        if (lateOnly && !r.is_late) return false;
        if (q) {
          const hay = `${r.lawmaker_name} ${r.ticker ?? ''} ${r.asset_name}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [rows, q, party, type, chamber, lateOnly],
  );

  const select =
    'rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700';

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search lawmaker, ticker, asset…"
          className="w-64 rounded border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <select value={chamber} onChange={(e) => setChamber(e.target.value as typeof chamber)} className={select}>
          <option value="all">Both chambers</option>
          <option value="house">House</option>
          <option value="senate">Senate</option>
        </select>
        <select value={party} onChange={(e) => setParty(e.target.value as typeof party)} className={select}>
          {PARTIES.map((p) => (
            <option key={p} value={p}>
              {p === 'all' ? 'All parties' : p}
            </option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={select}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t === 'all' ? 'All types' : t}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-neutral-700">
          <input type="checkbox" checked={lateOnly} onChange={(e) => setLateOnly(e.target.checked)} />
          Late filings only
        </label>
        <span className="ml-auto text-xs text-neutral-500">
          {filtered.length} of {rows.length} trades
        </span>
      </div>

      <FeedTable rows={filtered} />
    </div>
  );
}

function FeedTable({ rows }: { rows: FeedRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-600">
        No trades match the current filters.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200">
      <table className="min-w-full divide-y divide-neutral-200 text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3">Lawmaker</th>
            <th className="px-4 py-3">Asset</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Amount</th>
            <th className="px-4 py-3">Lag (d)</th>
            <th className="px-4 py-3">Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-neutral-50">
              <td className="px-4 py-3">
                <a href={`/lawmakers/${r.bioguide_id}`} className="font-medium hover:underline">
                  {r.lawmaker_name}
                </a>
                <span className="ml-2 text-xs text-neutral-500">
                  {r.chamber === 'senate' ? 'Senate' : 'House'} · {r.party}
                </span>
              </td>
              <td className="px-4 py-3">
                {r.ticker ? <span className="font-mono font-semibold">{r.ticker}</span> : r.asset_name}
                <span className="ml-2 text-xs text-neutral-400">{r.owner_type}</span>
              </td>
              <td className="px-4 py-3">
                <span className={r.trade_type === 'purchase' ? 'text-emerald-700' : r.trade_type === 'sale' ? 'text-red-700' : 'text-neutral-600'}>
                  {r.trade_type}
                </span>
              </td>
              <td className="px-4 py-3">{r.tx_date}</td>
              <td className="px-4 py-3">{r.range_label}</td>
              <td className="px-4 py-3">
                {r.days_to_file}
                {r.is_late && <span className="ml-1 text-xs font-semibold text-red-600">LATE</span>}
              </td>
              <td className="px-4 py-3">
                <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  filing ↗
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
