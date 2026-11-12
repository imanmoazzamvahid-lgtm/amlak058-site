import argparse
import json
import random
from pathlib import Path

import numpy as np
import sentencepiece as spm
import torch
from tqdm import trange

from model import IranGPT


def sample_batch(data: np.memmap, batch_size: int, context: int, device: torch.device):
    starts = np.random.randint(0, len(data) - context - 1, size=batch_size)
    x = np.stack([data[s:s + context] for s in starts]).astype(np.int64, copy=False)
    y = np.stack([data[s + 1:s + context + 1] for s in starts]).astype(np.int64, copy=False)
    return torch.from_numpy(x).to(device), torch.from_numpy(y).to(device)


@torch.no_grad()
def estimate_loss(model, data, batch_size, context, device, batches=20):
    model.eval()
    values = []
    for _ in range(batches):
        x, y = sample_batch(data, batch_size, context, device)
        _, loss = model(x, y)
        values.append(float(loss.item()))
    model.train()
    return float(np.mean(values))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--train-bin", required=True)
    p.add_argument("--validation-bin", required=True)
    p.add_argument("--tokenizer", required=True)
    p.add_argument("--steps", type=int, default=1000)
    p.add_argument("--batch-size", type=int, default=4)
    p.add_argument("--context", type=int, default=512)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--out", default="checkpoints/iran-llm.pt")
    p.add_argument("--dim", type=int, default=768)
    p.add_argument("--layers", type=int, default=12)
    p.add_argument("--heads", type=int, default=12)
    p.add_argument("--eval-every", type=int, default=100)
    p.add_argument("--eval-batches", type=int, default=20)
    p.add_argument("--log-file", default="checkpoints/training_log.jsonl")
    args = p.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    train_path, val_path = Path(args.train_bin), Path(args.validation_bin)
    for path in (train_path, val_path):
        if not path.is_file() or path.stat().st_size % np.dtype(np.uint32).itemsize:
            raise SystemExit(f"Missing or invalid uint32 token file: {path}")
    train_data = np.memmap(train_path, dtype=np.uint32, mode="r")
    val_data = np.memmap(val_path, dtype=np.uint32, mode="r")
    if len(train_data) <= args.context + 1 or len(val_data) <= args.context + 1:
        raise SystemExit("Train and validation token files must each exceed context length + 1.")

    sp = spm.SentencePieceProcessor(model_file=args.tokenizer)
    model = IranGPT(
        vocab_size=sp.get_piece_size(),
        context=args.context,
        dim=args.dim,
        layers=args.layers,
        heads=args.heads,
    ).to(device)
    parameter_count = sum(param.numel() for param in model.parameters())
    print(json.dumps({
        "event": "training_started",
        "parameters": parameter_count,
        "device": str(device),
        "train_tokens": len(train_data),
        "validation_tokens": len(val_data),
        "seed": args.seed,
    }))

    optimizer = torch.optim.AdamW(
        model.parameters(), lr=args.lr, betas=(0.9, 0.95), weight_decay=0.1
    )
    log_path = Path(args.log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    model.train()
    with log_path.open("a", encoding="utf-8") as log:
        for step in trange(args.steps):
            x, y = sample_batch(train_data, args.batch_size, args.context, device)
            optimizer.zero_grad(set_to_none=True)
            _, loss = model(x, y)
            if not torch.isfinite(loss):
                raise RuntimeError(f"Non-finite training loss at step {step}")
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            if step % args.eval_every == 0 or step == args.steps - 1:
                train_loss = estimate_loss(
                    model, train_data, args.batch_size, args.context,
                    device, args.eval_batches
                )
                val_loss = estimate_loss(
                    model, val_data, args.batch_size, args.context,
                    device, args.eval_batches
                )
                record = {
                    "step": step + 1,
                    "train_loss": train_loss,
                    "validation_loss": val_loss,
                    "parameters": parameter_count,
                    "device": str(device),
                }
                line = json.dumps(record)
                print(line)
                log.write(line + "\n")
                log.flush()

                torch.save({
                    "model": model.state_dict(),
                    "optimizer": optimizer.state_dict(),
                    "config": vars(args),
                    "parameter_count": parameter_count,
                    "step": step + 1,
                    "tokenizer_model": str(args.tokenizer),
                }, out_path)

    print(f"Training run finished. Checkpoint: {out_path}")

if __name__ == "__main__":
    main()
