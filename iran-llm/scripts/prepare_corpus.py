import argparse, csv, hashlib, json, random, re, unicodedata
from pathlib import Path

def normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = text.replace("ي", "ی").replace("ى", "ی").replace("ك", "ک").replace("ـ", "")
    text = re.sub(r"[\t\r ]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def main():
    ap = argparse.ArgumentParser(description="Prepare an auditable, licensed Persian corpus.")
    ap.add_argument("--raw-dir", default="data/raw")
    ap.add_argument("--manifest", default="data/manifest.csv")
    ap.add_argument("--output-dir", default="data/processed")
    ap.add_argument("--validation-ratio", type=float, default=0.02)
    ap.add_argument("--min-paragraph-chars", type=int, default=40)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    raw_dir, out_dir = Path(args.raw_dir).resolve(), Path(args.output_dir)
    if not 0.0 < args.validation_ratio < 0.5:
        raise SystemExit("--validation-ratio must be between 0 and 0.5")
    manifest_path = Path(args.manifest)
    if not manifest_path.exists():
        raise SystemExit(f"Missing {manifest_path}; create the CSV from data/manifest.csv.")

    with manifest_path.open("r", encoding="utf-8-sig", newline="") as f:
        rows = [
            row for row in csv.DictReader(f)
            if row.get("source_id") and not row["source_id"].strip().startswith("#")
        ]
    required = {"source_id", "path", "title", "source_url", "license", "approved", "retrieved_at"}
    if not rows or not required.issubset(rows[0].keys()):
        raise SystemExit(f"Manifest must include columns: {', '.join(sorted(required))}")

    docs, audit, seen = [], [], set()
    for row in rows:
        approved = (row.get("approved") or "").strip().lower()
        if approved not in {"yes", "true", "1"}:
            print(f"SKIP not approved: {row.get('source_id', '')}")
            continue
        license_text = (row.get("license") or "").strip()
        if not license_text:
            raise SystemExit(f"Missing license/rights statement for {row['source_id']}")
        rel = Path(row["path"])
        file_path = (raw_dir / rel).resolve()
        if raw_dir not in file_path.parents:
            raise SystemExit(f"Path escapes raw directory: {row['path']}")
        if not file_path.is_file():
            raise SystemExit(f"Source file not found: {file_path}")

        raw = file_path.read_text(encoding="utf-8")
        normalized = normalize(raw)
        paragraphs, local_seen = [], set()
        for paragraph in re.split(r"\n\s*\n", normalized):
            paragraph = re.sub(r"\s+", " ", paragraph).strip()
            if len(paragraph) < args.min_paragraph_chars:
                continue
            digest = sha256(paragraph)
            if digest not in seen and digest not in local_seen:
                paragraphs.append(paragraph)
                local_seen.add(digest)
        if not paragraphs:
            continue
        seen.update(local_seen)
        item = {
            "source_id": row["source_id"], "title": row["title"], "path": row["path"],
            "source_url": row["source_url"], "license": license_text,
            "retrieved_at": row["retrieved_at"],
            "sha256_normalized_file": sha256(normalized),
            "paragraphs": paragraphs,
        }
        docs.append(item)
        audit.append({k: item[k] for k in (
            "source_id", "title", "path", "source_url", "license",
            "retrieved_at", "sha256_normalized_file"
        )} | {"paragraph_count_after_dedup": len(paragraphs)})

    if len(docs) < 2:
        raise SystemExit("Need at least two approved source files for a document-level train/validation split.")

    random.Random(args.seed).shuffle(docs)
    val_count = max(1, round(len(docs) * args.validation_ratio))
    val_docs, train_docs = docs[:val_count], docs[val_count:]
    if not train_docs:
        raise SystemExit("Not enough source documents for a training split.")

    out_dir.mkdir(parents=True, exist_ok=True)
    def write(name, selected):
        target = out_dir / name
        with target.open("w", encoding="utf-8") as f:
            for doc in selected:
                for paragraph in doc["paragraphs"]:
                    f.write(paragraph + "\n")
                    f.write("<|document_end|>\n")
        return target

    train_path = write("train.txt", train_docs)
    val_path = write("validation.txt", val_docs)
    report = {
        "seed": args.seed,
        "validation_ratio_requested": args.validation_ratio,
        "train_documents": len(train_docs),
        "validation_documents": len(val_docs),
        "train_paragraphs": sum(len(d["paragraphs"]) for d in train_docs),
        "validation_paragraphs": sum(len(d["paragraphs"]) for d in val_docs),
        "sources": audit,
    }
    (out_dir / "corpus_manifest.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({
        "train_file": str(train_path), "validation_file": str(val_path),
        "train_documents": len(train_docs), "validation_documents": len(val_docs),
        "train_paragraphs": report["train_paragraphs"],
        "validation_paragraphs": report["validation_paragraphs"],
    }, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
