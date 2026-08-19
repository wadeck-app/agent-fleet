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
