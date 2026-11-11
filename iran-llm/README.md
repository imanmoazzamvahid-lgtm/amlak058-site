# IRAN-LLM 100M — From-Scratch Persian Language Model

This is an experimental foundation-model project. The model weights are initialized randomly. No pretrained model weights or hosted LLM APIs are used.

## Scope of the first milestone
- Train a Persian-capable tokenizer from an owned/licensed text corpus.
- Train a decoder-only Transformer with causal next-token prediction.
- Save checkpoints and training metadata locally.
- Evaluate on a held-out corpus before any legal-domain fine-tuning.

## Important limits
A 100M-parameter model is a research prototype, not a ChatGPT replacement. It may produce poor or incorrect answers. Do not use it for legal advice or client matters. Legal specialization comes only after base-language training, evaluation, source curation, and safety testing.

## Data requirements
Prepare UTF-8 plain-text files under `data/raw/`. Use only public-domain, permissioned, or properly licensed material. Keep source URL/title, license, retrieval date, and hash in a dataset manifest. Exclude private client files, personal data, copyrighted books without permission, and unverified legal text. Deduplicate before training and reserve a held-out test split.

## Environment
Python 3.11+, PyTorch 2.x, SentencePiece, NumPy.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
mkdir -p data/raw data/processed artifacts checkpoints
```

## Train tokenizer
```bash
python scripts/train_tokenizer.py --input data/processed/corpus.txt --model-prefix artifacts/iran_spm --vocab-size 16000
```

## Train model from random initialization
```bash
python train.py --text data/processed/corpus.txt --tokenizer artifacts/iran_spm.model --steps 1000
```

The initial config is intentionally small for smoke tests. Increase dimensions only after measuring GPU memory, throughput, loss curves, and data quality. A 100M model requires substantially more data and compute than a smoke test.

## Reproducibility
Set and record the random seed, corpus manifest, tokenizer model hash, code commit, hardware, precision, batch size, sequence length, optimizer, and checkpoint step. Never claim a model is trained until a completed run and evaluation artifacts exist.

## Roadmap
1. Corpus inventory and licensing.
2. Tokenizer training and coverage tests for Persian, Arabic, Latin, digits, ZWNJ, and punctuation.
3. Small random-init training smoke test.
4. Scale toward 100M parameters after benchmark.
5. Held-out perplexity and human evaluation.
6. Only then consider supervised instruction tuning and legal retrieval.
