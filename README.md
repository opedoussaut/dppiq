# REGIQ

**Regulation Intelligence** — an open-source, mobile-first "Shazam for product regulation".

Point a phone or laptop camera at a physical product. REGIQ identifies it, maps potentially applicable regulatory regimes, and explains the result with traceable public sources. Digital Product Passports are one possible regulatory dimension, not the boundary of the product.

## What works today

- live camera capture on laptop and mobile;
- photo upload and basic barcode signal validation;
- pluggable open-weight visual identification through Hugging Face Inference Providers or Ollama;
- multi-regime EU regulatory mapping;
- product-specific Intelligence view based on the latest scan;
- model/provider/license provenance where available;
- local browser scan history;
- optional Bring Your Own Hugging Face token flow;
- Progressive Web App support for home-screen installation;
- one-container Docker deployment;
- Apache-2.0 licensing for REGIQ itself.

REGIQ is a prototype and does not provide legal advice. Regulatory applicability can depend on exact specifications, intended use, market, dates and Member State implementation.

## Fastest way to try it

### Codespaces / local development

Backend:

```bash
pip install -r backend/requirements.txt
export REGIQ_VISION_ENABLED=true
export REGIQ_VISION_PROVIDER=huggingface
export REGIQ_HF_MODEL=auto
export REGIQ_ALLOW_BYO_HF_TOKEN=true
# Optional: export HF_TOKEN=hf_... if the host pays for inference
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend, in another terminal:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

Open port 5173. A Codespaces forwarded HTTPS URL can also be opened from a phone, subject to the port visibility/authentication settings.

### One-command Docker deployment

```bash
git clone https://github.com/opedoussaut/regiq.git
cd regiq
docker compose up --build
```

Then open `http://localhost:8000`.

To use a server-owned Hugging Face token:

```bash
export HF_TOKEN=hf_your_token_here
docker compose up --build
```

Without a server token, users can enter their own token in **Setup** when `REGIQ_ALLOW_BYO_HF_TOKEN=true`.

## Mobile use

REGIQ is a Progressive Web App.

- **iPhone/iPad:** open the HTTPS deployment in Safari → Share → **Add to Home Screen**.
- **Android/Chrome:** open the HTTPS deployment → browser menu → **Install app** / **Add to Home screen**.
- The live camera requests the environment-facing camera where supported.
- The photo input uses `capture="environment"` as a mobile fallback.
- Recent scan metadata and regulatory results are stored locally in the browser.
- The Hugging Face token entered in Setup is kept only in page memory and is not persisted by the frontend.

A public deployment should use HTTPS for reliable camera and PWA behavior.

## Easy user setup

The REGIQ **Setup** screen shows:

- current vision provider and model configuration;
- whether the deployment has a server token;
- whether Bring Your Own Hugging Face token is enabled;
- a session-only token input when BYO is enabled;
- software/model provenance;
- mobile installation guidance.

The BYO token is sent as `X-REGIQ-HF-Token` only with a scan request. REGIQ does not intentionally write it to local storage or scan history.

## Architecture

```text
Camera / photo / identifier
          |
          v
 Product identification
          |
          v
 Regulatory classification
          |
    +-----+----------+----------+---------+
    |                |          |         |
    v                v          v         v
Packaging        Batteries    ESPR     Other regimes
    |                |          |         |
    +----------------+----------+---------+
                     v
            Regulatory evidence
                     |
                     v
          What applies / what next
```

Recognition is probabilistic and replaceable. REGIQ keeps it separate from regulatory reasoning.

## Model provenance

REGIQ itself is licensed under Apache-2.0. Model weights are separate works and retain their own licenses.

Successful Hugging Face scans return best-effort provenance including exact model identifier, provider, source URL, revision where available, and declared model-card license where available.

Useful endpoints:

```text
GET /api/health
GET /api/scan/config
GET /api/model/provenance
POST /api/scan/image
```

## Environment variables

See `.env.example`.

```bash
REGIQ_VISION_ENABLED=true
REGIQ_VISION_PROVIDER=huggingface
REGIQ_HF_MODEL=auto
REGIQ_ALLOW_BYO_HF_TOKEN=true
HF_TOKEN=
```

For Ollama:

```bash
REGIQ_VISION_PROVIDER=ollama
REGIQ_VISION_MODEL=qwen3-vl:2b
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

## Repository layout

- `backend/` — FastAPI, recognition gateway and regulatory intelligence
- `frontend/` — React/Vite mobile-first PWA
- `data/` — public/sample products and regulatory snapshots
- `docs/` — deployment and methodology
- `Dockerfile` — production frontend + backend image
- `compose.yaml` — one-command startup
- `.env.example` — safe configuration template
- `LICENSE` — Apache License 2.0

## Self-improving workflow

REGIQ treats regulation and agent performance as changing environments. Candidate improvements should detect and version regulatory changes, preserve source provenance, benchmark strategies against historical cases, reject regressions, and promote changes only when objective evaluation improves.

The goal is **auditable self-improvement**, not uncontrolled self-modifying code.

## Principles

- **Authoritative-source first** — legal conclusions remain traceable.
- **No false certainty** — uncertainty is explicit.
- **Model-neutral** — REGIQ is not tied to one provider.
- **Source-aware** — source, extraction, interpretation and conclusion remain separate.
- **Auditable** — scans expose evidence and provenance.
- **Public-first** — proprietary enterprise integrations are not required.
- **Benchmark-gated evolution** — self-improvement must be measurable and reviewable.

## Security

Never commit tokens. Use environment variables, platform secrets, or the optional session-only BYO flow. If a token is ever pasted publicly, revoke it and create a replacement.

## License

REGIQ software is licensed under the **Apache License 2.0**. See `LICENSE`.
