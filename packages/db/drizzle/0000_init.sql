CREATE TYPE "public"."asset_type" AS ENUM('stock', 'bond', 'fund', 'option', 'commodity_future', 'other');--> statement-breakpoint
CREATE TYPE "public"."chamber" AS ENUM('house', 'senate');--> statement-breakpoint
CREATE TYPE "public"."filing_status" AS ENUM('discovered', 'ingested', 'failed');--> statement-breakpoint
CREATE TYPE "public"."hitl_status" AS ENUM('open', 'approved', 'rejected', 'edited');--> statement-breakpoint
CREATE TYPE "public"."owner_type" AS ENUM('filer', 'spouse', 'joint', 'dependent_child', 'other');--> statement-breakpoint
CREATE TYPE "public"."party" AS ENUM('democrat', 'republican', 'independent', 'other');--> statement-breakpoint
CREATE TYPE "public"."raw_kind" AS ENUM('pdf', 'html', 'xml', 'json');--> statement-breakpoint
CREATE TYPE "public"."trade_status" AS ENUM('extracted', 'pending_review', 'published', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."trade_type" AS ENUM('purchase', 'sale', 'exchange', 'unknown');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticker" varchar(12),
	"cusip" varchar(12),
	"name" text NOT NULL,
	"asset_class" text,
	"gics_sector" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_ticker_unique" UNIQUE("ticker")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "committee_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lawmaker_id" uuid NOT NULL,
	"committee_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "committees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chamber" "chamber" NOT NULL,
	"name" text NOT NULL,
	"system_code" varchar(32),
	"jurisdiction_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "filings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chamber" "chamber" NOT NULL,
	"source" text NOT NULL,
	"external_doc_id" text NOT NULL,
	"filed_at" date NOT NULL,
	"source_url" text NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"storage_key" text,
	"parser_version" text NOT NULL,
	"raw_kind" "raw_kind" NOT NULL,
	"status" "filing_status" DEFAULT 'discovered' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hitl_review_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid,
	"filing_id" uuid,
	"raw_excerpt" text,
	"extracted_json" jsonb,
	"flag_reason" text,
	"confidence" numeric(4, 3),
	"status" "hitl_status" DEFAULT 'open' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"edited_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lawmaker_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lawmaker_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"congress_number" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lawmakers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bioguide_id" varchar(16) NOT NULL,
	"name" text NOT NULL,
	"chamber" "chamber" NOT NULL,
	"party" "party" NOT NULL,
	"state" varchar(4) NOT NULL,
	"district" integer,
	"image_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lawmakers_bioguide_id_unique" UNIQUE("bioguide_id")
);
--> statement-breakpoint
CREATE TABLE "stock_prices_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticker" varchar(12) NOT NULL,
	"date" date NOT NULL,
	"open" numeric(14, 4),
	"high" numeric(14, 4),
	"low" numeric(14, 4),
	"close" numeric(14, 4),
	"volume" numeric(18, 0),
	"adj_close" numeric(14, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filing_id" uuid NOT NULL,
	"lawmaker_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"asset_type" "asset_type" NOT NULL,
	"trade_type" "trade_type" NOT NULL,
	"tx_date" date NOT NULL,
	"filing_date" date NOT NULL,
	"days_to_file" integer NOT NULL,
	"is_late" boolean NOT NULL,
	"rule_version" text NOT NULL,
	"range_label" text NOT NULL,
	"range_min" numeric(16, 2),
	"range_max" numeric(16, 2),
	"range_mid" numeric(16, 2),
	"open_ended_range" boolean DEFAULT false NOT NULL,
	"owner_type" "owner_type" NOT NULL,
	"options" jsonb,
	"row_fingerprint" varchar(64) NOT NULL,
	"status" "trade_status" DEFAULT 'extracted' NOT NULL,
	"confidence" numeric(4, 3),
	"source_excerpt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text,
	"email" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
ALTER TABLE "committee_memberships" ADD CONSTRAINT "committee_memberships_lawmaker_id_lawmakers_id_fk" FOREIGN KEY ("lawmaker_id") REFERENCES "public"."lawmakers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_memberships" ADD CONSTRAINT "committee_memberships_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hitl_review_queue" ADD CONSTRAINT "hitl_review_queue_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hitl_review_queue" ADD CONSTRAINT "hitl_review_queue_filing_id_filings_id_fk" FOREIGN KEY ("filing_id") REFERENCES "public"."filings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lawmaker_terms" ADD CONSTRAINT "lawmaker_terms_lawmaker_id_lawmakers_id_fk" FOREIGN KEY ("lawmaker_id") REFERENCES "public"."lawmakers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_filing_id_filings_id_fk" FOREIGN KEY ("filing_id") REFERENCES "public"."filings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_lawmaker_id_lawmakers_id_fk" FOREIGN KEY ("lawmaker_id") REFERENCES "public"."lawmakers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "filings_chamber_source_doc_uq" ON "filings" USING btree ("chamber","source","external_doc_id");--> statement-breakpoint
CREATE INDEX "filings_external_doc_id_idx" ON "filings" USING btree ("external_doc_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_prices_daily_ticker_date_uq" ON "stock_prices_daily" USING btree ("ticker","date");--> statement-breakpoint
CREATE UNIQUE INDEX "trades_filing_fingerprint_uq" ON "trades" USING btree ("filing_id","row_fingerprint");--> statement-breakpoint
CREATE INDEX "trades_tx_date_idx" ON "trades" USING btree ("tx_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "trades_asset_idx" ON "trades" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "trades_lawmaker_tx_idx" ON "trades" USING btree ("lawmaker_id","tx_date");--> statement-breakpoint
CREATE VIEW "public"."lawmaker_transparency" AS (select "lawmakers"."id", "lawmakers"."bioguide_id", "lawmakers"."name", "lawmakers"."chamber", "lawmakers"."party", "lawmakers"."state", count("trades"."id") as "n_trades", round(avg("trades"."days_to_file")::numeric, 1) as "avg_days_to_file", count(*) filter (where "trades"."is_late") as "late_count", round((count(*) filter (where "trades"."is_late")::numeric / greatest(count("trades"."id"), 1)) * 100, 1) as "late_rate", max("trades"."tx_date") as "most_recent_tx" from "lawmakers" left join "trades" on "trades"."lawmaker_id" = "lawmakers"."id" and "trades"."status" = 'published' group by "lawmakers"."id", "lawmakers"."bioguide_id", "lawmakers"."name", "lawmakers"."chamber", "lawmakers"."party", "lawmakers"."state");