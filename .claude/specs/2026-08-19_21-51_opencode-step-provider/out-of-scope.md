# Out of Scope -- OpenCode Step Provider

Items listed here are **explicitly excluded**.
Raising an excluded item as a requirement is a change-of-scope conversation, not a design question.

## Excluded items

### `ProviderLifecycleManager` generalization (v1)
**Reason:** Only two providers in v1; self-managed `kill()` per provider is sufficient.
**Covered by:** Decision #5 -- deferred to v2 when a third provider is added.

### Applying OpenCode provider to `FlowDesignerAgent` and `LocalClaudeAgentExecutor`
**Reason:** These agents bypass the `ModelProvider` interface and call Claude directly. Refactoring them is out of scope for v1; they remain Claude-only.
**Covered by:** Decision #5.

### Migration strategy / rollout plan
**Reason:** No production usage; clean cut acceptable.

### McpServer.command[] executable allowlist
**Reason:** Flow authors are trusted operators (same trust level as `script` steps, which execute arbitrary shell). Allowlist enforcement is a deployment concern, not a spec concern.
**Risk accepted:** T-04 partial -- string field validation is required (see provider-abstraction.md security requirements), but executable path restriction is not.

### Binary path pinning for provider CLIs
**Reason:** `ClaudeLauncher` already resolves `claude` via `where`/`which` without pinning; this spec does not introduce new risk. Pinning would require installer-level config out of this spec's scope.
**Risk accepted:** T-03 (binary spoofing via PATH).

### Repudiation controls for provider subprocess output
**Reason:** `StepTrace` captures stdout/stderr; orchestrator stores execution history. No cryptographic signing or tamper-proof audit log is implemented in v1.
**Risk accepted:** Repudiation -- no additional controls beyond trace capture.

### McpServer.cwd path validation
**Reason:** Flow authors are trusted operators (same trust level as `script` steps and `McpServer.command`). Restricting cwd is a deployment concern.
**Risk accepted:** An adversarial flow definition could set cwd to a sensitive directory. Mitigation is at the flow authoring/review layer, not the provider layer.

### Cross-provider session sharing
**Reason:** Sessions are provider-scoped (`--session <id>` / `--resume <id>`). A Claude session ID has no meaning to OpenCode and vice versa. No cross-provider session continuity in v1.
**Risk accepted:** A flow that switches provider mid-session loses conversation history -- this is intentional.

### Env value validation (McpServer.env values)
**Reason:** Env key format is validated (`^[A-Z_][A-Z0-9_]*$`). Values are passed to trusted MCP server processes authored by flow operators; value-level validation is a deployment concern.
**Risk accepted:** Null bytes or overlong env values could behave unexpectedly in the child process -- no mitigation in v1.

### Prompt length for ClaudeModelProvider (stdin delivery)
**Reason:** Claude Code receives prompts via stdin, which is not subject to OS ARG_MAX. No prompt size limit applies to `ClaudeModelProvider`. The 32KB limit in rule 6 is OpenCode-specific.
**Risk accepted:** N/A for Claude.

### Total env block ARG_MAX
**Reason:** Monitoring the total size of all environment variables passed to a subprocess is a deployment-level concern beyond the provider interface scope.
**Risk accepted:** In practice, the env block rarely approaches OS limits; `OPENCODE_CONFIG_CONTENT` is the only large dynamic entry and is already bounded.

### File permissions on Windows (0o600)
**Reason:** `0o600` is a POSIX permission mode; on Windows it has no effect. Temp file access control on Windows is governed by file ACLs at the OS level.
**Risk accepted:** Temp MCP config files may be readable by other processes in the same user session on Windows. Mitigation: temp files are short-lived (deleted in `finally` block).

### Backwards-compatible `mcpConfigPath` migration shim
**Reason:** No production usage; clean cut is cheaper and safer.
**Covered by:** Decision #3 -- `mcpConfigPath` removed entirely, replaced by `McpServer[]`.

<!-- Format for each:
### <Item>
**Reason:** <Why it is excluded.>
**Covered by:** <Link to another spec or roadmap item, if applicable.>
-->

## How to challenge scope
If you believe an item should be in scope, open a new discussion with the rationale.
Do not modify this file silently -- scope changes must be acknowledged as a versioned decision.
