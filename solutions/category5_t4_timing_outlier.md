# Category 5: Statistical Timing Outlier Detection (t4_timing_outlier)

Attacks where attestations have abnormally short time gaps between parent and child, but pass all hard cryptographic and structural rules.

## Attacks Covered

| Attack | Count | Detection |
|---|---|---|
| t4_timing_outlier | 41 | Min parent-child gap below clean floor for (action_type, output_name) |

**Total: 41 cases (10 component_manufacture, 21 final_integration, 10 subassembly)**

## The Problem

These chains are cryptographically valid. The anomaly is the time between a parent attestation and its child is unusually short — implying the work was done impossibly fast relative to genuine supply chains.

### Clean Distribution

| action_type | Min Gap (clean) | Mean Gap | Median |
|---|---|---|---|
| component_manufacture | 29.5h | 264.5h | 269.5h |
| subassembly | 24.0h | 272.4h | 269.5h |
| final_integration | 24.0h | 259.4h | 264.0h |

### Perturbed Gaps

All 41 outliers have SHORT gaps (8–35 hours). Many fall below the clean minimum for their specific (action_type, output_name) combination.

## Detection Logic

Floor-based approach using per-(action_type, output_name) minimum gaps learned from clean training data:

```python
# During training: record minimum gap per (action, output_name) from clean chains
_name_min_gap = {}  # (action, name) -> minimum observed gap in clean data

# During detection:
min_gap = min(parent-child gaps for this attestation)
clean_floor = _name_min_gap[(action, output_name)]
if min_gap < clean_floor * 0.9:
    flag("statistical_timing_anomaly", att_id)
```

The 0.9 multiplier provides a small tolerance so we don't flag chains that are exactly at the clean minimum due to floating-point or minor timing variations.

## Why Log Z-Scores Failed

The original approach used `log1p(gap)` with z-score threshold 4.2. Problems:
- Clean chains have a cluster of gaps at z=4.12 (log scale) — lowering the threshold creates massive FPs
- The gap distribution is extremely wide (24h to 2237h), so log z-scores compress the signal
- At threshold 4.2, only 17/41 outliers were caught

## Key Design Decisions

1. **Floor-based, not z-score-based**: Since the anomaly is "too short", a simple floor works better than a symmetric z-score. No false positives by definition.
2. **Per-(action, name) granularity**: Different products have different minimum turnaround times. A "BLDC motor" might take at least 29.5h, while a "Man-portable solar kit" takes at least 48h.
3. **0.9 multiplier**: Small tolerance to avoid flagging clean chains that happen to be at exactly the minimum.
4. **Priority**: Timing check runs after cost/labour checks to avoid double-flagging.

## Results

| Metric | Before | After |
|---|---|---|
| t4_timing_outlier score | 45.5% | 65.0% |
| clean score | 98.6% | 98.6% |
| Overall score | 94.5% | 95.3% |

## Remaining Misses (16/41)

The 16 missed cases have min gaps between `clean_floor * 0.9` and the clean floor — they're very close to legitimate timing and cannot be caught without accepting false positives.
