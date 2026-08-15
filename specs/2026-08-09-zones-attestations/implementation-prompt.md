# Implementation Prompt — Zones & Attestations V1

## Context

Implement the Zones & Attestations V1 feature in the `agent-fleet` monorepo. Read the full spec before writing any code:

- `specs/2026-08-09-zones-attestations/decisions.md` — architecture decisions Z1–Z9
- `specs/2026-08-09-zones-attestations/scenarios.md` — the 4 test scenarios you must pass
- `specs/2026-08-09-zones-attestations/open-questions.md` — what is explicitly out of scope

Cross-cutting constraints from the flow-cli spec:

- `specs/2026-07-30-flow-cli/decisions.md` — D31 (secrets model), D34 (validation error format), D37 (`.flows/config.yml` schema)

## Existing code to read before writing anything

```
packages/flow-engine/src/
  validation/
    FlowValidator.ts        ← entry point; constructor takes (flowRegistry?: FlowRegistry)
    SchemaValidator.ts
    SemanticValidator.ts
    TemplateValidator.ts
    ValidationTypes.ts      ← ValidationCode enum, ValidationIssue interface
  executor/
    FlowExecutor.ts
    FlowOrchestrator.ts
    StepRunner.ts
    ScriptExecutor.ts
  types.ts                  ← FlowDefinition, ScriptFlowStep shapes live here
```

Read `types.ts` and `ValidationTypes.ts` before writing any code — their shapes define what you extend and produce.

## V1 scope

V1 delivers static validation only. Runtime concerns (attestation production, zone activation, secret injection) depend on D23 (WebSocket worker↔daemon) which is deferred to v2. Do not implement anything in the "v2" section below.

## What you must implement (V1)

### 1. Types

Add to `packages/flow-engine/src/types.ts` or a new `packages/flow-engine/src/validation/ZoneTypes.ts`:

```typescript
interface AttestationRequirement {
	attestation: string;
}

interface ZoneConfig {
	requires: AttestationRequirement[];
}

interface SecretConfig {
	id: string;
	zone: string;
}

interface ZonesScopeConfig {
	zones?: Record<string, ZoneConfig>;
	secrets?: SecretConfig[];
}

// Discriminated union — failIfAbsent only exists on file sources
type AttestationProducer =
	| { attestation: string; from: 'exit-code' }
	| { attestation: string; from: { file: string; format: 'jest' | 'junit' | 'raw' }; failIfAbsent?: boolean };
```

`failIfAbsent` defaults to `true` when absent. `from: exit-code` does not have this property.

Add `zone?: string` and `produces?: AttestationProducer[]` to `ScriptFlowStep` only — not to `BaseFlowStep`. Only script steps can declare zones and produce attestations in V1.

### 2. `ZonesScopeConfigLoader`

New class at `packages/flow-engine/src/validation/ZonesScopeConfigLoader.ts`:

- Constructor takes `projectRoot: string`
- Reads `<projectRoot>/.flows/zones.yml`
- Returns `ZonesScopeConfig`
- If file does not exist: return `{}` (empty config — no error)
- If file exists but YAML parse fails: throw with a clear message
- If file parses but schema is invalid (unexpected structure): throw with a clear message

### 3. `ZoneValidator`

New class at `packages/flow-engine/src/validation/ZoneValidator.ts`.

Constructor takes `(issueCollector: IssueCollector, scopeConfig: ZonesScopeConfig)` — follows the same pattern as other validators in the package (collector first, then domain config).

`validate(flowDef: FlowDefinition): void` — pushes issues directly to `issueCollector`. Flow definition is passed at call time, not at construction (same pattern as other specialized validators).

**Identifier constraints:** Zone names and attestation IDs both follow `[A-Za-z_][A-Za-z0-9_-]*` (letters, digits, underscores, hyphens; must start with letter or underscore). Secret IDs follow the stricter `[A-Za-z_][A-Za-z0-9_]*` (no hyphens — this is what the template syntax supports). Matching is case-sensitive.

**Secret reference pattern:** The template syntax is `${{ secrets.<id> }}` where `<id>` matches `[A-Za-z_][A-Za-z0-9_]*` (no hyphens). Match with regex `/\$\{\{\s*secrets\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g`. An env value may contain multiple references.

**Check Z4-1:** For each step with `zone: X` — if zone `X` is not a key in `scopeConfig.zones` (including when `scopeConfig.zones` is absent or empty) → `ZONE_UNDEFINED` error with message: `"Step '<stepId>' references undefined zone '<X>'"`. A step that declares a zone always requires that zone to exist in the scope config.

**Check Z4-2:** For each zone `X` referenced by any step — for each attestation `A` in `zone.requires` — if no step in the flow declares `produces` containing `{ attestation: A }` → `ZONE_ATTESTATION_UNSATISFIABLE` error with message: `"Zone '<X>' requires attestation '<A>' but no step produces it"`. Multiple steps producing the same attestation name is allowed (Z4-2 requires at least one). A zone with an empty or absent `requires` array has no unsatisfiable attestations — no error.

**Check Z5:** For each step (all steps, not only zoned steps) — scan all `env` values for secret references matching the pattern above. For each match `<id>`:

- If `<id>` is not found in `scopeConfig.secrets` → `SECRET_ZONE_MISMATCH` error with message: `"Secret '<id>' is not declared in scope config"`
- If `<id>` is found with `zone: Y` and the step does not declare `zone: Y` → `SECRET_ZONE_MISMATCH` error with message: `"Secret '<id>' requires zone 'Y' but step '<stepId>' is not in zone 'Y'"`

Note: `SecretConfig.zone` is a required field. Every secret in `scopeConfig.secrets` must have a zone. There is no "unzoned secret" concept — if a secret does not need zone restriction, it should not appear in `.flows/zones.yml` at all and references to it will fail Z5's "not declared" check.

**D31 vs. zone secrets:** Flow-level `secrets:` (D31 — `env://`, `file://` URI schemes, declared in the flow YAML) are independent of zone-scoped secrets (declared in `.flows/zones.yml`). Z5 only checks references in `env` values against `scopeConfig.secrets` from `.flows/zones.yml`. D31 flow-level secrets are resolved by a different mechanism and are not subject to zone validation.

**Check Z5-ext:** For each secret in `scopeConfig.secrets` — if `secret.zone` is not a key in `scopeConfig.zones` → `ZONE_UNDEFINED` error on the secret declaration itself. Also validate that secret `id` values are unique in `scopeConfig.secrets`; duplicates → `DUPLICATE_ID` error (reuse existing code). Also validate that `produces` within a single step has no duplicate `attestation` values; duplicates within the same step → `DUPLICATE_ID` error.

Add new `ValidationCode` values to `ValidationTypes.ts`:

- `ZONE_UNDEFINED` — step or secret references a zone not in scope config
- `ZONE_ATTESTATION_UNSATISFIABLE` — zone requires an attestation that no step produces
- `SECRET_ZONE_MISMATCH` — step references a zone-scoped secret without being in that zone

Zone errors are identified by their code. `ValidationIssue` has no `type` field — do not add one.

All zone `ValidationIssue` entries use `severity: 'error'`. Populate `location.stepId` for step-level errors and `location.field` for field-level precision (e.g., `field: 'zone'` for Z4-1, `field: 'env.<key>'` for Z5). Scope-level errors (Z5-ext — secret declares undefined zone) have no stepId; use `location.path` like `"secrets[0].zone"` instead.

`env` values on steps are `Record<string, string>` — flat key/value string pairs. No nested objects or arrays to traverse. Scan each value string with the regex as-is.

Unsupported `format` values in `AttestationProducer.from.format` are validated by `ZoneValidator` during `validate()`, not by the schema validator. Use `INVALID_VALUE` (existing code) for this check. `failIfAbsent` present on an `exit-code` producer (which can arrive via YAML despite the discriminated union) is silently ignored — not a validation error.

### 4. Wire `ZoneValidator` into `FlowValidator`

`ZoneValidator` runs as the last validation phase (phase 9) in `FlowValidator`.

Add `scopeConfig?: ZonesScopeConfig` as a **second** constructor parameter to `FlowValidator`:

```typescript
constructor(flowRegistry?: FlowRegistry, scopeConfig?: ZonesScopeConfig)
```

When `scopeConfig` is not provided, default to `{}`. Instantiate `ZoneValidator` in the `FlowValidator` constructor with `this` (IssueCollector) and `scopeConfig`. Call `this.zoneValidator.validate(flow)` at phase 9 (after simulation validation, inside `validate(flow: FlowDefinition)`).

**Breaking change note:** The existing `FlowValidator` constructor signature is `constructor(flowRegistry?: FlowRegistry)`. Adding a second optional parameter is backwards-compatible at the call site — existing calls remain valid. Update any existing tests that construct `FlowValidator` directly if needed.

**`ZonesScopeConfigLoader` is not called by `FlowValidator` internally.** The caller is responsible for loading the scope config before constructing `FlowValidator`. Typical usage:

```typescript
const loader = new ZonesScopeConfigLoader(projectRoot);
const scopeConfig = loader.load(); // throws on malformed file
const validator = new FlowValidator(flowRegistry, scopeConfig);
```

When `scopeConfig` is omitted (e.g., in existing tests or tool integrations that don't know about zones), `FlowValidator` defaults to `{}` and zone validation runs but produces no errors (empty scope config means no zones/secrets declared).

Zone errors appear in `ValidationResult.issues` (same array as all other validation issues).

## Test requirements

Place test files next to implementation:

- `ZonesScopeConfigLoader.test.ts`
- `ZoneValidator.test.ts`

Use the flow YAML and scope config from `scenarios.md` as test fixtures.

V1 covers static validation only. Scenarios 2 and 3 in `scenarios.md` describe runtime behavior (zone activation, secret injection) — those are V2 concerns. Map them to their static-validation equivalent for V1 tests:

- Scenario 1a → step declares undefined zone → `ZONE_UNDEFINED`
- Scenario 1b → secret used outside its zone → `SECRET_ZONE_MISMATCH`
- Scenario 2 → use the shared flow YAML from scenarios.md but remove the `produces` block from `run-tests` to simulate a flow where zone `production` requires an attestation no step produces → `ZONE_ATTESTATION_UNSATISFIABLE`
- Scenario 3 → the shared flow YAML from scenarios.md exactly as written → no errors (flow is statically valid)

Minimum coverage: 90% for `ZoneValidator` and `ZonesScopeConfigLoader`.

## Constraints

- PascalCase file names matching exported class names
- Unsupported `format` values in `AttestationProducer` (e.g. `format: 'bad'`) throw — no silent fallback
- Do not implement anything in `open-questions.md`
- Run `check` skill after completing implementation
- Run `run-test` skill after completing implementation

---

## V2 — Runtime (do not implement now)

The following sections depend on D23 (WebSocket worker↔daemon) which is deferred to v2.

**Attestation production** — `ScriptExecutor` sends `attestation_produced` WebSocket message to daemon after step completes. Daemon is sole writer (D21). File: `~/.flow-daemon/attestations/<executionId>-<attestationId>.json`.

**Zone activation** — after each step completion, daemon re-evaluates zone readiness by checking attestation files for the current executionId. Emits `[executionId|__zone] <zoneName> ACTIVE` log line (D20). Zone-gated steps become eligible for the ready-step pool.

**Secret injection** — on step assignment, daemon resolves `${{ secrets.X }}` references. Zone-scoped secrets injected only when zone is active. Throw if zone not active (should be impossible given Z4 static validation).
