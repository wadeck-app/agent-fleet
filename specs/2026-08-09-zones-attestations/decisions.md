# Architecture Decisions — Zones & Attestations

## Z1 — Zone as execution boundary

A zone is a named execution boundary declared in `<project-root>/.flows/zones.yml`. Org/sub-org scope hierarchy is deferred to post-V1. It declares which attestations are required to enter it. Secrets are not declared on the zone — they declare their own zone membership (Z5).

If `.flows/zones.yml` does not exist and no step declares a zone, the flow runs normally — no error. The file is only required when a step references a zone.

```yaml
zones:
    production:
        requires:
            - attestation: tests-passed
```

**Why:** Secrets and evidence requirements are governance concerns, not flow concerns. They live in scope config, not in individual flow YAMLs. Keeping secret ownership on the secret (Z5) avoids a redundant dual-declaration that could fall out of sync.

## Z2 — Zone declared on step

```yaml
steps:
    - id: dummy-deploy
      script: ./deploy.sh
      zone: production
```

**Why:** Explicit per-step declaration is the minimal form. A grouping block syntax (to avoid repetition across multiple steps in the same zone) is deferred to post-V1.

## Z3 — Zone activation is automatic, with explicit log trace

A zone becomes active when all its required attestations are present in the execution state. No explicit zone-entry step required — a zone-entry step type was evaluated and rejected as unnecessary noise in the flow graph.

The engine evaluates zone readiness after each step completion. When all required attestations for a zone are satisfied, the engine emits a structured log line:

```
[executionId|__zone] production ACTIVE
```

Zone-gated steps become eligible for the ready-step pool at this point.

**Why:** Automatic activation is consistent with the dependency model — the engine already tracks what has completed after each step. The log line makes the transition observable without adding noise to the flow graph.

## Z4 — Static validation at load time

Two categories of errors caught before any step runs:

1. A step declares `zone: production` but no zone `production` is defined in `.flows/zones.yml` → validation error.
2. A step declares `zone: production`, the zone requires attestation `tests-passed`, but no step in the flow graph declares it produces `tests-passed` → validation error.

**Why:** Fail fast. A flow that can never satisfy its zone requirements should not start.

## Z5 — Secrets scoped to zones, always referenced never inline

Secrets are declared in a catalogue per scope with an associated zone:

```yaml
secrets:
    - id: PROD_API_KEY
      zone: production
```

A step outside zone `production` that references `PROD_API_KEY` → static validation error at load time. The engine never injects a secret into a context where the active zone does not match.

**Why:** Structural enforcement. The author cannot access zone-restricted secrets by writing clever YAML — the engine refuses at scheduling time.

## Z6 — Step produces 0 to N attestations, declared explicitly

A step produces no attestation by default. Attestations are declared explicitly with a named id and a source.

```yaml
- id: run-tests
  script: npm test -- --coverage --reporter=json
  produces:
      - attestation: tests-passed
        from: exit-code
      - attestation: coverage-report
        from: { file: coverage/report.json, format: jest }
        failIfAbsent: false # optional attestation — default is true
```

**Valid sources in V1:**

- `from: exit-code` — exit code 0 produces the attestation. `failIfAbsent` does not apply.
- `from: { file: <path>, format: <jest|junit|raw> }` — file must exist and be parseable. `raw`: file presence alone is sufficient, no parsing.

`failIfAbsent` applies only to `from: { file: ... }` sources.

`failIfAbsent: true` (default) — if the file is absent or unparseable, the step fails.
`failIfAbsent: false` — attestation is not produced but the step does not fail.

**Why:** The attestation id is independent of the step id. A zone references `tests-passed`, not `run-tests`. One step can produce multiple attestations with different sources and different optionality.

## Z7 — The engine does not validate attestation content semantically

The engine validates structure only: exit-code value, file existence and parseability, format validity.

What an attestation _means_ — "real tests ran", "nothing was skipped", "coverage is genuine" — is a contract between the step author and the trust authority that certifies the step. This is a business concern, not an engine concern. Trust is relative and scoped (org/sub-org/project) — not a global binary — and semantic validation responsibility follows the trust authority's scope.

**Why:** The engine has no way to verify intent. A non-trusted step can produce a `tests-passed` attestation from `exit-code` and return 0 without running a single test. Trusted steps (post-V1) exist precisely to provide a guarantee on the semantic contract. The distinction between structural and semantic validation is intentional and permanent.

## Z8 — Attestations persisted as separate signed files per execution

```
~/.flow-daemon/attestations/
  <executionId>-tests-passed.json
  <executionId>-coverage-report.json
```

File structure:

```json
{
	"signature": null,
	"attestation": {
		"id": "tests-passed",
		"executionId": "abc1",
		"stepId": "run-tests",
		"issuedAt": "2026-08-09T00:03:00Z",
		"claims": { "exitCode": 0 }
	}
}
```

`signature` is `null` in V1 — field is reserved for post-V1 authority signing. `claims` content depends on the source: `{ "exitCode": N }` for `from: exit-code`, parsed fields from the report file for `from: { file, format }` — exact fields are format-specific and determined at implementation time.

Retention aligned with `logs.retainDays` (see `specs/2026-07-30-flow-cli/decisions.md` D22).

The daemon is the sole writer of attestation files (consistent with D21 single-writer rule). Workers send an `attestation_produced` WebSocket message to the daemon; the daemon writes the file.

**Why:** Signing requires a discrete file — a sub-object in a JSON document cannot be signed cleanly. Separate files allow independent verification without loading the full execution state. `signature: null` reserves the field without requiring a signing infrastructure in V1.

## Z9 — New execution ID on every run, no attestation overwrite

Each `flow run` produces a new execution ID. Replaying a flow or step never overwrites a previous attestation — it produces a new file under the new execution ID.

**Why:** Attestations are immutable evidence. Overwriting would destroy the audit trail.
