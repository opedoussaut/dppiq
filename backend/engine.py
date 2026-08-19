from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class RequirementResult:
    requirement_id: str
    title: str
    status: str
    score: int | None
    field: str | None
    rationale: str
    source: str
    article: str | None
    classification: str


def _read_path(payload: dict[str, Any], path: str | None) -> Any:
    if not path:
        return None
    value: Any = payload
    for part in path.split("."):
        if not isinstance(value, dict) or part not in value:
            return None
        value = value[part]
    return value


def _evaluate_requirement(passport: dict[str, Any], req: dict[str, Any]) -> RequirementResult:
    classification = req.get("classification", "EU_FRAMEWORK")
    mode = req.get("evaluation", "presence")
    field = req.get("field")
    source = f"Regulation (EU) 2024/1781, Article {req.get('article')}" if req.get("article") else "Regulation (EU) 2024/1781"

    if classification == "PRODUCT_SPECIFIC" or mode == "applicability":
        identified = passport.get("legal_applicability", {}).get("product_specific_dpp_obligation_identified", False)
        if identified:
            status, score = "applicable", None
            rationale = "A product-specific legal basis has been identified and must be evaluated separately."
        else:
            status, score = "not_asserted", None
            rationale = "No applicable product-specific delegated or sector act is asserted for this demo product. DPPIQ does not turn the horizontal ESPR framework into a product-specific legal obligation."
    else:
        value = _read_path(passport, field)
        missing = value is None or value == "" or value == [] or value is False
        if missing:
            status, score = "gap", 0
            rationale = f"No supporting product/system value found at {field}."
        else:
            status, score = "ready", 100
            rationale = f"Supporting product/system value is present at {field}. This is a readiness check, not a legal compliance opinion."

    return RequirementResult(
        requirement_id=req["id"],
        title=req["title"],
        status=status,
        score=score,
        field=field,
        rationale=rationale,
        source=source,
        article=req.get("article"),
        classification=classification,
    )


def evaluate_passport(passport: dict[str, Any], regulatory_reference: dict[str, Any]) -> dict[str, Any]:
    results = [_evaluate_requirement(passport, req) for req in regulatory_reference.get("provisions", [])]
    scored = [r.score for r in results if r.score is not None]
    readiness = round(sum(scored) / len(scored)) if scored else 0

    evidence = passport.get("evidence", [])
    evidence_quality = min(100, 40 + len(evidence) * 15)
    circularity = passport.get("circularity", {})
    circularity_score = round(
        min(
            100,
            (circularity.get("recycled_content_percent", 0) * 0.7)
            + (25 if circularity.get("disassembly_instructions") else 0)
            + (25 if passport.get("repair", {}).get("spare_parts_available_years", 0) >= 5 else 0),
        )
    )

    # DPPIQ intelligence score: explicitly not an EU regulatory score.
    overall_iq = round((readiness * 0.5) + (evidence_quality * 0.25) + (circularity_score * 0.25))

    return {
        "product_id": passport.get("identity", {}).get("product_id", "unknown"),
        "framework_readiness": readiness,
        "regulatory_readiness": readiness,
        "evidence_quality": evidence_quality,
        "circularity_readiness": circularity_score,
        "overall_iq": overall_iq,
        "score_classification": "DPPIQ_INTELLIGENCE",
        "legal_conclusion": "none",
        "requirements": [r.__dict__ for r in results],
        "gaps": [r.__dict__ for r in results if r.status == "gap"],
        "applicability": passport.get("legal_applicability", {}),
        "regulatory_reference": {
            "reference_id": regulatory_reference.get("reference_id"),
            "legal_basis": regulatory_reference.get("legal_basis"),
            "status": regulatory_reference.get("status"),
            "last_verified_by_dppiq": regulatory_reference.get("last_verified_by_dppiq"),
            "authoritative_source": regulatory_reference.get("authoritative_source"),
            "commission_reference": regulatory_reference.get("commission_reference"),
            "scope_note": regulatory_reference.get("scope_note"),
        },
    }


def compare_regulation_versions(old: dict[str, Any], new: dict[str, Any]) -> dict[str, Any]:
    old_rules = {r["id"]: r for r in old.get("requirements", [])}
    new_rules = {r["id"]: r for r in new.get("requirements", [])}

    added = [new_rules[k] for k in new_rules.keys() - old_rules.keys()]
    removed = [old_rules[k] for k in old_rules.keys() - new_rules.keys()]
    changed = []
    for key in old_rules.keys() & new_rules.keys():
        if old_rules[key] != new_rules[key]:
            changed.append({"before": old_rules[key], "after": new_rules[key]})

    return {
        "from_version": old.get("version"),
        "to_version": new.get("version"),
        "added": added,
        "removed": removed,
        "changed": changed,
        "summary": f"{len(added)} added, {len(changed)} changed, {len(removed)} removed",
        "classification": "DPPIQ_SIMULATION",
        "note": "Illustrative version-comparison dataset. It is not the authoritative ESPR legal reference used by /api/regulation/reference.",
    }


def evaluate_candidate_generation(candidate: dict[str, Any]) -> dict[str, Any]:
    baseline = candidate.get("baseline", {})
    proposal = candidate.get("proposal", {})
    dimensions = ["requirement_mapping_accuracy", "evidence_precision", "false_compliance_rate"]

    delta = {}
    for key in dimensions:
        before = float(baseline.get(key, 0))
        after = float(proposal.get(key, 0))
        delta[key] = round(after - before, 3)

    promoted = (
        proposal.get("requirement_mapping_accuracy", 0) >= baseline.get("requirement_mapping_accuracy", 0)
        and proposal.get("evidence_precision", 0) >= baseline.get("evidence_precision", 0)
        and proposal.get("false_compliance_rate", 100) < baseline.get("false_compliance_rate", 100)
    )

    return {
        "candidate": candidate.get("candidate", "unknown"),
        "decision": "promote" if promoted else "reject",
        "delta": delta,
        "classification": "DPPIQ_INTELLIGENCE",
        "reason": "Candidate improves mapping and evidence precision while reducing false-compliance rate."
        if promoted
        else "Candidate did not improve all promotion guardrails.",
    }
