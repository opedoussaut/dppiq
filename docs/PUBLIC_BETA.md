# REGIQ public beta guide

REGIQ is a mobile-first HTTPS Progressive Web App designed to be publicly shareable without requiring visitors to create an account or provide an AI token.

## Public runtime

The public beta runs as a single Cloudflare Worker deployment:

- React/Vite PWA is served as Worker Static Assets;
- `/api/*` is handled by `cloudflare/worker.js`;
- Workers AI performs product vision, regulatory investigation and independent verification;
- `data/regulatory_catalog.json` is bundled into the Worker as the verified EU legal corpus;
- visitors do not receive or enter a model credential.

The FastAPI/Hugging Face/Ollama implementation remains available for self-hosting and development only.

## Free-public-demo policy

The hosted demo is intentionally bounded by Cloudflare's free allocations. REGIQ does not configure an automatic paid inference fallback.

If the free Workers AI daily allocation is exhausted:

- the PWA remains available;
- new inference requests return an explicit capacity message;
- no user is charged;
- the project owner is not silently billed by REGIQ.

This is preferable for an open-source public beta to pretending that unlimited AI inference can be permanently free.

## Deploy

```bash
npm install
npx wrangler login
npm run test:mobile
npm run test:ui
npm run deploy:dry-run
npm run deploy
```

The deployment URL is normally on `workers.dev` until a custom domain is configured.

## Mobile acceptance test

Before sharing publicly, verify on a real Android Chrome device and, when available, iPhone Safari:

- page loads over HTTPS;
- desktop and mobile use the same gray visual canvas and design language;
- rear camera opens after permission;
- captured photo preview is correct;
- gallery upload works for JPEG/PNG/WebP and HEIC/HEIF conversion;
- product identity is credible and confidence is visible;
- investigator + verifier complete without a token prompt;
- regulatory findings are readable without horizontal scrolling;
- official EUR-Lex links open correctly;
- Intelligence shows the latest scanned product;
- evidence gaps can be answered and re-assessed;
- History reopens recent dossiers;
- PWA install/Add to Home Screen works;
- final REGIQ icon is used on the installed app;
- no credentials appear in browser storage or scan history.

Automated Playwright release tests cover desktop Chrome, Pixel-sized Android and a narrow 360 px phone viewport. Real-device testing remains required for camera permission, PWA installation and inference latency.

## Product test matrix

Use more than one easy consumer product before publishing:

1. simple packaging/beverage container;
2. wireless headphones or smartphone;
3. battery with readable label;
4. more complex electronic/industrial equipment such as a server, power supply or tool.

For each product verify:

- identification;
- visible evidence;
- investigator relevance;
- verifier behavior;
- evidence confidence;
- official-source traceability;
- explicit uncertainty when specifications are missing.

## What to say publicly

REGIQ is an open-source **regulatory-intelligence prototype**, not a legal compliance determination tool.

A precise public description is:

> Scan a product. REGIQ identifies it, investigates a verified EU regulatory corpus, asks a second agent to challenge the findings, and exposes the resulting evidence confidence and official sources.

Avoid saying that REGIQ "proves compliance" or that the current catalog covers all legislation.

## LinkedIn demo sequence

For a first 20–30 second recording:

1. REGIQ home/scan screen;
2. camera pointed at a neutral product;
3. capture and identification;
4. regulatory signals + confidence;
5. open Intelligence;
6. show one official source/evidence gap;
7. final frame: REGIQ icon, GitHub repository and public `workers.dev` demo URL.

Do not record Cloudflare account pages, developer credentials, private tokens or unrelated browser tabs.
