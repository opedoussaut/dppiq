from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, File, Header, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .category import normalize_identification
from .engine import compare_regulation_versions, evaluate_candidate_generation
from .regulatory import regulatory_profile_for_product
from .regulatory_agents import investigate_regulation, regulation_agent_configuration
from .vision import identify_product, vision_configuration

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
FRONTEND_DIST = ROOT / "frontend" / "dist"

app = FastAPI(title="REGIQ API", version="1.1.0-beta.1")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False, allow_methods=["*"], allow_headers=["*"])


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/api/health")
def health():
    catalog = load_json(DATA / "regulatory_catalog.json")
    return {"status": "ok", "name": "REGIQ", "version": "1.1.0-beta.1", "regulatory_catalog_version": catalog.get("catalog_version"), "regulatory_catalog_verified_at": catalog.get("verified_at")}


@app.get("/api/model/provenance")
def model_provenance():
    return {"software": {"name": "REGIQ", "version": "1.1.0-beta.1", "license": "Apache-2.0", "repository": "https://github.com/opedoussaut/regiq"}, "vision": vision_configuration(), "regulation_agents": regulation_agent_configuration(), "note": "REGIQ separates product recognition from regulatory investigation. Model weights retain their own licenses."}


@app.get("/api/regulation/catalog")
def regulation_catalog():
    return load_json(DATA / "regulatory_catalog.json")


@app.get("/api/regulation/reference")
def regulation_reference():
    return load_json(DATA / "regulatory_reference.json")


@app.get("/api/regulation/change")
def regulation_change():
    return compare_regulation_versions(load_json(DATA / "regulation_v1.json"), load_json(DATA / "regulation_v2.json"))


@app.get("/api/evolution")
def evolution():
    return evaluate_candidate_generation(load_json(DATA / "evolution_candidate.json"))


@app.get("/api/scan/config")
def scan_config():
    catalog = load_json(DATA / "regulatory_catalog.json")
    return {"vision": vision_configuration(), "regulation_agents": regulation_agent_configuration(), "camera_capture": True, "photo_upload": True, "barcode_qr": True, "byo_header": "X-REGIQ-HF-Token", "reference_product_families": sorted(catalog.get("product_families", {}).keys()), "regulatory_catalog_version": catalog.get("catalog_version"), "principle": "Primary path: raw vision evidence -> investigator LLM over the full verified corpus -> independent verifier -> REGIQ confidence. Product-category rules are fallback only."}


@app.post("/api/scan/image")
async def scan_image(file: UploadFile = File(...), x_regiq_hf_token: str | None = Header(default=None, alias="X-REGIQ-HF-Token")):
    image_bytes = await file.read()
    content_type = file.content_type or "image/jpeg"
    raw_identification = await identify_product(image_bytes, hf_token_override=x_regiq_hf_token)

    # Primary path: the regulation agents reason from raw visual/product evidence.
    agent_profile = await investigate_regulation(raw_identification, hf_token_override=x_regiq_hf_token)
    if agent_profile:
        identification = raw_identification
        regulatory_profile = agent_profile
        regulatory_profile["reasoning_mode"] = "agentic_investigator_verifier"
        regulatory_profile["fallback_used"] = False
    else:
        # Categories exist only as a resilience mechanism and regression benchmark.
        identification = normalize_identification(raw_identification)
        regulatory_profile = regulatory_profile_for_product(identification)
        regulatory_profile["reasoning_mode"] = "deterministic_category_fallback"
        regulatory_profile["fallback_used"] = True
        regulatory_profile["overall_confidence"] = None
        regulatory_profile["overall_confidence_label"] = "not_scored"

    return {"filename": file.filename, "content_type": content_type, "identification": identification, "regulatory_profile": regulatory_profile, "regulatory": {"status": regulatory_profile.get("status"), "label": regulatory_profile.get("headline"), "scope_note": regulatory_profile.get("summary"), "classification": "MULTI_REGIME_PROFILE", "legal_basis": None, "source_url": None}, "discovery": {"status": "ready_for_source_discovery" if regulatory_profile.get("regimes") else "waiting_for_identification", "message": "The investigator works against REGIQ's verified legal corpus. A future source-discovery agent can propose new official acts for verification before they enter that corpus."}}


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
