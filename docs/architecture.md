# REGIQ architecture

## Purpose

REGIQ turns a camera/photo observation of a physical product into a transparent regulatory-intelligence assessment. It separates probabilistic product recognition from legal-source evidence, independent verification and deterministic confidence scoring.

The public architecture is intentionally serverless and open-source friendly: React PWA + Cloudflare Worker + Workers AI + a versioned regulatory corpus.

## Public runtime

```text
                         REGIQ public PWA
                               |
                       Cloudflare HTTPS
                               |
             +-----------------+-----------------+
             |                                   |
      Static React assets                  /api/* Worker
      frontend/dist                             |
                                                |
                              +-----------------+----------------+
                              |                 |                |
                         Vision model      Investigator       Verifier
                              |                 |                |
                              +-------- product evidence --------+
                                                |
                                  verified regulatory catalog
                                                |
                                   deterministic confidence
                                                |
                                      Intelligence dossier
```

`wrangler.jsonc` deploys `cloudflare/worker.js` and `frontend/dist` as one Cloudflare Worker application. API requests run the Worker first; all other navigation is handled as a single-page application.

## Core components

### 1. Product observation

Camera capture or photo upload supplies image evidence. The vision model returns generic product type, optional visible brand/model/text, a confidence value and a short factual reasoning summary. It must not infer legal obligations.

### 2. Versioned regulatory corpus

`data/regulatory_catalog.json` contains reviewed official-source metadata. Each act includes a stable ID, title, legal basis, source URL, source authority/status and a deliberately concise summary.

The corpus is data, not model memory. Agent findings may reference only IDs present in this supplied corpus.

### 3. Regulatory investigator

The investigator receives the product evidence and the complete compact verified corpus. It proposes materially relevant acts, applicability states, supported high-level checks and missing product facts.

Predefined product-family mappings are not the primary inference path. They remain useful for regression benchmarks and the Python fallback runtime.

### 4. Independent verifier

The verifier receives the same product evidence, same corpus and investigator output. It can confirm a finding, request more evidence or reject it. Rejected findings are not shown as applicable findings.

### 5. Confidence layer

REGIQ does not ask the LLM to self-rate confidence. A deterministic score combines:

- product identity confidence;
- official-source authority;
- verifier agreement;
- applicability specificity;
- amount of missing evidence.

The score is confidence in the investigation, not a compliance score.

### 6. Intelligence workspace

The React UI shows:

- product identity;
- regulatory findings;
- official legal sources;
- evidence confidence;
- current/conditional/upcoming signals;
- missing evidence;
- re-assessment after user-supplied product facts;
- local scan history.

### 7. Self-host runtime

`backend/` remains a FastAPI implementation for contributors, Docker deployments and alternate inference providers such as Hugging Face or Ollama. It is deliberately separate from the public hosting requirement.

## Free-tier boundary

The public Worker uses Cloudflare's free Workers/Workers AI allocations. No automatic paid inference fallback is configured by REGIQ. When free AI capacity is exhausted, the application must expose that state explicitly instead of producing fake/fallback legal conclusions.

This is a product boundary, not an error to hide.

## Privacy boundary

The public architecture currently has no application database. Images are submitted for inference and are not intentionally persisted by REGIQ. Scan results/history are kept in browser local storage. Future persistence must be opt-in and documented separately.

## Source-status policy

REGIQ should visually and structurally distinguish:

- `official_eur_lex` / authoritative official source;
- official draft/proposal when later supported;
- secondary explanatory material when explicitly introduced;
- synthetic benchmark/demo data;
- model-generated interpretation.

An interpretation must never be represented as an authoritative legal source.

## Evolution boundary

Future agents may propose changes to:

- prompts;
- retrieval/source discovery;
- model routing;
- corpus extraction;
- evidence ranking;
- agent topology;
- benchmark cases.

Runtime agents must not silently rewrite production code or silently promote new legal sources. Code/corpus changes should be reviewable GitHub changes with automated tests and source provenance.
