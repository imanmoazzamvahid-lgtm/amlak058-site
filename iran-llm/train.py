import argparse, json, random
from pathlib import Path
import numpy as np
import sentencepiece as spm
import torch
from tqdm import trange
from model import IranGPT

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--text", required=True)
    p.add_argument("--tokenizer", required=True)
    p.add_argument("--steps", type=int, default=1000)
    p.add_argument("--batch-size", type=int, default=8)
    p.add_argument("--context", type=int, default=512)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--out", default="checkpoints/iran-llm.pt")
    p.add_argument("--dim", type=int, default=768)
    p.add_argument("--layers", type=int, default=12)
    p.add_argument("--heads", type=int, default=12)
    args = p.parse_args()

    random.seed(args.seed); np.random.seed(args.seed); torch.manual_seed(args.seed)
    if torch.cuda.is_available(): torch.cuda.manual_seed_all(args.seed)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    sp = spm.SentencePieceProcessor(model_file=args.tokenizer)
    text = Path(args.text).read_text(encoding="utf-8")
    ids = torch.tensor(sp.encode(text), dtype=torch.long)
    if len(ids) <= args.context + 1:
        raise SystemExit("Corpus is too small for the selected context length.")
    data = ids.to(device)

    model = IranGPT(sp.get_piece_size(), args.context, args.dim, args.layers, args.heads).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, betas=(0.9, 0.95), weight_decay=0.1)
    model.train()
    for step in trange(args.steps):
        starts = torch.randint(0, len(data) - args.context - 1, (args.batch_size,), device=device)
        x = torch.stack([data[s:s+args.context] for s in starts])
        y = torch.stack([data[s+1:s+args.context+1] for s in starts])
        optimizer.zero_grad(set_to_none=True)
        _, loss = model(x, y)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        if step % 100 == 0:
            print(json.dumps({"step": step, "loss": round(loss.item(), 4), "device": device}))
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    torch.save({"model": model.state_dict(), "config": vars(args), "tokenizer": args.tokenizer}, args.out)
    print(f"Checkpoint saved to {args.out}")

if __name__ == "__main__":
    main()
