# Open Questions & Deferred Topics

## Deferred to post-V1

### Authorities & certificates
Each authority (security-team, sre, platform) has a named identity declared at scope level with a referenced certificate (not inline). Trusted steps are signed by their authority at publication time. The engine verifies the signature at scheduling time.

Certificate management: stored in the secrets catalogue per scope. Rotation does not require modifying the trusted step catalogue.

### Trusted step catalogue
Trusted steps are defined at org/sub-org/project scope. The flow author references them by id only — attestation declarations come from the catalogue, not the flow YAML. An ordinary step declares its attestations inline in the flow.

### Attestation thresholds
Deferred to post-V1. Thresholds allow zones to require specific claim values (e.g. coverage ≥ 90%). Design not decided.

### Zone grouping block syntax
Multiple steps sharing the same zone can be grouped to avoid repetition. Deferred — per-step declaration covers V1 needs.

### Nested zones
`production` ⊃ `production.critical-data` — entry into the inner zone requires a second attestation on top of the outer one.

### Attestation expiration mid-execution
A long-running execution holds zone access after a single gate passage. Whether attestations should expire after a configurable duration is deferred.

### Chain signing (SLSA-style)
Each attestation references the hash of the previous one in the chain. Enables independent external verification without access to the execution state file.

### Cross-flow attestation inheritance
Whether a subflow inherits attestations produced by its parent flow, or must re-run the gate independently.

### Zone restriction on step types
A zone declaring `allows: step-types: [script]` would forbid `model` steps inside it — enforcing determinism in critical zones.

