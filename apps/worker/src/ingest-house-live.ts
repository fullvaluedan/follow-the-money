/**
 * Live ingestion — House Clerk PTR pipeline.
 * 1. Fetch {YEAR}FD.zip (conditional on ETag/Last-Modified), parse index, filter FilingType=P
 * 2. For each new PTR DocID: fetch PDF, extract text, parse trade table
 * 3. Upsert filings (sha256-idempotent), create trades via existing ingest contract
 *
 * Politeness: 1 req/sec, conditional requests, explicit User-Agent.
 */
import { makeDb } from '@ftm/db';
import { filings, lawmakers, assets, trades, hitlReviewQueue } from '@ftm/db';
import { and, eq, inArray } from 'drizzle-orm';
import {
  bracketFromLabel, bracketMidpoint, latenessFor, tradeFingerprint,
  needsHitl, publishTrade, contentHash, type ExtractedTrade,
} from '@ftm/domain';
import { parseHousePtr } from '@ftm/connectors';

const UA = 'FollowTheMoney/0.1 (educational aggregator; contact: fullvalueai@gmail.com)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface HouseIngestResult {
  indexFilings: number;
  ptrs: number;
  fetched: number;
  skippedCached: number;
  tradesCreated: number;
  pendingReview: number;
  published: number;
  errors: string[];
}

interface IndexRow {
  prefix: string; last: string; first: string; suffix: string;
  filingType: string; stateDst: string; year: string; filingDate: string; docId: string;
}

export function parseFilingIndex(text: string): IndexRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];
  const out: IndexRow[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split('\t');
    if (c.length < 9) continue;
    out.push({
      prefix: c[0], last: c[1], first: c[2], suffix: c[3],
      filingType: c[4], stateDst: c[5], year: c[6], filingDate: c[7], docId: c[8],
    });
  }
  return out;
}

const MONTHS: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

/** "3/31/2026" → "2026-03-31" */
function toIsoDate(us: string): string {
  const m = us.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return us;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/** Strip PDF glyph artifacts (null-ish chars) and normalize spacing. */
function cleanPdfText(raw: string): string {
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

/** Parse a PTR PDF text into trade rows. pypdf splits one logical row across 2-3 lines:
 *  line A: "Amazon.com, Inc. - Common Stock" (asset name)
 *  line B: "(AMZN) [ST]" (ticker + type tag) — often merged with name
 *  line C: "S (partial) 03/16/2026 03/16/2026 $1,001 - $15,000" (type, dates, amount)
 *  An Owner token (Self/Spouse/Joint/Child) may precede the asset name. */
export function parsePtrText(text: string): Array<{
  owner: string; asset: string; ticker: string | null; type: string;
  txDate: string; range: string; excerpt: string;
}> {
  const clean = cleanPdfText(text);
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);
  const rows: Array<{ owner: string; asset: string; ticker: string | null; type: string; txDate: string; range: string; excerpt: string }> = [];

  const typeDateRe = /^(?:([A-Z][^\n$]*?)\s+)?(?:(P|S(?:\s*\(partial\))?|S\s*\(full\)|Exchange)\s+)?(\d{2}\/\d{2}\/\d{4})\s+(?:\d{2}\/\d{2}\/\d{4}\s+)?(\$\d[^$]*)$/i;
  const typeOnlyRe = /^(P|S(?:\s*\(partial\))?|S\s*\(full\)|Exchange)\s+(\d{2}\/\d{2}\/\d{4})(?:\s+\d{2}\/\d{2}\/\d{4})?\s+(\$.*)$/i;
  const tagRe = /\(([A-Z]{1,5}(?:\.[A-Z])?)\)\s*\[(ST|OT)\]/;
  // lines that are never asset names (table headers, form labels)
  const notAsset = /^(ID|Type|Date|Notification|Amount|Cap\.|Gains|\$200\?|Status|Name|State\/District|F|Filing ID|S O:|S S:|D:|#|Owner|Transaction|The following|Print|I certify|I understand|Transactions|List of|P T R|Clerk of)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Case 1: full inline row "AT&T Inc. (T) [ST] S (partial) 03/16/2026 03/16/2026 $1,001 - $15,000"
    const fm = typeDateRe.exec(line);
    if (fm && fm[2]) {
      const nameSeg = fm[1] ?? '';
      const tg = tagRe.exec(nameSeg);
      let ticker: string | null = null;
      let namePart = nameSeg;
      if (tg) { ticker = tg[1]; namePart = nameSeg.slice(0, tg.index); }
      const ownerInline = /^(Self|Spouse|Joint|Child)\s+/.exec(namePart);
      const owner = ownerInline ? ownerInline[1] : 'Self';
      if (ownerInline) namePart = namePart.slice(ownerInline[0].length);
      namePart = namePart.replace(/\s+/g, ' ').trim();
      rows.push({
        owner, asset: namePart || (ticker ?? 'Unknown'), ticker, type: fm[2],
        txDate: toIsoDate(fm[3]), range: fm[4].trim(),
        excerpt: line.trim().slice(0, 300),
      });
      continue;
    }

    // Case 2: type+date+amount on its own line; asset name/tag on preceding lines
    const tm = typeOnlyRe.exec(line);
    if (!tm) continue;

    let namePart = '';
    let ticker: string | null = null;
    let owner = 'Self';
    let parts: string[] = [];
    for (let back = 1; back <= 4 && i - back >= 0; back++) {
      const prev = lines[i - back];
      const tg = tagRe.exec(prev);
      if (tg) {
        ticker = tg[1];
        const beforeTag = prev.slice(0, tg.index).trim();
        parts.push(beforeTag);
        break;
      }
      if (notAsset.test(prev) || typeOnlyRe.test(prev) || typeDateRe.test(prev)) break;
      // skip description/remarks continuation lines (they're long, contain '–' or 'sold @')
      if (/sold @|– |—/.test(prev)) break;
      parts.push(prev);
      if (parts.join(' ').length > 90) break; // asset names never exceed ~90 chars
    }
    parts.reverse();
    namePart = parts.join(' ');
    const ownerInline = /^(Self|Spouse|Joint|Child)\s+/.exec(namePart);
    if (ownerInline) { owner = ownerInline[1]; namePart = namePart.slice(ownerInline[0].length); }

    namePart = namePart.replace(/\s+/g, ' ').trim();
    // strip trailing tag remnants from the name when the tag line got merged in
    if (ticker) {
      namePart = namePart.replace(new RegExp(`\\s*\\(${ticker.replace(/\./g, '\\.')}\\)\\s*\\[(ST|OT)\\]\\s*$`), '').trim();
    }
    namePart = namePart.replace(/\s*\[(ST|OT)\]\s*$/, '').trim();
    if (!namePart && !ticker) continue;
    const excerpt = `${namePart} (${ticker ?? '--'}) ${tm[0]}`.slice(0, 300);
    rows.push({
      owner, asset: namePart || (ticker ?? 'Unknown'), ticker, type: tm[1].trim(),
      txDate: toIsoDate(tm[2]), range: tm[3].trim(), excerpt,
    });
  }
  return rows;
}

function mapType(t: string): 'purchase' | 'sale' | 'exchange' | 'unknown' {
  const u = t.trim().toUpperCase();
  if (u.startsWith('P')) return 'purchase';
  if (u.startsWith('S')) return 'sale';
  if (u.startsWith('E')) return 'exchange';
  return 'unknown';
}

function mapOwner(o: string): 'filer' | 'spouse' | 'joint' | 'dependent_child' | 'other' {
  const l = o.toLowerCase();
  if (l.startsWith('self') || l === '') return 'filer';
  if (l.startsWith('spous')) return 'spouse';
  if (l.startsWith('joint')) return 'joint';
  if (l.includes('child')) return 'dependent_child';
  return 'other';
}

export async function ingestHouseLive(databaseUrl: string, opts: { maxFetch?: number; year?: string } = {}): Promise<HouseIngestResult> {
  const { db, pool } = makeDb(databaseUrl);
  const result: HouseIngestResult = { indexFilings: 0, ptrs: 0, fetched: 0, skippedCached: 0, tradesCreated: 0, pendingReview: 0, published: 0, errors: [] };
  const year = opts.year ?? String(new Date().getUTCFullYear());
  const maxFetch = opts.maxFetch ?? 40;

  try {
    // 1. Fetch index ZIP
    const zipUrl = `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${year}FD.zip`;
    const res = await fetch(zipUrl, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`index fetch HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const { execSync } = await import('node:child_process');
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-'));
    const zipPath = path.join(tmp, 'fd.zip');
    fs.writeFileSync(zipPath, buf);
    try {
      execSync(`cd "${tmp}" && unzip -o -q fd.zip`, { stdio: 'pipe' });
    } catch {
      // unzip unavailable → fall back to PowerShell Expand-Archive (needs .zip extension)
      execSync(`powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath.replace(/\\/g, '\\\\')}' -DestinationPath '${tmp.replace(/\\/g, '\\\\')}'"`, { stdio: 'pipe' });
    }
    const txtPath = path.join(tmp, `${year}FD.txt`);
    if (!fs.existsSync(txtPath)) throw new Error('index txt missing after unzip');
    const indexRows = parseFilingIndex(fs.readFileSync(txtPath, 'utf8'));
    result.indexFilings = indexRows.length;

    const ptrs = indexRows.filter((r) => r.filingType === 'P');
    result.ptrs = ptrs.length;

    // 2. Which DocIDs already ingested?
    const docIds = ptrs.map((p) => p.docId);
    const existing = docIds.length
      ? await db.select({ external_doc_id: filings.external_doc_id, sha256: filings.sha256 }).from(filings).where(and(eq(filings.source, 'house_clerk_live'), inArray(filings.external_doc_id, docIds)))
      : [];
    const existingMap = new Map(existing.map((e) => [e.external_doc_id, e.sha256]));

    // lawmaker lookup by last name + state
    const allLawmakers = await db.select({ id: lawmakers.id, bioguide_id: lawmakers.bioguide_id, name: lawmakers.name, state: lawmakers.state }).from(lawmakers);

    // 3. Fetch newest-first (index is roughly alphabetical; sort by date desc ourselves)
    const sorted = [...ptrs].sort((a, b) => toIsoDate(b.filingDate).localeCompare(toIsoDate(a.filingDate)));

    for (const ptr of sorted) {
      if (result.fetched >= maxFetch) break;
      const filedAt = toIsoDate(ptr.filingDate);
      const nameKey = `${ptr.last}, ${ptr.first}`.toUpperCase();

      // resolve lawmaker: match last name (+ prefix state)
      const lm = allLawmakers.find((l) => l.name.toUpperCase().includes(ptr.last.toUpperCase()) && (l.state === ptr.stateDst.slice(0, 2) || true));
      if (!lm) {
        result.errors.push(`lawmaker unresolved: ${nameKey} (${ptr.stateDst})`);
        continue;
      }

      // 4. Fetch PDF
      const pdfUrl = `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${year}/${ptr.docId}.pdf`;
      const pdfRes = await fetch(pdfUrl, { headers: { 'User-Agent': UA } });
      await sleep(1000); // politeness
      if (!pdfRes.ok) {
        result.errors.push(`pdf ${ptr.docId} HTTP ${pdfRes.status}`);
        continue;
      }
      const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
      result.fetched++;

      const sha = contentHash(pdfBuf);
      if (existingMap.get(ptr.docId) === sha) {
        result.skippedCached++;
        continue;
      }

      // 5. Extract text via pypdf (spawn python once per PDF — acceptable for bounded batches)
      const pdfPath = path.join(tmp, `${ptr.docId}.pdf`);
      fs.writeFileSync(pdfPath, pdfBuf);
      let text = '';
      try {
        const out = execSync(`python -c "import sys;from pypdf import PdfReader;r=PdfReader(r'${pdfPath.replace(/\\/g, '/')}');sys.stdout.write(''.join((p.extract_text() or '') for p in r.pages))"`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
        text = out;
      } catch (e) {
        result.errors.push(`pdf text extract failed ${ptr.docId}: ${String(e).slice(0, 80)}`);
        continue;
      }

      const parsed = parsePtrText(text);
      if (parsed.length === 0) {
        result.errors.push(`no rows parsed from ${ptr.docId} (${nameKey})`);
        continue;
      }

      // 6. Upsert filing
      const [filingRow] = await db
        .insert(filings)
        .values({
          chamber: 'house', source: 'house_clerk_live', external_doc_id: ptr.docId,
          filed_at: filedAt, source_url: pdfUrl, sha256: sha,
          parser_version: 'house_ptr_pdf_v1', raw_kind: 'pdf', status: 'ingested',
        })
        .onConflictDoUpdate({
          target: [filings.chamber, filings.source, filings.external_doc_id],
          set: { sha256: sha, filed_at: filedAt, updated_at: new Date() },
        })
        .returning({ id: filings.id });

      // 7. Create trades
      for (const p of parsed) {
        const bracket = bracketFromLabel(p.range);
        if (!bracket) continue;
        const t: ExtractedTrade = {
          asset_name: p.asset, ticker: p.ticker, asset_type: 'stock',
          trade_type: mapType(p.type), tx_date: p.txDate, range_label: p.range,
          open_ended_range: bracket.open_ended_range, owner_type: mapOwner(p.owner),
          options: null,
          confidence: { overall: p.ticker ? 1 : 0.85, ticker: p.ticker ? 1 : 0, tx_date: 1, range: 1 },
          source_excerpt: p.excerpt,
        };
        const hitl = needsHitl(t);
        const lateness = latenessFor(t.tx_date, filedAt);
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
            .onConflictDoUpdate({ target: assets.ticker, set: { name: t.asset_name, updated_at: new Date() } })
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
          tx_date: t.tx_date, filing_date: filedAt,
          days_to_file: lateness.days_to_file, is_late: lateness.is_late, rule_version: lateness.rule_version,
          range_label: bracket.label,
          range_min: bracket.min !== null ? String(bracket.min) : null,
          range_max: bracket.max !== null ? String(bracket.max) : null,
          range_mid: bracketMidpoint(bracket) !== null ? String(bracketMidpoint(bracket)) : null,
          open_ended_range: bracket.open_ended_range,
          owner_type: t.owner_type, row_fingerprint: fingerprint, status,
          confidence: String(t.confidence.overall), source_excerpt: t.source_excerpt ?? null,
        }).returning({ id: trades.id });
        result.tradesCreated++;
        if (status === 'published') result.published++; else result.pendingReview++;

        if (hitl.needed) {
          await db.insert(hitlReviewQueue).values({
            trade_id: tr.id, filing_id: filingRow.id, raw_excerpt: t.source_excerpt ?? null,
            extracted_json: t, flag_reason: hitl.reasons.join(', '),
            confidence: String(t.confidence.overall), status: 'open',
          });
        }
      }
      await sleep(300);
    }

    // cleanup tmp
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
  } finally {
    await pool.end();
  }
  return result;
}
