/**
 * Live ingestion — Senate eFD PTR pipeline.
 * 1. GET /search/ to obtain session + CSRF token (agreement cookie set on first GET)
 * 2. POST /search/ with filer_type=1 (Senator) + report_type=11 (PTR), paginate
 * 3. Parse result rows: name, office, report link (/search/view/ptr/{uuid}/), filed date
 * 4. Fetch each report page → structured tab-separated transaction rows (ticker included!)
 * 5. Upsert filings + trades via existing contract
 *
 * Politeness: 1 req/sec, explicit User-Agent, bounded pages.
 */
import { makeDb } from '@ftm/db';
import { filings, lawmakers, assets, trades, hitlReviewQueue } from '@ftm/db';
import { and, eq } from 'drizzle-orm';
import {
  bracketFromLabel, bracketMidpoint, latenessFor, tradeFingerprint,
  needsHitl, publishTrade, contentHash, type ExtractedTrade,
} from '@ftm/domain';

const UA = 'FollowTheMoney/0.1 (educational aggregator; contact: fullvalueai@gmail.com)';
const BASE = 'https://efdsearch.senate.gov';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SenateIngestResult {
  pages: number;
  reportsSeen: number;
  fetched: number;
  skippedCached: number;
  tradesCreated: number;
  pendingReview: number;
  published: number;
  errors: string[];
}

interface ReportRow {
  uuid: string;
  first: string;
  last: string;
  office: string;
  filedDate: string; // ISO
}

/** Extract CSRF token + establish agreement cookie. */
async function establishSession(): Promise<string | null> {
  const res = await fetch(`${BASE}/search/`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`search GET HTTP ${res.status}`);
  const html = await res.text();
  const m = html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/);
  // NOTE: fetch() here doesn't persist cookies across calls. The agreement POST sets the
  // session cookie needed for search. We replicate what a browser does:
  // POST to /search/ with prohibition_agreement=on → sets cookie, then searches work.
  return m?.[1] ?? null;
}

/** Parse the search results HTML for report rows. */
export function parseSearchResults(html: string): ReportRow[] {
  const out: ReportRow[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(html)) !== null) {
    const row = rm[1];
    const linkM = row.match(/href="\/search\/view\/ptr\/([0-9a-f-]{36})\/"/i);
    if (!linkM) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1].replace(/<[^>]+>/g, '').trim());
    if (cells.length < 5) continue;
    const [first, last, , , filedRaw] = cells;
    const filed = filedRaw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    out.push({
      uuid: linkM[1],
      first,
      last,
      office: cells[2],
      filedDate: filed ? `${filed[3]}-${filed[1]}-${filed[2]}` : filedRaw,
    });
  }
  return out;
}

/** Parse one PTR report page into transaction rows (tab-separated in page text). */
export function parseReportPage(html: string): Array<{
  txDate: string; owner: string; ticker: string | null; asset: string;
  assetType: string; type: string; range: string;
}> {
  // strip tags → text; the transactions table is tab-separated within <pre>-ish flow
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<t[dh][^>]*>/gi, '\t')
    .replace(/<tr[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  const out: Array<{ txDate: string; owner: string; ticker: string | null; asset: string; assetType: string; type: string; range: string }> = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    // "# date owner ticker asset... assetType type range"
    const m = line.match(/^(\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+(Self|Joint|Spouse|Dependent Child)\s+(--|[A-Z][A-Z0-9.=]{0,10})\s+(.+?)\s{2,}|\t/);
    if (!m) {
      // fallback: tab-structured parse
      const cells = rawLine.split('\t').map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 8 && /^\d+$/.test(cells[0]) && /^\d{2}\/\d{2}\/\d{4}$/.test(cells[1])) {
        out.push({
          txDate: `${cells[1].slice(6)}-${cells[1].slice(0, 2)}-${cells[1].slice(3, 5)}`,
          owner: cells[2],
          ticker: cells[3] === '--' ? null : cells[3],
          asset: cells[4],
          assetType: cells[5],
          type: cells[6],
          range: cells[7],
        });
      }
      continue;
    }
  }
  return out;
}

function mapType(t: string): 'purchase' | 'sale' | 'exchange' | 'unknown' {
  const u = t.trim().toLowerCase();
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

export async function ingestSenateLive(databaseUrl: string, opts: { maxReports?: number; maxPages?: number } = {}): Promise<SenateIngestResult> {
  const { db, pool } = makeDb(databaseUrl);
  const result: SenateIngestResult = { pages: 0, reportsSeen: 0, fetched: 0, skippedCached: 0, tradesCreated: 0, pendingReview: 0, published: 0, errors: [] };
  const maxReports = opts.maxReports ?? 30;
  const maxPages = opts.maxPages ?? 3;

  try {
    // 1. Establish session: GET then agreement POST (browser-equivalent)
    await establishSession();
    const agreeRes = await fetch(`${BASE}/search/`, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${BASE}/search/` },
      body: new URLSearchParams({ prohibition_agreement: 'on' }).toString(),
      redirect: 'manual',
    });
    // cookie from response headers
    const setCookies = agreeRes.headers.getSetCookie?.() ?? [];
    const cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
    if (!cookie) result.errors.push('no session cookie from agreement POST');
    await sleep(1000);

    const allReports: ReportRow[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const searchRes = await fetch(`${BASE}/search/`, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Referer: `${BASE}/search/`, Cookie: cookie },
        body: new URLSearchParams({
          filer_type: '1',
          report_type: '11',
          sort_field: 'filed_dt_desc',
          page: String(page),
        }).toString(),
      });
      if (!searchRes.ok) { result.errors.push(`search page ${page} HTTP ${searchRes.status}`); break; }
      const html = await searchRes.text();
      const rows = parseSearchResults(html);
      result.pages++;
      if (rows.length === 0) break;
      allReports.push(...rows);
      await sleep(1000);
    }
    result.reportsSeen = allReports.length;

    const existing = await db.select({ external_doc_id: filings.external_doc_id, sha256: filings.sha256 }).from(filings).where(eq(filings.source, 'senate_efd_live'));
    const existingMap = new Map(existing.map((e) => [e.external_doc_id, e.sha256]));
    const allLawmakers = await db.select({ id: lawmakers.id, bioguide_id: lawmakers.bioguide_id, name: lawmakers.name }).from(lawmakers);

    for (const report of allReports) {
      if (result.fetched >= maxReports) break;
      const nameKey = `${report.last}, ${report.first}`.toUpperCase();
      const lm = allLawmakers.find((l) => l.name.toUpperCase().includes(report.last.toUpperCase()));
      if (!lm) { result.errors.push(`lawmaker unresolved: ${nameKey}`); continue; }

      const viewUrl = `${BASE}/search/view/ptr/${report.uuid}/`;
      const res = await fetch(viewUrl, { headers: { 'User-Agent': UA, Cookie: cookie, Referer: `${BASE}/search/` } });
      await sleep(1000);
      if (!res.ok) { result.errors.push(`view ${report.uuid} HTTP ${res.status}`); continue; }
      const html = await res.text();
      result.fetched++;
      const sha = contentHash(html);
      if (existingMap.get(report.uuid) === sha) { result.skippedCached++; continue; }

      const txs = parseReportPage(html);
      if (txs.length === 0) { result.errors.push(`no rows: ${report.uuid} (${nameKey})`); continue; }

      const [filingRow] = await db
        .insert(filings)
        .values({
          chamber: 'senate', source: 'senate_efd_live', external_doc_id: report.uuid,
          filed_at: report.filedDate, source_url: viewUrl, sha256: sha,
          parser_version: 'senate_efd_html_v1', raw_kind: 'html', status: 'ingested',
        })
        .onConflictDoUpdate({
          target: [filings.chamber, filings.source, filings.external_doc_id],
          set: { sha256: sha, filed_at: report.filedDate, updated_at: new Date() },
        })
        .returning({ id: filings.id });

      for (const tx of txs) {
        const bracket = bracketFromLabel(tx.range);
        if (!bracket) continue;
        // ticker extraction from asset name "(TICKER)" as backup
        const nameTicker = tx.asset.match(/\(([A-Z]{1,5})\)/);
        const ticker = tx.ticker ?? nameTicker?.[1] ?? null;
        const t: ExtractedTrade = {
          asset_name: tx.asset, ticker, asset_type: /option/i.test(tx.assetType) ? 'option' : 'stock',
          trade_type: mapType(tx.type), tx_date: tx.txDate, range_label: tx.range,
          open_ended_range: bracket.open_ended_range, owner_type: mapOwner(tx.owner),
          options: /option/i.test(tx.assetType)
            ? { strike: tx.asset.match(/Strike price:\s*\$?([\d.]+)/)?.[1] ?? null, expires: tx.asset.match(/Expires:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? null, kind: /call/i.test(tx.asset) ? 'call' : /put/i.test(tx.asset) ? 'put' : null }
            : null,
          confidence: { overall: ticker ? 1 : 0.85, ticker: ticker ? 1 : 0, tx_date: 1, range: 1 },
          source_excerpt: `${tx.asset} | ${tx.type} | ${tx.range}`.slice(0, 300),
        };
        const hitl = needsHitl(t);
        const lateness = latenessFor(t.tx_date, report.filedDate);
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
            .insert(assets).values({ ticker: t.ticker, name: t.asset_name.slice(0, 120), asset_class: t.asset_type })
            .onConflictDoUpdate({ target: assets.ticker, set: { updated_at: new Date() } })
            .returning({ id: assets.id });
          assetId = a.id;
        } else {
          const [a] = await db.insert(assets).values({ name: t.asset_name.slice(0, 120), asset_class: t.asset_type }).returning({ id: assets.id });
          assetId = a.id;
        }

        const status = hitl.needed
          ? ('pending_review' as const)
          : publishTrade({ status: 'extracted', ticker: t.ticker ?? null, confidence: t.confidence.overall });

        const [tr] = await db.insert(trades).values({
          filing_id: filingRow.id, lawmaker_id: lm.id, asset_id: assetId,
          asset_type: t.asset_type, trade_type: t.trade_type,
          tx_date: t.tx_date, filing_date: report.filedDate,
          days_to_file: lateness.days_to_file, is_late: lateness.is_late, rule_version: lateness.rule_version,
          range_label: bracket.label,
          range_min: bracket.min !== null ? String(bracket.min) : null,
          range_max: bracket.max !== null ? String(bracket.max) : null,
          range_mid: bracketMidpoint(bracket) !== null ? String(bracketMidpoint(bracket)) : null,
          open_ended_range: bracket.open_ended_range,
          owner_type: t.owner_type, row_fingerprint: fingerprint, status,
          confidence: String(t.confidence.overall), source_excerpt: t.source_excerpt,
        }).returning({ id: trades.id });
        result.tradesCreated++;
        if (status === 'published') result.published++; else result.pendingReview++;

        if (hitl.needed) {
          await db.insert(hitlReviewQueue).values({
            trade_id: tr.id, filing_id: filingRow.id, raw_excerpt: t.source_excerpt,
            extracted_json: t, flag_reason: hitl.reasons.join(', '),
            confidence: String(t.confidence.overall), status: 'open',
          });
        }
      }
      await sleep(300);
    }
  } finally {
    await pool.end();
  }
  return result;
}
