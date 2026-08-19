from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class RequirementResult:
    requirement_id: str
    title: str
    status: str
    score: int
    field: str
    rationale: str
    source: str


REQUIREMENTS = [
    {
        "id": "ESPR-DPP-IDENTITY",
        "title": "Unique product identity",
        "field": "identity.product_id",
        "source": "ESPR framework (demo requirement)",
    },
    {
        "id": "ESPR-DPP-MATERIALS",
        "title": "Material composition",
        "field": "materials",
        "source": "ESPR framework (demo requirement)",
    },
    {
        "id": "DPP-REPAIR-SPARES",
        "title": "Spare-parts information",
        "field": "repair.spare_parts_available_years",
        "source": "DPPIQ future-scenario dataset",
    },
    {
        "id": "DPP-DISASSEMBLY",
        "title": "Disassembly guidance",
        "field": "circularity.disassembly_instructions",
        "source": "DPPIQ future-scenario dataset",
    },
    {
        "id": "DPP-RECYCLED-CONTENT",
        "title": "Recycled-content evidence",
        "field": "circularity.recycled_content_percent",
        "source": "DPPIQ future-scenario dataset",
    },
]


def _read_path(payload: dict[str, Any], path: str) -> Any:
    value: Any = payload
    for part in path.split("."):
        if not isinstance(value, dict) or part not in value:
            return None
        value = value[part]
    return value


def evaluate_passport(passport: dict[str, Any]) -> dict[str, Any]:
    results: list[RequirementResult] = []
    for req in REQUIREMENTS:
        value = _read_path(passport, req["field"])
        missing = value is None or value == "" or value == []
        if missing:
            status, score = "gap", 0
            rationale = f"No usable value found at {req['field']}."
        else:
            status, score = "ready", 100
            rationale = f"Evidence is present at {req['field']}."
        results.append(
            RequirementResult(
                requirement_id=req["id"],
                title=req["title"],
                status=status,
                score=score,
                field=req["field"],
                rationale=rationale,
                source=req["source"],
            )
        )

    readiness = round(sum(r.score for r in results) / len(results)) if results else 0
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

    return {
        "product_id": passport.get("identity", {}).get("product_id", "unknown"),
        "regulatory_readiness": readiness,
        "evidence_quality": evidence_quality,
        "circularity_readiness": circularity_score,
        "overall_iq": round((readiness * 0.5) + (evidence_quality * 0.25) + (circularity_score * 0.25)),
        "requirements": [r.__dict__ for r in results],
        "gaps": [r.__dict__ for r in results if r.status != "ready"],
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
        "reason": "Candidate improves mapping and evidence precision while reducing false-compliance rate."
        if promoted
        else "Candidate did not improve all promotion guardrails.",
    }
