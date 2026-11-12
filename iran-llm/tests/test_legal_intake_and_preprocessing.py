import csv
import subprocess
import sys
from pathlib import Path

from scripts.prepare_corpus import normalize, sha256


def test_persian_normalization_preserves_zwnj_and_normalizes_letters():
    result = normalize("علي  كلمه\u200cها\n\n\nمتن دوم")
    assert "علی" in result
    assert "کلمه\u200cها" in result
    assert "\n\n" in result


def test_sha256_is_stable():
    assert sha256("ایران") == sha256("ایران")
    assert sha256("ایران") != sha256("حقوق")


def test_intake_audit_keeps_unverified_records_out_of_training(tmp_path):
    root = Path(__file__).parents[1]
    input_csv = root / "data" / "legal" / "intake_queue.csv"
    output = tmp_path / "audit.json"
    proc = subprocess.run(
        [sys.executable, str(root / "scripts" / "audit_legal_intake.py"),
         "--input", str(input_csv), "--output", str(output)],
        capture_output=True, text=True, check=False
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
    import json
    report = json.loads(output.read_text(encoding="utf-8"))
    assert report["document_count"] >= 8
    assert report["training_approved_count"] == 0
    assert report["blocking_errors"] == []
