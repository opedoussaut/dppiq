from __future__ import annotations

from typing import Any


CATEGORY_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("plastic_beverage_bottle", ("plastic beverage bottle", "water bottle", "soft drink bottle", "pet bottle", "beverage bottle")),
    ("smartphone", ("smartphone", "mobile phone", "cell phone", "iphone", "android phone")),
    ("laptop", ("laptop", "notebook computer", "notebook pc", "macbook")),
    ("wireless_headphones", ("wireless headphones", "bluetooth headphones", "headset", "earbuds", "airpods")),
    ("server", ("rack server", "blade server", "enterprise server", "computer server", "server chassis", "poweredge", "proliant", "thinksystem")),
    ("data_storage_system", ("storage array", "data storage system", "san array", "nas appliance", "storage server")),
    ("ups", ("uninterruptible power supply", "ups system", "ups battery backup")),
    ("sli_battery", ("car battery", "automotive battery", "starter battery", "starting battery", "sli battery", "12v lead acid", "12 v lead acid")),
    ("battery_ev", ("ev battery", "electric vehicle battery", "traction battery", "vehicle traction battery", "high voltage battery pack")),
    ("battery_industrial_gt_2kwh", ("stationary battery", "industrial battery", "energy storage battery", "battery energy storage", "bess battery")),
    ("power_bank", ("power bank", "portable charger", "battery pack")),
    ("household_battery", ("aa battery", "aaa battery", "button cell", "coin cell", "household battery", "portable battery")),
    ("led_lamp", ("led lamp", "led bulb", "light bulb", "led light", "lamp bulb")),
    ("power_tool", ("power drill", "cordless drill", "electric drill", "power tool", "angle grinder", "circular saw", "jigsaw")),
    ("textile_garment", ("t-shirt", "tshirt", "shirt", "jacket", "trousers", "pants", "sweater", "garment", "dress", "clothing")),
    ("electronic_toy", ("electronic toy", "toy robot", "remote control toy", "rc toy", "interactive toy")),
]

EXPLICIT_CATEGORIES = {
    "plastic_beverage_bottle", "smartphone", "laptop", "wireless_headphones", "power_bank",
    "household_battery", "led_lamp", "power_tool", "textile_garment", "electronic_toy",
    "battery_ev", "battery_lmt", "battery_industrial_gt_2kwh", "sli_battery",
    "server", "data_storage_system", "ups",
}


def normalize_identification(identification: dict[str, Any]) -> dict[str, Any]:
    if identification.get("status") != "identified":
        return identification

    result = dict(identification)
    original = str(result.get("category") or "").strip().lower()
    if original in EXPLICIT_CATEGORIES:
        result["regiq_category_normalization"] = {"changed": False, "original": original, "normalized": original}
        return result

    evidence = " ".join([
        str(result.get("product_type") or ""),
        str(result.get("brand") or ""),
        str(result.get("model") or ""),
        " ".join(str(x) for x in (result.get("visible_text") or [])),
    ]).lower()

    normalized = original or "other"
    for category, keywords in CATEGORY_KEYWORDS:
        if any(keyword in evidence for keyword in keywords):
            normalized = category
            break

    result["category"] = normalized
    result["regiq_category_normalization"] = {
        "changed": normalized != original,
        "original": original or None,
        "normalized": normalized,
        "basis": "visible product-type/text keyword normalization" if normalized != original else "vision category",
    }
    return result
