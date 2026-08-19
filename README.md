# REGIQ

**Regulation Intelligence** — an open-source, mobile-first "Shazam for product regulation".

Point a phone or laptop camera at a physical product. REGIQ identifies it, normalizes it to a regulatory product family, maps potentially applicable EU regulatory regimes, and explains the result with traceable public sources. Digital Product Passports are one possible regulatory dimension, not the boundary of the product.

> **Current release:** `1.0.0-beta.1`

REGIQ is a regulatory-intelligence prototype, not legal advice or an automated compliance determination. Applicability can depend on exact specifications, intended use, market, dates, exemptions and Member State implementation.

## Public-beta coverage

REGIQ currently has curated EU regulatory families for:

- plastic beverage bottles;
- smartphones;
- laptops;
- wireless headphones / earbuds;
- power banks;
- household batteries;
- LED lamps / bulbs;
- power tools / drills;
- textile garments;
- electronic toys;
- EV batteries, LMT batteries and industrial batteries above 2 kWh.

Products outside these curated families deliberately fall back to **screening required** rather than claiming regulatory completeness.

The regulatory catalog is stored in `data/regulatory_catalog.json`, versioned independently from application code, and exposes official EUR-Lex source links and a verification date.

## What works today

- live camera capture on laptop and mobile;
- photo upload and basic barcode signal validation;
- pluggable open-weight visual identification through Hugging Face Inference Providers or Ollama;
- product-family normalization between vision and regulatory reasoning;
- multi-regime EU regulatory mapping with current / likely / conditional / upcoming / context distinctions;
- product-specific Intelligence view based on the latest scan;
- model/provider/license provenance where available;
- regulatory-catalog version and source provenance;
- local browser scan history;
- optional Bring Your Own Hugging Face token flow;
- Progressive Web App support for home-screen installation;
- premium responsive mobile-first UI;
- one-container Docker deployment;
- Render deployment blueprint;
- automated backend/frontend CI;
- Apache-2.0 licensing for REGIQ itself.

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

### Public HTTPS deployment

The repository includes `render.yaml` for a Docker-based Render deployment. Connect the repository, create a Blueprint, set `HF_TOKEN` as a platform secret, and deploy. See `docs/PUBLIC_BETA.md` and `docs/DEPLOYMENT.md`.

For a frictionless public demo, use a server-side token and keep:

```bash
REGIQ_ALLOW_BYO_HF_TOKEN=false
```

That lets visitors scan immediately without supplying credentials.

## Mobile use

REGIQ is a Progressive Web App.

- **iPhone/iPad:** open the HTTPS deployment in Safari → Share → **Add to Home Screen**.
- **Android/Chrome:** open the HTTPS deployment → browser menu → **Install app** / **Add to Home screen**.
- The live camera requests the environment-facing camera where supported.
- The photo input uses `capture="environment"` as a mobile fallback.
- Recent scan metadata and regulatory results are stored locally in the browser.
- A Hugging Face token entered in Setup is kept only in page memory and is not intentionally persisted by the frontend.

A public deployment should use HTTPS for reliable camera and PWA behavior.

## Architecture

```text
Camera / photo / identifier
          |
          v
 Product identification
          |
          v
 Product-family normalization
          |
          v
 Versioned regulatory catalog
          |
    +-----+----------+----------+---------+
    |                |          |         |
    v                v          v         v
Packaging        Batteries    ESPR     Sector rules
    |                |          |         |
    +----------------+----------+---------+
                     v
      Applicability + uncertainty layer
                     |
                     v
         Product intelligence dossier
```

Recognition is probabilistic and replaceable. REGIQ keeps visual identification, category normalization, regulatory sources and regulatory interpretation as separate layers.

## Regulatory-source policy

The beta catalog prioritizes official EUR-Lex legal acts. Examples include PPWR Regulation (EU) 2025/40, Batteries Regulation (EU) 2023/1542, smartphone ecodesign Regulation (EU) 2023/1670, RoHS, WEEE, RED, the Common Charger Directive, REACH, GPSR, machinery legislation and toy-safety legislation.

`GET /api/regulation/catalog` exposes the current machine-readable catalog.

## Useful endpoints

```text
GET  /api/health
GET  /api/scan/config
GET  /api/model/provenance
GET  /api/regulation/catalog
GET  /api/regulation/reference
GET  /api/regulation/change
GET  /api/evolution
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

- `backend/` — FastAPI, product-family normalization, recognition gateway and regulatory intelligence
- `frontend/` — React/Vite mobile-first PWA
- `data/regulatory_catalog.json` — versioned authoritative-source regulatory catalog
- `data/` — additional regulatory snapshots and benchmark data
- `docs/` — deployment, public-beta and methodology guides
- `Dockerfile` — production frontend + backend image
- `compose.yaml` — one-command startup
- `render.yaml` — public-hosting blueprint
- `.env.example` — safe configuration template
- `LICENSE` — Apache License 2.0

## Self-improving workflow

REGIQ treats regulation and agent performance as changing environments. Candidate improvements should detect and version authoritative regulatory changes, translate them into candidate machine-readable rules, benchmark mappings against known products, reject regressions and false-compliance increases, and promote changes only when objective evaluation improves.

The goal is **auditable self-improvement**, not uncontrolled self-modifying code.

## Principles

- **Authoritative-source first** — legal conclusions remain traceable.
- **No false certainty** — uncertainty and incomplete coverage are explicit.
- **Model-neutral** — REGIQ is not tied to one inference provider.
- **Source-aware** — source, extraction, interpretation and conclusion remain separate.
- **Auditable** — scans expose evidence and provenance.
- **Public-first** — proprietary enterprise integrations are not required.
- **Benchmark-gated evolution** — self-improvement must be measurable and reviewable.

## Security

Never commit tokens. Use environment variables, platform secrets, or the optional session-only BYO flow. If a token is ever pasted publicly, revoke it and create a replacement.

## License

REGIQ software is licensed under the **Apache License 2.0**. Third-party model weights, datasets, libraries and regulatory source materials retain their own terms. See `LICENSE`.
