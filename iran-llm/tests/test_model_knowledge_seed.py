import csv
from pathlib import Path


def test_model_knowledge_seed_is_discovery_only():
    path = Path(__file__).parents[1] / "data" / "legal" / "model_knowledge_seed.csv"
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) >= 20
    assert all(row["seed_origin"] == "LLM_KNOWLEDGE" for row in rows)
    assert all(row["verification_status"] == "unverified" for row in rows)
    assert all(row["training_approved"].lower() == "no" for row in rows)
    assert all(row["rights_status"] == "not_assessed" for row in rows)


def test_model_knowledge_seed_has_unique_ids_and_titles():
    path = Path(__file__).parents[1] / "data" / "legal" / "model_knowledge_seed.csv"
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    ids = [row["document_id"] for row in rows]
    titles = [row["title"] for row in rows]
    assert len(ids) == len(set(ids))
    assert all(title.strip() for title in titles)