# Security Audit Report -- v4 (Final Pass) -- OpenCode Step Provider

**Date:** 2026-08-19
**Spec version:** v1.0
**Auditor:** Claude subprocess (isolated, no conversation context)

## Scope

All 6 spec files read in full. Prior v3 fixes verified first, then new gaps sought.

## v3 Fix Verification

| #   | Check                                                         | Result |
| --- | ------------------------------------------------------------- | ------ |
| 1   | McpServer.name regex `^[a-zA-Z0-9_-]+$` in rule 3             | PASS   |
| 2   | 32KB prompt limit + PromptTooLargeError as rule 6             | PASS   |
| 3   | Concurrent kill() MUST language in step-model-integration.md  | PASS   |
| 4   | Env isolation rule 2: no "plus provider-specific credentials" | PASS   |
| 5   | McpServer.cwd accepted risk in out-of-scope.md                | PASS   |
| 6   | OPENCODE_CONFIG_CONTENT merge semantics marked "assumed"      | PASS   |
| 7   | Stale security considerations replaced with reference         | PASS   |

## Findings

### [HIGH] ModelProvider name collision -- compile-time blocker

- **Source:** step-model-integration.md §Type change vs provider-abstraction.md §v1 Interface
- **Finding:** `interface ModelProvider` (the DI interface) and `type ModelProvider = "claude" | "opencode"` (the union type) share the same identifier -- two incompatible TypeScript definitions in the same module scope.
- **Suggested fix:** Rename the union type to `ModelProviderName` in step-model-integration.md and update all references (ModelFlowStep.provider, map key type, types.ts export).

### [MEDIUM] model field has no validation rule

- **Source:** provider-abstraction.md §Security requirements (absent)
- **Finding:** The `model` string is passed as a CLI arg but has no sanitization rule. spawn() args array blocks injection, but the spec never says so and adds no charset/length constraint.
- **Suggested fix:** Add rule 8: `model` MUST match `^[a-zA-Z0-9_./:@-]{1,256}$`; or add a note that spawn() args array makes flag injection impossible and only a length cap is needed.

### [MEDIUM] launchInteractive() excluded from 32KB prompt guard

- **Source:** provider-abstraction.md §Security requirements rule 6
- **Finding:** Rule 6 covers `launchBackground()` only. If `launchInteractive()` also passes prompt as positional args, the same ARG_MAX constraint applies.
- **Suggested fix:** Extend rule 6 to cover both methods, or document that `launchInteractive()` does not accept a pre-supplied prompt and the constraint is irrelevant.

### [LOW] LaunchOptions.env and McpServer.env values unvalidated

- **Source:** provider-abstraction.md §Security requirements rule 3
- **Finding:** Rule 3 validates env keys but not values. Null bytes or values below U+0020 could cause silent corruption.
- **Suggested fix:** Add: "All env values MUST contain no null bytes and no characters below U+0020; max 4096 chars per value."

### [LOW] Claude prompt stdin/ARG_MAX not explicitly acknowledged

- **Source:** provider-abstraction.md rule 6
- **Finding:** "No limit applies to ClaudeModelProvider" is stated but not explained as a deliberate accepted-design decision. Future readers may add a cap by analogy.
- **Suggested fix:** Add parenthetical: "(stdin piping is not subject to ARG_MAX; no cap required -- accepted by design)"

## Score: 7/10

All v3 fixes verified. One compile-time blocker (ModelProvider name clash) must be resolved before implementation starts; two MEDIUMs (model validation, launchInteractive guard) should be closed.
