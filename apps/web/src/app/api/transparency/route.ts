import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { lawmakers, trades } from '@ftm/db';
import { eq, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/** Transparency scorecard JSON — neutral disclosure-lag statistics. */
export async function GET() {
  const handle = getDb();
  if (!handle) {
    return NextResponse.json({ error: 'database_not_configured' }, { status: 503 });
  }
  const rows = await handle.db
    .select({
      bioguide_id: lawmakers.bioguide_id,
      name: lawmakers.name,
      chamber: lawmakers.chamber,
      party: lawmakers.party,
      state: lawmakers.state,
      n_trades: sql<number>`count(${trades.id})`,
      avg_days_to_file: sql<string>`coalesce(round(avg(${trades.days_to_file})::numeric, 1), 0)`,
      late_count: sql<number>`count(*) filter (where ${trades.is_late})`,
    })
    .from(lawmakers)
    .leftJoin(
      trades,
      sql`${trades.lawmaker_id} = ${lawmakers.id} and ${trades.status} = 'published'`,
    )
    .groupBy(lawmakers.id, lawmakers.name, lawmakers.bioguide_id, lawmakers.chamber, lawmakers.party, lawmakers.state)
    .having(sql`count(${trades.id}) > 0`);

  return NextResponse.json(
    {
      note: 'Descriptive disclosure-timing statistics under the STOCK Act 45-day window. Implies nothing about intent.',
      rule_version: 'stock-act-45d-v1',
      lawmakers: rows,
    },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
