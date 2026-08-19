from backend.category import normalize_identification
from backend.regulatory import regulatory_profile_for_product


def identified(category: str, product_type: str):
    return {
        "status": "identified",
        "category": category,
        "product_type": product_type,
        "visible_text": [],
        "confidence": 0.95,
    }


def test_reference_product_families_have_curated_profiles():
    families = {
        "plastic_beverage_bottle": "plastic beverage bottle",
        "smartphone": "smartphone",
        "laptop": "laptop",
        "wireless_headphones": "wireless headphones",
        "power_bank": "power bank",
        "household_battery": "AA household battery",
        "led_lamp": "LED lamp",
        "power_tool": "cordless power drill",
        "textile_garment": "cotton t-shirt",
        "electronic_toy": "electronic toy robot",
    }
    for category, product_type in families.items():
        profile = regulatory_profile_for_product(identified(category, product_type))
        assert profile["status"] == "assessed"
        assert profile["coverage"] == "reference_family"
        assert len(profile["regimes"]) >= 1
        assert all(r["source_url"].startswith("https://eur-lex.europa.eu/") for r in profile["regimes"])
        assert profile["catalog_verified_at"] == "2026-08-19"


def test_battery_passport_scope_is_not_overgeneralized():
    phone = regulatory_profile_for_product(identified("smartphone", "smartphone"))
    assert phone["dpp"]["status"] == "no_verified_current_obligation"

    ev = regulatory_profile_for_product(identified("battery_ev", "electric vehicle battery"))
    assert ev["dpp"]["status"] == "mandatory_from_future_date"
    assert ev["dpp"]["effective_date"] == "2027-02-18"


def test_toy_future_dpp_is_explicit():
    toy = regulatory_profile_for_product(identified("electronic_toy", "electronic toy"))
    assert toy["dpp"]["status"] == "future_sector_obligation"
    assert toy["dpp"]["effective_date"] == "2030-08-01"


def test_generic_vision_category_normalizes_to_specific_family():
    raw = {
        "status": "identified",
        "category": "consumer_electronics",
        "product_type": "Apple smartphone",
        "brand": "Apple",
        "model": None,
        "visible_text": [],
    }
    normalized = normalize_identification(raw)
    assert normalized["category"] == "smartphone"
    assert normalized["regiq_category_normalization"]["changed"] is True


def test_unknown_category_stays_explicitly_incomplete():
    profile = regulatory_profile_for_product(identified("other", "unclassified product"))
    assert profile["coverage"] == "fallback"
    assert profile["regimes"][0]["status"] == "screening_required"
