import csv
from pathlib import Path

def test_no_candidate_is_preapproved_without_rights_review():
    path = Path(__file__).parents[1] / "data" / "corpus_candidates.csv"
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    assert len(rows) >= 6
    assert all(r["approved_for_training"].strip().lower() == "no" for r in rows)

def test_naab_license_conflict_is_explicitly_blocked():
    path = Path(__file__).parents[1] / "data" / "corpus_candidates.csv"
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        rows = {r["candidate_id"]: r for r in csv.DictReader(f)}
    naab = rows["SLPL-NAAB"]
    assert naab["decision"] == "blocked_pending_rights_clarification"
    assert naab["approved_for_training"].lower() == "no"
