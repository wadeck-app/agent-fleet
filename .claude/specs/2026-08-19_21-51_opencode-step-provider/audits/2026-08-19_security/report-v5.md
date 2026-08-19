# Security Audit Report -- v5 (Final) -- OpenCode Step Provider

**Date:** 2026-08-19
**Spec version:** v1.0
**Auditor:** Claude (subprocess, zero-context)

## All v4 fixes verified

1. `ModelProviderName` union type -- present ✓
2. `model` field regex `^[a-zA-Z0-9_./:@-]{1,256}$` -- present ✓
3. Rule 6 launchInteractive() scope clarification -- present ✓
4. McpServer.env values + Claude stdin accepted risks in out-of-scope -- present ✓
5. OPENCODE_CONFIG_CONTENT merge semantics marked "assumed" -- present ✓
6. Concurrent kill() MUST language -- present ✓

## Findings

### [HIGH] ClaudeModelProvider MCP temp file missing `0o600` permission
- **Source:** provider-abstraction.md § MCP serialization per provider
- **Finding:** Claude MCP temp file has no `0o600` mode requirement; on Linux with default umask 022, fs.writeFile creates files at 0o644 (world-readable), potentially exposing MCP server credentials. Rule 5 already sets 0o600 for the OpenCode fallback -- the Claude path is inconsistent.
- **Suggested fix:** Add to ClaudeModelProvider MCP description: "temp file MUST be written with mode `0o600`" (mirrors rule 5).

### [MEDIUM] launchInteractive() accepts `prompt` with no enforcement
- **Source:** provider-abstraction.md § Design -- v1 Interface
- **Finding:** `LaunchOptions` always includes `prompt: string`, but rule 6 says launchInteractive() must not use it. No type-level or normative enforcement prevents an implementor from accidentally forwarding it.
- **Suggested fix:** Add normative rule: "Implementations of launchInteractive() MUST NOT read or forward `options.prompt`."

### [MEDIUM] LaunchOptions.sessionId has no format validation
- **Source:** provider-abstraction.md § Security requirements rule 3
- **Finding:** sessionId is passed as a spawn arg with no constraint; malformed values could trigger unexpected CLI parsing.
- **Suggested fix:** Add to rule 3: "`LaunchOptions.sessionId`, if present, must match `^[a-zA-Z0-9_-]{1,128}$`."

### [MEDIUM] ARG_MAX check covers only OPENCODE_CONFIG_CONTENT, not total env block
- **Source:** provider-abstraction.md § Security requirements rule 5
- **Finding:** Total env size (including LaunchOptions.env) could exceed ARG_MAX even if MCP config is under 1MB.
- **Suggested fix:** Add note to rule 5: "The 1MB threshold covers the MCP config alone; if LaunchOptions.env carries large values, add a total-env-size guard."

### [INFO] KILL_CLAUDE signal name semantically wrong for multi-provider
- **Source:** step-model-integration.md § ClaudeLifecycleManager impact
- **Finding:** Signal kills all providers but is still named KILL_CLAUDE -- v2 developers may miss this hook.
- **Suggested fix:** Add TODO: "Rename to KILL_MODEL_PROVIDERS in v2."

### [INFO] 0o600 is a no-op on Windows
- **Source:** provider-abstraction.md § Security requirements rule 5
- **Finding:** POSIX permission modes have no effect on Windows (primary deployment OS for this project).
- **Suggested fix:** Add platform note about Windows ACL inheritance and consider in-memory delivery for secrets.

## Score: 8/10

All previous fixes verified. 1 HIGH (ClaudeModelProvider temp file missing 0o600), 3 MEDIUM, 2 INFO remaining. Spec is implementation-ready with the HIGH addressed.
