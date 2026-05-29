"""Golden-vector + behavior tests for the reference library.

The frozen constants below are the byte-exact source of truth. Any change to
canonical serialization or signing that breaks these MUST be deliberate —
generator, scoring harness, and team reimplementations all depend on matching
these exactly. Run: `python -m reference_lib.tests.test_golden` (or pytest).
"""
from __future__ import annotations

import math

from reference_lib.canonical import canonical_serialize as cs, content_hash
from reference_lib.crypto import (
    keypair_from_seed,
    sign_attestation,
    verify_attestation,
)

# Deterministic key from the 32-byte seed bytes(range(32)).
SEED = bytes(range(32))
GOLDEN_PRIV = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
GOLDEN_PUB = "A6EHv/POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg="

GOLDEN_ATT = {
    "attestation_id": "att-golden-0001",
    "version": "1.0",
    "supplier_id": "sup-avss-corp",
    "timestamp": "2026-04-15T14:30:00Z",
    "action_type": "component_manufacture",
    "performed_in_country": "CA",
    "parents": [
        {
            "attestation_id": "att-parent-aaaa",
            "content_hash": "deadbeef",
            "quantity_consumed": 8.0,
            "unit": "m2",
        }
    ],
    "output": {"name": "Parachute Assembly", "quantity_produced": 1, "unit": "units"},
    "costs": {"material_cad": 0.0, "labour_hours": 6.5, "labour_cost_cad": 520.0},
}

GOLDEN_CANON = (
    '{"action_type":"component_manufacture","attestation_id":"att-golden-0001",'
    '"costs":{"labour_cost_cad":520,"labour_hours":6.5,"material_cad":0},'
    '"output":{"name":"Parachute Assembly","quantity_produced":1,"unit":"units"},'
    '"parents":[{"attestation_id":"att-parent-aaaa","content_hash":"deadbeef",'
    '"quantity_consumed":8,"unit":"m2"}],"performed_in_country":"CA",'
    '"supplier_id":"sup-avss-corp","timestamp":"2026-04-15T14:30:00Z","version":"1.0"}'
)
GOLDEN_CHASH = "09aba57571d866025650689b5416bc17a77e1c44216ab3a70535962242ba506b"
GOLDEN_SIG = (
    "sSWieMGMjTmxGHL4ewUx5whpW0rBQQDQNYWaxJiI0HE5qTKk17ipptr1zfb5BOIHET4m/+O3qyGxJvSktCYqCw=="
)


def test_canonical_rules():
    assert cs({"b": 1, "a": 2}) == b'{"a":2,"b":1}'
    assert cs(1.0) == b"1"  # whole float -> int form
    assert cs(8.0) == b"8"
    assert cs(520.50) == b"520.5"  # no trailing zeros
    assert cs(0.1) == b"0.1"
    assert cs(True) == b"true" and cs(False) == b"false" and cs(None) == b"null"
    assert cs({"x": [1, 2.0, 3.5]}) == b'{"x":[1,2,3.5]}'
    assert cs({"z": {"b": 1, "a": 2}, "a": 1}) == b'{"a":1,"z":{"a":2,"b":1}}'
    assert cs({"city": "Gen\u00e8ve"}) == '{"city":"Gen\u00e8ve"}'.encode("utf-8")


def test_canonical_rejects_non_finite():
    for bad in (math.nan, math.inf, -math.inf):
        try:
            cs(bad)
        except ValueError:
            continue
        raise AssertionError(f"accepted non-finite {bad}")


def test_golden_canonical_and_hash():
    assert cs(GOLDEN_ATT, exclude_signature=True).decode() == GOLDEN_CANON
    assert content_hash(GOLDEN_ATT) == GOLDEN_CHASH


def test_golden_keypair_and_signature():
    priv, pub = keypair_from_seed(SEED)
    assert priv == GOLDEN_PRIV
    assert pub == GOLDEN_PUB
    signed = sign_attestation(GOLDEN_ATT, priv)
    assert signed["signature"]["value"] == GOLDEN_SIG  # deterministic Ed25519
    assert verify_attestation(signed, pub) is True


def test_verify_rejects_tamper_and_wrong_key():
    priv, pub = keypair_from_seed(SEED)
    signed = sign_attestation(GOLDEN_ATT, priv)
    tampered = dict(signed)
    tampered["costs"] = dict(tampered["costs"], labour_cost_cad=9999.0)
    assert verify_attestation(tampered, pub) is False
    _, other_pub = keypair_from_seed(bytes([1] * 32))
    assert verify_attestation(signed, other_pub) is False


def _run():
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"PASS  {fn.__name__}")
    print(f"\nAll {len(fns)} tests passed.")


if __name__ == "__main__":
    _run()
