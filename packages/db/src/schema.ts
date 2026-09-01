import {
  pgTable,
  pgEnum,
  pgView,
  uuid,
  text,
  varchar,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const chamberEnum = pgEnum('chamber', ['house', 'senate']);
export const partyEnum = pgEnum('party', ['democrat', 'republican', 'independent', 'other']);
export const tradeTypeEnum = pgEnum('trade_type', ['purchase', 'sale', 'exchange', 'unknown']);
export const ownerTypeEnum = pgEnum('owner_type', ['filer', 'spouse', 'joint', 'dependent_child', 'other']);
export const assetTypeEnum = pgEnum('asset_type', ['stock', 'bond', 'fund', 'option', 'commodity_future', 'other']);
export const tradeStatusEnum = pgEnum('trade_status', ['extracted', 'pending_review', 'published', 'rejected']);
export const rawKindEnum = pgEnum('raw_kind', ['pdf', 'html', 'xml', 'json']);
export const filingStatusEnum = pgEnum('filing_status', ['discovered', 'ingested', 'failed']);
export const hitlStatusEnum = pgEnum('hitl_status', ['open', 'approved', 'rejected', 'edited']);

const timestamps = {
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

export const lawmakers = pgTable('lawmakers', {
  id: uuid('id').defaultRandom().primaryKey(),
  bioguide_id: varchar('bioguide_id', { length: 16 }).notNull().unique(),
  name: text('name').notNull(),
  chamber: chamberEnum('chamber').notNull(),
  party: partyEnum('party').notNull(),
  state: varchar('state', { length: 4 }).notNull(),
  district: integer('district'),
  image_url: text('image_url'),
  ...timestamps,
});

export const lawmakerTerms = pgTable('lawmaker_terms', {
  id: uuid('id').defaultRandom().primaryKey(),
  lawmaker_id: uuid('lawmaker_id').notNull().references(() => lawmakers.id),
  start_date: date('start_date').notNull(),
  end_date: date('end_date'),
  congress_number: integer('congress_number'),
  ...timestamps,
});

export const committees = pgTable('committees', {
  id: uuid('id').defaultRandom().primaryKey(),
  chamber: chamberEnum('chamber').notNull(),
  name: text('name').notNull(),
  system_code: varchar('system_code', { length: 32 }),
  jurisdiction_tags: jsonb('jurisdiction_tags').$type<string[]>().default([]).notNull(),
  ...timestamps,
});

export const committeeMemberships = pgTable('committee_memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  lawmaker_id: uuid('lawmaker_id').notNull().references(() => lawmakers.id),
  committee_id: uuid('committee_id').notNull().references(() => committees.id),
  role: text('role').notNull().default('member'),
  start_date: date('start_date'),
  end_date: date('end_date'),
  ...timestamps,
});

export const filings = pgTable(
  'filings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chamber: chamberEnum('chamber').notNull(),
    source: text('source').notNull(), // e.g. 'house_clerk_yearly', 'senate_efd'
    external_doc_id: text('external_doc_id').notNull(),
    filed_at: date('filed_at').notNull(),
    source_url: text('source_url').notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
    storage_key: text('storage_key'),
    parser_version: text('parser_version').notNull(),
    raw_kind: rawKindEnum('raw_kind').notNull(),
    status: filingStatusEnum('status').notNull().default('discovered'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('filings_chamber_source_doc_uq').on(t.chamber, t.source, t.external_doc_id),
    index('filings_external_doc_id_idx').on(t.external_doc_id),
  ],
);

export const assets = pgTable('assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  ticker: varchar('ticker', { length: 12 }).unique(),
  cusip: varchar('cusip', { length: 12 }),
  name: text('name').notNull(),
  asset_class: text('asset_class'),
  gics_sector: text('gics_sector'),
  ...timestamps,
});

export const trades = pgTable(
  'trades',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    filing_id: uuid('filing_id').notNull().references(() => filings.id),
    lawmaker_id: uuid('lawmaker_id').notNull().references(() => lawmakers.id),
    asset_id: uuid('asset_id').notNull().references(() => assets.id),
    asset_type: assetTypeEnum('asset_type').notNull(),
    trade_type: tradeTypeEnum('trade_type').notNull(),
    tx_date: date('tx_date').notNull(),
    filing_date: date('filing_date').notNull(),
    days_to_file: integer('days_to_file').notNull(),
    is_late: boolean('is_late').notNull(),
    rule_version: text('rule_version').notNull(),
    range_label: text('range_label').notNull(),
    range_min: numeric('range_min', { precision: 16, scale: 2 }),
    range_max: numeric('range_max', { precision: 16, scale: 2 }),
    range_mid: numeric('range_mid', { precision: 16, scale: 2 }),
    open_ended_range: boolean('open_ended_range').notNull().default(false),
    owner_type: ownerTypeEnum('owner_type').notNull(),
    options: jsonb('options'),
    row_fingerprint: varchar('row_fingerprint', { length: 64 }).notNull(),
    status: tradeStatusEnum('status').notNull().default('extracted'),
    confidence: numeric('confidence', { precision: 4, scale: 3 }),
    source_excerpt: text('source_excerpt'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('trades_filing_fingerprint_uq').on(t.filing_id, t.row_fingerprint),
    index('trades_tx_date_idx').on(t.tx_date.desc()),
    index('trades_asset_idx').on(t.asset_id),
    index('trades_lawmaker_tx_idx').on(t.lawmaker_id, t.tx_date),
  ],
);

export const hitlReviewQueue = pgTable('hitl_review_queue', {
  id: uuid('id').defaultRandom().primaryKey(),
  trade_id: uuid('trade_id').references(() => trades.id),
  filing_id: uuid('filing_id').references(() => filings.id),
  raw_excerpt: text('raw_excerpt'),
  extracted_json: jsonb('extracted_json'),
  flag_reason: text('flag_reason'),
  confidence: numeric('confidence', { precision: 4, scale: 3 }),
  status: hitlStatusEnum('status').notNull().default('open'),
  reviewed_by: text('reviewed_by'),
  reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
  edited_json: jsonb('edited_json'),
  ...timestamps,
});

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  clerk_id: text('clerk_id').unique(),
  email: text('email'),
  plan: text('plan').notNull().default('free'),
  ...timestamps,
});

export const auditLog = pgTable('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entity_id: uuid('entity_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/** Phase 2 placeholder table so the unique index contract exists early. */
export const stockPricesDaily = pgTable(
  'stock_prices_daily',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ticker: varchar('ticker', { length: 12 }).notNull(),
    date: date('date').notNull(),
    open: numeric('open', { precision: 14, scale: 4 }),
    high: numeric('high', { precision: 14, scale: 4 }),
    low: numeric('low', { precision: 14, scale: 4 }),
    close: numeric('close', { precision: 14, scale: 4 }),
    volume: numeric('volume', { precision: 18, scale: 0 }),
    adj_close: numeric('adj_close', { precision: 14, scale: 4 }),
    ...timestamps,
  },
  (t) => [uniqueIndex('stock_prices_daily_ticker_date_uq').on(t.ticker, t.date)],
);

/** Transparency scorecard view: per-lawmaker disclosure-lag stats. Neutral stats only. */
export const lawmakerTransparency = pgView('lawmaker_transparency').as((qb) =>
  qb
    .select({
      lawmaker_id: lawmakers.id,
      bioguide_id: lawmakers.bioguide_id,
      name: lawmakers.name,
      chamber: lawmakers.chamber,
      party: lawmakers.party,
      state: lawmakers.state,
      n_trades: sql<number>`count(${trades.id})`.as('n_trades'),
      avg_days_to_file: sql<number>`round(avg(${trades.days_to_file})::numeric, 1)`.as('avg_days_to_file'),
      late_count: sql<number>`count(*) filter (where ${trades.is_late})`.as('late_count'),
      late_rate: sql<number>`round((count(*) filter (where ${trades.is_late})::numeric / greatest(count(${trades.id}), 1)) * 100, 1)`.as('late_rate'),
      most_recent_tx: sql<string>`max(${trades.tx_date})`.as('most_recent_tx'),
    })
    .from(lawmakers)
    .leftJoin(trades, sql`${trades.lawmaker_id} = ${lawmakers.id} and ${trades.status} = 'published'`)
    .groupBy(lawmakers.id, lawmakers.bioguide_id, lawmakers.name, lawmakers.chamber, lawmakers.party, lawmakers.state),
);
