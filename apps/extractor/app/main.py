"""Follow the Money — PTR extractor (Phase 1: deterministic text parsing).

Returns the extractor JSON contract (mirrors packages/domain/src/schema.ts).
Vision-LLM fallback (ANTHROPIC_API_KEY) is Phase 2; absent key = text-only mode.
"""
from datetime import date
import re

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

app = FastAPI(title="Follow the Money Extractor", version="ptr_extract_v1")

PARSER_VERSION = "ptr_extract_v1"


class FilingMeta(BaseModel):
    chamber: str
    source_url: str
    external_doc_id: str
    filed_at: str
    raw_kind: str = "pdf"


class FilerInfo(BaseModel):
    printed_name: str
    bioguide_id: str | None = None
    state: str | None = None
    district: int | None = None


class Confidence(BaseModel):
    overall: float = Field(ge=0, le=1)
    ticker: float = Field(ge=0, le=1)
    tx_date: float = Field(ge=0, le=1)
    range: float = Field(ge=0, le=1)


class ExtractedTrade(BaseModel):
    asset_name: str
    ticker: str | None = None
    asset_type: str = "stock"
    trade_type: str
    tx_date: str
    range_label: str
    range_min: float | None = None
    range_max: float | None = None
    open_ended_range: bool = False
    owner_type: str = "filer"
    options: dict | None = None
    confidence: Confidence
    source_excerpt: str = ""

    @field_validator("tx_date")
    @classmethod
    def tx_date_must_be_iso(cls, v: str) -> str:
        try:
            date.fromisoformat(v)
        except ValueError as e:
            raise ValueError("tx_date must be YYYY-MM-DD") from e
        return v


class ExtractRequest(BaseModel):
    meta: FilingMeta
    text: str
    filer: FilerInfo


ROW_RE = re.compile(
    r"^\s*(?:(\S[^\n|]*?)\s*\|\s*)?\|?\s*([^|\n]+)\|\s*([PSE])\s*\|\s*(\d{1,2}/\d{1,2}/\d{4})\s*\|\s*(\$[^\n|]+?)\s*$",
    re.MULTILINE,
)


@app.get("/health")
def health():
    return {"status": "ok", "parser_version": PARSER_VERSION, "vision_llm": False}


@app.post("/extract")
def extract(body: ExtractRequest):
    """Parse PTR table text into the canonical JSON contract."""
    trades = []
    for m in ROW_RE.finditer(body.text):
        owner_raw, asset, type_code, date_raw, range_raw = m.groups()
        mm, dd, yyyy = date_raw.split("/")
        trades.append(
            {
                "asset_name": asset.strip(),
                "ticker": None,
                "asset_type": "stock",
                "trade_type": {"P": "purchase", "S": "sale", "E": "exchange"}.get(
                    type_code.strip().upper(), "unknown"
                ),
                "tx_date": f"{yyyy}-{mm.zfill(2)}-{dd.zfill(2)}",
                "range_label": range_raw.strip(),
                "open_ended_range": "over" in range_raw.lower(),
                "owner_type": "filer",
                "options": None,
                "confidence": {"overall": 0.9, "ticker": 0.0, "tx_date": 1.0, "range": 0.9},
                "source_excerpt": m.group(0).strip()[:300],
            }
        )

    if not trades:
        raise HTTPException(status_code=422, detail="no trade rows found in text")

    needs_hitl = any(t["ticker"] is None for t in trades)
    return {
        "parser_version": PARSER_VERSION,
        "filing": body.meta.model_dump(),
        "filer": body.filer.model_dump(),
        "trades": trades,
        "needs_hitl": needs_hitl,
        "hitl_reasons": ["ticker_unresolved"] if needs_hitl else [],
    }
