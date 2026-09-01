# Follow the Money

Educational aggregation of U.S. congressional **STOCK Act Periodic Transaction Reports (PTRs)** — a typed, provenance-preserving trade ledger with a public live feed, lawmaker profiles, a transparency (disclosure-lag) scorecard, and a human-in-the-loop review queue.

> **Disclaimer:** Follow the Money is an educational and data-aggregation platform. Content does not constitute financial, investment, tax, or legal advice. Trade records come from public government disclosures. Amounts are disclosed as ranges, not exact values. Past disclosed transactions are not a portfolio and are not a recommendation. Not a broker; not affiliated with any government body.

## Architecture

```
apps/web          Next.js 15 App Router (feed, profiles, admin HITL, scorecard)
apps/worker       Ingestion (one-shot CLI; BullMQ-ready, inline without Redis)
apps/extractor    FastAPI deterministic PTR text extractor (vision-LLM fallback = Phase 2)
packages/db       Drizzle schema + migrations (PostgreSQL)
packages/domain   Pure TS: brackets, 45-day lateness, fingerprints, Zod contract, publish guard
packages/connectors  House Clerk + Senate eFD adapters
fixtures/         PTR fixtures with source URLs + seed lawmakers (real bioguide IDs)
```

## Domain rules encoded

- PTR required for transactions over $1,000; statutory window **45 days** (calendar days).
- `days_to_file = filing_date − tx_date`; `is_late = days_to_file > 45` (rule version `stock-act-45d-v1`).
- Amounts are the standard PTR range brackets; open-ended `Over $50,000,000` capped, never a point estimate.
- Trades dedup on a normalized fingerprint per filing; ingestion is idempotent on filing SHA-256.
- Publish guard: low-confidence / unresolved-ticker rows go to `pending_review` + HITL queue. **A pending-review trade can never be silently published.**

## Setup

```bash
npm install                 # workspaces
cp .env.example .env        # set DATABASE_URL (Postgres), ADMIN_PASSCODE
npm run db:generate         # drizzle-kit → packages/db/drizzle
npm run db:push             # apply schema to Postgres
npm run ingest              # one-shot ingest of fixtures
npm run dev                 # Next.js on :3000
```

Extractor (optional, Phase 1 = deterministic only):

```bash
cd apps/extractor
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # Windows
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

## Tests

```bash
npm test          # domain (43 tests) at root via workspaces
cd packages/connectors && npm test   # adapters (8 tests)
cd apps/extractor && .venv/Scripts/python -m pytest tests/ -q   # extractor (3 tests)
cd apps/web && npx next build        # type-safe build, all routes
```

## Environment variables

See [.env.example](.env.example). Phase 1 needs only `DATABASE_URL` and `ADMIN_PASSCODE`. Clerk/Stripe/SnapTrade/Polygon/Anthropic keys are Phase 2–3 (stubbed, typed adapters pending).

## Status: Phase 1 complete

- [x] Monorepo scaffold (apps/web, apps/worker, apps/extractor, packages/*)
- [x] Drizzle schema + migration SQL
- [x] Fixtures with source URLs, parsed by chamber adapters
- [x] HITL admin queue + publish path (guard-tested)
- [x] Public feed + lawmaker page + trade provenance link
- [x] Delay metrics + transparency scorecard
- [x] README / env / run instructions / one-shot ingest
- [x] Tests: brackets, 45-day flag, fingerprint dedup, schema rejects missing tx_date, no-publish-from-pending-review

**Known risks / next steps:** portal HTML markup drift (House yearly ZIP/XML, Senate eFD) needs live-polling adapters with ETags + backoff; ticker resolution for unlisted assets stays in HITL by design. Phase 2 slice: Polygon EOD prices → dual-window returns, Policy Overlap Index, sector flow, balanced news digests.

## License

MIT
