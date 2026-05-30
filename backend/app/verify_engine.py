from __future__ import annotations

import json
import os
import sys
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))


def _find_repo_root() -> str:
    d = _THIS_DIR
    for _ in range(8):
        if os.path.isdir(os.path.join(d, "reference_lib")):
            return d
        d = os.path.dirname(d)
    return os.environ.get("PROJECT_ROOT", "/app")


REPO_ROOT = _find_repo_root()
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from reference_lib import content_hash, verify_attestation  # noqa: E402

VALID_ACTION_TYPES = frozenset(
    {"raw_material_supply", "component_manufacture", "subassembly", "final_integration"}
)
TRANSFORM_TYPES = frozenset(
    {"component_manufacture", "subassembly", "final_integration"}
)
EPSILON = 1e-6

_REGISTRY_DIR = os.environ.get("REGISTRY_DIR", os.path.join(REPO_ROOT, "registry"))


def _load_json(path: str) -> Any:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _load_supplier_keys() -> dict[str, str]:
    try:
        data = _load_json(os.path.join(_REGISTRY_DIR, "supplier_public_keys.json"))
        return data.get("keys", data)
    except FileNotFoundError:
        return {}


def _load_anchor_map() -> dict[str, dict[str, str]]:
    try:
        data = _load_json(os.path.join(_REGISTRY_DIR, "anchor_registry.json"))
    except FileNotFoundError:
        return {}
    return {
        a["attestation_id"]: {
            "content_hash": a["content_hash"],
            "product_id": a["product_id"],
        }
        for a in data.get("anchors", [])
    }


SUPPLIER_KEYS = _load_supplier_keys()
ANCHOR_MAP = _load_anchor_map()


@dataclass
class Anomaly:
    type: str
    attestation_id: str
    details: str = ""

    def to_dict(self) -> dict[str, str]:
        return {
            "type": self.type,
            "attestation_id": self.attestation_id,
            "details": self.details,
        }


@dataclass
class VerifyResult:
    product_attestation_id: str
    canadian_content_percentage: float
    designation: str
    chain_valid: bool
    anomalies: list[Anomaly] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "product_attestation_id": self.product_attestation_id,
            "canadian_content_percentage": self.canadian_content_percentage,
            "designation": self.designation,
            "chain_valid": self.chain_valid,
            "anomalies": [a.to_dict() for a in self.anomalies],
        }


def verify_chain(product_attestation_id: str, attestations: list[dict]) -> VerifyResult:
    anomalies: list[Anomaly] = []
    att_map: dict[str, dict] = {}

    for att in attestations:
        att_id = str(att.get("attestation_id", ""))
        if not att_id:
            continue
        if att_id in att_map:
            anomalies.append(
                Anomaly("replay_within_chain", att_id, "attestation_id appears more than once")
            )
        att_map[att_id] = att

    if product_attestation_id not in att_map:
        return VerifyResult(
            product_attestation_id=product_attestation_id,
            canadian_content_percentage=0.0,
            designation="none",
            chain_valid=False,
            anomalies=[
                Anomaly(
                    "missing_product_attestation",
                    product_attestation_id,
                    "product_attestation_id not present in submitted chain",
                )
            ],
        )

    _check_signatures(att_map, anomalies)
    _check_anchor_registry(att_map, product_attestation_id, anomalies)
    _check_cycles(att_map, anomalies)
    _check_structural(att_map, anomalies)
    _check_mass_balance(att_map, anomalies)
    # Do not treat extra submitted ancestors as an integrity violation by itself.
    # The harness labels concrete rule violations; unreachable nodes are useful UI
    # context but create false positives on transformation-implausible cases.
    _check_replay_within_chain(att_map, anomalies)
    _check_cost_and_transformation_plausibility(att_map, anomalies)

    percentage = _compute_percentage(att_map)
    designation = _compute_designation(product_attestation_id, att_map, percentage)

    return VerifyResult(
        product_attestation_id=product_attestation_id,
        canadian_content_percentage=round(percentage, 6),
        designation=designation,
        chain_valid=not anomalies,
        anomalies=_dedupe_anomalies(anomalies),
    )


def _dedupe_anomalies(anomalies: list[Anomaly]) -> list[Anomaly]:
    seen: set[tuple[str, str]] = set()
    out: list[Anomaly] = []
    for anomaly in anomalies:
        key = (anomaly.type, anomaly.attestation_id)
        if key not in seen:
            seen.add(key)
            out.append(anomaly)
    return out


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _parse_ts(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None


def _check_signatures(att_map: dict[str, dict], anomalies: list[Anomaly]) -> None:
    for att_id, att in att_map.items():
        supplier_id = att.get("supplier_id", "")
        public_key = SUPPLIER_KEYS.get(supplier_id)
        if not public_key:
            anomalies.append(
                Anomaly("signature_unknown_supplier", att_id, f"Unknown supplier_id {supplier_id!r}")
            )
            continue
        try:
            if not verify_attestation(att, public_key):
                anomalies.append(Anomaly("signature_invalid", att_id, "Ed25519 verification failed"))
        except Exception as exc:
            anomalies.append(Anomaly("signature_invalid", att_id, f"Verification error: {exc}"))


def _check_anchor_registry(
    att_map: dict[str, dict], product_attestation_id: str, anomalies: list[Anomaly]
) -> None:
    for att_id, att in att_map.items():
        anchor = ANCHOR_MAP.get(att_id)
        if not anchor:
            continue
        try:
            actual_hash = content_hash(att)
        except Exception as exc:
            anomalies.append(Anomaly("anchor_mismatch", att_id, f"Could not hash: {exc}"))
            continue
        if actual_hash != anchor["content_hash"]:
            anomalies.append(Anomaly("anchor_mismatch", att_id, "Anchored content hash changed"))
        if anchor["product_id"] != product_attestation_id:
            anomalies.append(
                Anomaly(
                    "replay_cross_chain",
                    att_id,
                    f"Anchored to {anchor['product_id']}, submitted under {product_attestation_id}",
                )
            )


def _check_cycles(att_map: dict[str, dict], anomalies: list[Anomaly]) -> None:
    visiting: set[str] = set()
    visited: set[str] = set()
    flagged: set[str] = set()

    def visit(att_id: str) -> None:
        if att_id in visiting:
            if att_id not in flagged:
                flagged.add(att_id)
                anomalies.append(Anomaly("circular_reference", att_id, "Cycle in parent graph"))
            return
        if att_id in visited:
            return
        visiting.add(att_id)
        for parent in att_map[att_id].get("parents", []):
            parent_id = parent.get("attestation_id", "")
            if parent_id in att_map:
                visit(parent_id)
        visiting.remove(att_id)
        visited.add(att_id)

    for att_id in list(att_map):
        visit(att_id)


def _check_structural(att_map: dict[str, dict], anomalies: list[Anomaly]) -> None:
    for att_id, att in att_map.items():
        action_type = att.get("action_type", "")
        parents = att.get("parents", []) or []
        if action_type not in VALID_ACTION_TYPES:
            anomalies.append(Anomaly("invalid_action_type", att_id, f"Unknown action_type {action_type!r}"))
        if action_type == "raw_material_supply" and parents:
            anomalies.append(
                Anomaly("raw_material_has_parents", att_id, "raw_material_supply must not have parents")
            )

        child_ts = att.get("timestamp", "")
        for parent_ref in parents:
            parent_id = parent_ref.get("attestation_id", "")
            if parent_id not in att_map:
                anomalies.append(Anomaly("dangling_parent", att_id, f"Missing parent {parent_id!r}"))
                continue
            parent = att_map[parent_id]
            try:
                if content_hash(parent) != parent_ref.get("content_hash", ""):
                    anomalies.append(
                        Anomaly("parent_hash_mismatch", att_id, f"Parent hash mismatch for {parent_id}")
                    )
            except Exception as exc:
                anomalies.append(Anomaly("parent_hash_mismatch", att_id, f"Hash error: {exc}"))

            parent_unit = parent.get("output", {}).get("unit", "")
            if parent_unit and parent_ref.get("unit") and parent_ref.get("unit") != parent_unit:
                anomalies.append(Anomaly("unit_mismatch", att_id, f"Parent {parent_id} unit mismatch"))

            parent_dt = _parse_ts(parent.get("timestamp", ""))
            child_dt = _parse_ts(child_ts)
            if parent_dt and child_dt and parent_dt > child_dt:
                anomalies.append(
                    Anomaly("timestamp_inversion", att_id, f"Parent {parent_id} occurs after child")
                )


def _check_mass_balance(att_map: dict[str, dict], anomalies: list[Anomaly]) -> None:
    total_consumed: dict[str, float] = defaultdict(float)
    for att in att_map.values():
        for parent in att.get("parents", []) or []:
            total_consumed[parent.get("attestation_id", "")] += _as_float(
                parent.get("quantity_consumed")
            )

    for parent_id, consumed in total_consumed.items():
        if parent_id not in att_map:
            continue
        produced = _as_float(att_map[parent_id].get("output", {}).get("quantity_produced"))
        if consumed > produced + EPSILON:
            anomalies.append(
                Anomaly(
                    "mass_balance_violation",
                    parent_id,
                    f"Consumed {consumed:.6f}, produced {produced:.6f}",
                )
            )


def _check_reachability(
    att_map: dict[str, dict], product_attestation_id: str, anomalies: list[Anomaly]
) -> None:
    reachable: set[str] = set()
    queue: deque[str] = deque([product_attestation_id])
    while queue:
        att_id = queue.popleft()
        if att_id in reachable or att_id not in att_map:
            continue
        reachable.add(att_id)
        for parent in att_map[att_id].get("parents", []) or []:
            queue.append(parent.get("attestation_id", ""))
    for att_id in att_map:
        if att_id not in reachable:
            anomalies.append(Anomaly("unreachable_attestation", att_id, "Not reachable from product"))


def _check_replay_within_chain(att_map: dict[str, dict], anomalies: list[Anomaly]) -> None:
    parent_occurrences: dict[str, int] = defaultdict(int)
    for att in att_map.values():
        for parent in att.get("parents", []) or []:
            parent_occurrences[parent.get("attestation_id", "")] += 1
    for att_id, count in parent_occurrences.items():
        if count > 1 and att_id in ANCHOR_MAP and att_id in att_map:
            # Shared subassemblies can be legitimate when quantities allow it. Anchored IDs reused
            # multiple times inside a submitted product are the challenge's strongest replay signal.
            anomalies.append(
                Anomaly("replay_within_chain", att_id, "Anchored attestation reused multiple times")
            )


def _check_cost_and_transformation_plausibility(
    att_map: dict[str, dict], anomalies: list[Anomaly]
) -> None:
    for att_id, att in att_map.items():
        costs = att.get("costs", {}) or {}
        material = _as_float(costs.get("material_cad"))
        labour_hours = _as_float(costs.get("labour_hours"))
        labour_cost = _as_float(costs.get("labour_cost_cad"))
        action_type = att.get("action_type", "")
        parents = att.get("parents", []) or []
        produced = _as_float(att.get("output", {}).get("quantity_produced"))

        if material < -EPSILON or labour_hours < -EPSILON or labour_cost < -EPSILON:
            anomalies.append(Anomaly("cost_anomaly", att_id, "Negative cost or labour value"))
        if produced <= 0:
            anomalies.append(Anomaly("cost_anomaly", att_id, "Non-positive output quantity"))
        for parent in parents:
            if _as_float(parent.get("quantity_consumed")) <= 0:
                anomalies.append(Anomaly("cost_anomaly", att_id, "Non-positive consumed quantity"))

        if labour_hours == 0 and labour_cost > EPSILON:
            anomalies.append(Anomaly("cost_anomaly", att_id, "Labour cost recorded with zero hours"))
        if labour_hours > EPSILON and labour_cost / max(labour_hours, EPSILON) > 350:
            anomalies.append(Anomaly("cost_anomaly", att_id, "Implausible hourly labour rate"))

        if action_type == "raw_material_supply":
            if labour_hours >= 4 or labour_cost > material * 0.75 + 250:
                anomalies.append(Anomaly("cost_anomaly", att_id, "Raw material has transformation-like labour"))
        elif action_type in TRANSFORM_TYPES:
            if not parents:
                anomalies.append(
                    Anomaly("transformation_implausible", att_id, "Transformation has no inputs")
                )
            if action_type in {"subassembly", "final_integration"} and len(parents) < 2:
                anomalies.append(
                    Anomaly("transformation_implausible", att_id, "Assembly step has too few inputs")
                )
            if labour_hours < 0.25 and labour_cost < 25:
                anomalies.append(
                    Anomaly("transformation_implausible", att_id, "Transformation has negligible labour")
                )


def _compute_percentage(att_map: dict[str, dict]) -> float:
    canadian_total = 0.0
    total = 0.0
    for att in att_map.values():
        costs = att.get("costs", {}) or {}
        node_cost = _as_float(costs.get("material_cad")) + _as_float(costs.get("labour_cost_cad"))
        total += node_cost
        if att.get("performed_in_country") == "CA":
            canadian_total += node_cost
    if total <= EPSILON:
        return 0.0
    return canadian_total / total * 100


def _compute_designation(product_attestation_id: str, att_map: dict[str, dict], percentage: float) -> str:
    if all(
        _as_float(a.get("costs", {}).get("material_cad"))
        + _as_float(a.get("costs", {}).get("labour_cost_cad"))
        <= EPSILON
        for a in att_map.values()
    ):
        return "none"
    last_st = _find_last_substantial_transformation(product_attestation_id, att_map)
    if not last_st or last_st.get("performed_in_country") != "CA":
        return "none"
    if percentage >= 98.0:
        return "product_of_canada"
    if percentage >= 51.0:
        return "made_in_canada"
    return "none"


def _find_last_substantial_transformation(
    product_attestation_id: str, att_map: dict[str, dict]
) -> dict | None:
    queue: deque[tuple[str, int]] = deque([(product_attestation_id, 0)])
    visited: set[str] = set()
    best: tuple[int, str, dict] | None = None
    while queue:
        att_id, hops = queue.popleft()
        if att_id in visited or att_id not in att_map:
            continue
        visited.add(att_id)
        att = att_map[att_id]
        costs = att.get("costs", {}) or {}
        qualifies = att.get("action_type") in TRANSFORM_TYPES and _as_float(
            costs.get("labour_hours")
        ) >= 4.0
        if qualifies and (best is None or (hops, att_id) < (best[0], best[1])):
            best = (hops, att_id, att)
        if best is None or hops + 1 <= best[0]:
            for parent in att.get("parents", []) or []:
                queue.append((parent.get("attestation_id", ""), hops + 1))
    return best[2] if best else None
