# Architecture

## System Overview

```mermaid
graph TB
    subgraph "Docker Compose Stack"
        subgraph "Frontend :5173"
            UI[React/Vite App<br/>GC Design System]
            PV[Purchaser Verification UI]
            SA[Supplier Attestation UI]
            UI --> PV
            UI --> SA
        end

        subgraph "Backend :8000"
            API[FastAPI Server]
            VR[Verify Route<br/>POST /verify]
            DR[Demo Routes<br/>GET /products<br/>POST /issue-attestation]
            VE[Verify Engine]
            SD[Statistical Detector]
            RL[Reference Library<br/>Ed25519 + Canonical Serialization]
            
            API --> VR
            API --> DR
            VR --> VE
            VR --> SD
            VE --> RL
            DR --> RL
        end
    end

    subgraph "Data Layer"
        REG[registry/<br/>supplier_public_keys.json<br/>anchor_registry.json]
        PK[private_keys/<br/>supplier_private_keys.json]
        TC[training_corpus.jsonl<br/>1000 labeled chains]
        WE[worked-example/<br/>recovery_drone_chain.json]
    end

    PV -->|"POST /verify<br/>GET /products/{id}/chain"| API
    SA -->|"POST /issue-attestation"| API
    VE --> REG
    SD --> TC
    DR --> PK
    DR --> WE

    USER[Purchaser / End User] -->|"QR scan or manual ID"| PV
    SUPPLIER[Supplier] -->|"Issue signed attestation"| SA
    HARNESS[Scoring Harness] -->|"POST /verify"| VR
```

## Verification Pipeline

```mermaid
flowchart LR
    INPUT[Chain JSON] --> PARSE[Parse & Build DAG]
    PARSE --> HARD[Hard-Rule Checks]
    PARSE --> COMPUTE[Compute % & Designation]
    PARSE --> STAT[Statistical Detection]

    subgraph "Hard-Rule Checks"
        HARD --> SIG[Signature Verification]
        HARD --> HASH[Content Hash Validation]
        HARD --> STRUCT[Structural Checks<br/>cycles, dangling parents,<br/>timestamp inversions]
        HARD --> MB[Mass Balance]
        HARD --> ANCHOR[Anchor Registry]
        HARD --> PLAUS[Plausibility<br/>cost, transformation]
    end

    subgraph "Statistical Detection"
        STAT --> COST[Cost Outlier<br/>rate z-score per action]
        STAT --> LABOUR[Labour Outlier<br/>hours z-score per action]
        STAT --> TIMING[Timing Outlier<br/>min-gap floor per product]
        STAT --> ORIGIN[Origin Outlier<br/>country probability]
    end

    SIG --> MERGE[Merge Anomalies]
    HASH --> MERGE
    STRUCT --> MERGE
    MB --> MERGE
    ANCHOR --> MERGE
    PLAUS --> MERGE
    COST --> MERGE
    LABOUR --> MERGE
    TIMING --> MERGE
    ORIGIN --> MERGE
    COMPUTE --> RESPONSE[Response JSON]
    MERGE --> RESPONSE
```

## Anomaly Detection Categories

```mermaid
pie title Detection Coverage (Training Set)
    "Clean (no anomalies)" : 705
    "Signature/Identity" : 39
    "Structural/DAG" : 64
    "Semantic/Plausibility" : 32
    "Statistical (t4)" : 124
    "Replay" : 11
```

## Data Flow: Purchaser Verification

```mermaid
sequenceDiagram
    participant U as Purchaser
    participant FE as Frontend
    participant BE as Backend
    participant REG as Registry

    U->>FE: Scan QR / Enter Product ID
    FE->>BE: GET /products/{id}/chain
    BE-->>FE: Chain JSON (attestations[])
    FE->>BE: POST /verify {chain}
    BE->>REG: Load public keys & anchors
    BE->>BE: Verify signatures
    BE->>BE: Validate hash links
    BE->>BE: Check structural rules
    BE->>BE: Compute Canadian %
    BE->>BE: Run statistical detector
    BE-->>FE: {percentage, designation, valid, anomalies}
    FE-->>U: Provenance timeline + decision
```

## Data Flow: Supplier Attestation

```mermaid
sequenceDiagram
    participant S as Supplier
    participant FE as Frontend
    participant BE as Backend
    participant PK as Private Keys

    S->>FE: Fill attestation form
    FE->>BE: POST /issue-attestation {unsigned}
    BE->>PK: Load supplier private key
    BE->>BE: Canonical serialize
    BE->>BE: Ed25519 sign
    BE-->>FE: {signed attestation with signature}
    FE-->>S: Download / copy signed JSON
```

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, TypeScript, GC Design System, html5-qrcode |
| Backend | Python, FastAPI, uvicorn |
| Crypto | Ed25519 (via `cryptography` library), SHA-256 |
| Packaging | Docker Compose |
| Scoring | Self-test harness against 1000 labeled chains |
