# DPPIQ

**Digital Product Passport Intelligence** — an open-source, self-evolving agentic platform for Digital Product Passports, regulatory evolution, evidence quality and circularity.

DPPIQ is designed to be self-contained and public. It does not require PLM, ERP or other proprietary enterprise systems. Product data can be loaded from public/sample JSON, CSV or manual input, while regulations and evidence can come from public sources, open datasets, open MCP servers and model providers.

## Core idea

DPPIQ treats regulation as a changing environment. When regulatory requirements evolve, the platform can:

1. detect and version the change;
2. translate it into machine-readable DPP requirements;
3. evaluate affected passports;
4. explain gaps and evidence quality;
5. propose remediation;
6. benchmark improved agent strategies against historical cases;
7. promote a new strategy only when objective evaluation improves.

The goal is **auditable self-improvement**, not uncontrolled self-modifying code.

## Scan-first vision

DPPIQ is evolving into a **"Shazam for DPP"**: point a phone or laptop camera at a product, identify it from visual evidence/barcodes/text, then independently determine its Digital Product Passport regulatory status and search for verified public passport data.

The recognition provider is pluggable. DPPIQ keeps product identification separate from regulatory reasoning.

### Remote open-weight vision with Hugging Face

The recommended Codespaces setup uses Hugging Face Inference Providers so multimodal inference runs remotely instead of consuming Codespace RAM.

Create a Hugging Face token with **Inference Providers** permission, then start DPPIQ with:

```bash
export DPPIQ_VISION_ENABLED=true
export DPPIQ_VISION_PROVIDER=huggingface
export HF_TOKEN=hf_your_token_here
export DPPIQ_HF_MODEL=Qwen/Qwen2.5-VL-7B-Instruct

uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

The token is read from the environment and must never be committed to GitHub.

For users with sufficient local hardware, Ollama remains supported:

```bash
export DPPIQ_VISION_ENABLED=true
export DPPIQ_VISION_PROVIDER=ollama
export DPPIQ_OLLAMA_MODEL=qwen3-vl:2b
```

## V1 architecture

```text
Public product data / manual input
              |
              v
      DPP product model
              |
      +-------+--------+
      |                |
      v                v
Regulatory engine   Evidence engine
      |                |
      +-------+--------+
              v
       DPP intelligence
              |
      +-------+--------+
      |                |
      v                v
Compliance         Circularity
      |                |
      +-------+--------+
              v
          Evaluator
              |
              v
       Evolution engine
              |
        benchmark gate
              |
       promote / reject
```

## Repository layout

- `backend/` — FastAPI API and core intelligence engine
- `frontend/` — React/Vite dashboard
- `data/` — public/sample product passports and regulation snapshots
- `agents/` — versioned agent specifications
- `benchmarks/` — deterministic evaluation cases
- `evolution/` — promoted/rejected generations and rationale
- `docs/` — architecture and methodology

## Run locally / in Codespaces

### Backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

The Vite development server proxies `/api` requests to the FastAPI backend on port 8000.

## Principles

- **Public-first** — works without proprietary enterprise integrations.
- **Source-aware** — regulation, extraction, interpretation and inferred conclusions are separate layers.
- **Auditable** — every assessment carries evidence and provenance.
- **Model-neutral** — agent interfaces support local or remotely hosted open-weight models without changing the domain model.
- **Benchmark-gated evolution** — no new strategy is promoted only because an LLM claims it is better.
- **Human-readable** — the UI exposes why DPPIQ reached a conclusion.

## Status

Early prototype. The current milestone combines product camera capture, pluggable vision identification, regulatory classification, passport intelligence and a benchmark-gated evolution layer.

## License

A license will be selected before the first tagged release.