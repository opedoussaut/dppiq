# REGIQ deployment guide

REGIQ can be shared in two modes:

1. **Hosted demo** — you deploy the frontend and backend and configure a server-side model token.
2. **Bring your own token (BYO)** — users clone/self-host REGIQ or call the scan API with their own Hugging Face token.

REGIQ never requires a token in frontend source code and no secret should ever be committed to GitHub.

## 1. Quick start in GitHub Codespaces

```bash
git clone https://github.com/opedoussaut/regiq.git
cd regiq

python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

Configure the backend:

```bash
export REGIQ_VISION_ENABLED=true
export REGIQ_VISION_PROVIDER=huggingface
export REGIQ_HF_MODEL=auto
export HF_TOKEN='hf_your_token_here'
export REGIQ_ALLOW_BYO_HF_TOKEN=true
```

Start FastAPI:

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

Open port 5173. Vite proxies `/api` to port 8000.

## 2. Safe configuration

Use `.env.example` as the configuration template. `.env` and `.env.*` are ignored by Git, except `.env.example`.

Never put any of these in source code:

- `HF_TOKEN`
- provider API keys
- private endpoint credentials
- personal access tokens

For GitHub Codespaces, prefer Codespaces secrets or shell environment variables.

## 3. Bring your own Hugging Face token

REGIQ supports per-request BYO tokens when:

```bash
export REGIQ_ALLOW_BYO_HF_TOKEN=true
```

A client may then call:

```bash
curl -X POST http://127.0.0.1:8000/api/scan/image \
  -H 'X-REGIQ-HF-Token: hf_your_token_here' \
  -F 'file=@product.jpg'
```

The request token overrides the server `HF_TOKEN` for that scan only. REGIQ does not write the token to disk, return it in the response, or store it in application state.

**Trust warning:** only send a BYO token to a REGIQ backend you trust. A backend operator controls the server process and network stack. For maximum privacy, self-host REGIQ and provide your token through your own environment.

## 4. Hosted public demo

For a public demo, the simplest configuration is a server-side token:

```bash
REGIQ_VISION_ENABLED=true
REGIQ_VISION_PROVIDER=huggingface
REGIQ_HF_MODEL=auto
HF_TOKEN=...
REGIQ_ALLOW_BYO_HF_TOKEN=false
```

This avoids asking visitors for credentials. Monitor provider usage and quotas because inference requests are billed or rate-limited according to the configured provider/account.

## 5. Local/private inference with Ollama

Users with sufficient hardware can avoid remote image inference:

```bash
export REGIQ_VISION_ENABLED=true
export REGIQ_VISION_PROVIDER=ollama
export REGIQ_VISION_MODEL=qwen3-vl:2b
export OLLAMA_BASE_URL=http://127.0.0.1:11434
```

Then run Ollama separately and start REGIQ normally.

## 6. Model provenance

Every successful recognition result reports the provider and exact model used. Hugging Face results also include best-effort model provenance metadata when available, including model repository URL, revision and declared model-card license.

If a deployment pins a known model, operators can explicitly set:

```bash
REGIQ_MODEL_LICENSE=apache-2.0
REGIQ_MODEL_SOURCE_URL=https://huggingface.co/<org>/<model>
```

Do not assume that REGIQ's Apache-2.0 software license applies to model weights. Model licenses remain independent and must be checked before redistributing weights.

## 7. Production hardening checklist

Before exposing REGIQ publicly:

- run FastAPI behind TLS/HTTPS;
- restrict CORS to the deployed frontend origin instead of `*`;
- add request-size limits for uploaded images;
- add rate limiting and provider quota protection;
- never log authorization headers or BYO token headers;
- pin dependencies for reproducible production releases;
- pin or record model/version provenance;
- monitor official-source freshness for regulatory data;
- display that REGIQ provides regulatory intelligence, not legal advice.

## 8. License

REGIQ source code is licensed under Apache License 2.0. Third-party libraries, model weights, datasets and regulatory source material retain their own licenses/terms.