# REGIQ deployment guide

REGIQ supports three practical sharing modes:

1. **Hosted demo** — one public HTTPS URL; the host pays for inference.
2. **Hosted BYO** — one public HTTPS URL; users enter their own Hugging Face token in Setup.
3. **Self-hosted/private** — users run REGIQ themselves with Hugging Face or Ollama.

No secret belongs in frontend source code or Git history.

## 1. Easiest production deployment: Docker

REGIQ builds the React frontend and FastAPI backend into one image. FastAPI serves the built frontend and all `/api` endpoints from the same origin.

```bash
git clone https://github.com/opedoussaut/regiq.git
cd regiq
docker compose up --build
```

Open `http://localhost:8000`.

To provide a host-owned Hugging Face token:

```bash
export HF_TOKEN=hf_your_token_here
docker compose up --build
```

`compose.yaml` enables BYO token support by default, so a deployment can also run without a host token and let trusted users enter their own token in the REGIQ Setup screen.

## 2. GitHub Codespaces development

Backend:

```bash
pip install -r backend/requirements.txt
export REGIQ_VISION_ENABLED=true
export REGIQ_VISION_PROVIDER=huggingface
export REGIQ_HF_MODEL=auto
export REGIQ_ALLOW_BYO_HF_TOKEN=true
# Optional host credential:
# export HF_TOKEN=hf_your_token_here
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend, second terminal:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

Open the forwarded HTTPS URL for port 5173. The same URL can be opened on a phone if the Codespace port visibility and GitHub authentication settings allow it.

## 3. Mobile and PWA deployment

For normal mobile use, deploy REGIQ behind HTTPS. Camera APIs and PWA installation work most reliably in a secure context.

### iPhone / iPad

1. Open the REGIQ HTTPS URL in Safari.
2. Tap **Share**.
3. Choose **Add to Home Screen**.
4. Launch REGIQ from the new home-screen icon.

### Android / Chrome

1. Open the REGIQ HTTPS URL in Chrome.
2. Use **Install app** or **Add to Home screen** from the browser menu, or use REGIQ's Setup install button when the browser exposes it.
3. Launch REGIQ like a normal app.

The live scan requests the environment-facing camera where supported. The upload fallback uses `capture="environment"` to offer direct camera capture on mobile browsers.

The PWA service worker caches only same-origin GET resources and does not cache `/api` calls.

## 4. Bring Your Own Hugging Face token

Enable the backend feature:

```bash
export REGIQ_ALLOW_BYO_HF_TOKEN=true
```

The REGIQ Setup screen then shows a password-style token input. The frontend keeps this value only in React memory; it is not written to localStorage or scan history.

For direct API clients:

```bash
curl -X POST https://your-regiq.example/api/scan/image \
  -H 'X-REGIQ-HF-Token: hf_your_token_here' \
  -F 'file=@product.jpg'
```

The token applies to that scan request only and overrides the server `HF_TOKEN` only when BYO support is enabled.

Only send a BYO token to a backend you trust. A backend operator controls the server process and network stack. For maximum privacy, self-host REGIQ.

## 5. Hosted public demo

For a frictionless public demo:

```bash
REGIQ_VISION_ENABLED=true
REGIQ_VISION_PROVIDER=huggingface
REGIQ_HF_MODEL=auto
HF_TOKEN=...
REGIQ_ALLOW_BYO_HF_TOKEN=false
```

Visitors do not need credentials. The host is responsible for provider cost, quotas and abuse controls.

For a community/self-funded deployment, omit `HF_TOKEN` and enable BYO.

## 6. Local/private inference with Ollama

```bash
export REGIQ_VISION_ENABLED=true
export REGIQ_VISION_PROVIDER=ollama
export REGIQ_VISION_MODEL=qwen3-vl:2b
export OLLAMA_BASE_URL=http://127.0.0.1:11434
```

Run Ollama separately. Local multimodal inference requires sufficient RAM/GPU resources.

## 7. What REGIQ stores in the browser

- Recent scan **metadata and regulatory result JSON** are stored in localStorage.
- Captured image object URLs are not persisted across a full page reload.
- BYO Hugging Face tokens are not stored in localStorage.
- Clearing History removes REGIQ's saved scan history from that browser.

## 8. Model provenance

`GET /api/model/provenance` reports the REGIQ software version/license and current vision configuration.

Successful Hugging Face recognition responses include best-effort runtime model provenance such as model ID, source URL, revision and model-card license when available.

A pinned deployment may explicitly declare independently verified provenance:

```bash
REGIQ_MODEL_LICENSE=apache-2.0
REGIQ_MODEL_SOURCE_URL=https://huggingface.co/<org>/<model>
```

REGIQ's Apache-2.0 license never automatically applies to third-party model weights.

## 9. Production hardening checklist

Before exposing REGIQ broadly:

- use TLS/HTTPS;
- add upload-size limits;
- add rate limiting and inference quota controls;
- set explicit allowed origins if frontend/backend are split across origins;
- never log authorization or BYO token headers;
- pin deployment dependencies and model/version provenance;
- monitor official regulatory-source freshness;
- keep legal uncertainty and the non-legal-advice disclaimer visible;
- add automated tests for regulatory mappings before expanding coverage.

## 10. License

REGIQ source code is licensed under Apache License 2.0. Third-party libraries, model weights, datasets and regulatory source material retain their own licenses and terms.
