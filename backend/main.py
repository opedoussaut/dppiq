from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, File, Header, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .category import normalize_identification
from .complex_products import complex_product_profile
from .engine import compare_regulation_versions, evaluate_candidate_generation
from .regulatory import regulatory_profile_for_product
from .regulatory_agents import AGENTIC_ENABLED, investigate_regulation
from .vision import identify_product, vision_configuration

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
FRONTEND_DIST = ROOT / "frontend" / "dist"

app = FastAPI(title="REGIQ API", version="1.0.0-beta.3")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/api/health")
def health():
    catalog = load_json(DATA / "regulatory_catalog.json")
    return {
        "status": "ok",
        "name": "REGIQ",
        "version": "1.0.0-beta.3",
        "agentic_regulation_enabled": AGENTIC_ENABLED,
        "regulatory_catalog_version": catalog.get("catalog_version"),
        "regulatory_catalog_verified_at": catalog.get("verified_at"),
    }


@app.get("/api/model/provenance")
def model_provenance():
    config = vision_configuration()
    return {
        "software": {
            "name": "REGIQ",
            "version": "1.0.0-beta.3",
            "license": "Apache-2.0",
            "repository": "https://github.com/opedoussaut/regiq",
        },
        "vision": config,
        "agentic_regulation_enabled": AGENTIC_ENABLED,
        "note": "The REGIQ software license does not automatically apply to model weights. Confidence is computed by REGIQ from evidence and agent agreement, not copied from an LLM self-rating.",
    }


@app.get("/api/regulation/catalog")
def regulation_catalog():
    return load_json(DATA / "regulatory_catalog.json")


@app.get("/api/regulation/reference")
def regulation_reference():
    return load_json(DATA / "regulatory_reference.json")


@app.get("/api/regulation/change")
def regulation_change():
    old = load_json(DATA / "regulation_v1.json")
    new = load_json(DATA / "regulation_v2.json")
    return compare_regulation_versions(old, new)


@app.get("/api/evolution")
def evolution():
    candidate = load_json(DATA / "evolution_candidate.json")
    return evaluate_candidate_generation(candidate)


@app.get("/api/scan/config")
def scan_config():
    catalog = load_json(DATA / "regulatory_catalog.json")
    return {
        "vision": vision_configuration(),
        "camera_capture": True,
        "image_upload": True,
        "complex_product_screening": True,
        "agentic_regulation": {
            "enabled": AGENTIC_ENABLED,
            "primary_when_enabled": True,
            "fallback": "curated deterministic mappings",
            "confidence_method": "product identification + official source authority + investigator/verifier agreement",
        },
        "barcode_qr": True,
        "byo_header": "X-REGIQ-HF-Token",
        "reference_product_families": sorted(set(catalog.get("product_families", {}).keys()) | {"server", "data_storage_system", "ups", "sli_battery"}),
        "regulatory_catalog_version": catalog.get("catalog_version"),
        "principle": "REGIQ can ask an investigator LLM to screen the full verified regulatory corpus, then ask a verifier agent to challenge every finding. Deterministic category mappings remain as a safe fallback and benchmark.",
    }


@app.post("/api/scan/image")
async def scan_image(
    file: UploadFile = File(...),
    x_regiq_hf_token: str | None = Header(default=None, alias="X-REGIQ-HF-Token"),
):
    image_bytes = await file.read()
    content_type = file.content_type or "image/jpeg"
    raw_identification = await identify_product(image_bytes, hf_token_override=x_regiq_hf_token)
    identification = normalize_identification(raw_identification)

    agentic_profile = await investigate_regulation(identification, hf_token_override=x_regiq_hf_token)
    regulatory_profile = agentic_profile or complex_product_profile(identification) or regulatory_profile_for_product(identification)
    assessment_mode = "multi_agent" if agentic_profile else "deterministic_fallback"

    return {
        "filename": file.filename,
        "content_type": content_type,
        "identification": identification,
        "assessment_mode": assessment_mode,
        "regulatory_profile": regulatory_profile,
        "regulatory": {
            "status": regulatory_profile.get("status"),
            "label": regulatory_profile.get("headline"),
            "scope_note": regulatory_profile.get("summary"),
            "classification": "MULTI_AGENT_PROFILE" if agentic_profile else "MULTI_REGIME_PROFILE",
            "legal_basis": None,
            "source_url": None,
        },
        "discovery": {
            "status": "ready_for_source_discovery" if regulatory_profile.get("regimes") else "waiting_for_identification",
            "message": "REGIQ's current agentic mode investigates the verified regulatory corpus. Open-ended discovery of newly published acts is the next source-discovery layer.",
        },
    }


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
