"""Extractor tests: reject output missing tx_date; validate contract shape."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = None  # clients are created per-test

META = {
    "chamber": "house",
    "source_url": "https://disclosures-clerk.house.gov/example",
    "external_doc_id": "TEST-1",
    "filed_at": "2024-03-01",
}
FILER = {"printed_name": "PELOSIS, NANCY", "bioguide_id": "P000197", "state": "CA"}

TEXT = (
    "Owner | Asset | Type | Transaction Date | Amount\n"
    "      | Microsoft Corp (MSFT) | P | 02/15/2024 | $1,001 - $15,000\n"
)


def _client():
    from app.main import app as _app

    return TestClient(_app)


def test_extract_returns_rows():
    c = _client()
    r = c.post("/extract", json={"meta": META, "filer": FILER, "text": TEXT})
    assert r.status_code == 200
    body = r.json()
    assert body["parser_version"] == "ptr_extract_v1"
    assert len(body["trades"]) == 1
    assert body["trades"][0]["tx_date"] == "2024-02-15"
    assert body["trades"][0]["trade_type"] == "purchase"
    assert body["needs_hitl"] is True  # ticker unresolved


def test_extract_rejects_empty_text():
    c = _client()
    r = c.post("/extract", json={"meta": META, "filer": FILER, "text": "no rows here"})
    assert r.status_code == 422


def test_health():
    c = _client()
    r = c.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
