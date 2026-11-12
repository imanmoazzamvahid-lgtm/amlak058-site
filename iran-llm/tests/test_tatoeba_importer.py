import bz2
import json
from pathlib import Path

from scripts.download_tatoeba_persian import export_records, load_base_map, load_id_set, read_tsv


def write_bz2(path: Path, rows):
    with bz2.open(path, "wt", encoding="utf-8", newline="") as f:
        for row in rows:
            f.write("\t".join(row) + "\n")


def test_export_preserves_tatoeba_attribution_and_per_record_license(tmp_path):
    detailed = tmp_path / "pes_sentences_detailed.tsv.bz2"
    write_bz2(detailed, [
        ["100", "pes", "متن فارسی آزمایشی", "user_a", "2026-01-01", "2026-01-02"],
        ["101", "pes", "متن دوم آزمایشی", "user_b", "2026-01-03", "2026-01-04"],
        ["102", "eng", "English record", "user_c", "2026-01-03", "2026-01-04"],
    ])
    output = tmp_path / "out.jsonl"
    report = export_records(
        detailed, output, "pes", "https://example.org/export",
        "a" * 64, {"101"}, {"100": "0"}, 2
    )
    rows = [json.loads(x) for x in output.read_text(encoding="utf-8").splitlines()]
    assert len(rows) == 2
    assert rows[0]["contributor"] == "user_a"
    assert rows[0]["translation_base_id"] == "0"
    assert rows[0]["license"] == "CC-BY-2.0-FR"
    assert rows[1]["license"] == "CC0-1.0"
    assert all(row["training_approved"] is False for row in rows)
    assert report["counts"]["written"] == 2


def test_cc0_and_base_helpers(tmp_path):
    cc0 = tmp_path / "cc0.tsv.bz2"
    base = tmp_path / "base.tsv.bz2"
    write_bz2(cc0, [["101", "pes", "متن", "2026-01-01"]])
    write_bz2(base, [["100", "0"], ["101", "100"]])
    assert load_id_set(cc0) == {"101"}
    assert load_base_map(base) == {"100": "0", "101": "100"}
