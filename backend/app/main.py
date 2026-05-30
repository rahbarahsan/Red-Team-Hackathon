import json
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.routes.verify import router as verify_router

app = FastAPI(
    title="Canadian Provenance Verifier",
    version="1.0.0",
    description="Cryptographic provenance verification for Canadian supply chains.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(verify_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/sample-chain")
def sample_chain() -> dict:
    root = os.environ.get("PROJECT_ROOT", os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
    path = os.path.join(root, "worked-example", "recovery_drone_chain.json")
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Sample chain not available") from exc
