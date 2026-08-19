from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
CATALOG_PATH = ROOT / "data" / "regulatory_catalog.json"


def _catalog() -> dict[str, Any]:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


# Human-readable applicability logic. The legal act metadata itself lives in
# data/regulatory_catalog.json so it can be independently versioned and updated.
APPLICABILITY: dict[str, dict[str, dict[str, Any]]] = {
    "plastic_beverage_bottle": {
        "ppwr-2025-40": {"status": "applicable_regime", "why": "The object is consumer packaging, so EU packaging sustainability, recyclability, labelling and waste-management rules are directly relevant.", "obligations": ["Check packaging sustainability and recyclability requirements.", "Check recycled-content requirements against the exact polymer and compliance date.", "For covered single-use beverage containers, check deposit-and-return and collection requirements."], "conditions": ["Exact duties depend on material, capacity, use and transition dates."]},
        "sup-2019-904": {"status": "likely_applicable", "why": "A single-use plastic beverage bottle is a product type specifically addressed by the Single-Use Plastics Directive.", "obligations": ["Check attached-cap requirements for covered beverage containers.", "Check recycled-plastic content targets for PET and other covered beverage bottles."], "conditions": ["Confirm the bottle is single-use and within the Directive's covered scope."]},
        "fcm-10-2011": {"status": "likely_applicable", "why": "The bottle appears to be plastic packaging intended to contain a beverage.", "obligations": ["Check composition, migration and declaration requirements for the exact food-contact plastic structure."], "conditions": ["Confirm intended food/beverage contact and polymer structure."]},
        "fcm-1935-2004": {"status": "likely_applicable", "why": "Beverage packaging is normally a food-contact article.", "obligations": ["Materials must satisfy the general food-contact safety framework."], "conditions": []},
        "espr-2024-1781": {"status": "context_only", "why": "ESPR is a horizontal framework, but REGIQ does not infer a bottle DPP obligation merely because ESPR exists.", "obligations": [], "conditions": ["A Digital Product Passport obligation requires a specific legal basis."]},
    },
    "smartphone": {
        "smartphone-ecodesign-2023-1670": {"status": "applicable_regime", "why": "The identified product is a smartphone, which is explicitly within the product-specific ecodesign regulation's scope.", "obligations": ["Check durability, repairability and spare-part requirements.", "Check battery endurance and replacement provisions.", "Check operating-system and security-update support information."], "conditions": ["Scope exclusions such as high-security smartphones must still be checked."]},
        "red-2014-53": {"status": "applicable_regime", "why": "A smartphone intentionally transmits and receives radio waves and is radio equipment.", "obligations": ["Check RED safety, EMC and radio-spectrum essential requirements.", "Check conformity assessment and required technical documentation."], "conditions": []},
        "common-charger-2022-2380": {"status": "applicable_regime", "why": "Smartphones are among the radio-equipment categories covered by the EU common-charger rules.", "obligations": ["For wired charging, check USB-C receptacle and charging-protocol requirements.", "Check charging information and unbundling-related information requirements."], "conditions": ["Exact requirements depend on charging capabilities and product configuration."]},
        "rohs-2011-65": {"status": "likely_applicable", "why": "Smartphones are electrical and electronic equipment and normally fall within RoHS scope.", "obligations": ["Check restricted-substance limits and applicable exemptions."], "conditions": ["Confirm no scope exclusion applies."]},
        "weee-2012-19": {"status": "likely_applicable", "why": "Smartphones are electrical and electronic equipment subject to end-of-life producer-responsibility rules.", "obligations": ["Check producer registration, marking, collection and treatment obligations."], "conditions": ["Implementation details vary by Member State."]},
        "battery-2023-1542": {"status": "applicable_regime", "why": "A smartphone contains a portable rechargeable battery covered by the Batteries Regulation.", "obligations": ["Check portable-battery labelling, performance, removability and lifecycle requirements as applicable."], "conditions": ["A normal smartphone battery is not automatically within Article 77 battery-passport scope."]},
        "espr-2024-1781": {"status": "context_only", "why": "ESPR is relevant as the horizontal ecodesign/DPP framework but the smartphone has more direct product-specific rules today.", "obligations": [], "conditions": []},
    },
    "laptop": {
        "common-charger-2022-2380": {"status": "applicable_regime", "why": "Laptops are covered by the common-charger rules from 28 April 2026 when capable of wired charging.", "obligations": ["Check USB-C charging receptacle and power-delivery requirements for covered laptops.", "Check charging information requirements."], "conditions": ["Confirm the laptop is capable of wired charging and within the covered category."]},
        "rohs-2011-65": {"status": "likely_applicable", "why": "Laptop computers are electrical and electronic equipment normally within RoHS scope.", "obligations": ["Check restricted-substance limits and exemptions."], "conditions": []},
        "weee-2012-19": {"status": "likely_applicable", "why": "Laptops are electrical and electronic equipment subject to WEEE producer-responsibility requirements.", "obligations": ["Check producer registration, marking and end-of-life obligations."], "conditions": ["Member State implementation must be checked."]},
        "battery-2023-1542": {"status": "applicable_regime", "why": "Most laptops contain rechargeable portable batteries covered by the Batteries Regulation.", "obligations": ["Check portable-battery information, performance and removability requirements as applicable."], "conditions": ["Portable laptop batteries do not automatically require an Article 77 battery passport."]},
        "red-2014-53": {"status": "likely_applicable", "why": "Most modern laptops contain Wi-Fi/Bluetooth radio equipment.", "obligations": ["Check RED requirements for integrated radio functionality."], "conditions": ["Confirm the specific model has intentional radio functionality."]},
        "espr-2024-1781": {"status": "screening_required", "why": "ESPR can support future product-specific ecodesign/DPP rules; REGIQ does not infer a current laptop DPP without a specific act.", "obligations": [], "conditions": ["Check future product-specific measures and transitional dates."]},
    },
    "wireless_headphones": {
        "red-2014-53": {"status": "applicable_regime", "why": "Wireless headphones intentionally use radio communication such as Bluetooth.", "obligations": ["Check RED safety, EMC, spectrum-use and conformity requirements."], "conditions": []},
        "common-charger-2022-2380": {"status": "likely_applicable", "why": "Headphones/headsets and earbuds are listed common-charger product categories when rechargeable by wired charging.", "obligations": ["Check USB-C and charging-information requirements where wired charging is supported."], "conditions": ["Confirm the product's wired charging capability and precise category."]},
        "rohs-2011-65": {"status": "likely_applicable", "why": "Wireless headphones are electrical/electronic equipment normally within RoHS scope.", "obligations": ["Check restricted-substance limits and exemptions."], "conditions": []},
        "weee-2012-19": {"status": "likely_applicable", "why": "Wireless headphones are electrical/electronic equipment subject to WEEE end-of-life rules.", "obligations": ["Check marking and producer-responsibility obligations."], "conditions": []},
        "battery-2023-1542": {"status": "applicable_regime", "why": "Rechargeable wireless headphones contain portable batteries.", "obligations": ["Check portable-battery information, removability and lifecycle requirements."], "conditions": ["Article 77 passport scope does not automatically cover ordinary portable batteries."]},
    },
    "power_bank": {
        "battery-2023-1542": {"status": "applicable_regime", "why": "A power bank is principally a rechargeable portable battery product.", "obligations": ["Check battery safety, performance, labelling and lifecycle requirements."], "conditions": ["Exact battery category and capacity must be confirmed; ordinary portable power banks do not automatically require an Article 77 battery passport."]},
        "rohs-2011-65": {"status": "likely_applicable", "why": "Power banks contain electrical/electronic circuitry and may fall within RoHS scope.", "obligations": ["Check restricted-substance limits and exemptions."], "conditions": ["Confirm scope classification."]},
        "weee-2012-19": {"status": "likely_applicable", "why": "Power banks may also be electrical/electronic equipment for WEEE purposes.", "obligations": ["Check registration, marking and treatment obligations."], "conditions": ["Confirm national classification and battery-versus-EEE treatment."]},
        "gpsr-2023-988": {"status": "context_only", "why": "General product safety remains relevant for consumer risks not fully covered by sector-specific law.", "obligations": [], "conditions": []},
    },
    "household_battery": {
        "battery-2023-1542": {"status": "applicable_regime", "why": "A household portable battery is directly within the Batteries Regulation.", "obligations": ["Check safety, labelling, performance, collection and producer-responsibility requirements for the exact battery category."], "conditions": ["Portable household batteries are not automatically in Article 77 battery-passport scope."]},
    },
    "led_lamp": {
        "light-ecodesign-2019-2020": {"status": "applicable_regime", "why": "An LED lamp is normally a light source within the ecodesign regulation's scope.", "obligations": ["Check energy-efficiency, functional and product-information requirements."], "conditions": ["Confirm no Annex III exclusion applies."]},
        "light-energy-label-2019-2015": {"status": "applicable_regime", "why": "Light sources are subject to EU energy-labelling rules unless excluded.", "obligations": ["Check energy label, product information sheet and distance-selling information."], "conditions": ["Confirm scope and containing-product treatment."]},
        "rohs-2011-65": {"status": "likely_applicable", "why": "LED lamps are electrical/electronic equipment normally within RoHS scope.", "obligations": ["Check restricted-substance limits and exemptions."], "conditions": []},
        "weee-2012-19": {"status": "likely_applicable", "why": "Lamps/light sources may be WEEE and subject to end-of-life obligations.", "obligations": ["Check producer registration, collection and treatment obligations."], "conditions": []},
    },
    "power_tool": {
        "machinery-2006-42": {"status": "applicable_regime", "why": "A handheld power tool is machinery under the current machinery framework during the transition period.", "obligations": ["Check essential health and safety requirements, conformity assessment, CE marking and instructions."], "conditions": ["Transition to Regulation (EU) 2023/1230 must be managed for products placed on the market around January 2027."]},
        "machinery-2023-1230": {"status": "upcoming_regime", "why": "The Machinery Regulation replaces Directive 2006/42/EC from January 2027 subject to transitional provisions.", "obligations": ["Prepare for the new machinery-regulation conformity and documentation framework."], "conditions": ["Check the exact application date and transitional rules for the product's placing-on-market date."]},
        "rohs-2011-65": {"status": "likely_applicable", "why": "Handheld electrical power tools are normally electrical/electronic equipment within RoHS scope.", "obligations": ["Check restricted-substance limits and applicable exclusions."], "conditions": ["Large-scale stationary industrial tools have different scope treatment."]},
        "weee-2012-19": {"status": "likely_applicable", "why": "Electrical power tools are generally within WEEE scope subject to exclusions.", "obligations": ["Check producer and end-of-life obligations."], "conditions": []},
        "battery-2023-1542": {"status": "conditional", "why": "Cordless power tools contain rechargeable batteries covered by the Batteries Regulation.", "obligations": ["Check battery requirements if this is a cordless/battery-powered tool."], "conditions": ["Not relevant to mains-only tools."]},
    },
    "textile_garment": {
        "textile-1007-2011": {"status": "applicable_regime", "why": "A garment is a textile product and is subject to fibre-composition labelling rules.", "obligations": ["Provide accurate fibre-composition labelling/marking using permitted fibre names.", "Check language and presentation requirements in the Member State of sale."], "conditions": []},
        "reach-1907-2006": {"status": "likely_applicable", "why": "Textile articles are subject to horizontal REACH restrictions and substance-related duties where relevant.", "obligations": ["Check applicable restricted substances and article-related duties."], "conditions": ["Substance-specific obligations depend on composition and concentration."]},
        "gpsr-2023-988": {"status": "applicable_regime", "why": "Consumer garments are subject to the general product-safety framework for risks not fully harmonised elsewhere.", "obligations": ["Check general safety, traceability and economic-operator information requirements."], "conditions": []},
        "espr-2024-1781": {"status": "screening_required", "why": "Textiles are a priority area for future ESPR measures, but REGIQ must not invent a DPP before a specific applicable requirement and date are established.", "obligations": [], "conditions": ["Track product-specific delegated acts and implementation dates."]},
    },
    "electronic_toy": {
        "toy-2009-48": {"status": "applicable_regime", "why": "The Toy Safety Directive remains the current core toy-safety framework during the transition period.", "obligations": ["Check toy safety requirements, conformity assessment, CE marking, warnings and technical documentation."], "conditions": ["Confirm the product is designed or intended for play by children under 14."]},
        "toy-2025-2509": {"status": "upcoming_regime", "why": "The Toy Safety Regulation will replace the Directive from 1 August 2030 and introduces technical requirements for a Digital Product Passport.", "obligations": ["Prepare for the future toy Digital Product Passport and strengthened chemical/safety requirements."], "conditions": ["Most substantive replacement rules apply from 1 August 2030; transitional provisions must be checked."]},
        "rohs-2011-65": {"status": "likely_applicable", "why": "Electronic toys are electrical/electronic equipment and may fall within RoHS scope.", "obligations": ["Check restricted-substance limits and exemptions."], "conditions": []},
        "weee-2012-19": {"status": "likely_applicable", "why": "Electronic toys are generally electrical/electronic equipment for WEEE purposes.", "obligations": ["Check producer registration, marking and end-of-life obligations."], "conditions": []},
        "battery-2023-1542": {"status": "conditional", "why": "Battery-powered toys contain batteries covered by the Batteries Regulation.", "obligations": ["Check battery requirements if the toy contains a battery."], "conditions": ["Not applicable to toys without batteries."]},
        "red-2014-53": {"status": "conditional", "why": "Connected or remote-controlled toys with intentional radio functionality are radio equipment.", "obligations": ["Check RED requirements if wireless/radio functionality is present."], "conditions": ["Not applicable to toys without intentional radio transmission/reception."]},
    },
    "battery_ev": {
        "battery-2023-1542": {"status": "applicable_regime", "why": "Electric-vehicle batteries are explicitly covered by the Batteries Regulation and Article 77 battery-passport scope.", "obligations": ["Battery passport required from 18 February 2027.", "Check sustainability, performance, due-diligence, recycled-content and lifecycle information requirements as applicable."], "conditions": []},
    },
    "battery_lmt": {
        "battery-2023-1542": {"status": "applicable_regime", "why": "LMT batteries are explicitly within Article 77 battery-passport scope.", "obligations": ["Battery passport required from 18 February 2027."], "conditions": []},
    },
    "battery_industrial_gt_2kwh": {
        "battery-2023-1542": {"status": "applicable_regime", "why": "Industrial batteries above 2 kWh are explicitly within Article 77 battery-passport scope.", "obligations": ["Battery passport required from 18 February 2027."], "conditions": []},
    },
}


def _dpp_status(category: str) -> dict[str, Any]:
    if category in {"battery_ev", "battery_lmt", "battery_industrial_gt_2kwh"}:
        return {
            "status": "mandatory_from_future_date",
            "label": "Battery passport required from 18 February 2027",
            "effective_date": "2027-02-18",
            "explanation": "Article 77 of Regulation (EU) 2023/1542 creates a product-specific battery-passport obligation for this category.",
            "legal_basis": "Regulation (EU) 2023/1542, Article 77",
        }
    if category == "electronic_toy":
        return {
            "status": "future_sector_obligation",
            "label": "Toy Digital Product Passport is a future obligation",
            "effective_date": "2030-08-01",
            "explanation": "Regulation (EU) 2025/2509 introduces technical requirements for a Digital Product Passport when the new toy-safety regime applies from 1 August 2030, subject to transitional provisions.",
            "legal_basis": "Regulation (EU) 2025/2509",
        }
    return {
        "status": "no_verified_current_obligation",
        "label": "No current product-specific DPP obligation verified by REGIQ",
        "effective_date": None,
        "explanation": "REGIQ does not infer a Digital Product Passport obligation from the horizontal ESPR framework alone. A product-specific legal basis and effective date are required.",
        "legal_basis": None,
    }


def regulatory_profile_for_product(identification: dict[str, Any]) -> dict[str, Any]:
    catalog = _catalog()
    if identification.get("status") != "identified":
        return {
            "status": "not_assessed",
            "headline": "Regulatory profile not assessed",
            "summary": "REGIQ must identify the product before mapping regulatory regimes.",
            "category": None,
            "coverage": "none",
            "catalog_version": catalog.get("catalog_version"),
            "catalog_verified_at": catalog.get("verified_at"),
            "regimes": [],
            "dpp": {"status": "not_assessed", "label": "DPP not assessed"},
            "disclaimer": "REGIQ provides regulatory intelligence, not legal advice.",
        }

    category = identification.get("category") or "other"
    product_type = identification.get("product_type") or "product"
    family_rules = APPLICABILITY.get(category, {})
    family_acts = catalog.get("product_families", {}).get(category, [])
    regimes: list[dict[str, Any]] = []

    for act_id in family_acts:
        act = catalog.get("acts", {}).get(act_id)
        if not act:
            continue
        interpretation = family_rules.get(act_id, {})
        regimes.append({
            "id": act_id,
            "title": act.get("title"),
            "status": interpretation.get("status", "screening_required"),
            "classification": act.get("classification"),
            "legal_basis": act.get("legal_basis"),
            "source_url": act.get("source_url"),
            "source_type": act.get("source_type"),
            "source_status": act.get("status"),
            "source_verified_at": catalog.get("verified_at"),
            "why": interpretation.get("why", "This act is mapped to the product family and requires product-specific screening."),
            "obligations": interpretation.get("obligations", []),
            "conditions": interpretation.get("conditions", []),
            "dpp_relevance": "future_or_specific" if act_id in {"espr-2024-1781", "battery-2023-1542", "toy-2025-2509"} else "none",
        })

    if regimes:
        coverage = "reference_family"
        headline = f"{len(regimes)} EU regulatory regimes mapped"
        summary = f"REGIQ identified this as {product_type} and matched it to the curated {category.replace('_', ' ')} regulatory family. Applicable, likely, conditional and upcoming rules remain explicitly distinguished."
    else:
        coverage = "fallback"
        espr = catalog.get("acts", {}).get("espr-2024-1781", {})
        regimes = [{
            "id": "espr-2024-1781",
            "title": espr.get("title", "ESPR"),
            "status": "screening_required",
            "classification": espr.get("classification", "EU_REGULATION"),
            "legal_basis": espr.get("legal_basis", "Regulation (EU) 2024/1781"),
            "source_url": espr.get("source_url"),
            "source_type": espr.get("source_type", "official_eur_lex"),
            "source_status": espr.get("status", "in_force"),
            "source_verified_at": catalog.get("verified_at"),
            "why": "REGIQ identified the product but does not yet have a curated sector-specific regulatory family for this category.",
            "obligations": [],
            "conditions": ["Broader sector legislation must be researched before drawing a compliance conclusion."],
            "dpp_relevance": "product_specific_check_required",
        }]
        headline = "Regulatory screening required"
        summary = f"REGIQ identified this as {product_type}, but its regulatory family is not yet curated. No compliance conclusion is asserted."

    return {
        "status": "assessed",
        "headline": headline,
        "summary": summary,
        "category": category,
        "coverage": coverage,
        "catalog_version": catalog.get("catalog_version"),
        "catalog_verified_at": catalog.get("verified_at"),
        "regimes": regimes,
        "dpp": _dpp_status(category),
        "signals": {"visible_text": identification.get("visible_text") or []},
        "disclaimer": "REGIQ maps potentially applicable rules from authoritative public sources. Applicability can depend on specifications, intended use, market, dates, exemptions and Member State implementation. This is not legal advice.",
    }
