#!/usr/bin/env python3
"""Validate legal JSONL records before indexing or training."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlparse
from jsonschema import Draft202012Validator, FormatChecker

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()

def validate(path: Path, schema_path: Path, raw_root: Path, require_training: bool) -> list[str]:
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors: list[str] = []
    seen_ids: set[str] = set()
    seen_hashes: dict[str, str] = {}
    raw_root_resolved = raw_root.resolve()

    with path.open("r", encoding="utf-8") as stream:
        for line_no, line in enumerate(stream, 1):
            if not line.strip():
                continue
            try:
                doc = json.loads(line)
            except json.JSONDecodeError as exc:
                errors.append(f"line {line_no}: invalid JSON: {exc}")
                continue
            if not isinstance(doc, dict):
                errors.append(f"line {line_no}: each JSONL line must be an object")
                continue

            for err in sorted(validator.iter_errors(doc), key=lambda e: list(map(str, e.path))):
                loc = ".".join(map(str, err.path)) or "<root>"
                errors.append(f"line {line_no} {loc}: {err.message}")

            doc_id = doc.get("document_id")
            if doc_id:
                if doc_id in seen_ids:
                    errors.append(f"line {line_no}: duplicate document_id {doc_id}")
                seen_ids.add(doc_id)

            source = doc.get("source") or {}
            digest = source.get("sha256")
            if digest:
                if digest in seen_hashes:
                    errors.append(f"line {line_no}: duplicate source SHA-256 also used by {seen_hashes[digest]}")
                else:
                    seen_hashes[digest] = str(doc_id)

            original_file = source.get("original_file")
            actual_digest = None
            if original_file:
                original_path = (raw_root_resolved / original_file).resolve()
                if raw_root_resolved not in original_path.parents:
                    errors.append(f"line {line_no}: original_file escapes raw root")
                elif not original_path.is_file():
                    errors.append(f"line {line_no}: original file not found: {original_file}")
                else:
                    actual_digest = sha256_file(original_path)
                    if digest and actual_digest.lower() != str(digest).lower():
                        errors.append(f"line {line_no}: SHA-256 mismatch for {original_file}")

            text_data = doc.get("text") or {}
            raw_text = text_data.get("raw_text")
            if raw_text is not None and digest:
                raw_digest = hashlib.sha256(raw_text.encode("utf-8")).hexdigest()
                if raw_digest.lower() != str(digest).lower():
                    errors.append(f"line {line_no}: text.raw_text does not match source SHA-256")

            url = source.get("url", "")
            if url and urlparse(url).scheme != "https":
                errors.append(f"line {line_no}: source URL must use HTTPS")

            rights = doc.get("rights") or {}
            if require_training and rights.get("training_approved") is not True:
                errors.append(f"line {line_no}: document is not approved for training")
            if rights.get("training_approved") is True:
                if not rights.get("reviewer") or not rights.get("reviewed_at"):
                    errors.append(f"line {line_no}: training approval requires reviewer and reviewed_at")
                basis = str(rights.get("license_or_legal_basis", "")).strip().lower()
                if basis in {"", "unknown", "not assessed", "unverified"}:
                    errors.append(f"line {line_no}: training approval has no documented rights basis")
                if (doc.get("legal_status") or {}).get("status") == "unknown":
                    errors.append(f"line {line_no}: unknown legal status cannot enter approved training corpus")
    return errors

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--jsonl", required=True, type=Path)
    p.add_argument("--schema", default="data/legal_document.schema.json", type=Path)
    p.add_argument("--raw-root", default="data/legal/raw", type=Path)
    p.add_argument("--require-training-approved", action="store_true")
    args = p.parse_args()
    issues = validate(args.jsonl, args.schema, args.raw_root, args.require_training_approved)
    if issues:
        print("LEGAL CORPUS VALIDATION FAILED")
        for issue in issues:
            print(f"- {issue}")
        return 1
    print("LEGAL CORPUS VALIDATION PASSED")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
