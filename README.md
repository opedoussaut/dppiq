# REGIQ

**Regulation Intelligence** — an open-source, self-evolving agentic platform that identifies physical products and explains the regulations, standards, product-passport obligations, evidence requirements and upcoming regulatory changes that apply to them.

REGIQ is a **"Shazam for product regulation"**. Point a phone or laptop camera at a physical product, identify it from visual evidence, visible text and validated identifiers, then independently map it to potentially applicable regulatory regimes and authoritative sources.

Digital Product Passports remain one REGIQ module, not the boundary of the product.

## Share-ready status

REGIQ is licensed under **Apache License 2.0** and is designed for both hosted demos and self-hosted use.

- Public repository: `opedoussaut/regiq`
- Software license: Apache-2.0
- Secrets are excluded through `.gitignore`
- Safe configuration template: `.env.example`
- Deployment guide: `docs/DEPLOYMENT.md`
- Pluggable vision providers: Hugging Face Inference Providers or Ollama
- Optional Bring Your Own Hugging Face token API flow
- Successful recognitions expose the exact model/provider used and best-effort model provenance

> The Apache-2.0 license covers REGIQ source code. Third-party model weights, datasets, libraries and regulatory source material retain their own licenses and terms.

## Quick start

```bash
git clone https://github.com/opedoussaut/regiq.git
cd regiq

python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

Configure remote vision with your own Hugging Face token:

```bash
export REGIQ_VISION_ENABLED=true
export REGIQ_VISION_PROVIDER=huggingface
export REGIQ_HF_MODEL=auto
export HF_TOKEN='hf_your_token_here'
export REGIQ_ALLOW_BYO_HF_TOKEN=true
```

Start the backend:

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Start the frontend in another terminal:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

See `docs/DEPLOYMENT.md` for public hosting, Codespaces, local Ollama and security guidance.

## Bring your own Hugging Face token

REGIQ can accept a Hugging Face token for one scan without storing it server-side. Enable the feature on the backend:

```bash
export REGIQ_ALLOW_BYO_HF_TOKEN=true
```

Then an API client can call:

```bash
curl -X POST http://127.0.0.1:8000/api/scan/image \
  -H 'X-REGIQ-HF-Token: hf_your_token_here' \
  -F 'file=@product.jpg'
```

The request token overrides the server `HF_TOKEN` only for that request. REGIQ does not return the token, write it to disk or include it in model provenance.

Only send a BYO token to a backend you trust. For maximum privacy, self-host REGIQ.

## Model provenance

REGIQ keeps the software, model and regulatory-source layers separate.

`GET /api/model/provenance` reports:

- REGIQ software version and Apache-2.0 license;
- configured vision provider;
- configured or automatic model selection;
- whether BYO token support is enabled.

Each successful Hugging Face recognition also reports best-effort runtime provenance for the exact model selected, including:

- provider;
- model repository/model ID;
- source URL;
- model revision when available;
- model-card license when available;
- inference pipeline tag.

If a deployment pins a model and its licensing has been independently verified, provenance can be explicitly declared with:

```bash
export REGIQ_MODEL_LICENSE=apache-2.0
export REGIQ_MODEL_SOURCE_URL='https://huggingface.co/<org>/<model>'
```

Do not assume that a model is Apache-2.0 merely because REGIQ is Apache-2.0.

## Core architecture

```text
Camera / photo / identifier
          |
          v
 Product identification
          |
          v
 Regulatory classification
          |
    +-----+----------------------+------------------+
    |                            |                  |
    v                            v                  v
Packaging                   Batteries          ESPR / DPP
    |                            |                  |
    +-------------+--------------+------------------+
                  v
         Regulatory evidence
                  |
                  v
      Product intelligence dossier
                  |
                  v
          Evaluator / evolution
```

REGIQ deliberately separates probabilistic product recognition from regulatory interpretation.

## Self-improving workflow

REGIQ treats regulation and agent performance as changing environments. Candidate improvements should:

1. detect and version authoritative regulatory changes;
2. translate them into machine-readable candidate requirements;
3. map product categories to potentially applicable regimes;
4. preserve source provenance and uncertainty;
5. benchmark candidate strategies against historical cases;
6. reject regressions and false-compliance increases;
7. promote new strategies only when objective evaluation improves.

The goal is **auditable self-improvement**, not uncontrolled self-modifying code.

## Repository layout

- `backend/` — FastAPI API, recognition gateway and regulatory intelligence
- `frontend/` — React/Vite scan and intelligence experience
- `data/` — public/sample products, passports and regulation snapshots
- `docs/` — deployment, architecture and methodology
- `agents/` — versioned agent specifications when present
- `benchmarks/` — deterministic evaluation cases when present
- `evolution/` — promoted/rejected generations and rationale when present

## Security and secret hygiene

Never commit credentials. `.gitignore` excludes `.env`, `.env.*`, private keys, local virtual environments, Node modules and build outputs. `.env.example` contains placeholders only.

For GitHub Codespaces, prefer Codespaces secrets or shell environment variables. For production, use the deployment platform's secret manager.

## Principles

- **Authoritative-source first** — legal conclusions must be traceable to public regulatory sources.
- **Source-aware** — source, extraction, interpretation and inferred conclusions remain separate layers.
- **Auditable** — every assessment carries evidence and provenance.
- **Model-neutral** — model providers can be replaced without changing the regulatory domain model.
- **Benchmark-gated evolution** — no strategy is promoted merely because an LLM claims it is better.
- **Human-readable** — the UI explains why REGIQ reached a conclusion.
- **No false certainty** — unidentified products and uncertain applicability remain explicitly uncertain.

## Status

Early prototype. Camera capture, remote visual identification, multi-regime regulatory mapping and scan-driven product intelligence work end-to-end. The regulatory knowledge base remains intentionally limited and must continue to expand and be validated against authoritative sources.

## License

Licensed under the **Apache License, Version 2.0**. See `LICENSE`.