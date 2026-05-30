from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.statistical_detector import detect_statistical_anomalies
from app.verify_engine import verify_chain

logger = logging.getLogger(__name__)
router = APIRouter()


class VerifyRequest(BaseModel):
    product_attestation_id: str
    attestations: list[dict[str, Any]]


class AnomalyOut(BaseModel):
    type: str
    attestation_id: str
    details: str = ""


class VerifyResponse(BaseModel):
    product_attestation_id: str
    canadian_content_percentage: float
    designation: str
    chain_valid: bool
    anomalies: list[AnomalyOut]


@router.post("/verify", response_model=VerifyResponse)
async def verify(req: VerifyRequest) -> VerifyResponse:
    if not req.product_attestation_id:
        raise HTTPException(status_code=400, detail="product_attestation_id is required")
    if not req.attestations:
        raise HTTPException(status_code=400, detail="attestations must not be empty")
    try:
        result = verify_chain(req.product_attestation_id, req.attestations)
        anomalies = [a.to_dict() for a in result.anomalies]
        existing = {(a["type"], a["attestation_id"]) for a in anomalies}
        for anomaly in detect_statistical_anomalies(req.attestations):
            key = (anomaly["type"], anomaly["attestation_id"])
            if key not in existing:
                existing.add(key)
                anomalies.append(anomaly)
        return VerifyResponse(
            product_attestation_id=result.product_attestation_id,
            canadian_content_percentage=result.canadian_content_percentage,
            designation=result.designation,
            chain_valid=not anomalies,
            anomalies=[AnomalyOut(**a) for a in anomalies],
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unhandled /verify failure for %s", req.product_attestation_id)
        raise HTTPException(status_code=500, detail=f"Internal verification error: {exc}") from exc
