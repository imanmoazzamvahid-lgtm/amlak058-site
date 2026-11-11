#!/usr/bin/env python3
"""Calculate exact parameter count and a lower-bound optimizer-memory estimate."""
import argparse
import json

def count_parameters(vocab_size: int, context: int, dim: int, layers: int) -> int:
    # Tied token embedding/output head; learned position embedding; 2 LayerNorms per block.
    embeddings = vocab_size * dim + context * dim
    per_block = 12 * dim * dim + 13 * dim
    final_norm = 2 * dim
    return embeddings + layers * per_block + final_norm

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--vocab-size", type=int, default=16000)
    p.add_argument("--context", type=int, default=512)
    p.add_argument("--dim", type=int, default=768)
    p.add_argument("--layers", type=int, default=12)
    p.add_argument("--target-parameters", type=int, default=100_000_000)
    args = p.parse_args()
    if min(args.vocab_size, args.context, args.dim, args.layers) <= 0:
        raise SystemExit("All architecture dimensions must be positive.")
    params = count_parameters(args.vocab_size, args.context, args.dim, args.layers)
    report = {
        "architecture": "decoder_only_transformer",
        "initialization": "random",
        "vocab_size": args.vocab_size,
        "context": args.context,
        "dimension": args.dim,
        "layers": args.layers,
        "parameters_exact": params,
        "target_parameters": args.target_parameters,
        "target_deviation_percent": round((params - args.target_parameters) / args.target_parameters * 100, 3),
        "fp32_adamw_weights_grad_and_two_moments_lower_bound_bytes": params * 16,
        "fp32_adamw_lower_bound_gib": round(params * 16 / (1024 ** 3), 3),
        "warning": "Estimate excludes activations, attention workspace, CUDA context, temporary buffers, fragmentation and checkpoint copies. Benchmark the actual GPU before choosing batch size.",
    }
    print(json.dumps(report, indent=2))
if __name__ == "__main__":
    main()
