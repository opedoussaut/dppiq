# REGIQ

**Regulation Intelligence** — an open-source, self-evolving agentic platform that identifies physical products and explains the regulations, standards, product-passport obligations, evidence requirements and upcoming regulatory changes that apply to them.

REGIQ is designed to be self-contained and public. It does not require PLM, ERP or other proprietary enterprise systems. Product data can come from camera images, barcodes, public/sample JSON, CSV or manual input, while regulations and evidence can come from authoritative public sources, open datasets, open MCP servers and model providers.

## Core idea

REGIQ is a **"Shazam for product regulation"**. Point a phone or laptop camera at a product, identify it from visual evidence, text and validated identifiers, then independently determine which regulatory regimes may apply and show the evidence behind that assessment.

Digital Product Passports remain an important REGIQ module, but DPP is no longer the boundary of the product. REGIQ can grow to cover ESPR/DPP, batteries, packaging, ecodesign, chemicals/material restrictions, repairability, energy, product safety, standards and other product-specific regulatory domains.

REGIQ treats regulation as a changing environment. When requirements evolve, the platform can:

1. detect and version authoritative regulatory changes;
2. translate them into machine-readable requirements;
3. map identified product categories to potentially applicable regimes;
4. explain applicability, gaps and evidence quality;
5. propose remediation or data collection;
6. benchmark improved agent strategies against historical cases;
7. promote a new strategy only when objective evaluation improves.

The goal is **auditable self-improvement**, not uncontrolled self-modifying code.

## Scan-first experience

```text
Camera / photo / barcode
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
ESPR / DPP                  Batteries          Packaging
    |                            |                  |
    +-------------+--------------+------------------+
                  v
         Regulatory evidence
                  |
                  v
       What applies / what next
```

The recognition provider is pluggable. REGIQ keeps probabilistic product identification separate from legal and regulatory reasoning.

### Remote open-weight vision with Hugging Face

For Codespaces, multimodal inference can run remotely through Hugging Face Inference Providers instead of consuming Codespace RAM.

```bash
export REGIQ_VISION_ENABLED=true
export REGIQ_VISION_PROVIDER=huggingface
export HF_TOKEN=hf_your_token_here
export REGIQ_HF_MODEL=auto

uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

For users with sufficient local hardware, Ollama remains supported:

```bash
export REGIQ_VISION_ENABLED=true
export REGIQ_VISION_PROVIDER=ollama
export REGIQ_VISION_MODEL=qwen3-vl:2b
```

Legacy `DPPIQ_*` environment variables may remain temporarily supported during the rename, but new configuration should use `REGIQ_*`.

## Architecture

```text
Physical product / identifier
              |
              v
      Identification layer
              |
              v
      Product category model
              |
      +-------+--------+
      |                |
      v                v
Regulatory engine   Evidence engine
      |                |
      +-------+--------+
              v
     Regulation intelligence
              |
      +-------+--------+
      |                |
      v                v
Applicability       DPP / compliance
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

- `backend/` — FastAPI API and regulatory intelligence engine
- `frontend/` — React/Vite scan and intelligence experience
- `data/` — public/sample products, passports and regulation snapshots
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

- **Authoritative-source first** — legal conclusions must be traceable to public regulatory sources.
- **Source-aware** — source, extraction, interpretation and inferred conclusions remain separate layers.
- **Auditable** — every assessment carries evidence and provenance.
- **Model-neutral** — local or remotely hosted models can be replaced without changing the regulatory domain model.
- **Benchmark-gated evolution** — no strategy is promoted merely because an LLM claims it is better.
- **Human-readable** — the UI explains why REGIQ reached a conclusion.
- **No false certainty** — unidentified products and uncertain applicability remain explicitly uncertain.

## Status

Early prototype. Product camera capture and visual identification work end-to-end. The current regulatory knowledge base is still intentionally narrow and must now expand beyond ESPR/DPP into a broader product-regulation graph.

## License

A license will be selected before the first tagged release.
