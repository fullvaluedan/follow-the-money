# ptr_extract_v1 — PTR extraction prompt (vision-LLM fallback, Phase 2)

You are extracting structured data from a U.S. congressional STOCK Act Periodic
Transaction Report document. Return ONLY valid JSON matching the schema below.

## Rules

- Amounts are RANGE LABELS exactly as printed. Never invent exact notionals.
- tx_date and filed_at must be ISO YYYY-MM-DD.
- ticker: null unless explicitly printed or unambiguously derivable from "(TICKER)".
- trade_type: purchase | sale | exchange | unknown (House prints P/S/E).
- owner_type: filer | spouse | joint | dependent_child | other.
- Preserve the raw row text in source_excerpt (max 300 chars).
- If the document is a scan/handwriting and text extraction is poor, set
  needs_hitl=true with reason "poor_text_extraction".

## JSON schema

{
  "parser_version": "ptr_extract_v1",
  "filing": { "chamber": "house|senate", "source_url": "https://...", "external_doc_id": "string", "filed_at": "YYYY-MM-DD", "raw_kind": "pdf|html|xml|json" },
  "filer": { "printed_name": "string", "bioguide_id": null, "state": null, "district": null },
  "trades": [{
    "asset_name": "string", "ticker": null, "asset_type": "stock|bond|fund|option|commodity_future|other",
    "trade_type": "purchase|sale|exchange|unknown", "tx_date": "YYYY-MM-DD",
    "range_label": "$1,001 - $15,000", "range_min": 1001, "range_max": 15000,
    "open_ended_range": false, "owner_type": "filer", "options": null,
    "confidence": { "overall": 0.0, "ticker": 0.0, "tx_date": 0.0, "range": 0.0 },
    "source_excerpt": "string"
  }],
  "needs_hitl": true,
  "hitl_reasons": []
}
