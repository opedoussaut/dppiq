# REGIQ regulatory basis

REGIQ separates authoritative legal sources from model interpretation and from REGIQ-added intelligence.

## Authoritative-source policy

The active public corpus is `data/regulatory_catalog.json`. Entries are curated from official EUR-Lex legal acts and include a stable ID, legal basis, source URL, source authority/status and a concise scope summary.

The current catalog includes horizontal and sector-specific EU legislation such as:

- Ecodesign for Sustainable Products Regulation (EU) 2024/1781 (ESPR);
- Packaging and Packaging Waste Regulation (EU) 2025/40;
- Batteries Regulation (EU) 2023/1542;
- RoHS and WEEE;
- Radio Equipment Directive and Common Charger rules;
- smartphone/slate-tablet ecodesign requirements;
- REACH and General Product Safety Regulation;
- machinery and toy-safety transition legislation;
- selected lighting, textile and food-contact rules.

The catalog is not a claim of complete EU product-law coverage.

## Digital Product Passport status

ESPR remains a key horizontal reference for DPP architecture, but REGIQ does **not** assume that every product has a current ESPR DPP obligation. Product-specific ESPR requirements depend on delegated acts and application dates.

REGIQ therefore treats DPP/passport relevance as one finding among many. The Batteries Regulation and Toy Safety Regulation can also introduce passport concepts for specified scopes/dates.

The older `data/regulatory_reference.json` remains available as a focused ESPR/DPP reference snapshot, but it is not the sole public reasoning source.

## Interpretation model

REGIQ's public inference chain is:

```text
verified corpus
     |
product evidence -> investigator -> verifier
                                 |
                                 v
                     deterministic confidence
```

The investigator can reference only act IDs supplied in the catalog. Missing product specifications should produce conditional findings or evidence questions rather than invented certainty.

The verifier receives the same source corpus and can reject unsupported findings.

## Confidence is not compliance

REGIQ evidence confidence is computed from:

- visual/product identity confidence;
- official-source authority;
- verifier agreement;
- applicability specificity;
- missing evidence.

It is confidence in the quality of the investigation, not a compliance score, conformity assessment, CE-marking determination or legal opinion.

## Source taxonomy

REGIQ distinguishes:

- `official_eur_lex` — authoritative official legal source metadata;
- official proposal/draft — future category, must remain visibly non-final;
- secondary material — explanatory context only when explicitly added;
- benchmark/demo data — synthetic or curated test inputs;
- model interpretation — investigator/verifier output, never law.

## Regulatory evolution guardrail

Future regulatory-watch agents may discover candidate new acts or changes, but they must not silently promote them into the verified corpus. A source update should remain reviewable and version-controlled, with official provenance and regression testing before release.
