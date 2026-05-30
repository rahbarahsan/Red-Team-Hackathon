# Category 4: Statistical Labour Outlier Detection (t4_labour_outlier)

Attacks where attestations have abnormally high labour hours for their action type, but pass all hard cryptographic and structural rules.

## Attacks Covered

| Attack | Count | Detection |
|---|---|---|
| t4_labour_outlier | 28 | Labour hours significantly exceed normal range for action_type |

**Total: 28 cases (13 component_manufacture, 15 subassembly)**

## The Problem

These chains are cryptographically valid. The anomaly is that labour_hours values are far above what genuine chains produce for the same action type.

### Clean Distribution

| action_type | Mean Hours | Std Dev | Max |
|---|---|---|---|
| component_manufacture | 7.35 | 2.44 | 13.70 |
| subassembly | 12.70 | 4.18 | 23.70 |

### Perturbed Hours

- `component_manufacture` outliers: 20.1–33.2 hours (all above clean max of 13.7)
- `subassembly` outliers: 20.3–31.8 hours (some overlap with clean max of 23.7)

## Detection Logic

Uses **linear (raw) z-scores** on labour_hours per action type:

```python
LINEAR_HOURS_THRESHOLDS = {
    "component_manufacture": 2.6,  # threshold = 13.7h (just above clean max)
    "subassembly": 2.6,            # threshold = 23.6h (just below clean max 23.7)
    "final_integration": 3.0,
}

hours_stats = linear_stats[action]["labour_hours"]
z_hours = abs(hours - hours_stats["mean"]) / hours_stats["std"]
if z_hours > threshold:
    flag("statistical_labour_anomaly", att_id)
```

## Why Log-Transform Failed

The original detector used `log1p(hours)` which compresses high values:
- Component outlier at 20.1h: log z = 3.20 (below 3.4 threshold)
- Subassembly outlier at 25.8h: log z = 2.28 (far below threshold)

Linear z-scores for the same values: 5.22 and 3.13 — much more separable.

## Key Design Decisions

1. **Linear z-scores**: Hours have a tighter distribution than rates; log compression hurts discrimination.
2. **Threshold 2.6 for both**: At this level, component_manufacture has 0 FPs (clean max=13.7, threshold=13.7). Subassembly has 2 FPs (clean max=23.7, threshold=23.6), but the net gain from catching 22/28 outliers far outweighs 2 FPs.
3. **Priority ordering**: Rate check runs first, then name-rate, then hours. This prevents double-flagging attestations that are outliers on both rate AND hours.

## Results

| Metric | Before | After |
|---|---|---|
| t4_labour_outlier score | 38.1% | 76.2% |
| clean score | 98.6% | 98.6% |
| Overall score | 93.5% | 94.5% |

## Remaining Misses

6 subassembly cases with hours 20.3–23.1 fall below the 23.6h threshold. These overlap with the clean distribution's upper range and cannot be caught without significant false positives.
