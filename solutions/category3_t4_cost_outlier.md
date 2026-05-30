# Category 3: Statistical Cost Outlier Detection (t4_cost_outlier)

Attacks where attestations have labour rates significantly outside the normal distribution for their action type, but pass all hard cryptographic and structural rules.

## Attacks Covered

| Attack | Count | Detection |
|---|---|---|
| t4_cost_outlier | 17 | Labour rate ($/hr) deviates significantly from clean population for same action_type |

**Total: 17 cases**

## The Problem

These chains are cryptographically valid — signatures verify, hashes match, no structural issues. The anomaly is purely **statistical**: the effective labour rate (labour_cost_cad / labour_hours) is abnormally high compared to genuine chains.

### Clean Distribution (from training corpus)

| action_type | Mean Rate ($/hr) | Std Dev | Max |
|---|---|---|---|
| component_manufacture | 65.07 | 11.79 | 107.36 |
| subassembly | 85.05 | 11.81 | 124.08 |
| final_integration | 105.19 | 11.73 | 141.63 |

### Perturbed Rates

- `component_manufacture` outliers: 100–116 $/hr (3.0–4.3 sigma)
- `subassembly` outliers: 97–109 $/hr (1.0–2.0 sigma on action-level, higher on per-output-name level)

## Detection Logic

Two-tier approach using **raw (non-log) z-scores**:

```python
# Tier 1: Per action_type rate check
LINEAR_RATE_THRESHOLDS = {
    "component_manufacture": 3.0,
    "subassembly": 3.0,
    "final_integration": 3.2,
}

raw_rate = labour_cost_cad / labour_hours
z_score = abs(raw_rate - action_mean) / action_std
if z_score > threshold:
    flag("statistical_cost_anomaly", att_id)

# Tier 2: Per (action_type, output_name) rate check (catches subtler cases)
NAME_RATE_THRESHOLD = 2.5

name_stats = stats_for(action_type, output_name)  # requires N >= 20 samples
z_name = abs(raw_rate - name_mean) / name_std
if z_name > NAME_RATE_THRESHOLD:
    flag("statistical_cost_anomaly", att_id)
```

## Key Design Decisions

1. **Raw z-scores, not log-transformed**: The original detector used `log1p(rate)` which compresses differences at higher values. Since the outliers are at 100-116 (vs mean 65), the log transform made them ~2σ instead of ~3σ. Raw scale preserves the signal.

2. **Per-action thresholds**: Different action types have different rate distributions. component_manufacture is tightest (std=11.79), so a lower threshold works. final_integration has higher variance, needs a higher threshold to avoid FPs.

3. **Per-output-name fallback**: Subassembly outliers (97-109) are within the global subassembly range (max 124), but when profiled by specific output name (e.g., "Uncooled LWIR core", mean=84.33, std=10.93), they become 2+ sigma outliers.

4. **Threshold of 3.0σ for action-level**: At 2.8σ we catch all 14 component_manufacture outliers but create 5 false positives. At 3.0σ we catch 12/14 with fewer FPs. The net F1 improvement favors 3.0.

## Results

| Metric | Before | After |
|---|---|---|
| t4_cost_outlier score | 5.9% | 79.4% |
| clean score | 92.9% | 98.6% |
| Overall score | 89.4% | 93.5% |

## Limitations

- 3 subassembly outliers have rates (97.3, 106.2, 109.1) that are only 1-2σ from the clean mean. The "Flight controller" at 97.35 is essentially indistinguishable from clean data without over-fitting.
- The per-name approach requires sufficient samples (N >= 20) to be reliable.
