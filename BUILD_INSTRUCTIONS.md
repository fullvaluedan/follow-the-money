# Follow the Money — Phase 1 Build Instructions

You are building **Phase 1** of "Follow the Money", a production-grade platform that ingests official U.S. House and Senate STOCK Act Periodic Transaction Reports (PTRs), normalizes them into a typed trade ledger, and exposes a public feed, lawmaker pages, an admin HITL review queue, and a transparency/delay scorecard.

**App name: "Follow the Money"** (internal legacy codename "CapitolPulse" appears in the original brief — use "Follow the Money" everywhere user-visible: package names, UI copy, README, footer, metadata).

Repo root: `C:/Users/danom/follow-the-money` (already git-initialized on branch `main`, empty).

Read this file fully. Build everything listed. Don't ask questions — just build. Commit after each section with conventional commits.

## 0. Constraints & quality bar (hard requirements)

- Monorepo: `apps/web`, `apps/worker`, `apps/extractor`, `packages/db`, `packages/domain`, `packages/connectors`.
- Next.js 15 App Router, React 19, TypeScript strict. Tailwind CSS + shadcn/ui + Lucide.
- Drizzle ORM + drizzle-kit migrations. PostgreSQL. No Prisma.
- Zod on all boundaries. Idempotent ingestion (natural keys + content hashes).
- Every published trade has `source_url` and `parser_version`.
- Server Components by default; Client Components only for charts/modals/filters.
- No secrets in git. `.env.example` lists every var; `.env` gitignored.
- If a credential (DB URL, Clerk, Anthropic, Polygon, Redis) is missing, implement a typed adapter + mock/fixture path so the app still runs offline: use a local `DATABASE_URL=postgres://localhost:5432/ftm` default for migration generation, and for tests use an in-memory/sqlite-compatible path OR pure-function tests on `packages/domain` (preferred). Auth (Clerk) and billing (Stripe) are Phase 3 — **stub them**: create a `packages/db` users table schema but no Clerk integration in Phase 1; admin HITL is protected by a simple placeholder middleware that checks an `ADMIN_PASSCODE` env var (documented as temporary until Clerk lands).
- Worker/queues (BullMQ+Redis): scaffold `apps/worker` with a queue module and an ingest worker that can be run one-shot (`npm run ingest -- --once`) without Redis by falling back to direct execution when `REDIS_URL` is unset.

## 1. Domain facts to encode (exact)

- PTR required for transactions over $1,000; statutory window 45 days from tx date.
- `days_to_file = filing_date - tx_date` (calendar days — document this choice in code comments).
- `is_late = days_to_file > 45`.
- Amounts are range brackets. Standard PTR buckets — encode this exact mapping in `packages/domain/src/brackets.ts`:
  - `$1,001 - $15,000` → [1001, 15000]
  - `$15,001 - $50,000` → [15001, 50000]
  - `$50,001 - $100,000` → [50001, 100000]
  - `$100,001 - $250,000` → [100001, 250000]
  - `$250,001 - $500,000` → [250001, 500000]
  - `$500,001 - $1,000,000` → [500001, 1000000]
  - `$1,000,001 - $5,000,000` → [1000001, 5000000]
  - `$5,000,001 - $25,000,000` → [5000001, 25000000]
  - `$25,000,001 - $50,000,000` → [25000001, 50000000]
  - `Over $50,000,000` → [50000001, null] with `open_ended_range = true`
  - Unknown/unspecified → [null, null], `open_ended_range = false`
- Owner types: `filer | spouse | joint | dependent_child | other`.
- Trade types: `purchase | sale | exchange | unknown`.
- Asset types: `stock | bond | fund | option | commodity_future | other`.
- Chambers: `house | senate`. Parties: `democrat | republican | independent | other`.
- Dedup fingerprint: normalized `(date, asset, trade_type, range_label, owner_type)` sha256 over lowercased/trimmed fields.

## 2. Data model — `packages/db`

Implement Drizzle schema with UUID PKs and `created_at`/`updated_at` on everything:

- `lawmakers` — bioguide_id unique, name, chamber, party, state, district, image_url.
- `lawmaker_terms` — lawmaker_id, start/end, congress_number.
- `committees`, `committee_memberships` (lawmaker_id, committee_id, role, start/end).
- `filings` — chamber, source, external_doc_id (unique per chamber+source), filed_at, source_url, sha256, storage_key, parser_version, raw_kind enum (`pdf|html|xml|json`), status.
- `trades` — filing_id FK, lawmaker_id FK, asset_id FK, asset_type, trade_type, tx_date, filing_date, days_to_file, is_late, range_label, range_min, range_max, range_mid, open_ended_range, owner_type, options jsonb, status enum (`extracted|pending_review|published|rejected`), confidence (numeric), row_fingerprint (unique with filing_id).
- `assets` — ticker unique nullable, cusip, name, asset_class, gics_sector.
- `hitl_review_queue` — trade_id FK nullable, filing_id FK nullable, raw_excerpt, extracted_json jsonb, flag_reason, confidence, status (`open|approved|rejected|edited`), reviewed_by, reviewed_at, edited_json jsonb.
- `audit_log` — actor, action, entity, entity_id, before jsonb, after jsonb.
- Enum types for chamber, party, trade_type, owner_type, asset_type, review status, filing status.
- Indexes: trades(tx_date desc), trades(asset_id), trades(lawmaker_id, tx_date), filings(external_doc_id), unique(ticker, date) placeholder on prices for later.
- SQL view `lawmaker_transparency`: per lawmaker — n_trades, avg_days_to_file, late_count, late_rate, most_recent_tx.
- Provide `drizzle.config.ts` and a `packages/db` script `db:generate` + `db:push` (drizzle-kit). Migrations must apply cleanly to Postgres. If no local Postgres is available to verify, generate SQL migrations and validate syntax with a SQL parse (document it).

## 3. Fixtures + connectors — `packages/connectors`

- Create `fixtures/` at repo root with 5–10 REAL historical PTR fixtures: check in actual public-domain PTR text extracts (House Clerk format) — you may synthesize fixture files ONLY if they faithfully reproduce the real House/Senate PTR table format (columns: owner, asset, type, date, amount range); label each with source URL in a `fixtures/README.md` and note they are fixtures derived from public-domain filings. Include at least: one multi-row House-style table, one Senate eFD-style record, one with an open-ended range, one late filing (filing date > 45 days after tx), one with unknown ticker.
- House adapter: yearly-index-aware parser for House PTR text/table format → canonical `ExtractedFiling` (Zod schema below).
- Senate adapter: parser for Senate eFD PTR text format → same canonical type.
- Both adapters are pure functions: `parse(raw: string, meta: FilingMeta): ExtractedFiling`.
- `packages/domain/prompts/extract_ptr_v1.md`: versioned LLM prompt file with the JSON schema (for future vision fallback; not wired in Phase 1, but present).

## 4. Domain logic + tests — `packages/domain`

Pure TypeScript, no I/O. With vitest. Tests are part of the definition of done:

- `brackets.ts`: label → {min,max,open_ended}; midpoint = (min+max)/2 when both present; parse both label styles ("$1,001 - $15,000" and "Over $50,000,000").
- `lateness.ts`: days_to_file (calendar), is_late, rule version constant `RULE_STOCK_ACT_45D = 'stock-act-45d-v1'`.
- `fingerprint.ts`: dedup fingerprint function; same trade w/ whitespace/case differences → same hash.
- `schema.ts`: Zod schema mirroring the extractor JSON contract (Appendix B shape): filing {chamber, source_url, external_doc_id, filed_at, raw_kind}, filer {printed_name, bioguide_id?, state?, district?}, trades[] {asset_name, ticker?, asset_type, trade_type, tx_date, range_label, range_min?, range_max?, open_ended_range, owner_type, options?, confidence{overall,ticker,tx_date,range}, source_excerpt}, needs_hitl, hitl_reasons[].
- Tests (must all pass):
  1. bracket mapping: every label above, unknown label throws/flags, open-ended detection
  2. 45-day late flag: day 45 → not late, day 46 → late, same-day → 0
  3. dedup fingerprint: invariant under case/whitespace, differs across range/date/asset/type/owner
  4. extractor JSON schema: rejects missing tx_date, rejects bad confidence type, accepts valid doc
  5. publish guard: a trade with status `pending_review` can NEVER be published by the publish function — test `publishTrade` throws unless status === 'extracted' && confidence thresholds met OR status === 'pending_review' path goes through approve() first

## 5. Worker + ingestion — `apps/worker`

- BullMQ queue module; when `REDIS_URL` unset, run jobs inline (direct function call) so `npm run ingest` works offline.
- `ingest` job: read fixture files from `fixtures/`, for each: compute sha256, upsert `filings` by (chamber, source, external_doc_id) — skip if sha256 unchanged (idempotent), parse via chamber adapter, resolve/insert `assets` and `lawmakers` by bioguide_id (fixtures include a seed list of ~10 real lawmakers with real bioguide IDs — put them in `fixtures/lawmakers.json`), create trades with status determined by confidence + ticker resolution:
  - confidence.overall >= 0.95 AND ticker resolved → `extracted` → auto-publishable
  - else → `pending_review` + hitl_review_queue row
- `npm run ingest -- --once` runs one pass and exits; logging is structured (JSON lines) and shows counts ingested/skipped/pending_review/published.
- Log every extraction: parser version, source, latency, confidence.

## 6. Web app — `apps/web`

Next.js 15 App Router, Tailwind, shadcn/ui components, Lucide icons. Pages:

- `/` — live feed: searchable/filterable table of PUBLISHED trades (chamber, party, ticker, type, date, amount bracket, late-only toggle). Server Component + client filter bar. Empty state if DB empty.
- `/lawmakers/[bioguideId]` — profile: trades table, delay stats (avg days, late rate, n), committees (empty ok).
- `/trades/[id]` — trade detail: all fields, disclosure lag, source filing link (source_url), parser version, raw excerpt.
- `/admin/review` — HITL queue: list of pending_review rows; each row shows raw excerpt + extracted fields inline-editable + Approve/Publish, Edit, Reject buttons; target is one-screen fast correction. Protected by ADMIN_PASSCODE placeholder middleware.
- `/transparency` — scorecard: table of lawmakers ranked by late rate and avg delay (from `lawmaker_transparency` view), both most-prompt and most-delayed. Neutral copy: "Disclosure lag" never "hiding".
- Footer on every page, exact copy:
  > Follow the Money is an educational and data-aggregation platform. Content does not constitute financial, investment, tax, or legal advice. Trade records come from public government disclosures. Amounts are disclosed as ranges, not exact values.
- UI naming rules: use "Disclosure lag", never accusatory labels. Brand header: "Follow the Money".
- If DB unreachable, pages render a clear "database not connected — run npm run ingest" state instead of crashing.

## 7. Extractor service — `apps/extractor`

FastAPI app: `POST /extract` accepting multipart PDF/text + meta, returning the Appendix B JSON contract. Phase 1 implementation: deterministic text parser first (regex/table parsing mirroring the TS adapters, ported to Python), vision-LLM call stubbed behind `ANTHROPIC_API_KEY` presence check with a clear 501 response when unset. Pydantic models mirroring the Zod schema. Include `requirements.txt` (fastapi, uvicorn, pydantic) and a README note. Include a pytest that rejects extraction output missing tx_date.

## 8. Root

- npm workspaces monorepo (`package.json` with workspaces: apps/*, packages/*). TypeScript project references or simple per-package tsconfigs.
- Turborepo optional — plain npm scripts are fine: `dev`, `build`, `test`, `ingest`, `db:push`.
- `.env.example` with all Appendix A vars (DATABASE_URL, REDIS_URL, NEXT_PUBLIC_APP_URL, ANTHROPIC_API_KEY, POLYGON_API_KEY, ADMIN_PASSCODE, etc.).
- README.md: project name "Follow the Money", one-paragraph description, legal/educational disclaimer, env vars table, how to run web/worker/extractor, how to run one-shot ingest, how to run tests, architecture diagram (ASCII), Phase 1 checklist, "not a broker / not affiliated with any government body" note, license (MIT).
- `.gitignore`: node_modules, .next, .env, dist, coverage.
- LICENSE (MIT).

## 9. Definition of done checklist

1. ✅ Monorepo scaffold (apps/web, apps/worker, apps/extractor, packages/db, packages/domain, packages/connectors)
2. ✅ Drizzle schema + migration SQL generated
3. ✅ 5–10 fixtures with source URLs, parsed by adapters
4. ✅ HITL admin queue + publish path
5. ✅ Public feed + lawmaker page + trade provenance link
6. ✅ Delay metrics + transparency table
7. ✅ README with env vars, run instructions, one-shot ingest
8. ✅ Tests listed in §4 all pass (`npm test` green at repo root)

Do NOT build: SnapTrade, billing, Stripe, Clerk (stub only), news, sector flow, overlap scoring, social posting. Stop after Phase 1 checklist.

## 10. Build order

1. Root package.json/workspaces/tsconfig/.gitignore/.env.example
2. packages/domain (types, brackets, lateness, fingerprint, zod schema) + vitest tests
3. packages/db (schema, drizzle config, migrations, view SQL)
4. packages/connectors (adapters + fixtures)
5. apps/worker (ingest, idempotent upserts, publish guard)
6. apps/extractor (FastAPI + pydantic + pytest)
7. apps/web (feed, lawmaker, trade detail, admin HITL, transparency, footer)
8. README + LICENSE
9. Run `npm test` — all green. Run `npm run build` for web — compiles. Commit everything.

Final step: report the exact list of files created, test output (real, pasted), and any remaining risks.
