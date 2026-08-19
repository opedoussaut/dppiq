# REGIQ public beta guide

REGIQ is designed to be shareable as a mobile-first HTTPS web application and installable PWA.

## Recommended public demo configuration

Use a hosted server-side Hugging Face token so visitors do not need an account or token:

```bash
REGIQ_VISION_ENABLED=true
REGIQ_VISION_PROVIDER=huggingface
REGIQ_HF_MODEL=auto
REGIQ_ALLOW_BYO_HF_TOKEN=false
HF_TOKEN=<secret managed by the hosting platform>
```

Never expose `HF_TOKEN` in frontend code, screenshots, logs or GitHub.

## Deploy with Render

The repository contains `render.yaml` and a production `Dockerfile`.

1. Connect the public `opedoussaut/regiq` repository to Render.
2. Create a Blueprint from `render.yaml`.
3. Set the secret `HF_TOKEN` in Render.
4. Deploy.
5. Open the resulting HTTPS URL on desktop and mobile.

The same container serves both the React PWA and FastAPI API.

## Mobile acceptance test

Before sharing publicly, verify on both iPhone Safari and Android Chrome:

- page loads over HTTPS;
- rear camera opens after permission;
- capture succeeds;
- result is readable without horizontal scrolling;
- official EUR-Lex links open in a new tab;
- Intelligence shows the same scanned product;
- History reopens recent dossiers;
- PWA installation / Add to Home Screen works;
- no credentials appear in browser storage or scan history.

## Reference demo families

The public beta contains curated EU regulatory profiles for these demonstration families:

- plastic beverage bottle;
- smartphone;
- laptop;
- wireless headphones / earbuds;
- power bank;
- household battery;
- LED lamp / bulb;
- power tool / drill;
- textile garment;
- electronic toy;
- EV, LMT and >2 kWh industrial batteries.

Products outside those families deliberately fall back to `screening_required` rather than presenting false completeness.

## What to say publicly

REGIQ is an open-source regulatory-intelligence prototype, not a legal compliance determination tool. It separates probabilistic visual identification from regulatory interpretation and links mapped regimes back to authoritative public sources.

A useful demo sequence is:

1. open REGIQ on a phone;
2. scan an everyday product;
3. show recognition confidence and evidence;
4. show current / likely / conditional / upcoming regulatory regimes;
5. open one official EUR-Lex source;
6. switch to Intelligence to show provenance and the product dossier;
7. explain that the regulatory catalog is versioned and benchmarked for future agentic evolution.

## LinkedIn screen recording

Keep the first video around 15–25 seconds:

- 0–3 s: REGIQ landing / scan screen;
- 3–7 s: point camera at product and capture;
- 7–12 s: product recognition appears;
- 12–18 s: scroll through regulatory regimes;
- 18–22 s: open Intelligence / source provenance;
- final frame: REGIQ + GitHub repository + public demo URL.

Do not record a screen containing a Hugging Face token or hosting dashboard secret.
