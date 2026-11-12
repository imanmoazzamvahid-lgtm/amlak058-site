# IRAN-LLM 100M — Persian foundation model trained from random initialization

This experimental project does not load pretrained model weights and does not call OpenAI, Gemini, Groq, or another hosted LLM API. Parameters are initialized randomly in \`model.py\`.

## What this first milestone is
A reproducible research scaffold: tokenizer training, a causal Transformer, auditable corpus preparation, token encoding, and a CPU/GPU smoke test. It is **not yet a trained language model** and is not suitable for legal advice.

## 1. Environment
Python 3.11+, PyTorch 2.x, SentencePiece, NumPy, tqdm.

\`\`\`bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
mkdir -p data/raw data/processed data/encoded artifacts checkpoints
\`\`\`

## 2. Corpus provenance comes first
Place UTF-8 \`.txt\` documents in \`data/raw/\`. Complete \`data/manifest.csv\` with:
\`source_id,path,title,source_url,license,approved,retrieved_at\`.

Only use public-domain, permissioned, or otherwise properly licensed sources. Set \`approved=yes\` only after checking the exact license and source provenance. Do not use private client files, personal data, leaked material, or copyrighted books without permission. The script preserves an audit manifest with SHA-256 hashes and splits by document to avoid same-document leakage.

\`\`\`bash
python scripts/prepare_corpus.py --raw-dir data/raw --manifest data/manifest.csv --output-dir data/processed
\`\`\`

## 3. Train tokenizer from the project's own corpus
\`\`\`bash
python scripts/train_tokenizer.py --input data/processed/train.txt --model-prefix artifacts/iran_spm --vocab-size 16000
\`\`\`
Tokenizer training is not language-model training. Evaluate Persian character coverage, ZWNJ, Arabic/Persian letter variants, numbers, Latin text, and punctuation before freezing the vocabulary. SentencePiece can train BPE/Unigram directly from raw sentences; see its official docs: https://google.github.io/sentencepiece/.

## 4. Encode corpora to disk-backed uint32 arrays
\`\`\`bash
python scripts/encode_corpus.py --tokenizer artifacts/iran_spm.model --train-text data/processed/train.txt --validation-text data/processed/validation.txt
\`\`\`
The training loop samples batches from memory-mapped files instead of copying the complete corpus to GPU memory.

## 5. Run the code smoke test
\`\`\`bash
python scripts/smoke_test.py
\`\`\`
This initializes a small random Transformer, checks output shapes, finite loss, and backpropagation. It does not train a production model.

## 6. Train the initial ~100M-parameter configuration
\`\`\`bash
python train.py --train-bin data/encoded/train.bin --validation-bin data/encoded/validation.bin --tokenizer artifacts/iran_spm.model --steps 1000 --batch-size 4 --context 512
\`\`\`
The default architecture uses dim=768, 12 layers, 12 attention heads and a 16k vocabulary, approximately 100M parameters. The true count is printed at startup. Benchmark memory and tokens/second before choosing a long run.

## Reproducibility
Keep a record of seed, data manifest, tokenizer hash, code commit, package versions, GPU model/driver, precision, batch size, sequence length, optimizer, training tokens, wall-clock time, checkpoint hashes, and evaluation results. PyTorch notes that exact reproducibility is not guaranteed across releases and hardware, even with fixed seeds: https://pytorch.org/docs/stable/notes/randomness.html.

## Roadmap
1. Corpus acquisition, licensing and quality audits.
2. Tokenizer coverage/round-trip tests.
3. Smoke test on a developer machine.
4. Small GPU benchmark and memory profile.
5. Train 100M from random initialization.
6. Evaluate held-out loss/perplexity and human Persian quality.
7. Only after base pretraining: instruction tuning, then legal-domain adaptation with verified sources.

No legal-domain reliability claim is permitted before evaluation and source-grounded retrieval are implemented.

## Legal corpus validation

Keep legal source documents and JSONL metadata under `data/legal/`. Do not put unlicensed material into the training corpus. Check each source record and raw-file hash before indexing or training:

```bash
python -m pip install jsonschema pytest
python scripts/validate_legal_corpus.py --jsonl data/legal/documents.jsonl --schema data/legal_document.schema.json --raw-root data/legal/raw
python scripts/validate_legal_corpus.py --jsonl data/legal/documents.jsonl --schema data/legal_document.schema.json --raw-root data/legal/raw --require-training-approved
python -m pytest -q tests
```

The first command validates catalogue metadata. The second is stricter and must fail for every item without explicit documented training permission, reviewer, review timestamp, verified source hash and known legal status. The legal source registry intentionally marks all sources as not approved for model training until individually reviewed.


## Initial Iranian legal document intake

The first acquisition queue contains eight priority statutes, their provisional enactment dates, source-discovery references, and explicit acquisition/amendment/rights states. It is a **queue**, not a set of collected statute texts.

Review its audit report with:
```bash
python scripts/audit_legal_intake.py --input data/legal/intake_queue.csv --output data/legal/intake_audit.json
```

The current queue intentionally has zero training-approved legal documents. Official source pages may be temporarily unavailable to automated retrieval; a secondary website or a search result is discovery evidence only. A legal text cannot be marked ready until the official copy, amendment history, legal status, SHA-256, and training-use rights are verified.


## Exact first-model parameter budget

Run:
```bash
python scripts/model_profile.py
```
The current design (16,000 token vocabulary, context 512, width 768, 12 layers, 12 heads) has exactly 97,737,216 parameters with tied token embedding/output weights. The FP32 AdamW lower-bound estimate for weights, gradients, and two optimizer moments is approximately 1.46 GiB; this excludes activations, attention workspace and runtime overhead, so actual GPU memory needs are much higher.


## Persian corpus source review

Potential sources and their current acquisition decisions are tracked in `data/corpus_candidates.csv` and explained in `data/DATA_SOURCE_DECISIONS.md`. The candidate list is deliberately not an approval list.

- Persian Wikipedia: conditional candidate; preserve per-page attribution and source history, and resolve CC BY-SA/GFDL implications for model weights.
- SLPL/naab: blocked pending written rights clarification because the Hugging Face MIT card conflicts with CC BY-NC-SA copyright metadata and the source mixture has provenance/privacy risks.
- Tatoeba: small auxiliary candidate; sentence-level license and attribution must be retained. Do not assume all Persian records are CC0.
- ParsiNLU: hold out for evaluation only after source permissions are checked.
- Mixed-license corpora: split by original source before any use.
- CC BY-NC data: exclude from commercial product training unless separate permission is obtained.

No candidate is currently approved for model training.


## Controlled official legal acquisition

For statutes, first identify and retrieve the primary official record. Never treat a secondary transcription or an index entry as an official source copy. The official acquisition utility stores the original response and SHA-256, restricts downloads and redirects to allow-listed official domains, and explicitly leaves training approval disabled:

```bash
python scripts/acquire_official_law.py --url 'https://qavanin.ir/Law/TreeText/?IDS=12021850837713548188' --output data/legal/raw/IR-CIVIL-CODE/official-source.html --metadata data/legal/raw/IR-CIVIL-CODE/source-metadata.json
python scripts/extract_legal_articles.py --input data/legal/raw/IR-CIVIL-CODE/official-source.html --output data/legal/candidates/IR-CIVIL-CODE.articles.jsonl
```

Extracted articles are staging candidates only. They remain unverified and are not approved for training until the official text, amendments, legal status and exact reuse/training rights are independently reviewed.

## Research and system design

Research documents are kept separately from source code and corpus records:

- `research/ADAD_COMPETITIVE_REVIEW.md`: public-evidence review of Adad; it does not claim access to Adad's internal data or architecture.
- `research/IRAN_SYSTEM_BLUEPRINT.md`: proposed legal data model, ingestion, versioning, hybrid retrieval, RAG, security and model architecture.
- `research/EXECUTION_ROADMAP.md`: staged delivery plan and acceptance criteria.
- `research/MODEL_KNOWLEDGE_SEED_POLICY.md`: safe use of model knowledge for discovering legal documents without treating generated text as official legislation.

`data/legal/model_knowledge_seed.csv` is a discovery index generated from model knowledge. Every row is deliberately `unverified`, has `training_approved=no`, and must be resolved to a primary source before any full text is accepted. This index is not a legal corpus and contains no claim that all Iranian laws have been enumerated.

### Important distinction: model knowledge is not an exportable legal database

The language model cannot export a complete inventory of its hidden training documents or guarantee that its internal knowledge contains every current amendment. Generated statutory text may contain omissions, outdated provisions or citation errors. Model knowledge can help discover titles, topics and evaluation questions; official legal text must be acquired and verified independently.
- `research/LEGAL_CORPUS_DISCOVERY.md`: review of discovered qavanin tools and public Iranian legal datasets, including their limits and data-rights status.
- `data/legal/model_knowledge_seed.csv`: 32 title-level discovery records generated from model knowledge; all remain unverified and excluded from training.

Public legal datasets and third-party connectors are discovery aids only. A software license (for example, MIT on an MCP connector) does not license the law database content it reads. Secondary corpora must be audited record by record before reuse.