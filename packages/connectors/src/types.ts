import { z } from 'zod';

/**
 * Canonical intermediate type both chamber adapters emit.
 * The adapter's job: raw document text → FilingsDocument (typed).
 * Ticker resolution and bracket mapping happen downstream (ingest).
 */

export const parsedTradeRowSchema = z.object({
  owner_raw: z.string().min(1), // as printed
  asset_name: z.string().min(1), // as printed
  ticker: z.string().nullable(), // resolved if trivially derivable, else null
  trade_type_raw: z.string().min(1), // e.g. 'P' (House) / 'Purchase' (Senate)
  trade_type: z.enum(['purchase', 'sale', 'exchange', 'unknown']),
  tx_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  range_label: z.string().min(1),
  owner_type: z.enum(['filer', 'spouse', 'joint', 'dependent_child', 'other']),
  source_excerpt: z.string(),
});

export const filingsDocumentSchema = z.object({
  chamber: z.enum(['house', 'senate']),
  source: z.string(), // 'house_clerk_yearly' | 'senate_efd'
  external_doc_id: z.string(),
  filed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source_url: z.string().url(),
  raw_kind: z.enum(['pdf', 'html', 'xml', 'json']),
  filer: z.object({
    printed_name: z.string(),
    bioguide_id: z.string().nullable(),
    state: z.string().nullable(),
    district: z.union([z.string(), z.number()]).nullable(),
  }),
  rows: z.array(parsedTradeRowSchema),
});

export type ParsedTradeRow = z.infer<typeof parsedTradeRowSchema>;
export type FilingsDocument = z.infer<typeof filingsDocumentSchema>;

export interface FilingMeta {
  chamber: 'house' | 'senate';
  source: string;
  external_doc_id: string;
  filed_at: string;
  source_url: string;
  raw_kind: 'pdf' | 'html' | 'xml' | 'json';
  filer: FilingsDocument['filer'];
}
