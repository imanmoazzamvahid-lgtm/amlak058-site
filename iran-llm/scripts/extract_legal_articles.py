#!/usr/bin/env python3
"""Extract candidate article blocks from an already acquired official HTML file.

This is a staging aid only. Extracted articles are not legally verified and must
be checked against the official publication before inclusion in the corpus.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

BLOCK_TAGS = {
    "address", "article", "blockquote", "dd", "div", "dl", "dt", "h1", "h2",
    "h3", "h4", "h5", "h6", "li", "ol", "p", "section", "table", "tr", "br",
}
SKIP_TAGS = {"script", "style", "noscript", "svg", "nav", "footer"}
ARTICLE_HEADING = re.compile(
    r"(?m)(?:^|[\r\n])\s*ماده\s+([۰-۹0-9]+(?:\s*مکرر)?)\s*(?:[-–—:：]\s*)?"
)
DIGIT_TRANSLATION = str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")


class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in SKIP_TAGS:
            self.skip_depth += 1
        if not self.skip_depth and tag in BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS and self.skip_depth:
            self.skip_depth -= 1
        if not self.skip_depth and tag in BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip_depth:
            self.parts.append(data)

    def text(self) -> str:
        value = "".join(self.parts).replace("\xa0", " ")
        value = re.sub(r"[ \t]+\n", "\n", value)
        value = re.sub(r"\n{3,}", "\n\n", value)
        return value.strip()


def extract_article_candidates(html: str, document_id: str = "IR-CIVIL-CODE") -> list[dict]:
    parser = VisibleText()
    parser.feed(html)
    source_text = parser.text()
    matches = list(ARTICLE_HEADING.finditer(source_text))
    records = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(source_text)
        body = source_text[start:end].strip(" \t\r\n-–—:")
        if not body:
            continue
        number = re.sub(r"\s+", " ", match.group(1)).translate(DIGIT_TRANSLATION)
        records.append({
            "document_id": document_id,
            "article_number": number,
            "body_candidate": body,
            "extraction_status": "candidate_unverified",
            "training_approved": False,
        })
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--document-id", default="IR-CIVIL-CODE")
    args = parser.parse_args()
    raw = args.input.read_bytes()
    try:
        html = raw.decode("utf-8")
    except UnicodeDecodeError:
        html = raw.decode("utf-8-sig", errors="replace")
    records = extract_article_candidates(html, args.document_id)
    if not records:
        raise SystemExit("No article headings were detected; refusing to create an empty candidate file.")
    numbers = [row["article_number"] for row in records]
    digest = hashlib.sha256(raw).hexdigest()
    report = {
        "source_file": str(args.input),
        "source_sha256": digest,
        "candidate_article_count": len(records),
        "duplicate_article_numbers": sorted({n for n in numbers if numbers.count(n) > 1}),
        "status": "candidate_unverified",
        "training_approved": False,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as stream:
        for row in records:
            stream.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
