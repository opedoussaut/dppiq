# REGIQ

**Regulation Intelligence** — an open-source, mobile-first "Shazam for product regulation".

Point a phone or laptop camera at a physical product. REGIQ identifies the product, investigates a versioned verified EU regulatory corpus, asks an independent verifier to challenge the findings, and exposes evidence confidence and official sources. Digital Product Passports are one possible regulatory dimension, not the boundary of the product.

> **Current public architecture:** Cloudflare Workers + Workers AI + React PWA  
> **Current release line:** `1.2.0-cloudflare-beta`

REGIQ is a regulatory-intelligence prototype, not legal advice or an automated compliance determination. Exact applicability can depend on product specifications, intended use, market, dates, exemptions and Member State implementation.

## Why Cloudflare-native

The public demo is designed to cost the project owner **€0 while it stays within Cloudflare's free allocations**. There is no always-on VM, no Codespace dependency and no public Hugging Face token.

```text
Android / iPhone / desktop
           |
           v
   Cloudflare HTTPS edge
           |
   +-------+--------+
   |                |
React PWA       Worker /api
static assets       |
   |            Workers AI
   |          vision + agents
   |                |
   +------ verified EU corpus
```

Cloudflare serves the React build and Worker API from the same origin. `/api/*` runs through `cloudflare/worker.js`; all other requests are served from `frontend/dist` with SPA fallback.

The public app uses Workers AI's daily free allocation. When that allocation is exhausted, REGIQ returns an explicit capacity message rather than silently switching to paid inference. No billing secret is stored in the browser.

## Public inference pipeline

1. **Vision** — `@cf/google/gemma-4-26b-a4b-it` identifies the physical product from the submitted image.
2. **Investigator** — `@cf/zai-org/glm-4.7-flash` screens the product against the complete verified catalog in `data/regulatory_catalog.json`.
3. **Verifier** — a second model call challenges every proposed finding against the same corpus.
4. **REGIQ confidence** — deterministic evidence-weighted confidence is computed from identity quality, official-source authority, applicability specificity, missing evidence and verifier agreement.
5. **Intelligence** — the UI exposes applicable/likely/conditional/upcoming findings, evidence gaps, official URLs and re-assessment.

The public Worker does **not** use predefined product-family mappings as its primary reasoning path. `product_families` remain in the catalog for regression testing and the FastAPI fallback implementation.

## Public-beta regulatory corpus

The current verified catalog includes official EUR-Lex references for PPWR, Single-Use Plastics, food-contact materials, ESPR, Batteries Regulation, RoHS, WEEE, RED, Common Charger, smartphone ecodesign, lighting rules, textile labelling, REACH, GPSR, machinery legislation and toy-safety legislation.

`data/regulatory_catalog.json` is versioned independently from application code and exposes its verification date.

## Deploy the free public app

### Prerequisites

- free Cloudflare account;
- Node.js 20+;
- this repository cloned locally or opened in Codespaces only for development/deployment.

### First deployment

```bash
git clone https://github.com/opedoussaut/regiq.git
cd regiq
npm install
npx wrangler login
npm run deploy
```

Wrangler builds the React frontend and deploys the Worker + assets as one application. The resulting URL is typically:

```text
https://regiq.<your-workers-subdomain>.workers.dev
```

No `HF_TOKEN`, Render account, Docker host, Uvicorn process or Vite dev server is required for the public Cloudflare runtime.

### Local Cloudflare-runtime preview

```bash
npm install
npm run cf:dev
```

This builds the frontend and starts Wrangler locally so `/api/*` behaves like the public Worker.

### Release checks

```bash
npm run test:mobile
npm run test:ui
npm run deploy:dry-run
```

The Playwright release suite checks desktop Chrome, a Pixel-sized Android viewport and a 360 px narrow-phone viewport for visual completeness, navigation and overflow.

## Mobile use

REGIQ is a Progressive Web App.

- **Android/Chrome:** open the HTTPS deployment → browser menu → **Install app** / **Add to Home screen**.
- **iPhone/iPad:** open in Safari → Share → **Add to Home Screen**.
- Live camera requests the environment-facing camera where supported.
- Photo upload supports normal browser images plus HEIC/HEIF preprocessing in the frontend.
- Recent assessments are stored locally in the browser.

The Cloudflare deployment is HTTPS by default, which is required for reliable camera/PWA behavior.

## Self-hosted / development FastAPI runtime

The original Python implementation remains available for contributors who want local Hugging Face or Ollama inference, Docker deployment, or backend experimentation.

Backend:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

export REGIQ_VISION_ENABLED=true
export REGIQ_VISION_PROVIDER=huggingface
export REGIQ_HF_MODEL=auto
export REGIQ_AGENTIC_REGULATION_ENABLED=true
export REGIQ_ALLOW_BYO_HF_TOKEN=true
export HF_TOKEN=hf_...

uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

For Ollama, see `.env.example`.

## Repository layout

- `cloudflare/worker.js` — public serverless API and Workers AI orchestration
- `wrangler.jsonc` — Cloudflare Worker, AI binding and static-asset routing
- `package.json` — root build/test/deploy commands
- `frontend/` — React/Vite responsive PWA
- `backend/` — FastAPI self-host/development implementation
- `data/regulatory_catalog.json` — versioned verified regulatory corpus
- `docs/` — architecture, deployment, public-beta and methodology notes
- `Dockerfile` / `compose.yaml` — optional self-hosted Docker path
- `.env.example` — safe FastAPI/local configuration template
- `LICENSE` — Apache License 2.0

## Public Worker endpoints

```text
GET  /api/health
GET  /api/scan/config
GET  /api/model/provenance
GET  /api/regulation/catalog
POST /api/scan/image
POST /api/scan/reassess
```

## Principles

- **Authoritative-source first** — regulatory findings stay traceable to the verified corpus.
- **No false certainty** — missing evidence creates questions/conditional findings rather than guesses.
- **Independent verification** — the verifier can reject unsupported investigator findings.
- **Deterministic confidence** — the model does not self-award a confidence score.
- **Open-source first** — Apache-2.0 software; third-party models and legal sources retain their own terms.
- **Free public demo by design** — no mandatory user account or token; capacity is bounded by free cloud allocations.
- **Self-hostable** — FastAPI/Docker remains available independently of Cloudflare.

## Security and privacy

Never commit API tokens. The Cloudflare public runtime uses a Workers AI binding and does not expose a model credential to the browser. Uploaded images are sent to the Worker for inference; REGIQ does not intentionally persist them in application storage. Browser history stores assessment metadata/results locally.

## License

REGIQ software is licensed under the **Apache License 2.0**. Third-party model weights, datasets, libraries and regulatory source materials retain their own terms. See `LICENSE`.
