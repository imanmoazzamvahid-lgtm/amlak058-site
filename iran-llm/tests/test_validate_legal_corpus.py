import hashlib
import json
from pathlib import Path
from scripts.validate_legal_corpus import validate

def make_doc(raw_file: Path, approved=False):
    raw = raw_file.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    return {
        "document_id": "IR-TEST-001",
        "document_type": "statute",
        "title": "نمونه آزمون، نه قانون واقعی",
        "jurisdiction": "IR",
        "issuing_authority": "مرجع نمونه",
        "dates": {
            "adoption_jalali": "1400/01/01",
            "publication_jalali": "1400/01/10",
            "effective_from_jalali": "1400/02/01",
            "approval_jalali": None,
            "effective_until_jalali": None,
            "date_notes": None
        },
        "source": {
            "url": "https://example.org/test",
            "retrieved_at": "2026-11-12T00:00:00Z",
            "source_kind": "official_gazette",
            "publication_number": "TEST-NOT-REAL",
            "publication_date_jalali": "1400/01/10",
            "original_file": "sample.txt",
            "sha256": digest,
            "retrieval_notes": "fixture"
        },
        "legal_status": {
            "status": "in_force",
            "checked_at": "2026-11-12T00:00:00Z",
            "status_source_url": "https://example.org/status",
            "notes": "fixture"
        },
        "relationships": [],
        "text": {
            "raw_text": raw.decode("utf-8"),
            "normalized_text": raw.decode("utf-8"),
            "articles": [],
            "ocr_reviewed": True,
            "review_notes": "fixture"
        },
        "rights": {
            "license_or_legal_basis": "written permission test fixture" if approved else "not assessed",
            "training_approved": approved,
            "reviewer": "test reviewer" if approved else None,
            "reviewed_at": "2026-11-12T00:00:00Z" if approved else None,
            "restrictions": None
        }
    }

def test_unapproved_document_is_catalogued_but_not_trainable(tmp_path):
    raw = tmp_path / "raw"
    raw.mkdir()
    content = "متن نمونه آزمون که قانون واقعی نیست."
    (raw / "sample.txt").write_text(content, encoding="utf-8")
    doc = make_doc(raw / "sample.txt", approved=False)
    jsonl = tmp_path / "docs.jsonl"
    jsonl.write_text(json.dumps(doc, ensure_ascii=False) + "\n", encoding="utf-8")
    schema = Path(__file__).parents[1] / "data" / "legal_document.schema.json"
    assert validate(jsonl, schema, raw, False) == []
    assert any("not approved for training" in e for e in validate(jsonl, schema, raw, True))

def test_training_approved_requires_matching_hash_and_reviewer(tmp_path):
    raw = tmp_path / "raw"
    raw.mkdir()
    (raw / "sample.txt").write_text("متن نمونه آزمون که قانون واقعی نیست.", encoding="utf-8")
    doc = make_doc(raw / "sample.txt", approved=True)
    doc["source"]["sha256"] = "0" * 64
    jsonl = tmp_path / "docs.jsonl"
    jsonl.write_text(json.dumps(doc, ensure_ascii=False) + "\n", encoding="utf-8")
    schema = Path(__file__).parents[1] / "data" / "legal_document.schema.json"
    errors = validate(jsonl, schema, raw, True)
    assert any("SHA-256 mismatch" in e for e in errors)
    assert any("text.raw_text does not match" in e for e in errors)

def test_path_traversal_is_rejected(tmp_path):
    raw = tmp_path / "raw"
    raw.mkdir()
    outside = tmp_path / "outside.txt"
    outside.write_text("outside fixture", encoding="utf-8")
    doc = make_doc(outside, approved=False)
    doc["source"]["original_file"] = "../outside.txt"
    jsonl = tmp_path / "docs.jsonl"
    jsonl.write_text(json.dumps(doc, ensure_ascii=False) + "\n", encoding="utf-8")
    schema = Path(__file__).parents[1] / "data" / "legal_document.schema.json"
    errors = validate(jsonl, schema, raw, False)
    assert any("escapes raw root" in e for e in errors)
