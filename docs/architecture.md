# DPPIQ architecture

## Purpose

DPPIQ turns a Digital Product Passport into an evolving intelligence layer that can respond to changes in public regulation and improve its own decision strategies through objective evaluation.

## Core components

### 1. Product passport model
Stores product identity, materials, repairability, circularity, environmental indicators and evidence references in a vendor-neutral structure.

### 2. Regulatory layer
Maintains versioned regulation snapshots and extracted requirements. Future versions should attach jurisdiction, legal status, effective dates, source URL/hash, product scope and confidence to every extracted requirement.

### 3. Evidence layer
Links DPP claims to evidence objects and records provenance, freshness, quality and validation state.

### 4. Intelligence layer
Maps product data and evidence to regulatory requirements and circularity opportunities. It must always expose rationale and source status.

### 5. Evaluation layer
Runs deterministic and model-assisted benchmark cases. Metrics include requirement mapping accuracy, evidence precision/recall, false-compliance rate, latency and model cost.

### 6. Evolution engine
Generates candidate improvements to prompts, retrieval, model routing, tool selection or agent topology. Candidates run in a sandbox against benchmarks. Only candidates satisfying promotion guardrails become the next generation.

## Intended agent topology

```text
Regulatory Watch -> Requirement Extractor -> Regulatory Critic
                                      |
Product Intake -> DPP Normalizer -----+----> Compliance/Evidence Agent
                                      |              |
Circularity Agent --------------------+              v
                                              Evaluation Harness
                                                     |
                                                     v
                                                Meta Agent
                                                     |
                                              candidate strategy
                                                     |
                                              benchmark sandbox
                                                     |
                                              promote / reject
```

## Self-improvement boundary

The initial system may improve:

- prompts and structured instructions;
- retrieval strategies;
- model selection and routing;
- tool/MCP selection;
- requirement extraction strategies;
- evidence-ranking heuristics;
- agent topology.

Runtime agents must not silently rewrite production source code. Code changes may later be proposed as reviewable GitHub pull requests with tests and benchmark evidence.

## Source status taxonomy

DPPIQ should visually distinguish at least:

- `authoritative` — enacted/official source;
- `draft` — official draft/proposal/consultation material;
- `secondary` — non-authoritative explanatory material;
- `illustrative` — synthetic/demo content;
- `inferred` — agent-generated interpretation.

This distinction is part of the data model, not merely a UI convention.
