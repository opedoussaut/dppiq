from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .engine import compare_regulation_versions, evaluate_candidate_generation, evaluate_passport
from .regulatory import regulatory_profile_for_product
from .vision import identify_product, vision_configuration

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

app = FastAPI(title="REGIQ API", version="0.6.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/api/health")
def health():
    return {"status": "ok", "name": "REGIQ", "version": "0.6.0"}


@app.get("/api/passport")
def passport():
    return load_json(DATA / "sample_passport.json")


@app.get("/api/intelligence")
def intelligence():
    return evaluate_passport(
        load_json(DATA / "sample_passport.json"),
        load_json(DATA / "regulatory_reference.json"),
    )


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
    return {
        "vision": vision_configuration(),
        "camera_capture": True,
        "barcode_qr": True,
        "principle": "REGIQ identifies the product first, then maps multiple potentially applicable regulatory regimes. DPP is only one possible regime.",
    }


@app.post("/api/scan/image")
async def scan_image(file: UploadFile = File(...)):
    image_bytes = await file.read()
    content_type = file.content_type or "image/jpeg"
    identification = await identify_product(image_bytes)
    regulatory_profile = regulatory_profile_for_product(identification)

    return {
        "filename": file.filename,
        "content_type": content_type,
        "identification": identification,
        "regulatory_profile": regulatory_profile,
        "regulatory": {
            "status": regulatory_profile.get("status"),
            "label": regulatory_profile.get("headline"),
            "scope_note": regulatory_profile.get("summary"),
            "classification": "MULTI_REGIME_PROFILE",
            "legal_basis": None,
            "source_url": None,
        },
        "discovery": {
            "status": "ready_for_source_discovery" if regulatory_profile.get("regimes") else "waiting_for_identification",
            "message": "REGIQ maps authoritative regulatory sources first. Digital Product Passport discovery is performed only where the applicable regime calls for it.",
        },
    }
