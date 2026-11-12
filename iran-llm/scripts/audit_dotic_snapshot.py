#!/usr/bin/env python3
"""Audit a public DOTIC-derived Parquet snapshot without promoting it to the canonical corpus."""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse
from typing import Any, Iterable

ALLOWED_SOURCE_HOSTS = {"dotic.ir", "www.dotic.ir", "media.dotic.ir"}
REQUIRED_COLUMNS = {
    "id", "title", "text", "source_url", "source_type", "jurisdiction",
    "country", "language", "retrieved_at", "license", "law_status",
    "identifier", "official_identifier", "article_count", "json_path", "metadata_json"
}


def _metadata(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str) or not value.strip():
        return {}
    try:
        parsed = json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _host(url: Any) -> str:
    if not isinstance(url, str) or not url.strip():
        return ""
    try:
        return (urlparse(url.strip()).hostname or "").lower()
    except ValueError:
        return ""


def audit_rows(rows: Iterable[dict[str, Any]], columns: Iterable[str] | None = None) -> dict[str, Any]:
    rows = list(rows)
    available = set(columns or (rows[0].keys() if rows else []))
    missing_columns = sorted(REQUIRED_COLUMNS - available)
    ids = [str(row.get("id", "")).strip() for row in rows]
    nonempty_ids = [value for value in ids if value]
    source_hosts = Counter(_host(row.get("source_url")) for row in rows)
    licenses = Counter(str(row.get("license", "unknown") or "unknown") for row in rows)
    statuses = Counter(str(row.get("law_status", "unknown") or "unknown") for row in rows)
    missing_hash = 0
    malformed_metadata = 0
    reuse_url_missing = 0
    missing_dates = 0
    empty_text = 0
    empty_title = 0
    non_ir = 0
    off_domain = 0
    for row in rows:
        raw_meta = row.get("metadata_json")
        meta = _metadata(raw_meta)
        if raw_meta and not meta:
            malformed_metadata += 1
        if not meta.get("content_sha256"):
            missing_hash += 1
        rights = meta.get("rights") if isinstance(meta.get("rights"), dict) else {}
        if not rights.get("official_reuse_url"):
            reuse_url_missing += 1
        if not row.get("date") and not row.get("date_issued"):
            missing_dates += 1
        if not str(row.get("text", "") or "").strip():
            empty_text += 1
        if not str(row.get("title", "") or "").strip():
            empty_title += 1
        if str(row.get("jurisdiction", "")).strip().upper() != "IR":
            non_ir += 1
        host = _host(row.get("source_url"))
        if host and host not in ALLOWED_SOURCE_HOSTS and not host.endswith(".dotic.ir"):
            off_domain += 1
    duplicate_ids = len(nonempty_ids) - len(set(nonempty_ids))
    unknown_id_count = len(rows) - len(nonempty_ids)
    return {
        "row_count": len(rows),
        "missing_columns": missing_columns,
        "duplicate_id_count": duplicate_ids,
        "missing_id_count": unknown_id_count,
        "empty_title_count": empty_title,
        "empty_text_count": empty_text,
        "non_ir_jurisdiction_count": non_ir,
        "off_domain_source_count": off_domain,
        "missing_metadata_hash_count": missing_hash,
        "malformed_metadata_count": malformed_metadata,
        "missing_official_reuse_url_count": reuse_url_missing,
        "missing_date_count": missing_dates,
        "source_hosts": dict(source_hosts),
        "licenses": dict(licenses),
        "law_statuses": dict(statuses),
        "canonical_ingestion_approved": False,
        "training_approved": False,
        "decision": "discovery_only_pending_official_and_rights_review",
        "limitations": [
            "A metadata hash is only a claimed hash until compared with the actual source file.",
            "A DOTIC URL does not prove current legal validity or completeness.",
            "The custom ir-dotic label is not, by itself, a complete reuse permission.",
            "The snapshot may be incomplete or stale; amendments and effective dates need separate review.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Path to the downloaded laws.parquet file")
    parser.add_argument("--output", required=True, type=Path, help="JSON audit report path")
    parser.add_argument("--max-rows", type=int, default=0, help="Optional sample limit; 0 audits all rows")
    args = parser.parse_args()
    try:
        import pyarrow.parquet as pq
    except ImportError as exc:
        raise SystemExit("Install the optional Parquet reader first: python -m pip install pyarrow") from exc
    if not args.input.is_file():
        raise SystemExit(f"Input file not found: {args.input}")
    parquet = pq.ParquetFile(args.input)
    columns = parquet.schema.names
    selected = [name for name in columns if name in REQUIRED_COLUMNS or name in {"date", "date_issued"}]
    batches = parquet.iter_batches(batch_size=1000, columns=selected)
    rows: list[dict[str, Any]] = []
    for batch in batches:
        rows.extend(batch.to_pylist())
        if args.max_rows and len(rows) >= args.max_rows:
            rows = rows[: args.max_rows]
            break
    report = audit_rows(rows, columns)
    report["input_file"] = str(args.input)
    report["parquet_metadata_row_count"] = parquet.metadata.num_rows
    report["sampled_only"] = bool(args.max_rows and len(rows) < parquet.metadata.num_rows)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()