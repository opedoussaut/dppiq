# Scan a Product — REGIQ's Shazam-for-regulation experience

REGIQ's primary public experience is mobile-first: point a phone at a physical product, identify it, then investigate the verified regulatory corpus that may apply to that exact product evidence.

Digital Product Passports are one possible regulatory result; REGIQ is not limited to DPPs.

## Public pipeline

1. **Capture** — phone/laptop camera or uploaded image.
2. **Decode identifiers** — browser-side barcode/QR signal extraction where available.
3. **Visual identification** — Workers AI vision model identifies the product from visible evidence.
4. **Product evidence object** — generic type, optional visible brand/model/text, confidence and short factual reasoning summary.
5. **Regulatory investigator** — evaluates that evidence against the complete verified REGIQ EU catalog.
6. **Independent verifier** — challenges proposed findings and can reject unsupported ones.
7. **Deterministic confidence** — REGIQ computes evidence confidence from identity, source authority, applicability specificity, missing evidence and verifier agreement.
8. **Intelligence workspace** — exposes current/likely/conditional/upcoming signals, official sources and evidence gaps.
9. **Re-assessment** — user-supplied product facts can be sent through a fresh investigator + verifier run.

## Public models

The Cloudflare-native deployment currently uses:

```text
Vision       @cf/google/gemma-4-26b-a4b-it
Investigator @cf/zai-org/glm-4.7-flash
Verifier     @cf/zai-org/glm-4.7-flash
```

They are accessed through the Cloudflare Workers AI `AI` binding. Public visitors do not need to enter a token.

The exact models may change as the free-plan model catalog evolves; model provenance is exposed by `/api/model/provenance`.

## Free-tier behavior

The public service intentionally has finite free AI capacity. When the daily Workers AI free allocation is exhausted, REGIQ returns an explicit capacity message. It must not manufacture a regulatory answer merely to keep the demo looking available.

## Self-host alternatives

The Python backend still supports Hugging Face and Ollama for contributors. See `.env.example` and `docs/DEPLOYMENT.md`.

## Trust boundary

REGIQ deliberately separates these statements:

- **Product identification** — probabilistic, model-generated and confidence-scored.
- **Barcode/QR signal** — identifier evidence extracted directly from the image when decodable.
- **Regulatory source** — reviewed catalog entry linked to an official source.
- **Investigator interpretation** — model-generated reasoning constrained to the supplied corpus.
- **Verifier verdict** — independent second-pass critique.
- **Evidence confidence** — deterministic REGIQ score, not an LLM self-rating.
- **Compliance determination** — not provided by REGIQ.

A model confidence value must never be presented as proof of legal compliance.
