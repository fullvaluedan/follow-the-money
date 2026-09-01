import { z } from 'zod';
import { bracketFromLabel } from './brackets';

/**
 * Extractor JSON contract (mirrors apps/extractor pydantic models).
 * A filing extraction that fails this schema is rejected — never partially ingested.
 */

const confidenceSchema = z.object({
  overall: z.number().min(0).max(1),
  ticker: z.number().min(0).max(1),
  tx_date: z.number().min(0).max(1),
  range: z.number().min(0).max(1),
});

export const extractedTradeSchema = z.object({
  asset_name: z.string().min(1),
  ticker: z.string().nullable().optional(),
  asset_type: z.enum(['stock', 'bond', 'fund', 'option', 'commodity_future', 'other']),
  trade_type: z.enum(['purchase', 'sale', 'exchange', 'unknown']),
  tx_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'tx_date must be YYYY-MM-DD'),
  range_label: z.string().min(1),
  range_min: z.number().nullable().optional(),
  range_max: z.number().nullable().optional(),
  open_ended_range: z.boolean().optional().default(false),
  owner_type: z.enum(['filer', 'spouse', 'joint', 'dependent_child', 'other']),
  options: z.record(z.unknown()).nullable().optional(),
  confidence: confidenceSchema,
  source_excerpt: z.string().optional(),
});

export const extractedFilingSchema = z.object({
  parser_version: z.string().min(1),
  filing: z.object({
    chamber: z.enum(['house', 'senate']),
    source_url: z.string().url(),
    external_doc_id: z.string().min(1),
    filed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    raw_kind: z.enum(['pdf', 'html', 'xml', 'json']),
  }),
  filer: z.object({
    printed_name: z.string().min(1),
    bioguide_id: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    district: z.string().nullable().optional(),
  }),
  trades: z.array(extractedTradeSchema),
  needs_hitl: z.boolean(),
  hitl_reasons: z.array(z.string()),
});

export type ExtractedTrade = z.infer<typeof extractedTradeSchema>;
export type ExtractedFiling = z.infer<typeof extractedFilingSchema>;

/** Confidence at or above this (and a resolved ticker) allows auto-publish. */
export const AUTO_PUBLISH_CONFIDENCE = 0.95;

export function needsHitl(trade: ExtractedTrade): { needed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (trade.confidence.overall < AUTO_PUBLISH_CONFIDENCE) reasons.push('low_overall_confidence');
  if (trade.confidence.ticker < AUTO_PUBLISH_CONFIDENCE) reasons.push('low_ticker_confidence');
  if (!trade.ticker) reasons.push('ticker_unresolved');
  if (!bracketFromLabel(trade.range_label)) reasons.push('unrecognized_range_label');
  return { needed: reasons.length > 0, reasons };
}
