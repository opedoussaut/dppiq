from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .engine import compare_regulation_versions, evaluate_candidate_generation, evaluate_passport

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

app = FastAPI(title="DPPIQ API", version="0.2.0")
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
    return {"status": "ok", "name": "DPPIQ", "version": "0.2.0"}


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
