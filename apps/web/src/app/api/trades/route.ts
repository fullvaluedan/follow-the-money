import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { trades, lawmakers, assets, filings } from '@ftm/db';
import { desc, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/** Public JSON feed of published trades. */
export async function GET() {
  const handle = getDb();
  if (!handle) {
    return NextResponse.json({ error: 'database_not_configured' }, { status: 503 });
  }
  const rows = await handle.db
    .select({
      id: trades.id,
      tx_date: trades.tx_date,
      filing_date: trades.filing_date,
      days_to_file: trades.days_to_file,
      is_late: trades.is_late,
      trade_type: trades.trade_type,
      range_label: trades.range_label,
      range_min: trades.range_min,
      range_max: trades.range_max,
      open_ended_range: trades.open_ended_range,
      owner_type: trades.owner_type,
      lawmaker: lawmakers.name,
      bioguide_id: lawmakers.bioguide_id,
      party: lawmakers.party,
      chamber: lawmakers.chamber,
      ticker: assets.ticker,
      asset_name: assets.name,
      source_url: filings.source_url,
      parser_version: filings.parser_version,
    })
    .from(trades)
    .innerJoin(lawmakers, eq(trades.lawmaker_id, lawmakers.id))
    .innerJoin(assets, eq(trades.asset_id, assets.id))
    .innerJoin(filings, eq(trades.filing_id, filings.id))
    .where(eq(trades.status, 'published'))
    .orderBy(desc(trades.tx_date))
    .limit(1000);

  return NextResponse.json(
    {
      note: 'Educational data from public STOCK Act disclosures. Amounts are ranges, not exact values. Not financial advice.',
      count: rows.length,
      trades: rows,
    },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
