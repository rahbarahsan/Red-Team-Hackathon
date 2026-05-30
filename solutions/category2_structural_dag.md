# Category 2: Structural / DAG Integrity Checks

Attacks detected by walking the DAG and verifying hash-links, references, and structure.

## Attacks Covered

| Attack | Count | Detection |
|---|---|---|
| parent_hash_mismatch | 12 | Recomputed SHA-256 of parent's canonical form doesn't match claimed `content_hash` |
| dangling_parent | 13 | Parent `attestation_id` not present in the submitted chain |
| circular | 19 | Cycle detected in parent references (DAG has a loop) |
| replay_within_chain | 11 | Same `attestation_id` appears more than once in the attestations array |

**Total: 55 cases**

## Detection Logic

```python
att_map = {a['attestation_id']: a for a in attestations}

# Check 1: replay — duplicate attestation IDs
seen_ids = set()
for att in attestations:
    if att['attestation_id'] in seen_ids:
        flag("replay_within_chain", att['attestation_id'])
    seen_ids.add(att['attestation_id'])

# Check 2: dangling parent — parent not in chain
for att in attestations:
    for parent_ref in att['parents']:
        if parent_ref['attestation_id'] not in att_map:
            flag("dangling_parent", att['attestation_id'])

# Check 3: parent hash mismatch — recompute and compare
for att in attestations:
    for parent_ref in att['parents']:
        parent_att = att_map.get(parent_ref['attestation_id'])
        if parent_att:
            computed = sha256(canonical_serialize(parent_att, exclude_signature=True))
            if computed != parent_ref['content_hash']:
                flag("parent_hash_mismatch", att['attestation_id'])

# Check 4: circular — topological sort (Kahn's algorithm)
in_degree = {aid: 0 for aid in att_map}
for att in att_map.values():
    for p in att['parents']:
        pid = p['attestation_id']
        if pid in att_map:
            in_degree[att['attestation_id']] += 1

queue = [aid for aid, deg in in_degree.items() if deg == 0]
visited = set()
while queue:
    curr = queue.pop(0)
    visited.add(curr)
    for att in att_map.values():
        for p in att['parents']:
            if p['attestation_id'] == curr and att['attestation_id'] not in visited:
                in_degree[att['attestation_id']] -= 1
                if in_degree[att['attestation_id']] == 0:
                    queue.append(att['attestation_id'])

if len(visited) < len(att_map):
    # nodes not in visited are part of a cycle
    for aid in att_map:
        if aid not in visited:
            flag("circular_reference", aid)
```

## Key Observations

- **replay_within_chain**: Exact duplicate entries. Simplest check — just track seen IDs.
- **dangling_parent**: References a non-existent attestation. Often uses obviously fake IDs like `att-doesnotexist000000000`.
- **parent_hash_mismatch**: The parent attestation exists but its content doesn't match the hash the child committed to. Means either the parent was swapped or tampered with.
- **circular**: A raw material claims to consume the final product — physically impossible. Topological sort (Kahn's algorithm) detects this in O(n) and also provides correct traversal order for downstream checks. Circular cases often produce secondary anomalies (hash mismatches, timestamp inversions) as side effects.
