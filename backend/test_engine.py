from backend.engine import compare_regulation_versions, evaluate_candidate_generation, evaluate_passport


def test_passport_readiness_and_iq():
    passport = {
        "identity": {"product_id": "X"},
        "materials": [{"name": "Aluminium"}],
        "repair": {"spare_parts_available_years": 6},
        "circularity": {
            "recycled_content_percent": 30,
            "disassembly_instructions": "Unscrew enclosure",
        },
        "evidence": [{"type": "bom"}, {"type": "repair_manual"}],
    }
    result = evaluate_passport(passport)
    assert result["regulatory_readiness"] == 100
    assert result["overall_iq"] > 0
    assert result["gaps"] == []


def test_regulation_change_detection():
    old = {"version": "1", "requirements": [{"id": "A", "field": "a"}]}
    new = {
        "version": "2",
        "requirements": [
            {"id": "A", "field": "a2"},
            {"id": "B", "field": "b"},
        ],
    }
    result = compare_regulation_versions(old, new)
    assert len(result["added"]) == 1
    assert len(result["changed"]) == 1
    assert result["removed"] == []


def test_evolution_requires_all_guardrails():
    candidate = {
        "candidate": "g2",
        "baseline": {
            "requirement_mapping_accuracy": 0.8,
            "evidence_precision": 0.8,
            "false_compliance_rate": 0.1,
        },
        "proposal": {
            "requirement_mapping_accuracy": 0.9,
            "evidence_precision": 0.9,
            "false_compliance_rate": 0.05,
        },
    }
    assert evaluate_candidate_generation(candidate)["decision"] == "promote"

    candidate["proposal"]["false_compliance_rate"] = 0.12
    assert evaluate_candidate_generation(candidate)["decision"] == "reject"
