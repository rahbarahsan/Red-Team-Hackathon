"""Generate a sample product chain with deliberate anomalies for demo purposes.

Product: Tactical Communication Radio
Anomalies included:
  1. Timestamp inversion (child manufactured before parent supplied)
  2. Parent hash mismatch (tampered upstream attestation)
  3. Cost outlier (suspiciously cheap labour for complex assembly)
"""
import json
import sys
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reference_lib.canonical import canonical_serialize
from reference_lib.crypto import sign_attestation
import hashlib

# Load private keys
with open(ROOT / "private_keys" / "supplier_private_keys.json") as f:
    private_keys = json.load(f)["keys"]

def content_hash(attestation: dict) -> str:
    canonical = canonical_serialize(attestation, exclude_signature=True)
    return hashlib.sha256(canonical).hexdigest()

def sign(att: dict, supplier_id: str) -> dict:
    return sign_attestation(att, private_keys[supplier_id])

# ── Build attestations ──────────────────────────────────────────────────

attestations = []

# att-demo-0001: Aluminum Enclosure (raw material, US)
att1 = sign({
    "attestation_id": "att-demo-0001",
    "version": "1.0",
    "supplier_id": "sup-0003",
    "timestamp": "2026-04-01T09:00:00Z",
    "action_type": "raw_material_supply",
    "performed_in_country": "US",
    "parents": [],
    "output": {"name": "Mil-Spec Aluminum Enclosure", "quantity_produced": 1, "unit": "units"},
    "costs": {"material_cad": 185.0, "labour_hours": 0.0, "labour_cost_cad": 0.0},
}, "sup-0003")
attestations.append(att1)

# att-demo-0002: PCB Board (raw material, CN)
att2 = sign({
    "attestation_id": "att-demo-0002",
    "version": "1.0",
    "supplier_id": "sup-0005",
    "timestamp": "2026-04-01T09:00:00Z",
    "action_type": "raw_material_supply",
    "performed_in_country": "CN",
    "parents": [],
    "output": {"name": "Multi-Layer PCB Board", "quantity_produced": 2, "unit": "units"},
    "costs": {"material_cad": 95.0, "labour_hours": 0.0, "labour_cost_cad": 0.0},
}, "sup-0005")
attestations.append(att2)

# att-demo-0003: Antenna Assembly (raw material, CA)
att3 = sign({
    "attestation_id": "att-demo-0003",
    "version": "1.0",
    "supplier_id": "sup-0008",
    "timestamp": "2026-04-01T09:00:00Z",
    "action_type": "raw_material_supply",
    "performed_in_country": "CA",
    "parents": [],
    "output": {"name": "Wideband Antenna Assembly", "quantity_produced": 1, "unit": "units"},
    "costs": {"material_cad": 220.0, "labour_hours": 0.0, "labour_cost_cad": 0.0},
}, "sup-0008")
attestations.append(att3)

# att-demo-0004: Lithium Battery Pack (raw material, JP)
att4 = sign({
    "attestation_id": "att-demo-0004",
    "version": "1.0",
    "supplier_id": "sup-0010",
    "timestamp": "2026-04-02T10:00:00Z",
    "action_type": "raw_material_supply",
    "performed_in_country": "JP",
    "parents": [],
    "output": {"name": "Lithium Battery Pack", "quantity_produced": 1, "unit": "units"},
    "costs": {"material_cad": 150.0, "labour_hours": 0.0, "labour_cost_cad": 0.0},
}, "sup-0010")
attestations.append(att4)

# att-demo-0005: Rubber Gasket Set (raw material, CA)
att5 = sign({
    "attestation_id": "att-demo-0005",
    "version": "1.0",
    "supplier_id": "sup-0012",
    "timestamp": "2026-04-02T10:00:00Z",
    "action_type": "raw_material_supply",
    "performed_in_country": "CA",
    "parents": [],
    "output": {"name": "Rubber Gasket Set", "quantity_produced": 4, "unit": "units"},
    "costs": {"material_cad": 12.0, "labour_hours": 0.0, "labour_cost_cad": 0.0},
}, "sup-0012")
attestations.append(att5)

# att-demo-0006: Encryption Chip (raw material, DE)
att6 = sign({
    "attestation_id": "att-demo-0006",
    "version": "1.0",
    "supplier_id": "sup-0015",
    "timestamp": "2026-04-03T08:00:00Z",
    "action_type": "raw_material_supply",
    "performed_in_country": "DE",
    "parents": [],
    "output": {"name": "AES-256 Encryption Chip", "quantity_produced": 1, "unit": "units"},
    "costs": {"material_cad": 310.0, "labour_hours": 0.0, "labour_cost_cad": 0.0},
}, "sup-0015")
attestations.append(att6)

# att-demo-0007: Display Module (raw material, CN)
att7 = sign({
    "attestation_id": "att-demo-0007",
    "version": "1.0",
    "supplier_id": "sup-0005",
    "timestamp": "2026-04-03T08:00:00Z",
    "action_type": "raw_material_supply",
    "performed_in_country": "CN",
    "parents": [],
    "output": {"name": "OLED Display Module", "quantity_produced": 1, "unit": "units"},
    "costs": {"material_cad": 75.0, "labour_hours": 0.0, "labour_cost_cad": 0.0},
}, "sup-0005")
attestations.append(att7)

# att-demo-0008: Screws and Fasteners (raw material, CA)
att8 = sign({
    "attestation_id": "att-demo-0008",
    "version": "1.0",
    "supplier_id": "sup-0012",
    "timestamp": "2026-04-03T08:00:00Z",
    "action_type": "raw_material_supply",
    "performed_in_country": "CA",
    "parents": [],
    "output": {"name": "Stainless Steel Fastener Kit", "quantity_produced": 16, "unit": "units"},
    "costs": {"material_cad": 8.0, "labour_hours": 0.0, "labour_cost_cad": 0.0},
}, "sup-0012")
attestations.append(att8)

# ── ANOMALY 1: Timestamp inversion ──────────────────────────────────────
# att-demo-0009: RF Transceiver Board (component_manufacture, CA)
# This child is dated BEFORE its parent att-demo-0006 (Apr 3) — set to Apr 2
att9 = sign({
    "attestation_id": "att-demo-0009",
    "version": "1.0",
    "supplier_id": "sup-0001",
    "timestamp": "2026-04-02T08:00:00Z",  # ANOMALY: before parent att-demo-0006 (Apr 3)
    "action_type": "component_manufacture",
    "performed_in_country": "CA",
    "parents": [
        {"attestation_id": "att-demo-0002", "content_hash": content_hash(att2), "quantity_consumed": 2, "unit": "units"},
        {"attestation_id": "att-demo-0006", "content_hash": content_hash(att6), "quantity_consumed": 1, "unit": "units"},
    ],
    "output": {"name": "RF Transceiver Board", "quantity_produced": 1, "unit": "units"},
    "costs": {"material_cad": 0.0, "labour_hours": 8.0, "labour_cost_cad": 640.0},
}, "sup-0001")
attestations.append(att9)

# att-demo-0010: Weatherproof Housing Assembly (component_manufacture, CA)
att10 = sign({
    "attestation_id": "att-demo-0010",
    "version": "1.0",
    "supplier_id": "sup-0001",
    "timestamp": "2026-04-10T14:00:00Z",
    "action_type": "component_manufacture",
    "performed_in_country": "CA",
    "parents": [
        {"attestation_id": "att-demo-0001", "content_hash": content_hash(att1), "quantity_consumed": 1, "unit": "units"},
        {"attestation_id": "att-demo-0005", "content_hash": content_hash(att5), "quantity_consumed": 4, "unit": "units"},
        {"attestation_id": "att-demo-0008", "content_hash": content_hash(att8), "quantity_consumed": 16, "unit": "units"},
    ],
    "output": {"name": "Weatherproof Housing Assembly", "quantity_produced": 1, "unit": "units"},
    "costs": {"material_cad": 0.0, "labour_hours": 4.0, "labour_cost_cad": 320.0},
}, "sup-0001")
attestations.append(att10)

# ── ANOMALY 2: Parent hash mismatch ─────────────────────────────────────
# att-demo-0011: Power Management Unit (subassembly, CA)
# The content_hash for parent att-demo-0004 is deliberately wrong
att11 = sign({
    "attestation_id": "att-demo-0011",
    "version": "1.0",
    "supplier_id": "sup-0001",
    "timestamp": "2026-04-12T10:00:00Z",
    "action_type": "subassembly",
    "performed_in_country": "CA",
    "parents": [
        {"attestation_id": "att-demo-0004", "content_hash": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "quantity_consumed": 1, "unit": "units"},  # ANOMALY: wrong hash
        {"attestation_id": "att-demo-0007", "content_hash": content_hash(att7), "quantity_consumed": 1, "unit": "units"},
    ],
    "output": {"name": "Power Management Unit", "quantity_produced": 1, "unit": "units"},
    "costs": {"material_cad": 0.0, "labour_hours": 3.0, "labour_cost_cad": 240.0},
}, "sup-0001")
attestations.append(att11)

# ── ANOMALY 3: Cost outlier (suspiciously cheap labour) ──────────────────
# att-demo-0012: Final Integration — Tactical Communication Radio
# 0.5 labour hours for final integration of a complex radio is implausibly low
att12 = sign({
    "attestation_id": "att-demo-0012",
    "version": "1.0",
    "supplier_id": "sup-0001",
    "timestamp": "2026-04-20T16:00:00Z",
    "action_type": "final_integration",
    "performed_in_country": "CA",
    "parents": [
        {"attestation_id": "att-demo-0003", "content_hash": content_hash(att3), "quantity_consumed": 1, "unit": "units"},
        {"attestation_id": "att-demo-0009", "content_hash": content_hash(att9), "quantity_consumed": 1, "unit": "units"},
        {"attestation_id": "att-demo-0010", "content_hash": content_hash(att10), "quantity_consumed": 1, "unit": "units"},
        {"attestation_id": "att-demo-0011", "content_hash": content_hash(att11), "quantity_consumed": 1, "unit": "units"},
    ],
    "output": {"name": "Tactical Communication Radio", "quantity_produced": 1, "unit": "units"},
    "costs": {"material_cad": 0.0, "labour_hours": 0.5, "labour_cost_cad": 40.0},  # ANOMALY: suspiciously low
}, "sup-0001")
attestations.append(att12)

# ── Build chain and expected result ──────────────────────────────────────

chain = {
    "product_attestation_id": "att-demo-0012",
    "attestations": attestations,
}

# Canadian content calculation:
# Canadian steps: att3 ($220), att5 ($12), att8 ($8), att9 ($640), att10 ($320), att11 ($240), att12 ($40)
# = 220 + 12 + 8 + 640 + 320 + 240 + 40 = 1480
# Non-Canadian: att1 ($185 US), att2 ($95 CN), att4 ($150 JP), att6 ($310 DE), att7 ($75 CN)
# = 185 + 95 + 150 + 310 + 75 = 815
# Total = 1480 + 815 = 2295
# Canadian % = 1480 / 2295 = 64.49%

total = sum(a["costs"]["material_cad"] + a["costs"]["labour_cost_cad"] for a in attestations)
ca_cost = sum(
    a["costs"]["material_cad"] + a["costs"]["labour_cost_cad"]
    for a in attestations if a["performed_in_country"] == "CA"
)
pct = round(ca_cost / total * 100, 1)

expected = {
    "product_attestation_id": "att-demo-0012",
    "canadian_content_percentage": pct,
    "designation": "made_in_canada" if pct >= 51 else "none",
    "chain_valid": False,
    "anomalies": [
        {
            "type": "timestamp_inversion",
            "attestation_id": "att-demo-0009",
            "details": "Child attestation dated 2026-04-02 is before parent att-demo-0006 dated 2026-04-03."
        },
        {
            "type": "parent_hash_mismatch",
            "attestation_id": "att-demo-0011",
            "details": "Content hash for parent att-demo-0004 does not match the actual attestation content."
        },
        {
            "type": "cost_anomaly",
            "attestation_id": "att-demo-0012",
            "details": "Final integration labour of 0.5 hours ($40 CAD) is implausibly low for assembling a tactical radio from 4 subassemblies."
        }
    ]
}

# ── Write output ─────────────────────────────────────────────────────────

out_dir = ROOT / "EXAMPLE DATA"
out_dir.mkdir(exist_ok=True)

with open(out_dir / "tactical_radio_chain.json", "w") as f:
    json.dump(chain, f, indent=2)
print(f"Chain written to {out_dir / 'tactical_radio_chain.json'}")

with open(out_dir / "tactical_radio_expected.json", "w") as f:
    json.dump(expected, f, indent=2)
print(f"Expected written to {out_dir / 'tactical_radio_expected.json'}")

print(f"\nProduct: Tactical Communication Radio")
print(f"Attestations: {len(attestations)}")
print(f"Canadian content: {pct}% -> {expected['designation']}")
print(f"Chain valid: {expected['chain_valid']}")
print(f"Anomalies: {len(expected['anomalies'])}")
for a in expected["anomalies"]:
    print(f"  - [{a['type']}] {a['attestation_id']}: {a['details']}")
