from __future__ import annotations

from typing import Any


def _regime(id: str, title: str, legal_basis: str, source_url: str, status: str, why: str, obligations: list[str], conditions: list[str] | None = None) -> dict[str, Any]:
    return {
        "id": id,
        "title": title,
        "legal_basis": legal_basis,
        "classification": "EU_REGULATION" if "Regulation" in legal_basis else "EU_DIRECTIVE",
        "source_url": source_url,
        "status": status,
        "why": why,
        "obligations": obligations,
        "conditions": conditions or [],
        "dpp_relevance": "none",
    }


def complex_product_profile(identification: dict[str, Any]) -> dict[str, Any] | None:
    category = identification.get("category")

    if category in {"server", "data_storage_system"}:
        regimes = [
            _regime(
                "server-ecodesign-2019-424",
                "Ecodesign requirements for servers and data storage products",
                "Commission Regulation (EU) 2019/424",
                "https://eur-lex.europa.eu/eli/reg/2019/424/oj",
                "applicable_regime",
                "The identified product appears to be a server or online data-storage product, a product family specifically addressed by Regulation (EU) 2019/424.",
                [
                    "Check whether the exact server/storage configuration is within scope or an excluded server class.",
                    "Check PSU efficiency and power-factor requirements.",
                    "Check active-state/idle-state energy-efficiency requirements where applicable.",
                    "Check resource-efficiency, firmware and information requirements.",
                ],
                ["Some server classes and storage products are expressly excluded, so exact architecture and configuration matter."],
            ),
            _regime("rohs-2011-65", "Restriction of Hazardous Substances (RoHS)", "Directive 2011/65/EU", "https://eur-lex.europa.eu/eli/dir/2011/65/oj", "likely_applicable", "Servers are electrical and electronic equipment and normally require RoHS screening.", ["Check restricted-substance limits and applicable exemptions."], ["Confirm no scope exclusion applies."]),
            _regime("weee-2012-19", "Waste Electrical and Electronic Equipment (WEEE)", "Directive 2012/19/EU", "https://eur-lex.europa.eu/eli/dir/2012/19/oj", "likely_applicable", "Servers and storage systems are electrical/electronic equipment for which producer-responsibility and end-of-life rules are generally relevant.", ["Check producer registration, marking, take-back and treatment obligations."], ["Member State implementation must be checked."]),
            _regime("emc-2014-30", "Electromagnetic Compatibility Directive", "Directive 2014/30/EU", "https://eur-lex.europa.eu/eli/dir/2014/30/oj", "likely_applicable", "Mains-powered computing equipment must be screened for electromagnetic compatibility requirements.", ["Check EMC essential requirements, conformity assessment and technical documentation."], ["Exact applicability depends on product configuration and intended installation."]),
            _regime("lvd-2014-35", "Low Voltage Directive", "Directive 2014/35/EU", "https://eur-lex.europa.eu/eli/dir/2014/35/oj", "conditional", "Many rack servers use mains-voltage power supplies within the Low Voltage Directive voltage range.", ["Check electrical-safety essential requirements and conformity documentation."], ["Confirm the equipment's input voltage is within the Directive's scope."]),
        ]
        return {
            "status": "assessed",
            "headline": "Server / data-centre regulatory profile identified",
            "summary": "REGIQ has mapped server-specific ecodesign together with horizontal electrical, substance and end-of-life regimes. Exact server class is important because Regulation (EU) 2019/424 contains explicit exclusions.",
            "regimes": regimes,
            "dpp": {"status": "no_verified_current_obligation", "label": "No current server DPP obligation identified", "explanation": "The current server-specific ecodesign regulation does not by itself create a Digital Product Passport obligation. Future ESPR product-specific measures should be monitored."},
            "missing_evidence": ["server class / architecture", "processor socket count", "embedded/appliance/network-server status", "input voltage", "radio interfaces if any"],
            "disclaimer": "REGIQ provides regulatory screening from public sources, not legal advice. Exact applicability depends on configuration, intended use, placing-on-market date and exemptions.",
        }

    if category == "sli_battery":
        regimes = [
            _regime(
                "battery-2023-1542",
                "EU Batteries Regulation",
                "Regulation (EU) 2023/1542",
                "https://eur-lex.europa.eu/eli/reg/2023/1542/oj",
                "applicable_regime",
                "A conventional automotive starter battery is normally an SLI (starting, lighting and ignition) battery, a category expressly covered by the Batteries Regulation.",
                [
                    "Check safety, sustainability, labelling and information requirements for SLI batteries.",
                    "Check producer-responsibility, collection and waste-battery obligations.",
                    "Check carbon-footprint/recycled-content requirements where and when applicable to the exact battery category and timetable.",
                ],
                ["Confirm this is an SLI battery rather than an EV traction battery or another industrial battery category."],
            )
        ]
        return {
            "status": "assessed",
            "headline": "Automotive starter-battery regime identified",
            "summary": "The product appears to be an SLI automotive battery. The EU Batteries Regulation is the primary lifecycle framework.",
            "regimes": regimes,
            "dpp": {"status": "no_verified_current_obligation", "label": "No Article 77 battery passport for an ordinary SLI battery", "explanation": "Article 77 battery passports apply to LMT batteries, EV batteries and industrial batteries above 2 kWh, not ordinary SLI starter batteries."},
            "missing_evidence": ["battery category confirmation", "chemistry", "rated capacity", "voltage", "manufacturer/model", "placing-on-market date"],
            "disclaimer": "REGIQ provides regulatory screening from public sources, not legal advice. Battery classification must be confirmed from technical specifications.",
        }

    if category == "ups":
        regimes = [
            _regime("rohs-2011-65", "Restriction of Hazardous Substances (RoHS)", "Directive 2011/65/EU", "https://eur-lex.europa.eu/eli/dir/2011/65/oj", "likely_applicable", "A UPS is electrical/electronic equipment requiring RoHS screening.", ["Check restricted-substance requirements and exemptions."]),
            _regime("weee-2012-19", "Waste Electrical and Electronic Equipment (WEEE)", "Directive 2012/19/EU", "https://eur-lex.europa.eu/eli/dir/2012/19/oj", "likely_applicable", "UPS equipment is generally relevant to WEEE producer and treatment obligations.", ["Check registration, marking, take-back and treatment duties."]),
            _regime("battery-2023-1542", "EU Batteries Regulation", "Regulation (EU) 2023/1542", "https://eur-lex.europa.eu/eli/reg/2023/1542/oj", "conditional", "UPS systems commonly contain industrial or other rechargeable batteries.", ["Classify the installed battery and assess the corresponding battery requirements."], ["Battery-passport applicability depends on whether the installed battery is an industrial battery above 2 kWh or another passport-covered class."]),
        ]
        return {"status":"assessed","headline":"UPS regulatory screening identified","summary":"REGIQ has separated the UPS electrical equipment from its internal battery, which may trigger a different regulatory category.","regimes":regimes,"dpp":{"status":"conditional","label":"Battery passport may depend on the installed battery","explanation":"A UPS does not automatically have a DPP, but an industrial battery above 2 kWh can fall within battery-passport scope from 18 February 2027."},"missing_evidence":["UPS power rating","battery chemistry","battery energy in kWh","input/output voltage","intended installation"],"disclaimer":"REGIQ provides regulatory screening, not legal advice."}

    return None
