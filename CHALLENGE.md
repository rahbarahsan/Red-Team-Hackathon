# Challenge Instructions — Cryptographic Provenance for Canadian Supply Chains

**AVSS / Ottawa Defence Hackathon**

This document covers **what to build, what to submit, and how you're judged.** For the
technical detail of the verification backend, see [`TECHNICAL_GUIDE.md`](TECHNICAL_GUIDE.md).

## The problem in one paragraph

"Buy Canadian" procurement rules turn on whether a product is *Product of Canada* or
*Made in Canada*, but those claims rest on unverifiable supplier self-reporting. Build a
system where every supplier contribution is a cryptographically signed attestation,
attestations link across tiers into a tamper-evident provenance chain, and the chain can
be independently verified and used to compute the Canadian-content designation — while
detecting forgery, tampering, replay, and other integrity attacks.

## What you deliver

You build **one system with three deliverables**:

### 1. Verification backend (automatically graded)

A service exposing **`POST /verify`** that takes a product's attestation chain and returns
its Canadian-content percentage, designation, validity, and detected anomalies (full
contract in `TECHNICAL_GUIDE.md` §9). This is the only component scored by the automated
harness. Package it as a **Docker Compose** project that comes up with `docker compose up`
and serves `/verify` on **[organizer: confirm port, e.g. 8080]**.

### 2. Two user interfaces (judged in the demo)

- **Supplier UI** — lets a supplier issue a signed attestation for their contribution
  (materials/labour/location), producing a node in the chain.
- **Purchaser / end-user UI** — lets someone look up a product (e.g. by scanning a QR
  code) and see its provenance, Canadian-content percentage, and verification status in a
  clear, accessible way.

These are not auto-graded but count toward your demo and overall score. A worked sample
chain you can resolve in the purchaser UI is in [`worked-example/`](worked-example/).

### 3. Judge presentation

A short presentation/demo to the judges covering your approach, your architecture, how you
detect attacks (especially the subtle ones), and a live walkthrough of the two UIs.
**[organizer: confirm length and format]**

## What you're given (this kit)

The reference signing library, supplier public-key registry, signed anchor registry, all
supplier private keys, 1,000 labeled training chains, a self-test, the technical guide, the
participant specs (`spec/`), and the worked example. See [`README.md`](README.md).

## Submission

- Fork/clone this repo, build your system in it, and submit your repository (or a `docker compose`-able archive) by the deadline to the Devpost page.
- Your repo must include the Docker Compose project for the backend and the UIs, plus a
  short README explaining how to run everything.

## How you're judged

The automated backend score maps to the **technical implementation** criterion; the UIs and
presentation are judged separately.

[TBA]

### How the automated backend score works

Your `/verify` is run against a **held-out set of chains** (you never see it). Each case is
scored on: Canadian-content percentage (within a small tolerance), designation (exact),
which integrity violations you detected (by attestation, scored by **F1** so over-flagging
hurts), and how well you classified them. Harder cases weigh more.

Cases span a spectrum (see `TECHNICAL_GUIDE.md` §10): many fall to a careful, spec-correct
implementation; some are **statistical** — legal on every individual rule but anomalous
relative to how genuine chains look, rewarding teams who learn from the training corpus. A
solid correct core gets you a strong score; the top of the leaderboard goes to teams who
also model the statistical cases. Use `self_test.py` to calibrate against the training data.
