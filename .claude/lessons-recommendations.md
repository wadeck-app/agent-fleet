# Recommendations

<!-- consolidated 2026-07-31 -->

- [ ] **Documentation**: Add an explicit SDK boundary statement to relevant specs before any design work begins — state what the SDK handles and what it does not (e.g., "SDK handles CLI↔daemon only, not worker↔daemon").
- [ ] **Documentation**: Add a glossary of domain terms (e.g., RE-QUEUED, bufferSpill, reconnectTimeout) to spec files so repeated grep searches are unnecessary during audits.
- [ ] **Documentation**: Add to CLAUDE.md the criteria for parallel vs. sequential agent delegation — when agents should share findings vs. each reading specs independently.
- [ ] **Documentation**: Define a decision-log schema in CLAUDE.md (structure, naming convention for D12/D13-style markers, file location) to reduce audit-fix cycles.
- [ ] **Process**: During brainstorming/design sessions, never make design choices unilaterally — always present options and wait for explicit approval before proceeding.
- [ ] **Process**: Before proposing a new option, cross-check all prior decisions and exclude already-rejected alternatives.
- [ ] **Process**: When full content is explicitly requested (spec sections, file contents), output the complete text — never summarize.
- [ ] **Process**: For independent evaluations (code review, coherence audit), use subprocess model (`claude --print` via Bash) rather than the Agent tool — subprocess gets fresh context without harness state.
- [ ] **Process**: When multiple agents need the same spec files, pass shared context or findings rather than having each agent re-read the same files independently.

<!-- consolidated 2026-08-15 -->
**Documentation**

- [ ] Add a `decisions-index.md` (or TOC block) to each spec directory listing every decision ID (D1, D2…) with a one-line summary and anchor link, so agents can jump directly to a decision instead of grepping across files
- [ ] Document the goldfish review three-pass pattern (comprehension → critic → implementation-readiness) in `.claude/docs/` so agents don't need to re-fetch the Medium article each session
- [ ] Add a glossary section to each spec's `index.md` defining key domain terms (e.g. `bufferSpillMs`, `reusePolicy`, `drainTimeout`, `ValidationError` format, daemon `cwd` semantics) to eliminate repetitive grep hunts
- [ ] Split large spec files (decisions.md > 300 lines, log-streaming.md) into focused sub-documents with a navigation index at the top, or add section anchors so chunk-reads can be targeted
- [ ] Document in `.claude/kb/lessons-learned.md` which implementation patterns require code-search to discover (WebSocket reconnection, ValidationError format, daemon cwd handling) and add the exact grep pattern that resolves each

**Process**

- [ ] Run a goldfish validation pass (comprehension → critic → implementation-readiness) *before* finalizing a spec and before generating an implementation prompt — not after repeated editing cycles
- [ ] When delegating parallel spec-audit agents, assign non-overlapping file scopes explicitly in each agent prompt to prevent 4+ agents reading identical files without coordination
- [ ] Always specify `subagent_type` in every `Agent()` call — never omit it; "Agent unknown" entries indicate missing type and defeat parallelization benefits
- [ ] Before delegating analysis to sub-agents, read shared context files once in the main agent and pass relevant excerpts in the delegation prompt rather than letting each sub-agent re-read the same files from scratch
- [ ] Crystallize spec decisions before starting implementation: do not edit `decisions.md` / `implementation-prompt.md` while implementation planning agents are already running
- [ ] For fresh-context coherence audits, prefer the `subprocess` skill (`claude --print` via Bash) over managed Agent tool subagents — subprocess avoids harness context bias; document this preference in `.claude/docs/collaboration-rules.md`
- [ ] When a user requests "full content" or "exact text" of a file, return the raw file output via Read tool — never summarize or abstract unless explicitly asked

**Code comments**

- [ ] Add JSDoc comments to the exported types in `packages/flow-engine/src/types.ts` for `WorkspaceConfig`, `DeclaredWorkspaceProvider`, `InputSpec`, and other abstractions that require multiple grep passes to understand — one line per type is enough

**Configuration**

- [ ] Add high-frequency read-only Bash commands (grep patterns used for spec/code exploration, `claude --print` subprocess invocations) to the project `.claude/settings.json` allowlist via the `fewer-permission-prompts` skill to eliminate recurring `--dangerously-skip-permissions` workarounds
- [ ] Pre-load deferred tools (ToolSearch, WebFetch, ReportFindings) at session start for any session that does spec authoring or goldfish review — call `ToolSearch select:<tool>` before the first agent delegation that may need them
