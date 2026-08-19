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
AGENTIC_ENABLED = os.getenv("REGIQ_AGENTIC_REGULATION_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
ALLOW_BYO_HF_TOKEN = os.getenv("REGIQ_ALLOW_BYO_HF_TOKEN", "false").lower() in {"1", "true", "yes", "on"}
INVESTIGATOR_MODEL = os.getenv("REGIQ_REGULATION_MODEL", "auto")
VERIFIER_MODEL = os.getenv("REGIQ_VERIFIER_MODEL", "auto")


def regulation_agent_configuration() -> dict[str, Any]:
    return {
        "enabled": AGENTIC_ENABLED,
        "provider": "huggingface",
        "investigator_model": INVESTIGATOR_MODEL,
        "verifier_model": VERIFIER_MODEL,
        "server_token_configured": bool(HF_TOKEN),
        "byo_token_enabled": ALLOW_BYO_HF_TOKEN,
        "confidence_method": "deterministic evidence-weighted score",
    }


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


def _effective_token(token_override: str | None) -> str:
    if token_override and ALLOW_BYO_HF_TOKEN:
        return token_override.strip()
    return HF_TOKEN.strip()


async def _discover_text_model(client: httpx.AsyncClient, token: str) -> str | None:
    response = await client.get(f"{HF_ROUTER}/models", headers={"Authorization": f"Bearer {token}"})
    response.raise_for_status()
    payload = response.json()
    models = payload.get("data", []) if isinstance(payload, dict) else []
    candidates: list[str] = []
    for model in models:
        arch = model.get("architecture") or {}
        inputs = set(arch.get("input_modalities") or [])
        outputs = set(arch.get("output_modalities") or [])
        live = any(p.get("status") == "live" for p in (model.get("providers") or []))
        if live and (not inputs or "text" in inputs) and (not outputs or "text" in outputs):
            model_id = model.get("id")
            if model_id:
                candidates.append(model_id)
    preferred = ["qwen", "mistral", "llama", "gemma", "deepseek"]
    candidates.sort(key=lambda mid: (next((i for i, f in enumerate(preferred) if f in mid.lower()), 99), mid))
    return candidates[0] if candidates else None


async def _chat(client: httpx.AsyncClient, token: str, model: str, prompt: str, max_tokens: int = 2200) -> dict[str, Any] | None:
    response = await client.post(
        f"{HF_ROUTER}/chat/completions",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": 0, "max_tokens": max_tokens},
    )
    if response.status_code >= 400:
        return None
    raw = response.json().get("choices", [{}])[0].get("message", {}).get("content", "")
    return _extract_json(raw)


def _compact_catalog() -> list[dict[str, Any]]:
    acts = _catalog().get("acts", {})
    return [{
        "id": act_id,
        "title": act.get("title"),
        "legal_basis": act.get("legal_basis"),
        "classification": act.get("classification"),
        "status": act.get("status"),
        "summary": act.get("summary"),
        "source_url": act.get("source_url"),
        "source_type": act.get("source_type"),
    } for act_id, act in acts.items()]


def _confidence(identity_confidence: float, source_official: bool, verifier_state: str, applicability: str, missing_count: int) -> int:
    identity = max(0.0, min(float(identity_confidence or 0.0), 1.0))
    agreement = 1.0 if verifier_state == "confirmed" else 0.62 if verifier_state == "needs_more_evidence" else 0.2
    specificity = {"applicable": 1.0, "likely": 0.82, "conditional": 0.62, "upcoming": 0.78, "context": 0.48}.get(applicability, 0.5)
    completeness = max(0.55, 1.0 - 0.08 * missing_count)
    value = (0.28 * identity + 0.27 * agreement + 0.30 * (1.0 if source_official else 0.45) + 0.15 * specificity) * completeness
    return max(1, min(99, round(value * 100)))


def _confidence_label(score: int) -> str:
    return "high" if score >= 85 else "medium" if score >= 65 else "low"


def _dpp_summary(regimes: list[dict[str, Any]]) -> dict[str, Any]:
    explicit = [r for r in regimes if any(term in ((r.get("title") or "") + " " + " ".join(r.get("obligations") or [])).lower() for term in ["digital product passport", "battery passport", "passport"])]
    if explicit:
        best = max(explicit, key=lambda r: r.get("confidence", 0))
        return {"status": "investigated", "label": "Passport relevance found", "explanation": f"Passport relevance is supported by {best['title']} with {best.get('confidence', 0)}% REGIQ confidence. Check scope and application dates."}
    return {"status": "not_identified", "label": "No passport requirement identified", "explanation": "The investigator found no supported product-specific passport requirement in the verified corpus for the available evidence."}


async def investigate_regulation(identification: dict[str, Any], hf_token_override: str | None = None) -> dict[str, Any] | None:
    if not AGENTIC_ENABLED or identification.get("status") != "identified":
        return None
    token = _effective_token(hf_token_override)
    if not token:
        return None

    catalog = _compact_catalog()
    product = {
        "product_type": identification.get("product_type"),
        "brand": identification.get("brand"),
        "model": identification.get("model"),
        "visible_text": identification.get("visible_text") or [],
        "reasoning_summary": identification.get("reasoning_summary"),
        "vision_category": identification.get("category"),
    }
    investigator_prompt = f"""You are REGIQ's Regulatory Investigator Agent.
Investigate a physical product against the complete VERIFIED EU regulatory corpus below. Do not classify it by a predefined product-family lookup table. Evaluate the evidence directly.

STRICT RULES:
- Use ONLY act IDs present in the supplied corpus.
- Never invent regulations, URLs, articles, dates, thresholds or DPP requirements.
- Missing product facts must produce a conditional finding or a missing-evidence question, not a guess.
- Select only materially relevant acts.
- Do NOT give yourself a numeric confidence score.

PRODUCT EVIDENCE:
{json.dumps(product, ensure_ascii=False)}

VERIFIED EU REGULATORY CORPUS:
{json.dumps(catalog, ensure_ascii=False)}

Return ONLY JSON:
{{
  "headline":"short screening conclusion",
  "summary":"2-3 factual sentences",
  "findings":[{{
    "act_id":"exact id from corpus",
    "applicability":"applicable|likely|conditional|upcoming|context",
    "why":"why the act is relevant to this exact product",
    "obligations":["high-level obligations/checks supported by the corpus"],
    "missing_evidence":["facts needed to strengthen or reject applicability"]
  }}],
  "global_missing_evidence":["highest-value product facts/specifications still needed"]
}}
"""

    try:
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
Challenge the investigator's findings using ONLY the verified corpus and visible product evidence. Be skeptical. Reject findings that require unsupported assumptions.
Do NOT add new regulations and do NOT provide numeric confidence.

PRODUCT:
{json.dumps(product, ensure_ascii=False)}
CORPUS:
{json.dumps(catalog, ensure_ascii=False)}
INVESTIGATOR FINDINGS:
{json.dumps(investigation, ensure_ascii=False)}

Return ONLY JSON:
{{"reviews":[{{"act_id":"exact act id","verdict":"confirmed|needs_more_evidence|rejected","reason":"brief factual critique"}}],"overall_note":"brief verification note"}}
"""
            verification = await _chat(client, token, verifier_model, verifier_prompt, max_tokens=1400) or {"reviews": [], "overall_note": "Verifier response unavailable."}
    except Exception:
        return None

    act_map = {a["id"]: a for a in catalog}
    review_map = {r.get("act_id"): r for r in verification.get("reviews", []) if r.get("act_id")}
    regimes: list[dict[str, Any]] = []
    identity_conf = float(identification.get("confidence") or 0.0)
    for finding in investigation.get("findings", []):
        act_id = finding.get("act_id")
        act = act_map.get(act_id)
        if not act:
            continue
        review = review_map.get(act_id, {"verdict": "needs_more_evidence", "reason": "No independent verifier verdict."})
        if review.get("verdict") == "rejected":
            continue
        missing = finding.get("missing_evidence") or []
        score = _confidence(identity_conf, act.get("source_type") == "official_eur_lex", review.get("verdict", "needs_more_evidence"), finding.get("applicability", "conditional"), len(missing))
        regimes.append({
            "id": act_id,
            "title": act.get("title"),
            "legal_basis": act.get("legal_basis"),
            "classification": act.get("classification"),
            "source_url": act.get("source_url"),
            "status": finding.get("applicability", "conditional"),
            "why": finding.get("why"),
            "obligations": finding.get("obligations") or [],
            "conditions": missing,
            "confidence": score,
            "confidence_label": _confidence_label(score),
            "verification": review.get("verdict"),
            "verification_note": review.get("reason"),
            "source_authority": "official_eur_lex" if act.get("source_type") == "official_eur_lex" else act.get("source_type"),
        })

    if not regimes:
        return None
    regimes.sort(key=lambda r: r["confidence"], reverse=True)
    overall = round(sum(r["confidence"] for r in regimes) / len(regimes))
    return {
        "status": "agentic_assessment",
        "headline": investigation.get("headline") or "Agentic regulatory screening completed",
        "summary": investigation.get("summary") or "REGIQ screened the product against its verified regulatory corpus.",
        "regimes": regimes,
        "dpp": _dpp_summary(regimes),
        "missing_evidence": investigation.get("global_missing_evidence") or [],
        "overall_confidence": overall,
        "overall_confidence_label": _confidence_label(overall),
        "investigation": {
            "mode": "multi_agent_verified_corpus",
            "investigator_model": investigator_model,
            "verifier_model": verifier_model,
            "verifier_note": verification.get("overall_note"),
            "corpus_scope": "verified REGIQ EU catalog",
        },
        "disclaimer": "REGIQ confidence is computed from identity quality, official-source authority, applicability specificity, missing evidence and independent-agent agreement. It is not an LLM self-rating and is not legal advice.",
    }
