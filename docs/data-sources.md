# Quiver Quantitative — Data Sourcing Research

Based on direct inspection of the primary sources (Sept 2026):

## What Quiver uses (confirmed by source availability)

### House of Representatives
- **Index**: `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{YEAR}FD.zip`
  - Updated **daily** (Last-Modified header = previous day)
  - Contains `FD.txt` + `FD.xml`: every filing with Prefix/Last/First/FilingType/StateDst/Year/FilingDate/DocID
  - FilingType codes: **P = PTR** (Periodic Transaction Report, 371 YTD 2026), W = Weekly, A = Amendment, C = Candidate, D/D = others
- **Documents**: `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/{YEAR}/{DocID}.pdf`
  - Real PTR PDFs, text-extractable (pypdf works; some glyph artifacts to strip)
  - Contains: Name, Status, State/District, then table: Owner | Asset (name + ticker + [ST]/[OT]) | Transaction Type (S (partial)/P/Exchange) | Date | Notification Date | Amount range | Cap Gains flag, plus remarks

### Senate
- **Search**: `https://efdsearch.senate.gov/search/` (Django app, CSRF-protected)
  - Requires clicking a prohibition-agreement checkbox first (sets session cookie)
  - POST `/search/` with `filer_type=1` (Senator) + `report_type=11` (PTR) returns HTML table, 25/page
  - Each row links to `/search/view/ptr/{uuid}/`
- **Documents**: the view page renders **structured text** (not PDF): tab-separated rows with
  `# | Transaction Date | Owner | Ticker | Asset Name | Asset Type | Type | Amount | Comment`
  - Tickers often included directly; options carry strike/expiry in the asset name
  - Example: 703 transactions in a single report (Armstrong)

## Implication for Follow the Money
Both chambers are fully scrapeable with a polite, no-key pipeline:
1. House: daily ZIP fetch (ETag/Last-Modified conditional) → filter FilingType=P → fetch PDF → extract text → parse table
2. Senate: maintain session w/ agreement cookie → POST search paginated → fetch each `/view/ptr/{uuid}` page → parse structured rows (easier than House PDFs)
3. Feed both into the existing canonical ExtractedFiling contract → HITL for low-confidence rows → publish

Quiver does exactly this (their FAQ cites the same Clerk/eFD sources). Our differentiators:
- Cleaner UX, dollar-midpoint sizing, SPY-benchmarked per-trade returns, cadence profiles
- Our existing Zod schema + HITL gate is production-grade for exactly this flow
