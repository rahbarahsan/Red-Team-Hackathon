"""Generate a QR code encoding the product attestation ID for the recovery drone.

The frontend scans this QR, reads the product ID, and fetches the full
attestation chain from the backend via GET /products/{id}/chain.
"""

import json
import qrcode
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHAIN_PATH = ROOT / "worked-example" / "recovery_drone_chain.json"
OUTPUT_PATH = ROOT / "QRs" / "recovery_drone_qr.png"

# Load the chain to extract the product attestation ID
with open(CHAIN_PATH) as f:
    chain = json.load(f)

product_id = chain["product_attestation_id"]
print(f"Product attestation ID: {product_id}")

qr = qrcode.QRCode(
    version=None,  # auto-size
    error_correction=qrcode.constants.ERROR_CORRECT_M,
    box_size=10,
    border=4,
)
qr.add_data(product_id)
qr.make(fit=True)

img = qr.make_image(fill_color="black", back_color="white")
img.save(str(OUTPUT_PATH))

print(f"QR version used: {qr.version}")
print(f"QR code saved to: {OUTPUT_PATH.resolve()}")
