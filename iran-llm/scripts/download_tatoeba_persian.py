#!/usr/bin/env python3
"""Download and audit a language-specific Tatoeba sentence export.

The output is JSONL with attribution metadata. It is not automatically approved
for language-model training; the Tatoeba export is generally CC BY 2.0 FR and
some records may be CC0. Preserve the per-record license and contributor.
"""
from __future__ import annotations
import argparse
import bz2
import csv
import hashlib
import json
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen


class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "a":
            for key, value in attrs:
                if key.lower() == "href" and value:
                    self.links.append(value)


def fetch(url: str, timeout: int = 60) -> bytes:
    request = Request(url, headers={"User-Agent": "IRAN-LLM-CorpusCollector/0.1"})
    with urlopen(request, timeout=timeout) as response:
        if response.status != 200:
            raise RuntimeError(f"Unexpected HTTP status {response.status} for {url}")
        return response.read()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def discover_file(index_url: str, expected_name: str) -> str | None:
    page = fetch(index_url).decode("utf-8", errors="replace")
    parser = LinkParser()
    parser.feed(page)
    for link in parser.links:
        if link.rstrip("/").split("/")[-1] == expected_name:
            return urljoin(index_url, link)
    return None


def download(url: str, target: Path) -> str:
    target.parent.mkdir(parents=True, exist_ok=True)
    request = Request(url, headers={"User-Agent": "IRAN-LLM-CorpusCollector/0.1"})
    digest = hashlib.sha256()
    temporary = target.with_suffix(target.suffix + ".part")
    try:
        with urlopen(request, timeout=120) as response, temporary.open("wb") as out:
            if response.status != 200:
                raise RuntimeError(f"Unexpected HTTP status {response.status} for {url}")
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
                digest.update(chunk)
        temporary.replace(target)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return digest.hexdigest()


def read_tsv(path: Path):
    with bz2.open(path, "rt", encoding="utf-8", errors="strict", newline="") as stream:
        reader = csv.reader(stream, delimiter="\t")
        for row in reader:
            yield row


def load_id_set(path: Path | None) -> set[str]:
    ids: set[str] = set()
    if path is None or not path.exists():
        return ids
    for row in read_tsv(path):
        if row and row[0].isdigit():
            ids.add(row[0])
    return ids


def load_base_map(path: Path | None) -> dict[str, str]:
    mapping: dict[str, str] = {}
    if path is None or not path.exists():
        return mapping
    for row in read_tsv(path):
        if len(row) >= 2 and row[0].isdigit():
            mapping[row[0]] = row[1]
    return mapping


def export_records(
    detailed_path: Path,
    output_path: Path,
    language_code: str,
    dataset_url: str,
    detailed_sha256: str,
    cc0_ids: set[str],
    base_map: dict[str, str],
    min_chars: int,
) -> dict:
    retrieved_at = datetime.now(timezone.utc).isoformat()
    seen_ids: set[str] = set()
    seen_text_hashes: set[str] = set()
    counts = {"rows_seen": 0, "language_rows": 0, "written": 0, "duplicates": 0, "too_short": 0}
    license_counts = {"CC-BY-2.0-FR": 0, "CC0-1.0": 0}

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as output:
        for row in read_tsv(detailed_path):
            counts["rows_seen"] += 1
            if len(row) < 3:
                continue
            sentence_id, row_language, text = row[0], row[1], row[2]
            if row_language != language_code:
                continue
            counts["language_rows"] += 1
            if not sentence_id.isdigit() or not text.strip():
                continue
            if len(text.strip()) < min_chars:
                counts["too_short"] += 1
                continue
            text_hash = hashlib.sha256(text.strip().encode("utf-8")).hexdigest()
            if sentence_id in seen_ids or text_hash in seen_text_hashes:
                counts["duplicates"] += 1
                continue
            seen_ids.add(sentence_id)
            seen_text_hashes.add(text_hash)

            license_id = "CC0-1.0" if sentence_id in cc0_ids else "CC-BY-2.0-FR"
            license_counts[license_id] += 1
            creator = row[3] if len(row) > 3 else ""
            date_added = row[4] if len(row) > 4 else ""
            date_modified = row[5] if len(row) > 5 else ""
            record = {
                "document_id": f"tatoeba:{sentence_id}",
                "text": text,
                "language_code": language_code,
                "source_url": f"https://tatoeba.org/en/sentences/show/{sentence_id}",
                "dataset_url": dataset_url,
                "license": license_id,
                "license_url": (
                    "https://creativecommons.org/publicdomain/zero/1.0/"
                    if license_id == "CC0-1.0"
                    else "https://creativecommons.org/licenses/by/2.0/fr/"
                ),
                "contributor": creator,
                "date_added": date_added,
                "date_modified": date_modified,
                "translation_base_id": base_map.get(sentence_id),
                "retrieved_at": retrieved_at,
                "export_sha256": detailed_sha256,
                "training_approved": False,
                "approval_note": "Requires separate rights, attribution and privacy review; never auto-approved.",
            }
            output.write(json.dumps(record, ensure_ascii=False) + "\n")
            counts["written"] += 1

    return {
        "language_code": language_code,
        "retrieved_at": retrieved_at,
        "source_dataset_url": dataset_url,
        "detailed_export_sha256": detailed_sha256,
        "cc0_export_present": bool(cc0_ids),
        "counts": counts,
        "license_counts": license_counts,
        "training_approved": False,
        "output_jsonl": str(output_path),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--language-code", default="pes", help="Tatoeba ISO language code, default pes (Persian)")
    parser.add_argument("--download-dir", default="data/raw/tatoeba", type=Path)
    parser.add_argument("--output", default="data/processed/tatoeba_persian.jsonl", type=Path)
    parser.add_argument("--min-chars", type=int, default=2)
    args = parser.parse_args()

    if not args.language_code.isalpha() or len(args.language_code) not in (3, 4):
        raise SystemExit("Use a 3- or 4-letter Tatoeba language code.")
    index_url = f"https://downloads.tatoeba.org/exports/per_language/{args.language_code}/"
    detailed_name = f"{args.language_code}_sentences_detailed.tsv.bz2"
    detailed_url = discover_file(index_url, detailed_name)
    if not detailed_url:
        raise SystemExit(
            f"Could not find {detailed_name} at {index_url}. "
            "Check the current Tatoeba language code/index before retrying."
        )

    args.download_dir.mkdir(parents=True, exist_ok=True)
    detailed_path = args.download_dir / detailed_name
    detailed_sha = download(detailed_url, detailed_path)

    cc0_name = f"{args.language_code}_sentences_CC0.tsv.bz2"
    cc0_url = discover_file(index_url, cc0_name)
    cc0_path = None
    if cc0_url:
        cc0_path = args.download_dir / cc0_name
        download(cc0_url, cc0_path)

    base_name = f"{args.language_code}_sentences_base.tsv.bz2"
    base_url = discover_file(index_url, base_name)
    base_path = None
    if base_url:
        base_path = args.download_dir / base_name
        download(base_url, base_path)

    cc0_ids = load_id_set(cc0_path)
    base_map = load_base_map(base_path)
    report = export_records(
        detailed_path=detailed_path,
        output_path=args.output,
        language_code=args.language_code,
        dataset_url=detailed_url,
        detailed_sha256=detailed_sha,
        cc0_ids=cc0_ids,
        base_map=base_map,
        min_chars=args.min_chars,
    )
    report_path = args.output.with_suffix(".audit.json")
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
