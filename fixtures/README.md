# Fixtures

Text fixtures reproducing the real House Clerk / Senate eFD PTR table layouts.
These are FIXTURES derived from the public-domain STOCK Act disclosure format
(not verbatim copies of specific member filings, except where noted). Column
order and value formats match the official portals:

- House: `disclosures-clerk.house.gov` yearly PTR archives (Owner | Asset | Type P/S/E | Date | Amount)
- Senate: `efdsearch.senate.gov` / `efd.senate.gov` PTR records (Owner | Asset | Purchase/Sale | Date | Amount)

STOCK Act disclosures are public records (no copyright). Ticker/name pairs are real
securities; lawmaker names are real public figures with real bioguide IDs (see lawmakers.json).

Source URLs are recorded per fixture in `index.json` and ingested into `filings.source_url`
so every published trade retains provenance.
