# REGIQ deployment

REGIQ supports two deployment modes:

1. **Public free-tier deployment:** Cloudflare Workers + Workers AI + Worker Static Assets.
2. **Self-hosted development/runtime:** FastAPI + React, optionally Docker, Hugging Face or Ollama.

The public project direction is Cloudflare-native.

## Public Cloudflare deployment

### Architecture

```text
Browser / PWA
    |
    v
Cloudflare Worker
    |-- /api/* --------> cloudflare/worker.js
    |                       |
    |                       +--> Workers AI vision
    |                       +--> Workers AI investigator
    |                       +--> Workers AI verifier
    |                       +--> bundled regulatory_catalog.json
    |
    +-- everything else -> frontend/dist static assets
```

The Worker and frontend share one HTTPS origin. There is no CORS/proxy configuration in production and no always-on server process.

### Free-tier behavior

REGIQ is designed to stay free to the project owner while usage remains within the Cloudflare Workers/Workers AI free allocations. REGIQ does not configure automatic paid fallback. If the Workers AI daily free capacity is exhausted, API calls return an explicit capacity error and the UI remains available.

Cloudflare periodically changes model availability and quotas. Before a public release, verify the current Workers AI model catalog and free-plan limits.

### One-time setup

```bash
npm install
npx wrangler login
```

`npm install` at repository root also installs the frontend dependencies.

### Validate before deployment

```bash
npm run test:mobile
npm run test:ui
npm run deploy:dry-run
```

### Deploy

```bash
npm run deploy
```

This performs a Vite production build and then `wrangler deploy`. The public application is served from a `*.workers.dev` URL unless a custom domain is configured.

### Local Cloudflare preview

```bash
npm run cf:dev
```

This builds the frontend and starts Wrangler locally with the Workers AI binding available according to Wrangler's development mode.

## Continuous deployment

The repository CI validates:

- Cloudflare build and Wrangler dry-run;
- full Playwright desktop/mobile release smoke tests;
- FastAPI self-host regression tests.

For automatic public deployment, connect the repository to Cloudflare Workers Builds or use a GitHub Actions deployment with Cloudflare credentials stored as repository secrets. The repository intentionally does not commit Cloudflare account credentials.

## Public API

Cloudflare public runtime:

```text
GET  /api/health
GET  /api/scan/config
GET  /api/model/provenance
GET  /api/regulation/catalog
POST /api/scan/image
POST /api/scan/reassess
```

The Python self-host runtime exposes additional development endpoints.

## Self-hosted FastAPI mode

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

export REGIQ_VISION_ENABLED=true
export REGIQ_VISION_PROVIDER=huggingface
export REGIQ_HF_MODEL=auto
export REGIQ_AGENTIC_REGULATION_ENABLED=true
export REGIQ_REGULATION_MODEL=auto
export REGIQ_VERIFIER_MODEL=auto
export REGIQ_ALLOW_BYO_HF_TOKEN=true
export HF_TOKEN=hf_...

uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

## Docker self-host

```bash
docker compose up --build
```

Docker remains a convenience for contributors and private/self-hosted deployments; it is not the public hosting strategy.

## Security

- Never commit model/API tokens.
- The Cloudflare public Worker uses the `AI` binding; visitors do not receive a model token.
- The public Worker does not intentionally persist uploaded images.
- Regulatory results/history are stored locally in the browser unless a future persistence layer is explicitly added.
- Keep legal source provenance in `data/regulatory_catalog.json` reviewable and version-controlled.
