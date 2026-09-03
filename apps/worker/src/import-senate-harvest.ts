// Import harvested Senate PTR rows (browser-harvested, real data) into the DB.
// Input: JSON array of {url, name, filed, rows[[...]]} from CDP Chrome harvest.
import { makeDb } from '@ftm/db';
import { filings, lawmakers, assets, trades, hitlReviewQueue } from '@ftm/db';
import { eq } from 'drizzle-orm';
import {
  bracketFromLabel, bracketMidpoint, latenessFor, tradeFingerprint,
  needsHitl, publishTrade, contentHash, type ExtractedTrade,
} from '@ftm/domain';
import { readFileSync } from 'node:fs';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL required'); process.exit(1); }
const srcPath = process.argv[2];
if (!srcPath) { console.error('usage: tsx import-senate-harvest.ts <rows.json>'); process.exit(1); }

interface Harvested { url: string; name: string; filed: string; rows: string[][]; }
const reports: Harvested[] = JSON.parse(readFileSync(srcPath, 'utf8'));

function isoDate(us: string): string {
  const m = us.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : us;
}
function mapType(t: string): 'purchase' | 'sale' | 'exchange' | 'unknown' {
  const u = t.toLowerCase();
  if (u.startsWith('purch')) return 'purchase';
  if (u.startsWith('sale')) return 'sale';
  if (u.startsWith('exch')) return 'exchange';
  return 'unknown';
}
function mapOwner(o: string): 'filer' | 'spouse' | 'joint' | 'dependent_child' | 'other' {
  const l = o.toLowerCase();
  if (l.startsWith('self')) return 'filer';
  if (l.startsWith('spous')) return 'spouse';
  if (l.startsWith('joint')) return 'joint';
  if (l.includes('child')) return 'dependent_child';
  return 'other';
}

const { db, pool } = makeDb(url);
const counts = { reports: 0, trades: 0, pending: 0, published: 0, skipped: 0, errors: [] as string[] };
try {
  const allLawmakers = await db.select({ id: lawmakers.id, name: lawmakers.name }).from(lawmakers);

  for (const report of reports) {
    const uuid = report.url.split('/').filter(Boolean).pop()!;
    const filedIso = isoDate((report.filed.match(/(\d{2}\/\d{2}\/\d{4})/) ?? [''])[0] ? report.filed.match(/(\d{2})\/(\d{2})\/(\d{4})/)![0] : '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filedIso)) { counts.errors.push(`bad filed date: ${report.filed}`); continue; }

    // resolve member: "Mr. Alan Armstrong" → last token(s)
    const nameClean = report.name.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/, '').trim();
    const lastToken = nameClean.split(/\s+/).pop() ?? '';
    const lm = allLawmakers.find((l) => l.name.toUpperCase().includes(lastToken.toUpperCase()));
    if (!lm) { counts.errors.push(`lawmaker unresolved: ${nameClean}`); continue; }

    const sha = contentHash(JSON.stringify(report.rows));
    const existing = await db.query.filings.findFirst({ where: (f, { eq: E }) => E(f.external_doc_id, uuid) });
    if (existing && existing.sha256 === sha) { counts.skipped++; continue; }

    const [filingRow] = await db
      .insert(filings)
      .values({
        chamber: 'senate', source: 'senate_efd_live', external_doc_id: uuid,
        filed_at: filedIso, source_url: report.url, sha256: sha,
        parser_version: 'senate_efd_html_v1', raw_kind: 'html', status: 'ingested',
      })
      .onConflictDoUpdate({
        target: [filings.chamber, filings.source, filings.external_doc_id],
        set: { sha256: sha, filed_at: filedIso, updated_at: new Date() },
      })
      .returning({ id: filings.id });
    counts.reports++;

    for (const cells of report.rows) {
      const [, dateRaw, ownerRaw, tickerRaw, assetRaw, assetType, type, range] = cells;
      if (!dateRaw || !range) continue;
      const bracket = bracketFromLabel(range);
      if (!bracket) continue;
      const txIso = isoDate(dateRaw);
      const nameTicker = assetRaw.match(/\(([A-Z]{1,5})\)/);
      // "RBLX" parked in the asset-name column with '--' ticker (data quirk)
      const ticker = tickerRaw !== '--' ? tickerRaw : (nameTicker?.[1] ?? (/^[A-Z]{1,5}$/.test(assetRaw) ? assetRaw : null));
      const t: ExtractedTrade = {
        asset_name: assetRaw.replace(/\n/g, ' ').slice(0, 160),
        ticker, asset_type: /option/i.test(assetType) ? 'option' : 'stock',
        trade_type: mapType(type), tx_date: txIso, range_label: range,
        open_ended_range: bracket.open_ended_range, owner_type: mapOwner(ownerRaw),
        options: /option/i.test(assetRaw)
          ? { strike: assetRaw.match(/Strike price:\s*\$?([\d.]+)/)?.[1] ?? null, expires: assetRaw.match(/Expires:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? null }
          : null,
        confidence: { overall: ticker ? 1 : 0.8, ticker: ticker ? 1 : 0, tx_date: 1, range: 1 },
        source_excerpt: cells.join(' | ').slice(0, 300),
      };
      const hitl = needsHitl(t);
      const lateness = latenessFor(t.tx_date, filedIso);
      const fingerprint = tradeFingerprint({
        tx_date: t.tx_date, asset_name: t.asset_name, trade_type: t.trade_type,
        range_label: t.range_label, owner_type: t.owner_type,
      });
      const dup = await db.query.trades.findFirst({
        where: (tr, { and: A, eq: E }) => A(E(tr.filing_id, filingRow.id), E(tr.row_fingerprint, fingerprint)),
      });
      if (dup) continue;

      let assetId: string;
      if (t.ticker) {
        const [a] = await db
          .insert(assets).values({ ticker: t.ticker, name: t.asset_name, asset_class: t.asset_type })
          .onConflictDoUpdate({ target: assets.ticker, set: { updated_at: new Date() } })
          .returning({ id: assets.id });
        assetId = a.id;
      } else {
        const [a] = await db.insert(assets).values({ name: t.asset_name, asset_class: t.asset_type }).returning({ id: assets.id });
        assetId = a.id;
      }

      const status = hitl.needed
        ? ('pending_review' as const)
        : publishTrade({ status: 'extracted', ticker: t.ticker ?? null, confidence: t.confidence.overall });

      const [tr] = await db.insert(trades).values({
        filing_id: filingRow.id, lawmaker_id: lm.id, asset_id: assetId,
        asset_type: t.asset_type, trade_type: t.trade_type,
        tx_date: t.tx_date, filing_date: filedIso,
        days_to_file: lateness.days_to_file, is_late: lateness.is_late, rule_version: lateness.rule_version,
        range_label: bracket.label,
        range_min: bracket.min !== null ? String(bracket.min) : null,
        range_max: bracket.max !== null ? String(bracket.max) : null,
        range_mid: bracketMidpoint(bracket) !== null ? String(bracketMidpoint(bracket)) : null,
        open_ended_range: bracket.open_ended_range,
        owner_type: t.owner_type, row_fingerprint: fingerprint, status,
        confidence: String(t.confidence.overall), source_excerpt: t.source_excerpt,
      }).returning({ id: trades.id });
      counts.trades++;
      if (status === 'published') counts.published++; else counts.pending++;

      if (hitl.needed) {
        await db.insert(hitlReviewQueue).values({
          trade_id: tr.id, filing_id: filingRow.id, raw_excerpt: t.source_excerpt,
          extracted_json: t, flag_reason: hitl.reasons.join(', '),
          confidence: String(t.confidence.overall), status: 'open',
        });
      }
    }
  }
  console.log(JSON.stringify({ msg: 'senate harvest imported', ...counts }));
} finally {
  await pool.end();
}
