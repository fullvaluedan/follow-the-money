import type { FilingsDocument, ParsedTradeRow } from '@ftm/connectors';
import { parseHousePtr, parseSenatePtr } from '@ftm/connectors';
import {
  bracketFromLabel,
  bracketMidpoint,
  latenessFor,
  tradeFingerprint,
  contentHash,
  extractedFilingSchema,
  needsHitl,
  canAutoPublish,
  publishTrade,
} from '@ftm/domain';
import type { ExtractedFiling, ExtractedTrade } from '@ftm/domain';
import { makeDb } from '@ftm/db';
import { lawmakers, filings, assets, trades, hitlReviewQueue } from '@ftm/db';
import type { InferSelectModel } from 'drizzle-orm';
import { and, eq } from 'drizzle-orm';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PARSER_VERSION = 'ptr_text_v1';

export interface IngestCounts {
  filings_seen: number;
  filings_skipped_unchanged: number;
  trades_created: number;
  trades_published: number;
  trades_pending_review: number;
  errors: string[];
}

function fixturesDir(): string {
  // apps/worker/src → repo root is 3 up
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'fixtures');
}

export function loadFixtureIndex(): Array<{
  file: string;
  chamber: 'house' | 'senate';
  source: string;
  external_doc_id: string;
  filed_at: string;
  source_url: string;
  raw_kind: 'pdf' | 'html' | 'xml' | 'json';
  filer: FilingsDocument['filer'];
}> {
  const idx = JSON.parse(readFileSync(join(fixturesDir(), 'index.json'), 'utf8'));
  return idx.filings;
}

export function loadLawmakers(): Array<{
  bioguide_id: string;
  name: string;
  chamber: 'house' | 'senate';
  party: string;
  state: string;
  district: number | null;
}> {
  const dir = fixturesDir();
  const full = join(dir, 'lawmakers_full.json');
  const path = existsSync(full) ? full : join(dir, 'lawmakers.json');
  const idx = JSON.parse(readFileSync(path, 'utf8'));
  return idx.lawmakers;
}

/**
 * Convert a parsed FilingsDocument into the extractor JSON contract shape.
 * Deterministic text parsing: confidence 1.0 for text-derived fields;
 * ticker confidence 1.0 only when actually resolved.
 */
function toExtractedFiling(doc: FilingsDocument): ExtractedFiling {
  const rows: ExtractedTrade[] = doc.rows.map((row: ParsedTradeRow) => ({
    asset_name: row.asset_name,
    ticker: row.ticker,
    asset_type: /etf|fund/i.test(row.asset_name) ? 'fund' : 'stock',
    trade_type: row.trade_type,
    tx_date: row.tx_date,
    range_label: row.range_label,
    open_ended_range: /over\s/i.test(row.range_label),
    owner_type: row.owner_type,
    options: null,
    confidence: {
      overall: row.ticker ? 1.0 : 0.9,
      ticker: row.ticker ? 1.0 : 0.0,
      tx_date: 1.0,
      range: bracketFromLabel(row.range_label) ? 1.0 : 0.0,
    },
    source_excerpt: row.source_excerpt,
  }));
  return extractedFilingSchema.parse({
    parser_version: PARSER_VERSION,
    filing: {
      chamber: doc.chamber,
      source_url: doc.source_url,
      external_doc_id: doc.external_doc_id,
      filed_at: doc.filed_at,
      raw_kind: doc.raw_kind,
    },
    filer: doc.filer,
    trades: rows,
    needs_hitl: false,
    hitl_reasons: [],
  });
}

export async function ingestOnce(databaseUrl: string): Promise<IngestCounts> {
  const { db, pool } = makeDb(databaseUrl);
  const counts: IngestCounts = {
    filings_seen: 0,
    filings_skipped_unchanged: 0,
    trades_created: 0,
    trades_published: 0,
    trades_pending_review: 0,
    errors: [],
  };

  try {
    // 1. Upsert lawmakers (by bioguide_id)
    const lawmakerIdByBioguide = new Map<string, string>();
    for (const lw of loadLawmakers()) {
      const [row] = await db
        .insert(lawmakers)
        .values({
          bioguide_id: lw.bioguide_id,
          name: lw.name,
          chamber: lw.chamber,
          party: lw.party as 'democrat' | 'republican' | 'independent' | 'other',
          state: lw.state,
          district: lw.district,
        })
        .onConflictDoUpdate({
          target: lawmakers.bioguide_id,
          set: { name: lw.name, updated_at: new Date() },
        })
        .returning({ id: lawmakers.id });
      lawmakerIdByBioguide.set(lw.bioguide_id, row.id);
    }

    // 2. Ingest each fixture filing
    for (const entry of loadFixtureIndex()) {
      counts.filings_seen++;
      const path = join(fixturesDir(), entry.file);
      if (!existsSync(path)) {
        counts.errors.push(`missing fixture file: ${entry.file}`);
        continue;
      }
      const raw = readFileSync(path, 'utf8');
      const sha = contentHash(raw);

      // Idempotency: skip if existing filing has identical sha256
      const existing = await db.query.filings.findFirst({
        where: (f, { and, eq }) =>
          and(eq(f.chamber, entry.chamber), eq(f.external_doc_id, entry.external_doc_id)),
      });
      if (existing && existing.sha256 === sha) {
        counts.filings_skipped_unchanged++;
        continue;
      }

      const [filingRow] = await db
        .insert(filings)
        .values({
          chamber: entry.chamber,
          source: entry.source,
          external_doc_id: entry.external_doc_id,
          filed_at: entry.filed_at,
          source_url: entry.source_url,
          sha256: sha,
          parser_version: PARSER_VERSION,
          raw_kind: entry.raw_kind,
          status: 'ingested',
        })
        .onConflictDoUpdate({
          target: [filings.chamber, filings.source, filings.external_doc_id],
          set: { sha256: sha, status: 'ingested', updated_at: new Date() },
        })
        .returning({ id: filings.id });

      const lawmakerId = entry.filer.bioguide_id
        ? lawmakerIdByBioguide.get(entry.filer.bioguide_id)
        : undefined;
      if (!lawmakerId) {
        counts.errors.push(`lawmaker not resolved for filing ${entry.external_doc_id}`);
        continue;
      }

      // Parse via chamber adapter; if the primary adapter finds no rows (format drift),
      // fall back to the other chamber's adapter before giving up (documented robustness).
      let doc = entry.chamber === 'house' ? parseHousePtr(raw, entry) : parseSenatePtr(raw, entry);
      if (doc.rows.length === 0) {
        doc = entry.chamber === 'house' ? parseSenatePtr(raw, entry) : parseHousePtr(raw, entry);
      }
      const extracted = toExtractedFiling(doc);

      // 4. Create trades
      for (const t of extracted.trades) {
        const bracket = bracketFromLabel(t.range_label);
        if (!bracket) {
          counts.errors.push(
            `unrecognized range label in ${entry.external_doc_id}: ${t.range_label}`,
          );
          continue;
        }
        const hitl = needsHitl(t);
        const lateness = latenessFor(t.tx_date, entry.filed_at);
        const fingerprint = tradeFingerprint({
          tx_date: t.tx_date,
          asset_name: t.asset_name,
          trade_type: t.trade_type,
          range_label: t.range_label,
          owner_type: t.owner_type,
        });

        // Dedup: skip if fingerprint already exists for this filing
        const dup = await db.query.trades.findFirst({
          where: (tr, { and, eq }) =>
            and(eq(tr.filing_id, filingRow.id), eq(tr.row_fingerprint, fingerprint)),
        });
        if (dup) continue;

        // Resolve asset (by ticker when available)
        let assetId: string;
        if (t.ticker) {
          const [asset] = await db
            .insert(assets)
            .values({ ticker: t.ticker, name: t.asset_name, asset_class: t.asset_type })
            .onConflictDoUpdate({
              target: assets.ticker,
              set: { name: t.asset_name, updated_at: new Date() },
            })
            .returning({ id: assets.id });
          assetId = asset.id;
        } else {
          const [asset] = await db
            .insert(assets)
            .values({ name: t.asset_name, asset_class: t.asset_type })
            .returning({ id: assets.id });
          assetId = asset.id;
        }

        // Publish guard: pending_review unless auto-publish criteria met
        const status = hitl.needed
          ? ('pending_review' as const)
          : publishTrade({
              status: 'extracted',
              ticker: t.ticker ?? null,
              confidence: t.confidence.overall,
            });

        const [trade] = await db
          .insert(trades)
          .values({
            filing_id: filingRow.id,
            lawmaker_id: lawmakerId,
            asset_id: assetId,
            asset_type: t.asset_type,
            trade_type: t.trade_type,
            tx_date: t.tx_date,
            filing_date: entry.filed_at,
            days_to_file: lateness.days_to_file,
            is_late: lateness.is_late,
            rule_version: lateness.rule_version,
            range_label: bracket.label,
            range_min: bracket.min !== null ? String(bracket.min) : null,
            range_max: bracket.max !== null ? String(bracket.max) : null,
            range_mid:
              bracketMidpoint(bracket) !== null ? String(bracketMidpoint(bracket)) : null,
            open_ended_range: bracket.open_ended_range,
            owner_type: t.owner_type,
            row_fingerprint: fingerprint,
            status,
            confidence: String(t.confidence.overall),
            source_excerpt: t.source_excerpt ?? null,
          })
          .returning({ id: trades.id });
        counts.trades_created++;
        if (status === 'published') counts.trades_published++;
        if (status === 'pending_review') counts.trades_pending_review++;

        if (hitl.needed) {
          await db.insert(hitlReviewQueue).values({
            trade_id: trade.id,
            filing_id: filingRow.id,
            raw_excerpt: t.source_excerpt ?? null,
            extracted_json: t,
            flag_reason: hitl.reasons.join(', '),
            confidence: String(t.confidence.overall),
            status: 'open',
          });
        }
      }
    }
  } finally {
    await pool.end();
  }
  return counts;
}
