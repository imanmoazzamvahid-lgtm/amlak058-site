import argparse
from pathlib import Path
import sentencepiece as spm

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--model-prefix", default="artifacts/iran_spm")
    p.add_argument("--vocab-size", type=int, default=16000)
    args = p.parse_args()
    source = Path(args.input)
    if not source.exists():
        raise SystemExit(f"Corpus not found: {source}")
    Path(args.model_prefix).parent.mkdir(parents=True, exist_ok=True)
    spm.SentencePieceTrainer.train(
        input=str(source),
        model_prefix=args.model_prefix,
        vocab_size=args.vocab_size,
        model_type="bpe",
        character_coverage=0.9995,
        normalization_rule_name="nmt_nfkc",
        pad_id=0, unk_id=1, bos_id=2, eos_id=3,
        user_defined_symbols=["\u200c"],
        input_sentence_size=0,
        shuffle_input_sentence=True,
    )
    print(f"Tokenizer saved: {args.model_prefix}.model")

if __name__ == "__main__":
    main()
