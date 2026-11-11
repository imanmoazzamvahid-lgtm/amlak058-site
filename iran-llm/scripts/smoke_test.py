import torch
from model import IranGPT

def main():
    torch.manual_seed(7)
    model = IranGPT(vocab_size=512, context=64, dim=128, layers=4, heads=4)
    params = sum(p.numel() for p in model.parameters())
    x = torch.randint(0, 512, (2, 64))
    y = torch.randint(0, 512, (2, 64))
    logits, loss = model(x, y)
    assert logits.shape == (2, 64, 512), logits.shape
    assert loss is not None and torch.isfinite(loss), loss
    loss.backward()
    assert all(p.grad is not None for p in model.parameters() if p.requires_grad)
    print({"status": "PASS", "parameters": params, "loss": float(loss.detach())})

if __name__ == "__main__":
    main()
