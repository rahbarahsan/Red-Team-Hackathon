from __future__ import annotations

import json
import os
import sys
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))


def _find_repo_root() -> str:
    d = _THIS_DIR
    for _ in range(8):
        if os.path.isdir(os.path.join(d, "reference_lib")):
            return d
        d = os.path.dirname(d)
    return os.environ.get("PROJECT_ROOT", "/app")


REPO_ROOT = _find_repo_root()
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from reference_lib import sign_attestation  # noqa: E402

router = APIRouter()

PRODUCTS = {
    "att-anchor-0012": {
        "product_id": "att-anchor-0012",
        "name": "Recovery-Capable ISR Drone",
        "chain_path": os.path.join(REPO_ROOT, "worked-example", "recovery_drone_chain.json"),
    }
}


class IssueAttestationRequest(BaseModel):
    attestation: dict[str, Any] = Field(..., description="Unsigned attestation payload")


def _load_json(path: str) -> Any:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _private_keys() -> dict[str, str]:
    path = os.path.join(REPO_ROOT, "private_keys", "supplier_private_keys.json")
    data = _load_json(path)
    return data.get("keys", data)


@router.get("/products")
def products() -> list[dict[str, str]]:
    return [
        {
            "product_id": product["product_id"],
            "name": product["name"],
        }
        for product in PRODUCTS.values()
    ]


@router.get("/products/{product_id}/chain")
def product_chain(product_id: str) -> dict:
    product = PRODUCTS.get(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Unknown product ID")
    try:
        return _load_json(product["chain_path"])
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Product chain not available") from exc


@router.post("/issue-attestation")
def issue_attestation(req: IssueAttestationRequest) -> dict[str, Any]:
    attestation = dict(req.attestation)
    supplier_id = attestation.get("supplier_id")
    if not supplier_id:
        raise HTTPException(status_code=400, detail="supplier_id is required")

    key = _private_keys().get(supplier_id)
    if not key:
        raise HTTPException(status_code=400, detail=f"No private key available for {supplier_id}")

    attestation.setdefault("attestation_id", f"att-demo-{uuid.uuid4().hex[:24]}")
    attestation.setdefault("version", "1.0")
    attestation.setdefault("parents", [])
    attestation.pop("signature", None)

    try:
        signed = sign_attestation(attestation, key)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not sign attestation: {exc}") from exc

    return {
        "attestation": signed,
        "message": "Signed attestation issued successfully",
    }
