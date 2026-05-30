# Category 1: Cryptographic / Identity Checks

Attacks detected by verifying Ed25519 signatures and supplier registry lookups.

## Attacks Covered

| Attack | Count | Detection |
|---|---|---|
| signature_corrupt | 17 | Signature fails Ed25519 verification against supplier's public key |
| tamper_no_resign | 7 | Same check — data was modified but signature wasn't re-computed |
| unknown_supplier | 15 | `supplier_id` not found in `supplier_public_keys.json` |

**Total: 39 cases**

## Detection Logic

```python
pub_keys = load("registry/supplier_public_keys.json")["keys"]

for att in attestations:
    sid = att["supplier_id"]

    # Check 1: unknown supplier
    if sid not in pub_keys:
        flag("signature_unknown_supplier", att["attestation_id"])
        continue

    # Check 2: signature verification
    if not verify_attestation(att, pub_keys[sid]):
        flag("signature_invalid", att["attestation_id"])
```

## Key Observations

- `signature_corrupt` flips as little as **1 byte** in the signature — Ed25519 verification catches it regardless of how many bytes differ.
- `tamper_no_resign` modifies attestation data but leaves the old signature — the same `verify_attestation()` call catches both.
- `unknown_supplier` uses fabricated IDs like `sup-ghost-9999` that have no public key in the registry. Some cases have 2 unknown suppliers in one chain.
- Order matters: check for unknown supplier **before** attempting signature verification (no key to verify against).
