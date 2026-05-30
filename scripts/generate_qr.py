"""Generate QR codes encoding product attestation IDs.

The frontend scans a QR, reads the product ID, and fetches the full
attestation chain from the backend via GET /products/{id}/chain.
"""

import json
import sys
import qrcode
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Default chains to generate QRs for
DEFAULT_CHAINS = [
    (ROOT / "worked-example" / "recovery_drone_chain.json", ROOT / "QRs" / "recovery_drone_qr.png"),
    (ROOT / "EXAMPLE DATA" / "tactical_radio_chain.json", ROOT / "QRs" / "tactical_radio_qr.png"),
]

for chain_path, output_path in DEFAULT_CHAINS:
    if not chain_path.exists():
        print(f"Skipping {chain_path.name} (not found)")
        continue

    with open(chain_path) as f:
        chain = json.load(f)

    product_id = chain["product_attestation_id"]
    print(f"\nProduct attestation ID: {product_id}")

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(product_id)
    qr.make(fit=True)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img = qr.make_image(fill_color="black", back_color="white")
    img.save(str(output_path))

    print(f"QR version used: {qr.version}")
    print(f"QR code saved to: {output_path.resolve()}")
