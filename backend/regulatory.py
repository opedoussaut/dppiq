from __future__ import annotations

from typing import Any


def _regime(
    regime_id: str,
    title: str,
    status: str,
    classification: str,
    legal_basis: str,
    source_url: str,
    why: str,
    obligations: list[str] | None = None,
    conditions: list[str] | None = None,
    dpp_relevance: str = "none",
) -> dict[str, Any]:
    return {
        "id": regime_id,
        "title": title,
        "status": status,
        "classification": classification,
        "legal_basis": legal_basis,
        "source_url": source_url,
        "why": why,
        "obligations": obligations or [],
        "conditions": conditions or [],
        "dpp_relevance": dpp_relevance,
    }


def regulatory_profile_for_product(identification: dict[str, Any]) -> dict[str, Any]:
    if identification.get("status") != "identified":
        return {
            "status": "not_assessed",
            "headline": "Regulatory profile not assessed",
            "summary": "REGIQ must identify the product before mapping regulatory regimes.",
            "regimes": [],
            "dpp": {"status": "not_assessed", "label": "DPP not assessed"},
            "disclaimer": "REGIQ is a regulatory intelligence prototype, not legal advice.",
        }

    category = identification.get("category")
    product_type = identification.get("product_type") or "product"
    visible_text = " ".join(identification.get("visible_text") or []).lower()

    regimes: list[dict[str, Any]] = []

    if category == "plastic_beverage_bottle":
        regimes.extend([
            _regime(
                "ppwr-2025-40",
                "Packaging and Packaging Waste Regulation (PPWR)",
                "applicable_regime",
                "EU_REGULATION",
                "Regulation (EU) 2025/40",
                "https://eur-lex.europa.eu/eli/reg/2025/40/oj",
                "The identified object is consumer packaging, so EU packaging design, recyclability, labelling, recycled-content and waste-management rules are directly relevant.",
                obligations=[
                    "Packaging must meet applicable sustainability and recyclability requirements.",
                    "Single-use plastic beverage bottles up to 3 L are within the deposit-and-return framework, subject to the Regulation's timetable and Member State implementation.",
                    "Recycled-content and packaging minimisation requirements must be checked against the exact packaging composition and compliance date.",
                ],
                conditions=["Exact obligations depend on material, capacity, use case and applicable transition date."],
                dpp_relevance="possible_sector_digital_information_requirements",
            ),
            _regime(
                "sup-2019-904",
                "Single-Use Plastics Directive",
                "likely_applicable",
                "EU_DIRECTIVE",
                "Directive (EU) 2019/904, Article 6",
                "https://eur-lex.europa.eu/eli/dir/2019/904/oj",
                "A single-use plastic beverage bottle is one of the product types specifically addressed by the Single-Use Plastics Directive.",
                obligations=[
                    "Plastic caps and lids for covered beverage containers must remain attached during intended use.",
                    "PET beverage bottles are subject to recycled-plastic content targets; broader beverage-bottle targets increase from 2030.",
                ],
                conditions=["Confirm that the bottle is single-use and within the Directive's covered beverage-container scope."],
            ),
            _regime(
                "fcm-10-2011",
                "Plastic food-contact materials",
                "likely_applicable",
                "EU_REGULATION",
                "Commission Regulation (EU) No 10/2011",
                "https://eur-lex.europa.eu/eli/reg/2011/10/oj",
                "The bottle appears to be plastic packaging intended to contain a beverage, so plastic food-contact requirements are relevant.",
                obligations=[
                    "Plastic materials intended to contact food must comply with applicable composition, migration and declaration requirements.",
                ],
                conditions=["Confirm the packaging is intended to contact a food or beverage and determine the exact polymer/material structure."],
            ),
            _regime(
                "fcm-1935-2004",
                "Framework for food-contact materials",
                "likely_applicable",
                "EU_REGULATION",
                "Regulation (EC) No 1935/2004",
                "https://eur-lex.europa.eu/eli/reg/2004/1935/oj",
                "Beverage packaging is a food-contact article and therefore falls within the EU food-contact-materials framework when placed on the market for that use.",
                obligations=["Materials must not transfer constituents to food in quantities that endanger health or cause unacceptable changes."],
            ),
            _regime(
                "espr-2024-1781",
                "Ecodesign for Sustainable Products Regulation (ESPR)",
                "context_only",
                "EU_FRAMEWORK",
                "Regulation (EU) 2024/1781",
                "https://eur-lex.europa.eu/eli/reg/2024/1781/oj",
                "ESPR is relevant to REGIQ's broader product-regulation graph, but a beverage bottle should not be presented as having a DPP obligation merely because ESPR exists.",
                obligations=[],
                conditions=["A DPP obligation requires applicable product-specific or sector legislation."],
                dpp_relevance="not_currently_identified",
            ),
        ])
        dpp = {
            "status": "no_verified_current_obligation",
            "label": "No current DPP obligation identified for this bottle",
            "explanation": "REGIQ found several packaging and food-contact regimes that matter more directly. DPP is shown only as a secondary regulatory dimension unless a specific legal basis requires it.",
        }
        headline = "Multiple EU regulatory regimes identified"
        summary = "This appears to be a plastic beverage bottle. Packaging, single-use-plastic and food-contact rules are more directly relevant than DPP rules."

    elif category in {"battery_ev", "battery_lmt", "battery_industrial_gt_2kwh"}:
        regimes.append(_regime(
            "battery-2023-1542",
            "EU Batteries Regulation",
            "applicable_regime",
            "EU_REGULATION",
            "Regulation (EU) 2023/1542, Article 77",
            "https://eur-lex.europa.eu/eli/reg/2023/1542/oj",
            "The identified battery category is explicitly within the battery-passport scope.",
            obligations=["Battery passport required from 18 February 2027 for covered batteries."],
            dpp_relevance="mandatory_from_2027-02-18",
        ))
        dpp = {
            "status": "mandatory_from_future_date",
            "label": "Battery passport required from 18 February 2027",
            "explanation": "This is a product-specific digital passport obligation under the Batteries Regulation.",
        }
        headline = "Battery Regulation identified as primary regime"
        summary = "The battery category drives a specific EU battery-passport obligation and associated sustainability, performance and information requirements."

    else:
        regimes.append(_regime(
            "espr-2024-1781",
            "Ecodesign for Sustainable Products Regulation (ESPR)",
            "screening_required",
            "EU_FRAMEWORK",
            "Regulation (EU) 2024/1781",
            "https://eur-lex.europa.eu/eli/reg/2024/1781/oj",
            "REGIQ has identified the product but does not yet have a sufficiently complete sector rule-set for this category.",
            conditions=["Check product-specific delegated acts and other sector legislation before drawing a compliance conclusion."],
            dpp_relevance="product_specific_check_required",
        ))
        dpp = {
            "status": "unknown_product_specific",
            "label": "DPP applicability requires product-specific screening",
            "explanation": "There is no general ESPR rule requiring every physical product to carry a DPP.",
        }
        headline = "Regulatory screening required"
        summary = f"REGIQ identified this as {product_type}, but the regulatory graph for this category is not complete yet."

    return {
        "status": "assessed",
        "headline": headline,
        "summary": summary,
        "regimes": regimes,
        "dpp": dpp,
        "signals": {"visible_text": visible_text},
        "disclaimer": "REGIQ maps potentially applicable rules from authoritative public sources. Applicability can depend on product specifications, intended use, market, dates and Member State implementation. This is not legal advice.",
    }
