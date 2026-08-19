from __future__ import annotations

import base64
import json
import os
from typing import Any
from urllib.parse import quote

import httpx


OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
VISION_PROVIDER = os.getenv("REGIQ_VISION_PROVIDER", "ollama").lower()
VISION_MODEL = os.getenv("REGIQ_VISION_MODEL", "qwen3-vl:2b")
HF_MODEL = os.getenv("REGIQ_HF_MODEL", "auto")
HF_TOKEN = os.getenv("HF_TOKEN", "")
HF_ROUTER = "https://router.huggingface.co/v1"
HF_API = "https://huggingface.co/api/models"
VISION_ENABLED = os.getenv("REGIQ_VISION_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
ALLOW_BYO_HF_TOKEN = os.getenv("REGIQ_ALLOW_BYO_HF_TOKEN", "false").lower() in {"1", "true", "yes", "on"}
MODEL_LICENSE_OVERRIDE = os.getenv("REGIQ_MODEL_LICENSE", "").strip()
MODEL_SOURCE_OVERRIDE = os.getenv("REGIQ_MODEL_SOURCE_URL", "").strip()

VISION_PROMPT = """You are the product-identification component of REGIQ, an open-source product regulation intelligence system.
Identify the primary physical product in this image. Return ONLY valid JSON with these keys:
{
  "product_type": "short generic product type, e.g. smartphone or plastic beverage bottle",
  "category": "one of: plastic_beverage_bottle, smartphone, laptop, wireless_headphones, power_bank, household_battery, led_lamp, power_tool, textile_garment, electronic_toy, battery_ev, battery_lmt, battery_industrial_gt_2kwh, packaging, consumer_electronics, household_appliance, textile, footwear, tyre, battery_other, furniture, industrial_equipment, other",
  "brand": "brand if clearly visible, otherwise null",
  "model": "model or variant if clearly visible, otherwise null",
  "visible_text": ["important text seen on labels"],
  "confidence": 0.0,
  "reasoning_summary": "one short factual sentence about visible evidence"
}
Use the most specific category you can support from visible evidence. Do not infer legal obligations. Do not invent a brand or model. Confidence must be between 0 and 1.
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
        "server_token_configured": bool(HF_TOKEN) if VISION_PROVIDER == "huggingface" else False,
        "byo_hf_token_enabled": ALLOW_BYO_HF_TOKEN if VISION_PROVIDER == "huggingface" else False,
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


def _effective_hf_token(token_override: str | None) -> str:
    if token_override and ALLOW_BYO_HF_TOKEN:
        return token_override.strip()
    return HF_TOKEN


async def _discover_hf_vision_model(client: httpx.AsyncClient, token: str) -> tuple[str | None, dict[str, Any]]:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
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


async def _hf_model_provenance(client: httpx.AsyncClient, model: str, token: str) -> dict[str, Any]:
    provenance: dict[str, Any] = {
        "provider": "huggingface",
        "model": model,
        "source_url": MODEL_SOURCE_OVERRIDE or f"https://huggingface.co/{model}",
        "license": MODEL_LICENSE_OVERRIDE or None,
        "revision": None,
        "license_source": "deployment_override" if MODEL_LICENSE_OVERRIDE else "model_card_best_effort",
    }
    try:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        response = await client.get(f"{HF_API}/{quote(model, safe='/')}", headers=headers)
        if response.status_code < 400:
            metadata = response.json()
            card_data = metadata.get("cardData") or {}
            provenance["revision"] = metadata.get("sha")
            if not provenance["license"]:
                provenance["license"] = card_data.get("license") or metadata.get("license")
            provenance["pipeline_tag"] = metadata.get("pipeline_tag")
    except Exception:
        pass
    provenance["license"] = provenance["license"] or "unknown"
    return provenance


async def _identify_with_huggingface(image_bytes: bytes, token_override: str | None = None) -> dict[str, Any]:
    token = _effective_hf_token(token_override)
    if not token:
        return {
            "status": "vision_not_configured",
            "configuration": vision_configuration(),
            "message": "No Hugging Face token is available. Configure HF_TOKEN or use the optional BYO token flow if enabled.",
        }

    image_b64 = base64.b64encode(image_bytes).decode("ascii")
    image_url = f"data:image/jpeg;base64,{image_b64}"

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            discovery: dict[str, Any] = {}
            model = HF_MODEL
            if model == "auto":
                model, discovery = await _discover_hf_vision_model(client, token)
                if not model:
                    return {
                        "status": "vision_provider_unreachable",
                        "configuration": vision_configuration(),
                        "message": "Hugging Face returned no live image-capable chat model for this token/provider configuration.",
                        "discovery": discovery,
                    }

            payload = {
                "model": model,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": VISION_PROMPT},
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                }],
                "temperature": 0,
                "max_tokens": 500,
            }
            response = await client.post(
                f"{HF_ROUTER}/chat/completions",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
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
            provenance = await _hf_model_provenance(client, model, token)
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
            "model_provenance": provenance,
        }

    result["status"] = "identified"
    result["provider"] = "huggingface"
    result["model_used"] = model
    result["model_provenance"] = provenance
    result["discovery"] = discovery
    result["credential_source"] = "request_byo" if token_override and ALLOW_BYO_HF_TOKEN else "server_environment"
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
    result["model_provenance"] = {
        "provider": "ollama",
        "model": VISION_MODEL,
        "source_url": MODEL_SOURCE_OVERRIDE or None,
        "license": MODEL_LICENSE_OVERRIDE or "unknown",
        "revision": None,
        "license_source": "deployment_override" if MODEL_LICENSE_OVERRIDE else "not_resolved",
    }
    result["credential_source"] = "local"
    return result


async def identify_product(image_bytes: bytes, hf_token_override: str | None = None) -> dict[str, Any]:
    if not VISION_ENABLED:
        return {
            "status": "vision_not_configured",
            "configuration": vision_configuration(),
            "message": "Image capture is working, but visual identification is disabled.",
        }

    if VISION_PROVIDER == "huggingface":
        return await _identify_with_huggingface(image_bytes, hf_token_override)
    if VISION_PROVIDER == "ollama":
        return await _identify_with_ollama(image_bytes)

    return {
        "status": "vision_not_configured",
        "configuration": vision_configuration(),
        "message": f"Unknown vision provider: {VISION_PROVIDER}",
    }
