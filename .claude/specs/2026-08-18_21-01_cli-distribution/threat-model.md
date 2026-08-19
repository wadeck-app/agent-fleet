# Threat Model -- CLI Distribution

**Version:** 1.0
**Date:** 2026-08-18
**Methodology:** STRIDE

## Scope

Distribution pipeline for flow-cli and task-cli: build artifacts, release hosting, install scripts, and self-update mechanism.
Covers the path from source to a running binary on the user's machine.

## Assets

What we are protecting:

| Asset | Sensitivity | Owner |
|---|---|---|
| Release artifacts (bundles/binaries) | High -- tampered binary = RCE | Wadeck |
| Release signing key | Critical | Wadeck |
| User's local install | High -- runs with user privileges | User |
| GitHub Release hosting | Medium -- availability | GitHub |

## Threat actors

| Actor | Motivation | Capability |
|---|---|---|
| Supply-chain attacker | Inject malicious code into distributed binary | Medium (depends on release pipeline security) |
| Network MITM | Serve tampered download | Low (HTTPS + signature verification mitigates) |

## STRIDE analysis

### Spoofing
*(pending -- depends on Decision #1 re: distribution channel and signing)*

### Tampering
*(pending -- critical: any release artifact must be integrity-checked before execution)*

### Repudiation
*(pending)*

### Information Disclosure
*(pending -- install script may expose env vars or paths)*

### Denial of Service
*(pending -- self-updater polling could be rate-limited)*

### Elevation of Privilege
*(pending -- install to /usr/local/bin requires sudo; should be avoidable)*

## Mitigations

| ID | Threat category | Threat description | Mitigation | Status | Decision # |
|---|---|---|---|---|---|
| T-01 | Tampering | Tampered release artifact executed by user | Artifact signing (Ed25519 or SHA256 checksum) | Open | - |
| T-02 | Elevation of Privilege | Install script requires root/admin | Install to user-local PATH by default | Open | - |

## Open security questions

<!-- Q: should artifacts be signed (Ed25519 key like wdrive) or is SHA256 checksum sufficient? -> see Open Questions #1 -->
