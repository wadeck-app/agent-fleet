# Security Audit Report v2 -- OpenCode Step Provider

**Date:** 2026-08-19
**Spec version:** v1.0
**Auditor:** Claude (subprocess, zero-context)

## Scope

Files reviewed:

- `_index.md`, `guiding-principles.md`, `out-of-scope.md`, `threat-model.md`, `provider-abstraction.md`, `step-model-integration.md`

## Findings

### [HIGH] T-04, T-05, T-06 remain "Open" in the mitigations table

- **Source:** `threat-model.md` § Mitigations
- **Finding:** Status column for T-04, T-05, T-06 still reads "Open" despite `provider-abstraction.md` documenting the implementation requirements.
- **Suggested fix:** Change T-04/T-05/T-06 status to "Mitigated" with cross-reference to `provider-abstraction.md § Security requirements #1/3/5`.

### [HIGH] Env isolation: "credentials required by OpenCode" is an unverifiable assertion

- **Source:** `threat-model.md` § Information Disclosure
- **Finding:** OpenCode env forwarding is described as "any credentials required by OpenCode" -- open-ended, not a closed list. An implementer could forward entire `process.env` and satisfy this wording.
- **Suggested fix:** Replace with explicit closed list or state "no provider-implicit env vars; all credentials must be passed through `LaunchOptions.env`".

### [HIGH] `kill()` finally-block is prose, not an interface contract

- **Source:** `provider-abstraction.md` § Security requirements (#4)
- **Finding:** "The `launchBackground()` caller must use a `finally` block" is a prose note, not enforced by the interface or `ModelStepExecutor` design.
- **Suggested fix:** Add a `ModelStepExecutor` pseudocode snippet showing the required `try/finally` pattern, marked as normative.

### [MEDIUM] T-06 threshold absent from threat-model.md

- **Source:** `threat-model.md` § T-06 / `provider-abstraction.md` § Security requirements (#5)
- **Finding:** T-06 mitigation row does not state the 1 MB threshold; only `provider-abstraction.md` does.
- **Suggested fix:** Add threshold to T-06 row: "If serialized JSON exceeds 1 MB, write to temp file and pass `OPENCODE_CONFIG` env var."

### [MEDIUM] No repudiation accepted-risk entry

- **Source:** `threat-model.md` § Repudiation
- **Finding:** "No additional repudiation controls in v1 scope" is stated but not recorded as an accepted risk with rationale in the mitigations table.
- **Suggested fix:** Add T-07 row: `Repudiation | No prompt/provider audit log | Accepted -- StepTrace stored; full audit deferred to v2 | Accepted`.

### [MEDIUM] Temp file security not specified for OPENCODE_CONFIG fallback

- **Source:** `provider-abstraction.md` § Security requirements (#5)
- **Finding:** No file permissions (0o600), cleanup timing, or naming convention specified for the OpenCode fallback temp file -- unlike the Claude MCP temp file which has all three.
- **Suggested fix:** Add to #5: "mode `0o600`, named `opencode-config-<uuid>.json` in `os.tmpdir()`, deleted in a `finally` block."

### [MEDIUM] McpServer.env key injection not addressed

- **Source:** `provider-abstraction.md` § Security requirements (#3)
- **Finding:** `McpServer.env` keys are untrusted strings serialized as JSON keys in `OPENCODE_CONFIG_CONTENT`. A crafted key could escape the JSON object (e.g., `"MY_KEY": "v\", \"mcp\": {\"evil\": ..."`).
- **Suggested fix:** Add: env keys must match `^[A-Z_][A-Z0-9_]*$`; values subject to same 2048-char / no-control-char rule.

### [MEDIUM] Session ID reuse across providers undefined

- **Source:** `provider-abstraction.md` § Design
- **Finding:** `LaunchOptions.sessionId` could be passed from a Claude step to an OpenCode step; session ID namespaces differ between providers.
- **Suggested fix:** Document that `sessionId` is provider-scoped; `StepRunner` must not forward a sessionId from provider A to provider B.

### [MEDIUM] OPENCODE_CONFIG_CONTENT merge vs replace semantics undocumented

- **Source:** `provider-abstraction.md` § MCP serialization per provider
- **Finding:** If OpenCode merges `OPENCODE_CONFIG_CONTENT` with global config, a `McpServer.name` collision could silently override an existing server. Merge semantics not confirmed from OpenCode v1.18.18 docs.
- **Suggested fix:** Confirm and document whether `OPENCODE_CONFIG_CONTENT` replaces or merges with global config; if merges, add uniqueness requirement on `McpServer.name`.

### [INFO] Sub-file status headers still "Draft"

- **Source:** `provider-abstraction.md` header, `step-model-integration.md` header
- **Finding:** Both marked `Status: Draft` while `_index.md` is `Approved -- v1.0`.
- **Suggested fix:** Update to "Approved" or add a note that parent index approval governs.

### [INFO] Security principles not in guiding-principles.md

- **Source:** `guiding-principles.md`
- **Finding:** No-shell-interpolation and minimal-env-forwarding are stated only in `provider-abstraction.md`, not elevated as guiding principles.
- **Suggested fix:** Add P-2 (no shell interpolation) and P-3 (minimal env forwarding) to `guiding-principles.md`.

## Score: 5/10

Real progress from v1 (2/10) -- T-01/T-02 mitigated, STRIDE sections filled, spawn/MCP/kill requirements written. Three HIGH gaps remain (Open mitigation status, unverifiable OpenCode env isolation, unenforced kill() finally contract) plus five MEDIUMs that would produce insecure or undefined behavior at implementation time.
