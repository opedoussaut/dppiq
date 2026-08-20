from backend.vision import vision_configuration


def test_vision_defaults_to_open_weight_provider():
    config = vision_configuration()
    assert config["provider"] == "ollama"
    assert config["open_weight"] is True
    assert config["enabled"] is False


def test_default_local_vision_model_is_explicit():
    config = vision_configuration()
    assert config["model"] == "qwen3-vl:2b"
    assert config["base_url"].startswith("http://127.0.0.1:11434")


def test_huggingface_byo_is_not_enabled_by_default():
    config = vision_configuration()
    assert config["byo_hf_token_enabled"] is False
