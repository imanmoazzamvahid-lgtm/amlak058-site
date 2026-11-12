import importlib.util
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "scripts" / "audit_dotic_snapshot.py"
spec = importlib.util.spec_from_file_location("audit_dotic_snapshot", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)


def test_dotic_snapshot_audit_never_approves_training():
    row = {
        "id": "doc-1",
        "title": "قانون نمونه",
        "text": "متن نمونه",
        "source_url": "https://media.dotic.ir/file.pdf",
        "source_type": "dotic_ir",
        "jurisdiction": "IR",
        "country": "Iran",
        "language": "fa",
        "date": None,
        "date_issued": None,
        "retrieved_at": "2026-10-01T00:00:00Z",
        "license": "ir-dotic",
        "law_status": "current",
        "identifier": "doc-1",
        "official_identifier": "doc-1",
        "article_count": 2,
        "json_path": "doc-1.json",
        "metadata_json": '{"content_sha256":"' + ('a' * 64) + '","rights":{"official_reuse_url":"https://media.dotic.ir/file.pdf"}}',
    }
    report = module.audit_rows([row])
    assert report["row_count"] == 1
    assert report["missing_metadata_hash_count"] == 0
    assert report["canonical_ingestion_approved"] is False
    assert report["training_approved"] is False
    assert report["decision"] == "discovery_only_pending_official_and_rights_review"


def test_dotic_snapshot_audit_reports_duplicate_ids_and_off_domain_sources():
    base = {
        "id": "same", "title": "عنوان", "text": "متن",
        "source_url": "https://example.com/law.pdf", "jurisdiction": "IR",
        "metadata_json": "not-json", "date": None, "date_issued": None,
    }
    report = module.audit_rows([base, dict(base)])
    assert report["duplicate_id_count"] == 1
    assert report["off_domain_source_count"] == 2
    assert report["malformed_metadata_count"] == 2
    assert report["missing_official_reuse_url_count"] == 2
    assert report["training_approved"] is False