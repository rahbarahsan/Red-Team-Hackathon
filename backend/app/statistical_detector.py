from __future__ import annotations

import json
import math
import os
from collections import defaultdict
from datetime import datetime
from typing import Any

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))


def _find_repo_root() -> str:
    d = _THIS_DIR
    for _ in range(8):
        if os.path.exists(os.path.join(d, "training_corpus.jsonl")):
            return d
        d = os.path.dirname(d)
    return os.environ.get("PROJECT_ROOT", "/app")


REPO_ROOT = _find_repo_root()
CORPUS_PATH = os.environ.get("CORPUS_PATH", os.path.join(REPO_ROOT, "training_corpus.jsonl"))
Z_THRESHOLD = 3.4
MIN_SAMPLES = 20
ORIGIN_PROB_THRESHOLD = 0.02

_raw: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
_raw_linear: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
_country_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
_name_country_counts: dict[tuple[str, str], dict[str, int]] = defaultdict(lambda: defaultdict(int))
_name_rate_stats: dict[tuple[str, str], dict[str, float]] = {}
_compiled: dict[str, dict[str, dict[str, float]]] = {}
_compiled_linear: dict[str, dict[str, dict[str, float]]] = {}


def _as_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _parse_ts(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None


def _log(value: float) -> float:
    return math.log1p(max(value, 0.0))


def _stats(values: list[float]) -> dict[str, float] | None:
    if len(values) < MIN_SAMPLES:
        return None
    mean = sum(values) / len(values)
    var = sum((x - mean) ** 2 for x in values) / max(len(values) - 1, 1)
    std = math.sqrt(var)
    if std <= 0:
        return None
    return {"mean": mean, "std": std, "n": float(len(values))}


def _z(value: float, stats: dict[str, float]) -> float:
    return abs(value - stats["mean"]) / stats["std"]


def _train() -> None:
    if not os.path.exists(CORPUS_PATH):
        return
    with open(CORPUS_PATH, encoding="utf-8") as fh:
        for line in fh:
            row = json.loads(line)
            labels = row.get("labels", {})
            if labels.get("attack") or not labels.get("chain_valid", True):
                continue
            chain = row.get("chain", {})
            att_map = {a.get("attestation_id"): a for a in chain.get("attestations", [])}
            for att in chain.get("attestations", []):
                action = att.get("action_type", "")
                costs = att.get("costs", {}) or {}
                hours = _as_float(costs.get("labour_hours"))
                labour = _as_float(costs.get("labour_cost_cad"))
                material = _as_float(costs.get("material_cad"))
                output_name = att.get("output", {}).get("name", "")
                if hours > 0:
                    _raw[action]["effective_rate"].append(_log(labour / hours))
                    _raw[action]["labour_hours"].append(_log(hours))
                    _raw_linear[action]["effective_rate"].append(labour / hours)
                    _raw_linear[action]["labour_hours"].append(hours)
                    _raw_linear[(action, output_name)]["effective_rate"].append(labour / hours)
                if material > 0:
                    _raw[action]["material_cad"].append(_log(material))
                    _raw_linear[action]["material_cad"].append(material)
                country = att.get("performed_in_country")
                if country:
                    _country_counts[action][country] += 1
                    _name_country_counts[(action, output_name)][country] += 1
                child_ts = _parse_ts(att.get("timestamp", ""))
                for parent_ref in att.get("parents", []) or []:
                    parent = att_map.get(parent_ref.get("attestation_id"))
                    parent_ts = _parse_ts(parent.get("timestamp", "")) if parent else None
                    if parent_ts and child_ts:
                        _raw[action]["parent_gap_hours"].append(
                            _log(max((child_ts - parent_ts).total_seconds() / 3600, 0.0))
                        )

    for action, features in _raw.items():
        _compiled[action] = {}
        for name, values in features.items():
            stats = _stats(values)
            if stats:
                _compiled[action][name] = stats

    for key, features in _raw_linear.items():
        if isinstance(key, tuple):
            action, output_name = key
            for fname, values in features.items():
                s = _stats(values)
                if s:
                    _name_rate_stats[(action, output_name)] = s
        else:
            _compiled_linear[key] = {}
            for fname, values in features.items():
                s = _stats(values)
                if s:
                    _compiled_linear[key][fname] = s


_train()


LINEAR_RATE_THRESHOLDS = {
    "component_manufacture": 3.0,
    "subassembly": 3.0,
    "final_integration": 3.2,
}
NAME_RATE_THRESHOLD = 2.5


def detect_statistical_anomalies(attestations: list[dict], z_threshold: float = Z_THRESHOLD) -> list[dict]:
    result: list[dict] = []
    att_map = {a.get("attestation_id"): a for a in attestations}
    for att in attestations:
        att_id = att.get("attestation_id", "")
        action = att.get("action_type", "")
        stats = _compiled.get(action, {})
        costs = att.get("costs", {}) or {}
        hours = _as_float(costs.get("labour_hours"))
        labour = _as_float(costs.get("labour_cost_cad"))
        material = _as_float(costs.get("material_cad"))
        output_name = att.get("output", {}).get("name", "")

        flagged = False

        if hours > 0 and not flagged:
            raw_rate = labour / hours
            linear_stats = _compiled_linear.get(action, {}).get("effective_rate")
            if linear_stats:
                z_raw = _z(raw_rate, linear_stats)
                threshold = LINEAR_RATE_THRESHOLDS.get(action, 3.0)
                if z_raw > threshold:
                    result.append(
                        {
                            "type": "statistical_cost_anomaly",
                            "attestation_id": att_id,
                            "details": f"effective_rate {raw_rate:.1f} is {z_raw:.1f} sigma from clean {action} mean",
                        }
                    )
                    flagged = True

            if not flagged:
                name_stats = _name_rate_stats.get((action, output_name))
                if name_stats and name_stats["n"] >= MIN_SAMPLES:
                    z_name = _z(raw_rate, name_stats)
                    if z_name > NAME_RATE_THRESHOLD:
                        result.append(
                            {
                                "type": "statistical_cost_anomaly",
                                "attestation_id": att_id,
                                "details": f"effective_rate {raw_rate:.1f} is {z_name:.1f} sigma from clean {action}/{output_name} mean",
                            }
                        )
                        flagged = True

        checks: list[tuple[str, float, str]] = []
        if not flagged:
            if hours > 0 and "labour_hours" in stats:
                checks.append(("statistical_labour_anomaly", _log(hours), "labour_hours"))
            if material > 0 and "material_cad" in stats:
                checks.append(("statistical_material_anomaly", _log(material), "material_cad"))

            child_ts = _parse_ts(att.get("timestamp", ""))
            gaps = []
            for parent_ref in att.get("parents", []) or []:
                parent = att_map.get(parent_ref.get("attestation_id"))
                parent_ts = _parse_ts(parent.get("timestamp", "")) if parent else None
                if child_ts and parent_ts:
                    gaps.append(max((child_ts - parent_ts).total_seconds() / 3600, 0.0))
            if gaps and "parent_gap_hours" in stats:
                checks.append(("statistical_timing_anomaly", _log(min(gaps)), "parent_gap_hours"))

            feature_thresholds = {
                "material_cad": 3.4,
                "labour_hours": 3.4,
                "parent_gap_hours": 4.2,
            }
            for anomaly_type, value, feature in checks:
                z = _z(value, stats[feature])
                if z > feature_thresholds.get(feature, z_threshold):
                    result.append(
                        {
                            "type": anomaly_type,
                            "attestation_id": att_id,
                            "details": f"{feature} is {z:.1f} sigma from clean {action} profile",
                        }
                    )
                    flagged = True
                    break

        if not flagged:
            country_counts = _name_country_counts.get((action, output_name), {})
            country = att.get("performed_in_country")
            total = sum(country_counts.values())
            country_probability = country_counts.get(country, 0) / total if total else 1.0
            if total >= 50 and country and country_probability < ORIGIN_PROB_THRESHOLD:
                result.append(
                    {
                        "type": "statistical_origin_anomaly",
                        "attestation_id": att_id,
                        "details": f"{country} not observed for clean {action} attestations",
                    }
                )
    return result
