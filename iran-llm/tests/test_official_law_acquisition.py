import json
from email.message import Message

import pytest

from scripts.acquire_official_law import download_official_document, validate_official_url
from scripts.extract_legal_articles import extract_article_candidates


class FakeResponse:
    def __init__(self, data, url):
        self.data = data
        self.url = url
        self.status = 200
        self.headers = Message()
        self.headers["Content-Type"] = "text/html; charset=utf-8"

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def geturl(self):
        return self.url

    def read(self, size=-1):
        return self.data[:size]


class FakeOpener:
    def __init__(self, response):
        self.response = response

    def open(self, request, timeout=30):
        return self.response


def test_official_url_allowlist_rejects_secondary_sources():
    validate_official_url("https://qavanin.ir/Law/TreeText/?IDS=12021850837713548188")
    with pytest.raises(ValueError):
        validate_official_url("https://haghparvar.ir/laws/civil-code")
    with pytest.raises(ValueError):
        validate_official_url("http://rrk.ir/example")


def test_official_download_records_hash_and_keeps_training_disabled(tmp_path):
    payload = b"<html><body>official fixture</body></html>"
    output = tmp_path / "law.html"
    metadata = tmp_path / "law.source.json"
    result = download_official_document(
        "https://qavanin.ir/Law/TreeText/?IDS=12021850837713548188",
        output,
        metadata,
        opener=FakeOpener(FakeResponse(payload, "https://qavanin.ir/Law/TreeText/?IDS=12021850837713548188")),
    )
    assert output.read_bytes() == payload
    saved = json.loads(metadata.read_text(encoding="utf-8"))
    assert saved["sha256"] == result["sha256"]
    assert saved["training_approved"] is False
    assert saved["rights_status"] == "not_assessed"


def test_redirect_to_non_official_host_is_rejected(tmp_path):
    payload = b"fixture"
    with pytest.raises(ValueError):
        download_official_document(
            "https://qavanin.ir/law",
            tmp_path / "law.html",
            tmp_path / "law.json",
            opener=FakeOpener(FakeResponse(payload, "https://example.org/fake")),
        )


def test_extracts_candidate_articles_without_approving_them():
    html = """
    <html><body>
      <h2>ماده ۱</h2><p>متن ماده نخست.</p>
      <h2>ماده ۲</h2><p>متن ماده دوم.</p>
      <script>ماده ۹۹ متن پنهان</script>
    </body></html>
    """
    rows = extract_article_candidates(html)
    assert [row["article_number"] for row in rows] == ["1", "2"]
    assert rows[0]["body_candidate"] == "متن ماده نخست."
    assert all(row["training_approved"] is False for row in rows)
