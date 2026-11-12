#!/usr/bin/env python3
"""Audit legal intake registry and produce a transparent acquisition report."""
import argparse
import csv
import json
from collections import Counter
from pathlib import Path

REQUIRED = {
    "document_id", "title", "document_type", "enactment_date_jalali",
    "official_source_candidate", "discovery_reference", "official_copy_status",
    "amendment_review_status", "rights_status", "training_approved", "notes"
}

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", default="data/legal/intake_queue.csv", type=Path)
    p.add_argument("--output", default="data/legal/intake_audit.json", type=Path)
    args = p.parse_args()
    with args.input.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fields = set(reader.fieldnames or [])
        missing = REQUIRED - fields
        if missing:
            raise SystemExit("Missing columns: " + ", ".join(sorted(missing)))
        rows = list(reader)

    ids = [r["document_id"] for r in rows]
    if len(ids) != len(set(ids)):
        raise SystemExit("Duplicate document_id in intake registry")

    status_counts = Counter(r["official_copy_status"] for r in rows)
    amendment_counts = Counter(r["amendment_review_status"] for r in rows)
    rights_counts = Counter(r["rights_status"] for r in rows)
    approved = [r["document_id"] for r in rows if r["training_approved"].strip().lower() in {"yes", "true", "1"}]
    blockers = []
    for row in rows:
        if row["training_approved"].strip().lower() in {"yes", "true", "1"}:
            if row["official_copy_status"] != "verified":
                blockers.append(f"{row['document_id']}: official copy not verified")
            if row["amendment_review_status"] != "verified":
                blockers.append(f"{row['document_id']}: amendments not reviewed")
            if row["rights_status"] not in {"approved", "public_domain_verified", "permission_documented"}:
                blockers.append(f"{row['document_id']}: training rights not cleared")
    report = {
        "document_count": len(rows),
        "official_copy_status": dict(status_counts),
        "amendment_review_status": dict(amendment_counts),
        "rights_status": dict(rights_counts),
        "training_approved_count": len(approved),
        "training_approved_ids": approved,
        "blocking_errors": blockers,
        "note": "An intake entry is not a legal text and is not part of the training corpus.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if blockers:
        raise SystemExit(2)

if __name__ == "__main__":
    main()
