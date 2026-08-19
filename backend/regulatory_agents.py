from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parent.parent
CATALOG_PATH = ROOT / "data" / "regulatory_catalog.json"
HF_ROUTER = "https://router.huggingface.co/v1"
HF_TOKEN = os.getenv("HF_TOKEN", "")
AGENTIC_ENABLED = os.getenv("REGIQ_AGENTIC_REGULATION_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
INVESTIGATOR_MODEL = os.getenv("REGIQ_REGULATION_MODEL", "auto")
VERIFIER_MODEL = os.getenv("REGIQ_VERIFIER_MODEL", "auto")


def _catalog() -> dict[str, Any]:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def _extract_json(raw: str) -> dict[str, Any] | None:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(raw[start:end + 1])
            except json.JSONDecodeError:
                return None
    return None


async def _discover_text_model(client: httpx.AsyncClient, token: str) -> str | None:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    response = await client.get(f"{HF_ROUTER}/models", headers=headers)
    response.raise_for_status()
    payload = response.json()
    models = payload.get("data", []) if isinstance(payload, dict) else []
    candidates = []
    for model in models:
        arch = model.get("architecture") or {}
        inputs = set(arch.get("input_modalities") or [])
        outputs = set(arch.get("output_modalities") or [])
        live = any(p.get("status") == "live" for p in (model.get("providers") or []))
        if live and "text" in inputs and (not outputs or "text" in outputs):
            candidates.append(model.get("id"))
    preferred = ["qwen", "mistral", "llama", "gemma"]
    candidates = [c for c in candidates if c]
    candidates.sort(key=lambda mid: (next((i for i, f in enumerate(preferred) if f in mid.lower()), 99), mid))
    return candidates[0] if candidates else None


async def _chat(client: httpx.AsyncClient, token: str, model: str, prompt: str) -> dict[str, Any] | None:
    response = await client.post(
        f"{HF_ROUTER}/chat/completions",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": 0, "max_tokens": 2200},
    )
    if response.status_code >= 400:
        return None
    raw = response.json().get("choices", [{}])[0].get("message", {}).get("content", "")
    return _extract_json(raw)


def _compact_catalog() -> list[dict[str, Any]]:
    acts = _catalog().get("acts", {})
    return [
        {
            "id": act_id,
            "title": act.get("title"),
            "legal_basis": act.get("legal_basis"),
            "classification": act.get("classification"),
            "status": act.get("status"),
            "summary": act.get("summary"),
            "source_url": act.get("source_url"),
            "source_type": act.get("source_type"),
        }
        for act_id, act in acts.items()
    ]


def _confidence(identity_confidence: float, source_official: bool, verifier_state: str, applicability: str) -> float:
    agreement = 1.0 if verifier_state == "confirmed" else 0.55 if verifier_state == "needs_more_evidence" else 0.15
    specificity = {"applicable": 1.0, "likely": 0.8, "conditional": 0.58, "context": 0.4}.get(applicability, 0.45)
    value = 0.30 * max(0.0, min(identity_confidence, 1.0)) + 0.35 * agreement + 0.25 * (1.0 if source_official else 0.25) + 0.10 * specificity
    return round(max(0.0, min(value, 0.99)), 2)


async def investigate_regulation(identification: dict[str, Any], hf_token_override: str | None = None) -> dict[str, Any] | None:
    if not AGENTIC_ENABLED or identification.get("status") != "identified":
        return None
    token = (hf_token_override or HF_TOKEN).strip()
    if not token:
        return None

    catalog = _compact_catalog()
    product = {
        "product_type": identification.get("product_type"),
        "brand": identification.get("brand"),
        "model": identification.get("model"),
        "category": identification.get("category"),
        "visible_text": identification.get("visible_text") or [],
        "reasoning_summary": identification.get("reasoning_summary"),
    }
    investigator_prompt = f"""You are REGIQ's Regulatory Investigator Agent.
Your job is to screen a physical product against a VERIFIED regulatory corpus. Do not use regulations outside the supplied corpus and do not invent sources.

PRODUCT EVIDENCE:
{json.dumps(product, ensure_ascii=False)}

VERIFIED EU REGULATORY CORPUS:
{json.dumps(catalog, ensure_ascii=False)}

Return ONLY JSON:
{{
  "headline": "short screening conclusion",
  "summary": "2-3 factual sentences",
  "findings": [
    {{
      "act_id": "exact id from corpus",
      "applicability": "applicable|likely|conditional|context",
      "why": "why the act is relevant to this exact product",
      "obligations": ["short obligations or checks"],
      "missing_evidence": ["facts needed to strengthen or reject applicability"]
    }}
  ],
  "global_missing_evidence": ["important product facts not visible in the image"]
}}
Select only materially relevant acts. Prefer uncertainty over guessing.
"""

    async with httpx.AsyncClient(timeout=120.0) as client:
        investigator_model = INVESTIGATOR_MODEL
        if investigator_model == "auto":
            investigator_model = await _discover_text_model(client, token)
        if not investigator_model:
            return None
        investigation = await _chat(client, token, investigator_model, investigator_prompt)
        if not investigation:
            return None

        verifier_model = VERIFIER_MODEL
        if verifier_model == "auto":
            verifier_model = investigator_model
        verifier_prompt = f"""You are REGIQ's independent Regulatory Verifier Agent.
Challenge the investigator's findings using ONLY the supplied verified corpus and product evidence. Do not invent laws or sources.

PRODUCT:
{json.dumps(product, ensure_ascii=False)}
CORPUS:
{json.dumps(catalog, ensure_ascii=False)}
INVESTIGATOR FINDINGS:
{json.dumps(investigation, ensure_ascii=False)}

Return ONLY JSON:
{{"reviews":[{{"act_id":"exact act id","verdict":"confirmed|needs_more_evidence|rejected","reason":"brief reason"}}]}}
"""
        verification = await _chat(client, token, verifier_model, verifier_prompt) or {"reviews": []}

    act_map = {a["id"]: a for a in catalog}
    review_map = {r.get("act_id"): r for r in verification.get("reviews", []) if r.get("act_id")}
    regimes = []
    identity_conf = float(identification.get("confidence") or 0.0)
    for finding in investigation.get("findings", []):
        act_id = finding.get("act_id")
        act = act_map.get(act_id)
        if not act:
            continue
        review = review_map.get(act_id, {"verdict": "needs_more_evidence", "reason": "No independent verifier result."})
        if review.get("verdict") == "rejected":
            continue
        conf = _confidence(identity_conf, act.get("source_type") == "official_eur_lex", review.get("verdict", "needs_more_evidence"), finding.get("applicability", "conditional"))
        regimes.append({
            "id": act_id,
            "title": act.get("title"),
            "legal_basis": act.get("legal_basis"),
            "classification": act.get("classification"),
            "source_url": act.get("source_url"),
            "status": finding.get("applicability", "conditional"),
            "why": finding.get("why"),
            "obligations": finding.get("obligations") or [],
            "conditions": finding.get("missing_evidence") or [],
            "confidence": conf,
            "confidence_label": "high" if conf >= 0.8 else "medium" if conf >= 0.6 else "low",
            "verification": review,
            "source_authority": "official_eur_lex" if act.get("source_type") == "official_eur_lex" else act.get("source_type"),
        })

    if not regimes:
        return None
    overall = round(sum(r["confidence"] for r in regimes) / len(regimes), 2)
    return {
        "status": "agentic_assessment",
        "headline": investigation.get("headline") or "Agentic regulatory screening completed",
        "summary": investigation.get("summary") or "REGIQ screened the product against its verified regulatory corpus.",
        "regimes": sorted(regimes, key=lambda r: r["confidence"], reverse=True),
        "dpp": {"status": "investigation_required", "label": "Passport status derived from applicable acts", "explanation": "REGIQ does not infer a DPP merely from product category. Passport relevance must be supported by a verified legal act in the investigation."},
        "missing_evidence": investigation.get("global_missing_evidence") or [],
        "overall_confidence": overall,
        "overall_confidence_label": "high" if overall >= 0.8 else "medium" if overall >= 0.6 else "low",
        "investigation": {
            "mode": "multi_agent_verified_corpus",
            "investigator_model": investigator_model,
            "verifier_model": verifier_model,
            "corpus_scope": "verified REGIQ EU catalog",
            "limitation": "This mode investigates the verified catalog; open-ended discovery of new legal acts is a separate source-discovery stage.",
        },
        "disclaimer": "Confidence is computed by REGIQ from product-identification quality, source authority and independent-agent agreement. It is not the LLM's self-reported confidence and is not legal advice.",
    }
