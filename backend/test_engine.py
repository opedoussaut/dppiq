from backend.engine import compare_regulation_versions, evaluate_candidate_generation, evaluate_product_record


REFERENCE = {
    "reference_id": "EU-ESPR-DPP-2024-1781",
    "legal_basis": "Regulation (EU) 2024/1781",
    "status": "in_force",
    "last_verified_by_regiq": "2026-08-19",
    "authoritative_source": {"url": "https://eur-lex.europa.eu/eli/reg/2024/1781/oj"},
    "commission_reference": {"url": "https://single-market-economy.ec.europa.eu/single-market/digital-product-passport_en"},
    "scope_note": "test",
    "provisions": [
        {"id": "A10-ID", "classification": "EU_FRAMEWORK", "article": "10(1)(a)", "title": "Unique ID", "evaluation": "presence", "field": "identity.product_id"},
        {"id": "A10-OPEN", "classification": "EU_FRAMEWORK", "article": "10(1)(d)", "title": "Open data", "evaluation": "boolean", "field": "dpp.open_interoperable"},
        {"id": "A9-SPEC", "classification": "PRODUCT_SPECIFIC", "article": "9(2)", "title": "Specific act", "evaluation": "applicability", "field": None},
    ],
}


def test_product_record_framework_readiness_and_iq():
    product_record = {
        "identity": {"product_id": "X"},
        "dpp": {"open_interoperable": True},
        "repair": {"spare_parts_available_years": 6},
        "circularity": {"recycled_content_percent": 30, "disassembly_instructions": "Unscrew enclosure"},
        "evidence": [{"type": "bom"}, {"type": "repair_manual"}],
        "legal_applicability": {"product_specific_dpp_obligation_identified": False},
    }
    result = evaluate_product_record(product_record, REFERENCE)
    assert result["framework_readiness"] == 100
    assert result["overall_iq"] > 0
    assert result["legal_conclusion"] == "none"
    assert result["score_classification"] == "REGIQ_INTELLIGENCE"
    assert [r for r in result["requirements"] if r["classification"] == "PRODUCT_SPECIFIC"][0]["status"] == "not_asserted"


def test_regulation_change_detection():
    old = {"version": "1", "requirements": [{"id": "A", "field": "a"}]}
    new = {"version": "2", "requirements": [{"id": "A", "field": "a2"}, {"id": "B", "field": "b"}]}
    result = compare_regulation_versions(old, new)
    assert len(result["added"]) == 1
    assert len(result["changed"]) == 1
    assert result["removed"] == []
    assert result["classification"] == "REGIQ_SIMULATION"


def test_evolution_requires_all_guardrails():
    candidate = {
        "candidate": "g2",
        "baseline": {"requirement_mapping_accuracy": 0.8, "evidence_precision": 0.8, "false_compliance_rate": 0.1},
        "proposal": {"requirement_mapping_accuracy": 0.9, "evidence_precision": 0.9, "false_compliance_rate": 0.05},
    }
    assert evaluate_candidate_generation(candidate)["decision"] == "promote"
    candidate["proposal"]["false_compliance_rate"] = 0.12
    assert evaluate_candidate_generation(candidate)["decision"] == "reject"
