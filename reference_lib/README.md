# Reference Library

Byte-exact core for the Cryptographic Provenance challenge: canonical
serialization, content hashing, and Ed25519 sign/verify. Used by the organizer
generator + scoring harness and shipped to teams. The canonical serialization
here is the source of truth — reimplementations in other languages must match
the golden vectors in `tests/` byte-for-byte.

## Install

```
pip install cryptography
```

## Use

```python
from reference_lib import (
    canonical_serialize, content_hash,
    generate_keypair, sign_attestation, verify_attestation,
)

priv, pub = generate_keypair()
signed = sign_attestation(attestation, priv)        # populates signature field
ok = verify_attestation(signed, pub)                # verify vs claimed supplier's key
h = content_hash(parent)                            # for parents[].content_hash / anchor registry
```

## Test

```
python -m reference_lib.tests.test_golden     # or: pytest
```

## Canonical rules (see spec/attestation-schema.md)

1. Keys sorted (code-point order) at every level.
2. Compact separators, no whitespace.
3. UTF-8; printable non-ASCII raw, only control/required chars escaped.
4. `signature` excluded from bytes-to-sign and content hash.
5. Whole numbers as integers (`1`, not `1.0`); non-whole with no trailing zeros (`520.5`).
6. No NaN / Infinity / scientific notation.
