"""Generate a QR code for the recovery drone attestation chain JSON."""

import json
import zlib
import base64
import qrcode
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHAIN_PATH = ROOT / "worked-example" / "recovery_drone_chain.json"
OUTPUT_PATH = ROOT / "QRs" / "recovery_drone_qr.png"

# Load and minify the JSON
with open(CHAIN_PATH) as f:
    chain = json.load(f)

minified = json.dumps(chain, separators=(",", ":"))
print(f"Minified JSON size: {len(minified)} bytes")

# Compress with zlib — raw bytes go straight into QR binary mode
compressed = zlib.compress(minified.encode(), level=9)
print(f"Compressed size: {len(compressed)} bytes")
# QR v40 LOW error correction supports 2953 bytes in binary mode
print(f"QR v40 binary capacity: 2953 bytes — {'FITS' if len(compressed) <= 2953 else 'TOO LARGE'}")

qr = qrcode.QRCode(
    version=None,  # auto-size
    error_correction=qrcode.constants.ERROR_CORRECT_L,
    box_size=4,
    border=4,
)
qr.add_data(compressed)
qr.make(fit=True)

img = qr.make_image(fill_color="black", back_color="white")
img.save(str(OUTPUT_PATH))

print(f"QR version used: {qr.version}")
print(f"QR code saved to: {OUTPUT_PATH.resolve()}")

# Also save a base64 version for easier web scanning (scanners return text)
b64_output = ROOT / "QRs" / "recovery_drone_qr_b64.png"
encoded = base64.b64encode(compressed).decode()
print(f"\nBase64 of compressed: {len(encoded)} chars")

# For the b64 version, split into smaller chunks if needed, or try fitting
try:
    qr2 = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=3,
        border=4,
    )
    qr2.add_data(encoded)
    qr2.make(fit=True)
    img2 = qr2.make_image(fill_color="black", back_color="white")
    img2.save(str(b64_output))
    print(f"Base64 QR version: {qr2.version}")
    print(f"Base64 QR saved to: {b64_output.resolve()}")
except Exception as e:
    print(f"Base64 version too large for single QR: {e}")
    print("Using binary QR only.")

print(f"\nTo decode: zlib-decompress the scanned bytes to get the original JSON.")
