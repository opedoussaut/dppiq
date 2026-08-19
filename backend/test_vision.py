from backend.vision import regulatory_status_for_category, vision_configuration


def test_battery_passport_scope_mapping():
    result = regulatory_status_for_category("battery_ev")
    assert result["status"] == "mandatory_from_future_date"
    assert result["effective_date"] == "2027-02-18"
    assert result["classification"] == "EU_REQUIRED"


def test_unknown_product_does_not_invent_obligation():
    result = regulatory_status_for_category("power_tool")
    assert result["status"] == "no_product_specific_rule_identified"
    assert result["classification"] == "EU_FRAMEWORK"


def test_vision_defaults_to_open_weight_provider():
    config = vision_configuration()
    assert config["provider"] == "ollama"
    assert config["open_weight"] is True
