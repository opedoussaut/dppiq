from __future__ import annotations

import base64
import json
import os
from typing import Any

import httpx


OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
VISION_MODEL = os.getenv("DPPIQ_VISION_MODEL", "qwen3-vl:2b")
VISION_ENABLED = os.getenv("DPPIQ_VISION_ENABLED", "false").lower() in {"1", "true", "yes", "on"}

VISION_PROMPT = """You are the product-identification component of DPPIQ.
Identify the physical product in this image. Return ONLY valid JSON with these keys:
{
  "product_type": "short generic product type",
  "category": "one of: consumer_electronics, household_appliance, power_tool, textile, footwear, tyre, battery_ev, battery_lmt, battery_industrial_gt_2kwh, battery_other, furniture, industrial_equipment, other",
  "brand": "brand if visible, otherwise null",
  "model": "model if visible, otherwise null",
  "visible_text": ["important text seen on labels"],
  "confidence": 0.0,
  "reasoning_summary": "one short factual sentence about visible evidence"
}
Do not infer legal obligations. Do not invent a model or brand. Confidence must be between 0 and 1.
"""


def vision_configuration() -> dict[str, Any]:
    return {
        "enabled": VISION_ENABLED,
        "provider": "ollama",
        "model": VISION_MODEL,
        "base_url": OLLAMA_BASE_URL,
        "open_weight": True,
    }


async def identify_product(image_bytes: bytes) -> dict[str, Any]:
    if not VISION_ENABLED:
        return {
            "status": "vision_not_configured",
            "configuration": vision_configuration(),
            "message": (
                "Image capture is working, but open-weight visual identification is disabled. "
                "Set DPPIQ_VISION_ENABLED=true and run an Ollama vision model to enable it."
            ),
        }

    image_b64 = base64.b64encode(image_bytes).decode("ascii")
    payload = {
        "model": VISION_MODEL,
        "messages": [
            {
                "role": "user",
                "content": VISION_PROMPT,
                "images": [image_b64],
            }
        ],
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
    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        return {
            "status": "vision_invalid_response",
            "configuration": vision_configuration(),
            "message": "The vision model did not return valid JSON.",
            "raw": raw[:2000],
        }

    result["status"] = "identified"
    result["provider"] = "ollama"
    result["model_used"] = VISION_MODEL
    return result


def regulatory_status_for_category(category: str | None) -> dict[str, Any]:
    category = category or "other"

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
        "scope_note": (
            "This is not a statement that the product is excluded from future DPP rules. "
            "DPPIQ must match the product against applicable delegated acts or sector legislation."
        ),
        "classification": "EU_FRAMEWORK",
    }
