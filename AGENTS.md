# DPPIQ agent instructions

DPPIQ is an open-source, auditable Digital Product Passport intelligence platform. Changes must preserve these rules.

## Non-negotiable principles

1. Never present AI interpretation as authoritative law.
2. Preserve provenance for regulatory sources, extracted requirements, evidence and inferred conclusions.
3. Keep illustrative/demo regulation data visibly labeled as such.
4. Do not auto-promote self-improving strategies without benchmark evidence.
5. Prefer deterministic evaluation where possible.
6. Keep runtime model providers replaceable; core domain logic must not depend on one vendor.
7. Public/open data is the default. Proprietary integrations are optional adapters, not core dependencies.
8. Any code-modifying self-improvement must be proposed through a reviewable change, not silently applied at runtime.

## Evolution workflow

A candidate strategy must be evaluated against versioned benchmark cases. Promotion requires improvement on target metrics without breaching guardrails such as false-compliance rate. Record candidate, baseline, result, decision and rationale.

## Regulatory workflow

Maintain four explicit layers:

- source: authoritative/public text and metadata;
- extraction: machine-readable candidate requirements;
- interpretation: applicability and mapping hypotheses;
- validation: benchmark or human-reviewed outcome.

Never collapse these layers into one generated answer.
