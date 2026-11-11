import argparse
from pathlib import Path
import numpy as np
import sentencepiece as spm

def encode_file(source: Path, model_file: str, destination: Path, batch_lines: int = 1000):
    processor = spm.SentencePieceProcessor(model_file=model_file)
    count = 0
    with source.open("r", encoding="utf-8") as f:
        for line in f:
            count += len(processor.encode(line))
    destination.parent.mkdir(parents=True, exist_ok=True)
    arr = np.memmap(destination, dtype=np.uint32, mode="w+", shape=(count,))
    offset, buffer = 0, []
    with source.open("r", encoding="utf-8") as f:
        for line in f:
            buffer.extend(processor.encode(line))
            if len(buffer) >= batch_lines * 512:
                arr[offset:offset+len(buffer)] = np.asarray(buffer, dtype=np.uint32)
                offset += len(buffer)
                buffer.clear()
    if buffer:
        arr[offset:offset+len(buffer)] = np.asarray(buffer, dtype=np.uint32)
        offset += len(buffer)
    arr.flush()
    if offset != count:
        raise RuntimeError(f"Token count changed between passes: {count} vs {offset}")
    print(f"{destination}: {count:,} tokens ({destination.stat().st_size:,} bytes)")

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--tokenizer", required=True)
    p.add_argument("--train-text", required=True)
    p.add_argument("--validation-text", required=True)
    p.add_argument("--out-dir", default="data/encoded")
    args = p.parse_args()
    out = Path(args.out_dir)
    encode_file(Path(args.train_text), args.tokenizer, out / "train.bin")
    encode_file(Path(args.validation_text), args.tokenizer, out / "validation.bin")

if __name__ == "__main__":
    main()
