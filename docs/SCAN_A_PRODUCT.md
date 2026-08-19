# Scan a Product — DPPIQ's Shazam-for-DPP experience

DPPIQ's primary public experience is mobile-first: point a phone at a physical product, identify it, then independently determine the product's Digital Product Passport (DPP) regulatory status and discover verified public passport data when available.

## Pipeline

1. **Capture** — phone camera or uploaded image.
2. **Decode identifiers** — browser-side barcode / QR decoding using ZXing.
3. **Visual identification** — optional open-weight multimodal model through Ollama. DPPIQ defaults to `qwen3-vl:2b` when enabled.
4. **Product classification** — the vision layer returns a product type/category, brand/model only when visible, and a confidence score.
5. **Regulatory assessment** — a separate deterministic regulatory layer maps the category against versioned EU regulatory references. The vision model never decides whether a legal obligation applies.
6. **Public DPP discovery** — future stage: search verified public DPP resolvers, manufacturer endpoints and public registries. DPPIQ must never invent a passport URL.

## Enabling open-weight vision

The camera/photo flow works without a model, but DPPIQ will explicitly say that visual identification is not configured. To enable Ollama vision:

```bash
ollama pull qwen3-vl:2b
export DPPIQ_VISION_ENABLED=true
export DPPIQ_VISION_MODEL=qwen3-vl:2b
export OLLAMA_BASE_URL=http://127.0.0.1:11434
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

For a remote Ollama-compatible server, point `OLLAMA_BASE_URL` to that server instead.

## Trust boundary

DPPIQ deliberately separates these statements:

- **Product identification:** probabilistic, model-generated, confidence-scored.
- **Barcode/QR identification:** identifier evidence extracted directly from the product.
- **Regulatory status:** source-backed rule evaluation.
- **Public DPP found:** only when a real, verified passport endpoint has been resolved.
- **DPPIQ intelligence:** analysis or recommendations added by DPPIQ and clearly labelled as such.

A model's confidence must never be promoted into a legal conclusion.
