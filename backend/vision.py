from __future__ import annotations

import base64
import json
import os
import re
from typing import Any

import httpx


VISION_PROVIDER = os.getenv("DPPIQ_VISION_PROVIDER", "huggingface").lower()
VISION_ENABLED = os.getenv("DPPIQ_VISION_ENABLED", "false").lower() in {"1", "true", "yes", "on"}

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("DPPIQ_OLLAMA_MODEL", os.getenv("DPPIQ_VISION_MODEL", "qwen3-vl:2b"))

HF_BASE_URL = os.getenv("HF_BASE_URL", "https://router.huggingface.co/v1").rstrip("/")
HF_TOKEN = os.getenv("HF_TOKEN", "")
HF_MODEL = os.getenv("DPPIQ_HF_MODEL", "Qwen/Qwen2.5-VL-7B-Instruct")

VISION_PROMPT = """You are the product-identification component of DPPIQ.
Identify the main physical product in this image. Return ONLY valid JSON with these keys:
{
  "product_type": "short generic product type",
  "category": "one of: plastic_beverage_bottle, packaging, consumer_electronics, household_appliance, power_tool, textile, footwear, tyre, battery_ev, battery_lmt, battery_industrial_gt_2kwh, battery_other, furniture, industrial_equipment, other",
  "brand": "brand if clearly visible, otherwise null",
  "model": "model or variant if clearly visible, otherwise null",
  "visible_text": ["important text visibly present on labels"],
  "materials_observed": ["materials that are visually plausible; do not claim certainty"],
  "confidence": 0.0,
  "reasoning_summary": "one short factual sentence describing the visible evidence"
}
Examples: a PET water/soda bottle should normally be product_type 'plastic beverage bottle' and category 'plastic_beverage_bottle'.
Do not infer legal obligations. Do not invent a brand, model, barcode, material grade or composition. Confidence must be between 0 and 1.
"""


def vision_configuration() -> dict[str, Any]:
    model = HF_MODEL if VISION_PROVIDER == "huggingface" else OLLAMA_MODEL
    return {
        "enabled": VISION_ENABLED,
        "provider": VISION_PROVIDER,
        "model": model,
        "open_weight": True,
        "remote": VISION_PROVIDER == "huggingface",
        "token_configured": bool(HF_TOKEN) if VISION_PROVIDER == "huggingface" else None,
    }


def _parse_json_text(raw: str) -> dict[str, Any] | None:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.S)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
    return None


async def _identify_huggingface(image_bytes: bytes, mime_type: str) -> dict[str, Any]:
    if not HF_TOKEN:
        return {
            "status": "vision_not_configured",
            "configuration": vision_configuration(),
            "message": "Hugging Face vision is selected but HF_TOKEN is not configured.",
        }

    image_b64 = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{mime_type};base64,{image_b64}"
    payload = {
        "model": HF_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": VISION_PROMPT},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
        "temperature": 0,
        "max_tokens": 700,
    }
    headers = {"Authorization": f"Bearer {HF_TOKEN}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(f"{HF_BASE_URL}/chat/completions", headers=headers, json=payload)
            response.raise_for_status()
            body = response.json()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text[:800]
        return {
            "status": "vision_provider_unreachable",
            "configuration": vision_configuration(),
            "message": f"Hugging Face returned HTTP {exc.response.status_code}: {detail}",
        }
    except Exception as exc:
        return {
            "status": "vision_provider_unreachable",
            "configuration": vision_configuration(),
            "message": f"Could not reach Hugging Face Inference Providers: {exc}",
        }

    raw = body.get("choices", [{}])[0].get("message", {}).get("content", "")
    result = _parse_json_text(raw)
    if result is None:
        return {
            "status": "vision_invalid_response",
            "configuration": vision_configuration(),
            "message": "The Hugging Face vision model did not return valid JSON.",
            "raw": raw[:2000],
        }

    result["status"] = "identified"
    result["provider"] = "huggingface"
    result["model_used"] = HF_MODEL
    return result


async def _identify_ollama(image_bytes: bytes) -> dict[str, Any]:
    image_b64 = base64.b64encode(image_bytes).decode("ascii")
    payload = {
        "model": OLLAMA_MODEL,
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
    result = _parse_json_text(raw)
    if result is None:
        return {
            "status": "vision_invalid_response",
            "configuration": vision_configuration(),
            "message": "The Ollama vision model did not return valid JSON.",
            "raw": raw[:2000],
        }
    result["status"] = "identified"
    result["provider"] = "ollama"
    result["model_used"] = OLLAMA_MODEL
    return result


async def identify_product(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict[str, Any]:
    if not VISION_ENABLED:
        return {
            "status": "vision_not_configured",
            "configuration": vision_configuration(),
            "message": "Image capture works, but visual identification is disabled. Set DPPIQ_VISION_ENABLED=true.",
        }
    if VISION_PROVIDER == "huggingface":
        return await _identify_huggingface(image_bytes, mime_type)
    if VISION_PROVIDER == "ollama":
        return await _identify_ollama(image_bytes)
    return {
        "status": "vision_not_configured",
        "configuration": vision_configuration(),
        "message": f"Unsupported vision provider: {VISION_PROVIDER}",
    }


def regulatory_status_for_category(category: str | None) -> dict[str, Any]:
    if not category:
        return {
            "status": "not_assessed",
            "label": "Regulatory status not assessed",
            "legal_basis": None,
            "effective_date": None,
            "source_url": None,
            "scope_note": "DPPIQ must identify the product category before assessing applicable DPP rules.",
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
        "label": "No product-specific DPP obligation identified by this DPPIQ prototype",
        "legal_basis": "Regulation (EU) 2024/1781 establishes the DPP framework; product-specific obligations require applicable product rules.",
        "effective_date": None,
        "source_url": "https://eur-lex.europa.eu/eli/reg/2024/1781/oj",
        "scope_note": "This is not a statement that the product is excluded from future DPP rules. DPPIQ must match the product against applicable delegated acts or sector legislation.",
        "classification": "EU_FRAMEWORK",
    }
