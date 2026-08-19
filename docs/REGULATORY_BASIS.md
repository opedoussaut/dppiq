# DPPIQ regulatory basis

DPPIQ separates authoritative law from machine interpretation and from DPPIQ-added intelligence.

## Authoritative reference

The current reference model is grounded in **Regulation (EU) 2024/1781 (ESPR)**, using the official EUR-Lex legal text:

- https://eur-lex.europa.eu/eli/reg/2024/1781/oj
- Digital Product Passport framework: Articles 9, 10 and 11
- Official European Commission DPP implementation page: https://single-market-economy.ec.europa.eu/single-market/digital-product-passport_en

The machine-readable reference used by the prototype is stored in `data/regulatory_reference.json`.

## Classification model

DPPIQ uses three visible classifications.

### `EU_FRAMEWORK`

An enacted horizontal requirement or design principle from the ESPR DPP framework. A framework-readiness check indicates whether the demo passport contains supporting data or system metadata. It is **not** a legal compliance opinion.

### `PRODUCT_SPECIFIC`

A requirement whose concrete content or applicability depends on an applicable delegated act under ESPR or other sector-specific EU legislation. DPPIQ must not assert that these requirements apply to a product unless the corresponding legal instrument has been identified.

### `DPPIQ_INTELLIGENCE`

A score, prediction, recommendation, evidence-quality assessment, circularity analysis or agent-evolution result created by DPPIQ. These are never represented as EU legal requirements.

## Current demo-product limitation

The sample product is illustrative. DPPIQ currently uses the horizontal ESPR DPP framework to demonstrate readiness and provenance. It does not claim that a product-specific DPP obligation is currently applicable to the demo sensor.

## Evolution guardrail

Self-improving agents may improve retrieval, extraction, mapping, evidence assessment and reasoning workflows. They may not alter the authoritative source, remove provenance, or silently promote an interpretation to the status of law. Proposed agent generations must pass objective benchmark guardrails before promotion.

## Keeping the reference current

Future work will add an automated regulatory-watch pipeline that checks official EU sources for new delegated acts, implementing acts, harmonised-standard references and product-specific DPP requirements. Detected changes will enter a review/evaluation flow before they can update DPPIQ's active regulatory model.
