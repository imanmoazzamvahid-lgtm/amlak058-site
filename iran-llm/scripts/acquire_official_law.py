#!/usr/bin/env python3
"""Download an original legal document from an allow-listed Iranian official host.

A successful HTTP download does not establish permission for model training.
The exact URL, retrieval timestamp, media type and SHA-256 are recorded.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

OFFICIAL_HOSTS = {
    "qavanin.ir", "www.qavanin.ir", "rrk.ir", "www.rrk.ir", "rc.majlis.ir",
}
MAX_BYTES = 100 * 1024 * 1024


def validate_official_url(url: str) -> None:
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or host not in OFFICIAL_HOSTS:
        raise ValueError("URL must use HTTPS and an allow-listed official host")
    if parsed.username or parsed.password:
        raise ValueError("Credentials in source URLs are not allowed")


class AllowListedRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_official_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def download_official_document(
    url: str,
    output: Path,
    metadata_path: Path,
    timeout: int = 30,
    retries: int = 3,
    force: bool = False,
    opener=None,
) -> dict:
    validate_official_url(url)
    if retries < 1:
        raise ValueError("retries must be at least 1")
    output = output.resolve()
    metadata_path = metadata_path.resolve()
    if output == metadata_path:
        raise ValueError("output and metadata paths must differ")
    if (output.exists() or metadata_path.exists()) and not force:
        raise FileExistsError("Refusing to overwrite existing files; pass --force")

    request = Request(
        url,
        headers={
            "User-Agent": "IRAN-LLM-LegalCorpusBot/0.1 (source-provenance)",
            "Accept": "text/html,application/pdf,application/msword,*/*;q=0.5",
        },
    )
    client = opener or build_opener(AllowListedRedirectHandler())
    last_error = None
    response_data = None
    media_type = None
    final_url = None

    for attempt in range(retries):
        try:
            with client.open(request, timeout=timeout) as response:
                final_url = response.geturl()
                validate_official_url(final_url)
                status = getattr(response, "status", 200)
                if status != 200:
                    raise RuntimeError(f"Unexpected HTTP status: {status}")
                response_data = response.read(MAX_BYTES + 1)
                media_type = response.headers.get_content_type()
                if not response_data:
                    raise RuntimeError("Official source returned an empty response")
                if len(response_data) > MAX_BYTES:
                    raise RuntimeError(f"Response exceeds {MAX_BYTES} bytes")
            break
        except HTTPError as exc:
            last_error = exc
            if 400 <= exc.code < 500 and exc.code != 429:
                raise RuntimeError(f"Official source rejected request: HTTP {exc.code}") from exc
        except (URLError, TimeoutError, OSError, RuntimeError) as exc:
            last_error = exc
        if attempt + 1 < retries:
            time.sleep(min(2 ** attempt, 8))

    if response_data is None:
        raise RuntimeError(f"Could not retrieve official document after {retries} attempts: {last_error}")

    digest = sha256_bytes(response_data)
    metadata = {
        "source_url_requested": url,
        "source_url_final": final_url,
        "retrieved_at_utc": datetime.now(timezone.utc).isoformat(),
        "http_status": 200,
        "content_type": media_type,
        "byte_length": len(response_data),
        "sha256": digest,
        "rights_status": "not_assessed",
        "training_approved": False,
        "review_note": "Successful retrieval does not establish reproduction or model-training permission.",
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    output_tmp = output.with_name(output.name + ".tmp")
    metadata_tmp = metadata_path.with_name(metadata_path.name + ".tmp")
    try:
        output_tmp.write_bytes(response_data)
        metadata_tmp.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(output_tmp, output)
        os.replace(metadata_tmp, metadata_path)
    finally:
        output_tmp.unlink(missing_ok=True)
        metadata_tmp.unlink(missing_ok=True)
    return metadata


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--metadata", required=True, type=Path)
    parser.add_argument("--timeout", type=int, default=30)
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    try:
        result = download_official_document(
            args.url, args.output, args.metadata, args.timeout, args.retries, args.force
        )
    except Exception as exc:
        print(f"ACQUISITION FAILED: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
