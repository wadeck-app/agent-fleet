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

- [ ] Run a goldfish validation pass (comprehension → critic → implementation-readiness) _before_ finalizing a spec and before generating an implementation prompt — not after repeated editing cycles
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

<!-- consolidated 2026-09-02 -->
- [ ] Document the singleton-daemon-kit IPC protocol (request/response format, `executionId` wrapping, `result:` nesting) in `.claude/docs/` so agents stop reverse-engineering `node_modules` dist files
- [ ] Document the `when:` condition evaluation context shape (step-id keyed, `outputs.*` only, no `task.*`) in a single reference file linked from `ConditionEvaluator.ts`
- [ ] Document that verbose/logging in model steps is controlled by the flow step's `log:` parameter, NOT a CLI `--verbose` flag — add this to the flow schema reference
- [ ] Document the npm workspace shadowing fix (`file:../` protocol + root `overrides`) in CLAUDE.md or a dedicated monorepo troubleshooting doc so agents find it before spending 10+ minutes debugging
- [ ] Document which flow-engine features are actually wired vs. only typed (statusTransitions, preProcess/postProcess, event triggers, contract validation) — agents waste significant time grepping to determine implemented vs. declared
- [ ] Document test file locations explicitly: `src/processing/` (not `src/orchestration/`) owns loop/output tests — add to naming-conventions.md
- [ ] Document the `${{ }}` template syntax as the canonical format (not legacy) in the flow schema reference
- [ ] Add a decision quick-reference index (D1, D2, … anchors) to spec `decisions.md` files so agents can locate decisions without repeated grep loops

---

- [ ] Always call `ToolSearch("select:<skill-name>")` before invoking any deferred skill/tool — never assume availability; treat the first "NOT YET KNOWN" as a hard stop, not a retry signal
- [ ] When debugging a failure, form one hypothesis, make one change, observe the result — never make multiple speculative edits in parallel (thrashing pattern observed 20+ times)
- [ ] Run `npm run build` on `flow-engine` before running type checks on dependent packages (`flow-cli`, `task-cli`) — composite tsconfig references require built dist-types
- [ ] Run a full spec goldfish/security audit before starting implementation, not after — iterative post-implementation audit rounds (v2→v6) consistently cost more than upfront review
- [ ] Scope all affected files (grep for all import/use sites) before starting any cross-package refactor — partial scoping is the root cause of 80%+ of "incomplete fix" cycles
- [ ] When delegating to parallel agents, assign explicit non-overlapping file ownership — never let two agents edit the same file concurrently
- [ ] Verify actual CLI behavior with `flow run --wait` before writing test assertions — assumed output format is wrong more often than not
- [ ] After any `types.ts` or shared interface change, rebuild `flow-engine` immediately and run one full `tsc --noEmit` pass before continuing — do not defer type validation to the end

---

- [ ] Add a comment above `CommandHandler` instantiation explaining that `allowAbsolutePaths` must be `true` for `--project-dir` to work — it is not obvious from the constructor signature
- [ ] Add a comment in `ConditionEvaluator.ts` documenting the exact shape of the evaluation context (which keys are available, which are absent) so future maintainers don't need to grep test files to discover it

---

- [ ] Add npm `overrides` for workspace packages to root `package.json` as a permanent guard against shadowing — do not rely on `workspace:` protocol alone
- [ ] Add `process.exit` mock type signature (`string | number | null`) as a shared test helper or documented pattern in `.claude/docs/` — agents re-discover this repeatedly across test files

<!-- consolidated 2026-09-02 -->
## Documentation

- [ ] Document the daemon IPC protocol (singleton-daemon-kit response wrapping, `executionId` extraction, `CommandHandler` return → client receive) in `.claude/docs/` so agents stop reverse-engineering `node_modules` compiled JS every session.
- [ ] Document the `when:` condition evaluation context shape (step-id keyed, `outputs[stepId].field`, no `task.*`) in flow schema docs or a dedicated `.claude/docs/condition-context.md`.
- [ ] Document `log: <stepName>` as the only way to enable verbose model step output (not any CLI flag) in the flow step reference.
- [ ] Add a feature implementation status matrix to `.claude/docs/` listing which flow-engine features are wired vs. stub (statusTransitions, contract validation, preProcess/postProcess, writeOutput cleanup, event triggers).
- [ ] Document the `process.exit` mock type signature (`_code?: string | number | null`) in a test patterns doc or ESM mocking guide so agents stop discovering it via trial-and-error.
- [ ] Create `.claude/docs/skill-discovery.md` explaining that deferred skills require `ToolSearch("select:<name>")` before calling via `Skill`, and listing which skills are always deferred vs. pre-loaded.
- [ ] Document the workspace `metaDir` separation (outputs write to `workspace.metaDir/outputs`, not workspace root) with a short architectural note in `.claude/docs/workspace-architecture.md`.
- [ ] Add the goldfish three-pass review methodology (comprehension → critic → implementation-readiness) to `.claude/docs/` so agents don't need to web-fetch a Medium article to understand it.
- [ ] Document npm workspace package shadowing root cause and fix (`file:../` protocol or root `overrides`) in `.claude/kb/lessons-learned.md` under a dedicated npm section (it's rediscovered every session).
- [ ] Add a decision quick-reference index to specs (D1–D36 anchors or a table) so agents can jump directly to decisions instead of chunk-reading through 800-line files.

## Process

- [ ] Always call `ToolSearch("select:<skillName>")` before invoking any skill via the `Skill` tool; never assume schema is pre-loaded.
- [ ] Run `npm run build` on `flow-engine` before running TypeScript checks in any dependent package (`flow-cli`, etc.) — dist-types must be fresh or composite project errors are misleading.
- [ ] Before delegating parallel agents to work on the same feature area, explicitly partition file ownership so no two agents edit the same files concurrently.
- [ ] Run the full test suite (`npm test`) and verify it passes before declaring any implementation complete; do not rely on build success alone.
- [ ] When debugging a hanging or failing loop/retry execution, add targeted debug logging first, read the trace output once, then make a single targeted fix — not speculative multi-file edits.
- [ ] Always run `npm install` from the monorepo root, never from a subpackage directory, to prevent workspace shadowing.
- [ ] Launch independent audit agents (security, quality, consistency) in a single parallel batch rather than sequentially; batch all findings into one fix pass instead of iterating audit→fix→audit.
- [ ] Never web-fetch npm docs or external tool documentation during agent tasks; use `npm help`, local `package.json`, and codebase inspection only.
- [ ] When spawning parallel spec-review agents, give each agent an explicit file ownership list to prevent redundant reads of the same spec files across all agents.
- [ ] For TDD: write tests in red phase, verify they fail, implement, verify they pass — never write stub implementations labeled "tests will fail first" without that framing being explicit upfront.

## Code comments

- [ ] Add a comment above `CommandHandler` constructor's `allowAbsolutePaths` parameter explaining when it must be `true` (e.g., when `--project-dir` absolute paths are accepted from CLI).
- [ ] Add a comment in `WorkspaceManager` (or wherever `metaDir` is defined) explaining the three-directory split: workspace root vs. `metaDir` vs. `outputsDir`, and which writes go where.
- [ ] Add a comment in `ConditionEvaluator` at the context-shape definition explaining the step-id keying contract and that `task.*` / `taskMetadata` are intentionally excluded.
- [ ] Add a comment in the model step executor wherever `log: <stepName>` is consumed, explaining it is the only verbosity control (there is no `--verbose` CLI flag for model steps).

## Configuration

- [ ] Standardize `@wadeck` registry npm configuration in a single canonical location (e.g., root `.npmrc` template) and reference it from all affected CLAUDE.md files instead of maintaining separate copies in agent-fleet, violations-framework, wdrive, and singleton-daemon-kit.
- [ ] Pin `@types/node` version to exactly match the Node.js runtime version (`^24` for Node 24, not `^26`) in root `package.json` or document this constraint in CLAUDE.md.
- [ ] Add `"flow-engine": "file:../flow-engine"` (or equivalent `overrides`) to `flow-cli/package.json` as a permanent guard against npm workspace shadowing — do not rely on `workspace:*` protocol alone.
- [ ] Add `"overrides"` block to root `package.json` for packages that must resolve from workspace, not registry, to prevent silent shadowing when `npm install` runs from subdirectories.
