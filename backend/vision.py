from __future__ import annotations

import base64
import json
import os
from typing import Any

import httpx


OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
VISION_PROVIDER = os.getenv("REGIQ_VISION_PROVIDER", os.getenv("DPPIQ_VISION_PROVIDER", "ollama")).lower()
VISION_MODEL = os.getenv("REGIQ_VISION_MODEL", os.getenv("DPPIQ_VISION_MODEL", "qwen3-vl:2b"))
HF_MODEL = os.getenv("REGIQ_HF_MODEL", os.getenv("DPPIQ_HF_MODEL", "auto"))
HF_TOKEN = os.getenv("HF_TOKEN", "")
HF_ROUTER = "https://router.huggingface.co/v1"
VISION_ENABLED = os.getenv("REGIQ_VISION_ENABLED", os.getenv("DPPIQ_VISION_ENABLED", "false")).lower() in {"1", "true", "yes", "on"}

VISION_PROMPT = """You are the product-identification component of REGIQ, an open-source product regulation intelligence system.
Identify the primary physical product in this image. Return ONLY valid JSON with these keys:
{
  "product_type": "short generic product type, e.g. plastic beverage bottle",
  "category": "one of: plastic_beverage_bottle, packaging, consumer_electronics, household_appliance, power_tool, textile, footwear, tyre, battery_ev, battery_lmt, battery_industrial_gt_2kwh, battery_other, furniture, industrial_equipment, other",
  "brand": "brand if clearly visible, otherwise null",
  "model": "model or variant if clearly visible, otherwise null",
  "visible_text": ["important text seen on labels"],
  "confidence": 0.0,
  "reasoning_summary": "one short factual sentence about visible evidence"
}
Do not infer legal obligations. Do not invent a brand or model. Confidence must be between 0 and 1.
"""


def vision_configuration() -> dict[str, Any]:
    model = HF_MODEL if VISION_PROVIDER == "huggingface" else VISION_MODEL
    return {
        "enabled": VISION_ENABLED,
        "provider": VISION_PROVIDER,
        "model": model,
        "base_url": HF_ROUTER if VISION_PROVIDER == "huggingface" else OLLAMA_BASE_URL,
        "open_weight": True,
        "auto_model_selection": VISION_PROVIDER == "huggingface" and HF_MODEL == "auto",
    }


async def _discover_hf_vision_model(client: httpx.AsyncClient) -> tuple[str | None, dict[str, Any]]:
    headers = {"Authorization": f"Bearer {HF_TOKEN}"} if HF_TOKEN else {}
    response = await client.get(f"{HF_ROUTER}/models", headers=headers)
    response.raise_for_status()
    payload = response.json()
    models = payload.get("data", []) if isinstance(payload, dict) else []

    candidates: list[dict[str, Any]] = []
    for model in models:
        architecture = model.get("architecture") or {}
        modalities = set(architecture.get("input_modalities") or [])
        providers = [p for p in (model.get("providers") or []) if p.get("status") == "live"]
        if "image" in modalities and providers:
            candidates.append({"id": model.get("id"), "providers": providers, "architecture": architecture})

    preferred_fragments = ["qwen", "gemma", "aya", "glm", "vision"]
    candidates.sort(
        key=lambda item: (
            next((i for i, frag in enumerate(preferred_fragments) if frag in (item.get("id") or "").lower()), 99),
            item.get("id") or "",
        )
    )

    if not candidates:
        return None, {"count": 0, "candidates": []}

    chosen = candidates[0]
    return chosen["id"], {
        "count": len(candidates),
        "candidates": [c["id"] for c in candidates[:10]],
        "chosen_providers": [p.get("provider") for p in chosen["providers"]],
    }


def _extract_json(raw: str) -> dict[str, Any] | None:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(raw[start:end + 1])
            except json.JSONDecodeError:
                return None
        return None


async def _identify_with_huggingface(image_bytes: bytes) -> dict[str, Any]:
    if not HF_TOKEN:
        return {
            "status": "vision_not_configured",
            "configuration": vision_configuration(),
            "message": "HF_TOKEN is missing. Set a Hugging Face token with Inference Providers permission.",
        }

    image_b64 = base64.b64encode(image_bytes).decode("ascii")
    image_url = f"data:image/jpeg;base64,{image_b64}"

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            discovery: dict[str, Any] = {}
            model = HF_MODEL
            if model == "auto":
                model, discovery = await _discover_hf_vision_model(client)
                if not model:
                    return {
                        "status": "vision_provider_unreachable",
                        "configuration": vision_configuration(),
                        "message": "Hugging Face returned no live image-capable chat model for this token/provider configuration.",
                        "discovery": discovery,
                    }

            payload = {
                "model": model,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": VISION_PROMPT},
                            {"type": "image_url", "image_url": {"url": image_url}},
                        ],
                    }
                ],
                "temperature": 0,
                "max_tokens": 500,
            }
            response = await client.post(
                f"{HF_ROUTER}/chat/completions",
                headers={"Authorization": f"Bearer {HF_TOKEN}", "Content-Type": "application/json"},
                json=payload,
            )
            if response.status_code >= 400:
                return {
                    "status": "vision_provider_unreachable",
                    "configuration": vision_configuration(),
                    "message": f"Hugging Face returned HTTP {response.status_code}: {response.text[:1200]}",
                    "model_attempted": model,
                    "discovery": discovery,
                }
            body = response.json()
    except Exception as exc:
        return {
            "status": "vision_provider_unreachable",
            "configuration": vision_configuration(),
            "message": f"Could not reach Hugging Face Inference Providers: {exc}",
        }

    raw = body.get("choices", [{}])[0].get("message", {}).get("content", "")
    result = _extract_json(raw)
    if not result:
        return {
            "status": "vision_invalid_response",
            "configuration": vision_configuration(),
            "message": "The Hugging Face vision model did not return parseable JSON.",
            "raw": raw[:2000],
            "model_used": model,
        }

    result["status"] = "identified"
    result["provider"] = "huggingface"
    result["model_used"] = model
    result["discovery"] = discovery
    return result


async def _identify_with_ollama(image_bytes: bytes) -> dict[str, Any]:
    image_b64 = base64.b64encode(image_bytes).decode("ascii")
    payload = {
        "model": VISION_MODEL,
        "messages": [{"role": "user", "content": VISION_PROMPT, "images": [image_b64]}],
        "format": "json",
        "stream": False,
        "options": {"temperature": 0},
    }
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload)
            response.raise_for_status()
            body = response.json()
    except Exception as exc:
        return {
            "status": "vision_provider_unreachable",
            "configuration": vision_configuration(),
            "message": f"Could not reach the configured Ollama vision provider: {exc}",
        }

    raw = body.get("message", {}).get("content", "")
    result = _extract_json(raw)
    if not result:
        return {
            "status": "vision_invalid_response",
            "configuration": vision_configuration(),
            "message": "The Ollama vision model did not return valid JSON.",
            "raw": raw[:2000],
        }

    result["status"] = "identified"
    result["provider"] = "ollama"
    result["model_used"] = VISION_MODEL
    return result


async def identify_product(image_bytes: bytes) -> dict[str, Any]:
    if not VISION_ENABLED:
        return {
            "status": "vision_not_configured",
            "configuration": vision_configuration(),
            "message": "Image capture is working, but visual identification is disabled.",
        }

    if VISION_PROVIDER == "huggingface":
        return await _identify_with_huggingface(image_bytes)
    if VISION_PROVIDER == "ollama":
        return await _identify_with_ollama(image_bytes)

    return {
        "status": "vision_not_configured",
        "configuration": vision_configuration(),
        "message": f"Unknown vision provider: {VISION_PROVIDER}",
    }


def regulatory_status_for_category(category: str | None) -> dict[str, Any]:
    if not category:
        return {
            "status": "not_assessed",
            "label": "Regulatory status not assessed",
            "legal_basis": None,
            "effective_date": None,
            "source_url": None,
            "scope_note": "REGIQ must identify the product category before assessing potentially applicable regulatory regimes.",
            "classification": "NOT_ASSESSED",
        }

    if category in {"battery_ev", "battery_lmt", "battery_industrial_gt_2kwh"}:
        return {
            "status": "mandatory_from_future_date",
            "label": "Battery passport required from 18 February 2027",
            "legal_basis": "Regulation (EU) 2023/1542, Article 77",
            "effective_date": "2027-02-18",
            "source_url": "https://eur-lex.europa.eu/eli/reg/2023/1542/oj",
            "scope_note": "Applies to LMT batteries, electric vehicle batteries and industrial batteries with capacity above 2 kWh.",
            "classification": "EU_REQUIRED",
        }

    return {
        "status": "no_product_specific_rule_identified",
        "label": "No product-specific DPP obligation identified in the current REGIQ knowledge base",
        "legal_basis": "Regulation (EU) 2024/1781 establishes the DPP framework; product-specific obligations require applicable product rules.",
        "effective_date": None,
        "source_url": "https://eur-lex.europa.eu/eli/reg/2024/1781/oj",
        "scope_note": "This is not a claim that no regulation applies. REGIQ's current knowledge base is still narrow and must be expanded across additional regulatory regimes.",
        "classification": "EU_FRAMEWORK",
    }
