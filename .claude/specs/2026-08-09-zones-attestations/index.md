# Zones & Attestations — V1 Spec

Execution boundaries that gate access to secrets and enforce evidence requirements before critical steps run.

## Documents

- [decisions.md](decisions.md) — All architecture decisions with rationale
- [scenarios.md](scenarios.md) — V1 test scenarios
- [open-questions.md](open-questions.md) — Deferred topics

## Goals

- Gate step execution behind verified evidence (attestations)
- Scope secrets to zones — unavailable outside their declared zone
- Fail fast at load time when zone requirements cannot be satisfied statically
- Leave semantic validation of attestation content to authors and trust authorities

## Out of scope for V1

- Authorities and certificates
- Attestation thresholds (coverage %, pass rate)
- Nested zones
- Attestation expiration mid-execution
- Chain signing (SLSA-style)
- Trusted step catalogue
- Cross-flow attestation inheritance
