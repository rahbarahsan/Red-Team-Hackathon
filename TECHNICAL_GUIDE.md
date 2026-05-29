# Cryptographic Provenance for Canadian Supply Chains — Technical Guide

**AVSS / Ottawa Defence Hackathon · Challenge brief for participants**

## 1. The problem

Canada's "Buy Canadian" rules turn on two designations:

- **Product of Canada** — nearly all direct production costs incurred in Canada.
- **Made in Canada** — a majority of direct costs incurred in Canada, *plus* the last substantial transformation performed in Canada.

Today these claims rest on supplier self-reporting: hard to verify, easy to misrepresent, and impossible to reconstruct once a product has passed through many hands. Your job is to build a system that establishes provenance cryptographically — every supplier contribution is a signed attestation, attestations link across tiers into a tamper-evident chain, and the chain can be independently verified and used to compute the Canadian-content designation.

## 2. What you build

A backend exposing **`POST /verify`** that, given a product's attestation chain, returns its Canadian-content percentage, its designation, whether the chain is valid, and any integrity anomalies it detects. You also build two UIs (supplier issuing, purchaser lookup) for the demo — but only the backend is automatically scored.

Submit as a **Docker Compose** project; the backend must listen on the port named in the event instructions.

## 3. What's in this kit

```
reference_lib/        Canonical serialization + Ed25519 sign/verify (the byte-exact core)
registry/
  supplier_public_keys.json   supplier_id -> Ed25519 public key
  anchor_registry.json        the public "ledger" of genuine attestations (see §7)
private_keys/
  supplier_private_keys.json  all supplier private keys (see threat model, §8)
training_corpus.jsonl         1,000 labeled chains to develop and train against
self_test.py                  grade your /verify against the training labels
worked-example/               a full, valid recovery-drone chain + its expected result
TECHNICAL_GUIDE.md            this document
```

## 4. The attestation (on the wire)

Each attestation is a signed JSON object:

```json
{
  "attestation_id": "att-...",
  "version": "1.0",
  "supplier_id": "sup-...",
  "timestamp": "2026-04-15T14:30:00Z",
  "action_type": "component_manufacture",
  "performed_in_country": "CA",
  "parents": [
    {"attestation_id": "att-...", "content_hash": "<sha256 hex>", "quantity_consumed": 8.0, "unit": "m2"}
  ],
  "output": {"name": "Parachute Assembly", "quantity_produced": 1, "unit": "units"},
  "costs": {"material_cad": 0.0, "labour_hours": 6.5, "labour_cost_cad": 520.0},
  "signature": {"algorithm": "ed25519", "value": "<base64>"}
}
```

Key points:

- `action_type` ∈ `raw_material_supply | component_manufacture | subassembly | final_integration`. Raw-material supply has no parents and carries the purchase cost in `material_cad`.
- `performed_in_country` is where *this step's* work happened. It is **independent** of the supplier's registered country — a Canadian firm may perform work abroad and vice-versa. Canadian content is attributed by `performed_in_country`, per attestation.
- `parents[].content_hash` is the SHA-256 of the parent attestation's canonical form (signature excluded). It binds each child to its parent's *content*, not just its id — the chain is hash-linked.
- The attestations you receive for one product include the leaf product plus all ancestors, in **unspecified order**. Build the DAG from `parents`.

## 5. Canonical serialization & signatures

Signatures and content hashes only match across implementations if everyone serializes identically. The rules (implemented in `reference_lib`, with golden vectors in `reference_lib/tests/`):

1. JSON, keys sorted at every level; compact (no whitespace); UTF-8.
2. The `signature` field is excluded from the bytes that are signed/hashed.
3. Whole numbers serialize as integers (`1`, not `1.0`); non-whole with no trailing zeros (`520.5`).
4. No NaN/Infinity.

A signature is valid only if it verifies against the **public key registered to the attestation's claimed `supplier_id`**.

## 6. Computing designation

```
percentage = (Σ direct cost of CA attestations) / (Σ direct cost of all attestations) × 100
direct cost of an attestation = material_cad + labour_cost_cad   (labour_hours is not a cost)

substantial transformation = action_type in {component_manufacture, subassembly, final_integration}
                             AND labour_hours >= 4
last substantial transformation = the qualifying node closest to the product leaf

if no substantial transformation OR last one not performed in CA:  designation = none
elif percentage >= 98:  product_of_canada
elif percentage >= 51:  made_in_canada
else:                   none
```

CAD only; no currency or unit conversion. A child must consume in its parent's `output.unit`.

## 7. The anchor registry

`anchor_registry.json` is the published, signed record of genuine attestations: it maps real `attestation_id`s to their content hash and the product they belong to. It is the source of truth an attacker cannot rewrite. Use it as you see fit.

It is **not exhaustive** — legitimately new products exist whose attestations are not anchored. Absence from the registry is therefore *not itself* a problem; a clean unanchored chain is valid.

## 8. Threat model — read this

**All supplier private keys ship in this kit.** Key theft is out of scope. This means an adversary can produce a perfectly, correctly signed malicious chain. **A valid signature proves a message wasn't garbled — it does not prove the claim is true.** Robust verification has to reason about whether a chain is internally consistent and physically/economically plausible, not just whether it's signed.

## 9. The `/verify` contract

Request:

```json
{ "product_attestation_id": "att-...", "attestations": [ { ... }, { ... } ] }
```

Response:

```json
{
  "product_attestation_id": "att-...",
  "canadian_content_percentage": 58.4,
  "designation": "made_in_canada",
  "chain_valid": false,
  "anomalies": [
    {"type": "mass_balance_violation", "attestation_id": "att-...", "details": "..."}
  ]
}
```

`anomalies[].type` is a **free-form** short label. The examples you will see named in this kit and the training data are **not a complete list of what can go wrong** — discovering the full range of integrity attacks is a core part of the challenge. Identify the offending attestation and describe the violation; a recognizable type label earns extra credit.

## 10. How you're scored

Only the backend is auto-graded, on a held-out set of chains, against four things: the Canadian-content percentage (within a small tolerance), the designation (exact), whether you detected the integrity violations that exist (by attestation, scored by F1 so over-flagging hurts), and how well you classified them. Harder cases are weighted more heavily.

Cases fall on a spectrum. Many are caught by a careful, spec-correct implementation. Some are **statistical** — perfectly legal on every individual rule, but anomalous relative to how genuine supply chains actually look; catching these reliably rewards learning from the data in `training_corpus.jsonl`. Aim for a solid correct core first, then push the ceiling.

## 11. Get started

1. Read `worked-example/recovery_drone_chain.json` and confirm you can reproduce `recovery_drone_expected.json` (valid, 58.4%, made_in_canada).
2. Verify a signature with `reference_lib`; match a `content_hash`.
3. Stand up `POST /verify`; run `python3 self_test.py http://localhost:<port>/verify` and iterate.
