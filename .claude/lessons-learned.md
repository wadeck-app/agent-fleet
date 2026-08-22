# Lessons learned

<!-- Last updated: 2026-08-22T21:41:26.749Z -->

## Recurring feedback

<!-- session 5565878c 2026-08-22 -->

- User escalates scope mid-task when initial request is underspecified — asked for "commands section" then immediately asks for "thorough codebase summary" with full directory structure, conventions, etc. Incomplete requests force exploratory back-and-forth instead of one comprehensive delivery.
- Test output is consistently piped through `tail` with varying limits (tail -30, -15, -40, -8) to reduce context — agents are learning the context-efficient output pattern from CLAUDE.md but have to reinvent it per agent spawn.
- Test configuration required multiple iterations: YAML file edited 5+ times (11:25–11:27) with model ID, format, and provider adjustments before tests passed. Suggests test YAML schema or model ID format documentation is unclear.
- npm install + npm run check → tail filtering is the standard verification workflow (repeated at 19:45:04, 19:46:41, 19:55:22, 19:57:01, 20:00:26) — context-efficient output pattern should be baked into verification routines.
- Parallel agent delegation pattern (aefe + abaa working independently on scrappers vs agent-fleet CI errors) — worked well, maintained progress on two fronts simultaneously without context bloat.

<!-- session e76b8d9c 2026-08-21 -->

- Test flows kept appearing in wrong subdirectories (`_flow_already_tested/`, scattered in `_test-tasks/`) — user had to redirect to flat structure at project root for user testing.
- Agent submission needs pre-validation: run full test suite before handing off implementation. 28 timeout failures from event name mismatch is a detection gap.
- Unit tests not added automatically when new types/functions created; user had to explicitly request "add unit tests in StepRunner.opencode.integration.test.ts" mid-task, indicating missing pattern/guideline.
- Npm spawning issue (13:22–13:40) solved via multiple hypothesis-test iterations (spawnSync → execFileSync → execSync → shell:true → npm.cmd) rather than identifying root cause upfront. This consumed ~18 min and many round-trips for what may have been a single platform-specific constraint.
- Package "cli-shared" created without following project naming convention (should be "shared-cli" per existing patterns like "shared-orch-worker"). Renamed late during refactoring (line 19:19+) instead of at creation.

<!-- session acc25325 2026-08-19 -->

- Never document a bug without fixing it — "Documenter" un bug sans le fixer, c'est le laisser en place. User explicitly rejected documenting "not yet implemented" features; must implement/fix instead.
- Spec validation loop: 6 rounds of goldfish + pentest audits (v1–v6, 21:11–21:28) with multiple edits each round. Suggests spec schema or validation rules were unclear or constantly shifting. Need either clearer spec guidelines or fewer validation rounds (batch fixes).

<!-- session 1dcbd5b4 2026-08-21 -->

- npm registry auth blocks duplicated across .github/workflows/publish-flow-cli.yml, publish-task-cli.yml, and found the same pattern in wdrive, violations-framework — DRY opportunity: extract to shared action or script.

<!-- session 2157a0f8 2026-08-20 -->

- Subagents (backend-dev, frontend-dev, etc.) cannot invoke Skill tools (`check`, `run-test`, `subprocess`, `write-doc`, `run`) — they return "NOT YET KNOWN". When delegating to subagents, avoid tasks that require these; stick to Read/Edit/Write/Grep/Bash only.
- Multiple code review + security pentest iterations with subagents running in parallel is a validated pattern — use this approach for complex implementations that need both correctness and security audits.

<!-- session 6d59c129 2026-08-20 -->

- Spawned two parallel backend-dev agents (e9704d0a, 4a2fd14d) working on overlapping code (flow-engine + flow-cli refactoring). Both performed similar edits (ModelStepExecutor, StepRunner, McpServer, Worker) in quick succession — indicates either unclear task partitioning or lack of handoff documentation between forked agents
- Test file creation repeatedly hit ESM mocking issues (process.exit type mismatches, child_process mock setup) requiring multiple edit cycles — suggests test templates should include documented ESM mocking patterns or examples in comments for common mocks (process.exit, child_process)

<!-- session 0455fbe4 2026-08-20 -->

- process.exit mocking signature too narrow: mockImplementation type changed from `((_code?: number)` to `((_code?: string | number | null)` across multiple test files (CliCommand.test.ts, TaskCliCommand.test.ts, Updater.test.ts). Several sed+test cycles needed to fix all occurrences — indicates type mismatch wasn't caught upfront.

<!-- session 95141215 2026-08-20 -->

- Two agents worked in parallel on related changes — edits to McpServer.ts, Worker.ts, WorkerAdapter.ts happened in coordinated bursts, suggesting agents synchronized or read shared context mid-session.
- Formatting and check cycles ran 3+ times with incremental fixes across audit reports, test files, and CLI modules — suggests parallel agent writes to multiple files (specs, tests, implementation) created format conflicts. Serial format pass after parallel work may be needed.
- Test file fixes required repeated grep searches for process.exit patterns across multiple test files with near-identical fixes (CliCommand/TaskCliCommand) — suggests this is a recurring maintenance pattern; consider templated fix or linting rule instead of manual edits
- Multiple parallel code-review and security-pentest fork agents ran but required 2 iterations to resolve findings — first pass was incomplete; either review agent briefing was incomplete or findings weren't actionable as-is

<!-- session 9ae6da57 2026-08-20 -->

- Multiple TypeScript compilation cycles (repeated `npm run build` with grep filters) suggest agent was making incremental edits without validating scope upfront. Should read all affected files and identify full type chain before starting edits.
- Test file generation pattern repeated identically for 5+ modules (configDir, versionValidation, UpdateManager, CliCommand, TaskCliCommand) — boilerplate could be templated to reduce redundant writes.
- Rapid successive edits to same test files (19:36–19:40, multiple process.exit mock changes) suggest thrashing rather than systematic debugging. User may prefer: read full error context once, make targeted fix, verify, move on

<!-- session 6211d754 2026-08-20 -->

- Bulk sed replacement (`sed -i 's/mockImplementation((_code?: number)/mockImplementation((_code?: string | number | null)/g'`) used to fix type compatibility across test files; suggests TypeScript mock/type issues could benefit from earlier architectural validation.

<!-- session a11724af 2026-08-20 -->

- Iterative TypeScript compilation: agents made 5+ sequential edits to `StepRunner.ts`, `ModelStepExecutor.ts`, and `types.ts` in rapid succession (22:01:04–22:01:53), suggesting they discovered validation/type issues during fixes rather than upfront. Pattern repeats across multiple files — fix, recompile, fail, fix again.
- User enforces a strong pre-commit discipline: `npm run format` followed by `npm run check` before declaring work complete. This appears consistently throughout the session (09:56, 10:01, 19:31, 19:35, etc.).
- Multi-fork agent strategy works well: spawning 3 parallel audits (quality/security/consistency) at 09:54 completed without interference. User trusts parallel fork agents for independent reviews.
- Session shows cross-project coordination: agent-fleet work (primary) with parallel updates to singleton-daemon-kit (Go launcher SDK). Pre-version bumps occur in SDK alongside flow-cli feature work.
- Test failures required iterative debugging (multiple grep/tail loops checking for specific error patterns) rather than failing fast with clear messages. Tests passed/failed multiple times before finding root causes (process.exit typing, file system mock issues).

<!-- session 6c0c8a03 2026-08-19 -->

- Spec documents edited 5+ times in cycle: initial edits (20:49) → goldfish review (21:04) → security audit (21:04) → fixes (21:07-21:09) → re-validation (21:10). Iterative validation pattern suggests upfront design review could reduce multiple passes.
- Multiple "final" passes on OpenCode Step Provider spec (security pentest v2–v6, goldfish v3–v5) with repeated edit cycles on same files (provider-abstraction.md, out-of-scope.md, step-model-integration.md). Pattern suggests either incremental refinement loops or review criteria not converging—clarify whether these cycles indicate convergence or iterative dissatisfaction.

<!-- session 98c0936a 2026-08-19 -->

- Agent a19e spent time searching for parseYAML implementation, then discovered it already existed (SendMessage at 21:08:46). Reflects implicit redirection mid-task when assumptions prove wrong.
- Opencode spec underwent 6+ iterations of goldfish + security pentest cycles (v2→v6) with incremental file edits — suggests either: (a) specs need upfront review before automation loops, or (b) iterative refinement is expected pattern for high-security specs and should be formalized/documented.

<!-- session 3f2a20af 2026-08-19 -->

- Heavy use of parallel agents for independent investigations (security audit, completeness audit, consistency audit, feature analysis) — effective for throughput but created redundant grep queries across agents; shared search results or coordinated patterns would reduce waste
- Sequential agent launches inefficient — fork agents spawned one at a time (21:00:02, 21:00:05, 21:00:07) when parallel launch available; switched to concurrent agents later (21:04:55+) and stayed with pattern. Establish parallel-agent launch as default where tasks are independent.

<!-- session afdd4652 2026-08-19 -->

- Test flow task-output-jsonpath.yml was edited at 20:39:13 immediately after first execution (20:38:55), indicating the run found an issue requiring mid-session fix before re-running. Suggests test flows weren't validated before first run.

<!-- session 66138a84 2026-08-19 -->

- Multiple parallel agents (acc25325, e9704d0a, 4a2fd14d, 55a79144) ran simultaneously across ~90 minutes with heavy overlapping file reads (flow-types.ts, threat-model.md, etc.). Consistent with user's CLAUDE.md "delegate early and often," but verify parallel work doesn't cause file-lock contention on Windows.
- Multiple re-launch pattern: goldfish coherence review launched at 21:04:12, then "Relaunch" at 21:10:06; security pentest subprocess audit at 21:04:31, then "Relaunch" at 21:10:17 — suggests first runs failed silently or didn't complete, agents not checking status before moving on.

<!-- session da343929 2026-08-19 -->

- User attempted to invoke skills "spec" and "violations" that either don't exist or aren't in the available skills list — suggest verifying skill registry is current with user expectations.
- Parallel agent forks (a19e, a5c0 both on OutputExtractor) with SendMessage coordination adds overhead; unclear decision criteria for parallelism vs. single-agent approach

<!-- session 55a79144 2026-08-19 -->

- User rejects over-engineered solutions. When multiple architecture options were proposed (IPC vs HTTP vs MCP client), the simplest direct-call option was correct — prefer direct over abstraction layers.
- Extensive parallelization pattern: 4-5 concurrent session flows (acc25325, 4a2fd14d, 55a79144, e9704d0a, de603161) launching fork agents for independent investigations (DX fixes, test coverage, spec coherence reviews, security audits)
- Multiple iterative spec reviews — goldfish coherence run twice (21:11:26, 21:14:55), security pentest audit twice (21:11:46, 21:13:12), then final passes (21:15:06). Pattern suggests unclear acceptance criteria or incremental discovery of issues per round.

<!-- session de603161 2026-08-19 -->

- Heavy parallel fork agent pattern with context-efficient output suppression (head/tail pipes) being applied consistently across builds, tests, and spec work to manage token usage.

<!-- session 274a5f98 2026-08-19 -->

- Spec file editing pattern: index.md, provider-abstraction.md, threat-model.md edited 4–8 times each in quick succession with small incremental changes (21:00–21:02, 21:07, 21:13) — suggests spec structure/requirements were unclear upfront; later goldfish/subprocess audits caught inconsistencies that earlier guidance would have prevented.

<!-- session e9704d0a 2026-08-19 -->

- Investigate external tool capabilities thoroughly (official docs, CLI help, env vars, config schema) BEFORE proposing design questions. Don't design abstractions based on assumed behavior.

<!-- session 4a2fd14d 2026-08-17 -->

- Review response quality before sending — user complained "t'avais pas reviewé ta reponse (ca commence à faire bcp de fois ce soir !)" multiple times in this chunk when I sent imprecise explanations or wrong examples (echo hook, absolute path requirement not justified). This is repeated feedback indicating a pattern.
- User values precision — asked "sois plus précis stp" on vague terms like "payload keys"; prefers concrete field names and examples over abstractions.
- User wants to TEST, not just understand theory — when given explanations, they immediately asked to adjust configs in `_test-tasks` to actually run and observe hooks working. Skip abstract discussion, go straight to runnable examples.
- Build artifact synchronization gap: mcp-server.cjs source written to src/worker/ but dist/ copy only discovered missing at 20:06:32; required manual cp + postbuild script addition rather than automatic pipeline.
- Old test config poisoned new test: `.flow/config.yml` from previous HTTP-transport test remained; agent disabled it (20:00:45) rather than deleting, causing investigation overhead.
- Formatter issues detected late: multiple re-runs of prettier + ESLint (20:12:06, 20:13:36, 20:14:49) instead of single pass; suggests no pre-commit hook or linter run before committing changes.

<!-- session d0c7ba90 2026-08-17 -->

- Parallel fork agents spawned mid-task (Phase 9/10 plugin work + MCP -p mode investigation) suggest context was splitting — better to complete one investigation before branching

<!-- session 5ddbec02 2026-08-16 -->

- Five+ edits to task-handle-conditional.yml across session (08:09, 08:10, 08:14, 08:21, 08:23) with repeated `flow validate` calls — suggests automated schema/validation test coverage insufficient, or test flow design evolved during development.
- Parallel fork agents for independent issues (env template fix + retry/loop testing + violations rule) — pattern appears validated by user; no complaints about task splitting.
- Multiple parallel agents spawned with "— TDD" suffix (a561, a3f9, a8a7, ac3a, a921), following delegation-first pattern from CLAUDE.md. Pattern validated multiple times this session; continue proactive delegation.
- Verbose/logging behavior for model steps is configured at step level via `log` parameter, not via CLI flags (no --verbose). Don't assume CLI-driven logging exists.
- Specification went through 4+ iterative fix rounds (rounds 4, 6, 7, 8) across multiple parallel agents with no clear stopping criteria or validation gate. Suggests either unstable spec requirements or validation loop not automated.
- Multiple round-trip investigations (15 grep/read calls over 15 minutes) before touching implementation files — exploratory work effective but verbose; TDD approach (test-meta-ref.yml validation at 15:29, then task-session-append.yml at 15:59) creates confidence but prolongs iteration cycles.
- Created both plugin.config.ts and .js versions defensively; suggests uncertainty about required file formats — clarify which format(s) are needed before delegating plugin package creation
- Tool loading issues at 18:33 (summary skill not known) and 18:57 (AskUserQuestion blocked) — tools should be pre-fetched before agent spawn to avoid availability surprises.

<!-- session c898dd1a 2026-08-16 -->

- User demands detailed pros/cons analysis for design options, not terse single-answer responses — three message cycle of "here's the answer / no I need analysis / [detailed response]" signals communication mismatch. Provide decision frameworks first, recommend second.
- Pre-existing flow-engine test failures (FlowRegistry, TemplateValidator, UserInterventionValidation) blocked new plugin work, creating context switches; tests were fixed mid-task rather than as setup
- Skills (run, spec, check) initially marked WARN "NOT YET KNOWN" (07:48, 07:52, 08:04) — suggests skill discovery/registration is either delayed or missing. Investigate tool-loading order.
- Fork agents attempted web fetching to research npm workspace issues (11:10:55 SendMessage warning "STOP making web fetching, use only local files") — constrain to local npm help, grep, and codebase investigation only
- Parallel agent work preferred — spec fixes (fork a0c6/a350/adfa) running concurrently with unrelated implementation work (fork bd4052a0 metaDir TDD) rather than sequential; suggests multi-track execution is validated workflow
- Multiple agent forks (a8dd, a440, a56a, a0cc) spawned mid-session for steps.X.meta, session append/fork modes — suggests feature scope wasn't bounded upfront. Parallel agent work needs clearer handoff/sync points to avoid diff conflicts when merging.
- Phase-based breakdown ("Phase 1 TDD", "Phase 4 WorktreeWorkspaceProvider") was given in spec but agent didn't enforce phase boundaries — created all packages + integration in one fork. Main session had to resume with "Continue Phase 6..." at 17:01. Agents should validate scope against phase boundaries before diverging.
- Silent enforcement pattern: agent (a2d3) added README files to all new packages without explicit user request visible in logs — indicates documentation standardization is being auto-applied proactively
- Manual grep-then-edit cycle for package refactoring (8 grep commands for "plugin-sdk" followed by edits) instead of scripted find-replace. Future similar refactors could use `find . -name "*.ts" -o -name "package.json" | xargs sed -i` or similar tooling.

<!-- session 75a0bd3d 2026-08-16 -->

- Reintroduced v2/v3 complexity after user explicitly scoped v1. User: "on a dit que le plugin était configuré au niveau du userHome, donc niveau flow dans les projets, on reste sur du minimum." Reset scope repeatedly.
- Confused when TypeScript was hand-written vs. generated (assumed generation from JSON manifest). User had to clarify: JSON manifest only declares existence + version numbers, interfaces are always hand-written.
- Unnecessary safety gate ("ask before Phase 8") rejected. User: planning + spec + subprocess review already provide guardrails; don't add procedural gates that reduce autonomy.
- Test investigation pattern: spawn fork → grep test name in file → read file → edit → rerun. Multiple forks (ac7f, aecb, ad3e) investigating FlowRegistry, TemplateValidator, UserInterventionValidation in parallel. Repeat grepping for same tests suggests incremental fixes across 5+ passes.
- TDD as standard implementation pattern: agents a0bf (env vars), ac93 (JSONPath), a6e4 (--project-dir), ac4e (TASK_PROJECT_DIR) all follow test-first approach — validates this is expected workflow
- Daemon communication protocol (executionId flow, command serialization) required repeated debugging of RunCommand.ts, Daemon.ts, CommandHandler.ts (09:15-09:26), then again at 09:26-09:29 with different issue. Pattern suggests docs or type safety is insufficient — no single place explains the round-trip contract.
- Parallel agent forking validated for independent investigations: npm shadowing research (a8c1), regression tests (ae19), model step investigation (a32b), validation fixes (a8a7). User consistently sends "Agent fork" commands to parallelize unrelated work—confirmed by multiple successful parallel executions.
- Parallel agent forks for independent features (meta implementation, session modes) work well but require clear file ownership — each fork modified different modules (StepRunner vs ClaudeLauncher vs Protocol) without conflicts, suggesting this pattern is validated for multi-mode development.

<!-- session e453d841 2026-08-16 -->

- Heavy parallel agent forking (fork pattern with ~6 independent agents) appears to be standard workflow here — all independent features (JSONPath, --project-dir, env vars, --inputs alias) spawned as separate agents to reduce context per agent.
- Multiple test iterations of task-loop.yml with debug logging additions (10:54–11:06) with uncertain resolution — suggests incomplete understanding of the fix before testing began; pattern of add-logging-then-test rather than diagnose-then-fix.
- User preference: STOP using web fetching/external APIs — use only local files and code inspection (11:10:55 message to agent a8c1)
- Parallel agents working on independent concerns (spec validation vs implementation) can miss coordinated changes — metaDir refactoring touched both, but fixes weren't synchronized.

<!-- session 7d4fb045 2026-08-16 -->

- TDD workflow applied consistently across parallel agents (a0bf, a106, ac4e, ac93) for feature implementation — red phase tests followed by implementation.
- Multiple iterations on `output` vs `outputs` vs `outputs[stepId]` nomenclature across FlowScheduler, ConditionEvaluator, SimulationValidator, and test files — showed unclear migration path for a breaking contract change.
- Loop/retry failure handling (`hasFailed` flag in loop context) was incomplete — main session debugged 30+ min through execution store, daemon command handling, and step tracking before identifying flag wasn't propagated on step failure; multi-layer coordination gap.
- User halted agent-browser web fetching — explicit SendMessage "STOP making web fetches, use only local files" (11:10:55). Preference: local-only operations, not browser-based discovery.
- Verbose mode in model steps is controlled via step config parameter (`log: step`), not CLI flags. Correction given at 13:17:18 during streaming implementation.

<!-- session 53ae965f 2026-08-16 -->

- Skills "spec" and "run" triggered "NOT YET KNOWN" warnings — agent fell back to bash searches for skill definitions. **Why:** Skills not pre-loaded into context, ToolSearch not automatically invoked. **How to apply:** Pre-load high-value skills or auto-trigger ToolSearch when skill call fails validation.
- User explicitly told agent to "STOP making it use browser mode" — agent-browser should run headless-only (line 11:10:55: SendMessage warning shows user redirect). This preference needs to be saved to memory and enforced when spawning agent-browser.
- Multiple spec audit passes (rounds 1-4) with escalating rigor (HIGH → CRITICAL findings) suggests either over-delegation or insufficient quality on first pass — clarify audit entry criteria and first-pass completeness standards.
- Multiple agent forks launched in rapid succession to fix spec issues ("Fix 4 remaining HIGH", "Fix round 6", "Fix round 7" at 14:24:24, 14:30:30, 14:34:51) suggests spec had cascading problems requiring multiple validation passes — spec may not have been sufficiently reviewed before implementation fork started.

<!-- session 08efa22d 2026-08-16 -->

- Test-debugging cycle repeats: `npm test | grep FAIL` → read test file → read implementation → Edit test → `npm test` again. Multiple rounds (22:00–22:24 for flow-engine alone). No upfront context about which tests validate what.
- TDD workflow is strict: write test (red phase), implement, validate with `flow validate`, run full suite. This is the expected dev loop, not optional.
- Agents should not fetch external resources during task execution; use local files/code first. User sent explicit "STOP" message to agent a8c1 during npm investigation.
- Verbose mode control moved from CLI flag to flow-step parameter (`log: <stepName>`). Correction sent via SendMessage at 13:17:18. This wasn't retroactively documented in code/comments; note for future model-step changes.

<!-- session e9472617 2026-08-16 -->

- Multiple fix-retry loops (22:30 build → grep → edit → rebuild; 22:33 grep → retest; 06:31+ TDD × ~10 iterations) suggest fork agents lack upfront design docs — issues discovered by running tests, not prevented upfront.
- Test output parsing via grep/tail fragile — multiple attempts with different patterns (tail -20, tail -8, grep -E, head -60) to capture test failures, suggesting no stable test output format.
- Test flows (task-retry.yml, task-loop.yml) were rewritten 5+ times by main agent after fork creation, without clear convergence toward passing state. Suggests test requirements/expectations were not clearly specified before fork agent created the files.
- Stop web-fetching in agents when debugging local tooling — investigate code paths and logs directly; don't attempt online npm documentation lookups or external fetches for problems that can be solved locally.
- Verbose mode is driven by `log: step` param in flow definition, not by `--verbose` CLI flag—agent assumed CLI control but logs show correction at 13:17:18.
- Workspace metadata refactoring spans types.ts, WorkspaceManager.ts, StepRunner.ts, multiple test files, factories, and CLI packages — indicates need for systematic refactoring checklist or architectural documentation of all affected boundaries.

<!-- session d300bfbf 2026-08-16 -->

- Skill discovery broken for new/unknown skills — `/spec` and `/run` showed "NOT YET KNOWN" warnings when user tried to invoke them, despite skills existing elsewhere in the system.
- Heavy fork delegation for parallel work: workspace shadowing fix (a53e), conditional refactor (abc9), template issues (a593), test flows (a6e6) — all running concurrently. Main session focuses on integration/debugging while forks handle isolated subsystems.
- User preference: investigate using local files only, do not web-fetch external docs (sent 11:10:55 "Stop web fetching, use only local files")

<!-- session bd4052a0 2026-08-16 -->

- When code review finds variant issues (e.g., Map.get()!), fix ALL variants immediately with TDD — don't report and wait for user to request the fix separately
- Launch independent forks in parallel by default — don't invent sequential dependencies that don't exist (flow-cli changes don't affect flow-engine)
- Test thoroughly before handing code to user — manual testing of conditional flows, daemon communication, etc., not just build + lint
- Agent declared features "ready to test" without manual verification — happened 3+ times (retry logs, model streaming, flow validate). User had to find bugs and re-report.
- Agent avoided root-cause analysis and over-complicated fixes (port cleanup, npm overrides). User redirects needed: "step back", "pourquoi tu ne te poses pas la vraie question".
- Test fixture incompleteness cascades across multiple test files — incomplete mocks (missing `exists()`, missing `taskMetadata` field) cause downstream test failures in multiple packages
- Heavy reliance on agent forks for parallel work — 7+ independent fork directives in single session successfully isolated scope and reduced context
- Parallel agent spawning at 08:19:29-08:19:35 (forks a0bf, ac4e) on overlapping work (global env vars + TASK_PROJECT_DIR) suggests lack of upfront task decomposition — both agents queried same files independently instead of one delegating to the other
- Multiple iterations debugging loop/retry flows (11:00–11:07): agent made speculative changes rather than tracing execution path first. Next time: add debug logging, read trace output, then change one thing — observe result before next change

<!-- session 5b7b2b1a 2026-08-16 -->

- Multiple test debug patterns needed (tail, grep, reporter=verbose, bail flag) to isolate failures — workflow could be standardized for faster debugging
- Four fork agents spawned within ~9 seconds (08:19:26, 08:19:29, 08:19:35, and implicit TASK_PROJECT_DIR) for parallel feature work — user pattern of delegating multi-feature tasks to agents in parallel.
- Heavy delegation to agent forks (3 forks for isolated tasks) follows CLAUDE.md guidance, but main agent had to re-investigate forked changes afterward (e.g., checking if violation rule compilation passed), suggesting fork results weren't summarized back to main context—consider tighter handoff protocol.
- Parallel agent fork delegation pattern (a8c1, ae19, a561, a32b, a3f9, a8a7, ac3a, a921) for independent tasks validated — no corrections observed; this is the expected workflow.
- User consistently delegated to fork agents for isolated parallel work: streaming fixes (a190), output injection design (aaa8/a9a5), and multi-round spec audits (a3e0/ab24/a928) — indicates preference for decomposing complex tasks across independent agents rather than sequential fixes.

<!-- session 576b7d8d 2026-08-16 -->

- Multiple test file rewrites fixing auto-discovery paths (TemplateValidator, FlowRegistry) — suggests initial path resolution assumptions were wrong; validation needs explicit setup in test harness early.
- workspace: protocol and npm override configuration reappeared (10:51–10:53) despite prior fixes — suggests the solution wasn't preserved or validated in CI/build process.
- User sent message to forked agents to stop web fetching and use only local files — preference for local-only investigation rather than external web calls during agent work.

<!-- session 32c17c8b 2026-08-16 -->

- When multiple test suites fail after refactoring, first check if test fixtures/mocks are stale vs production types before assuming logic bugs — this is faster than iterative test runs.
- Loop/retry state handling required many file reads and debug logging iterations (10:58-11:06) to isolate — control flow across FlowScheduler/ExecutionStore/Daemon/CommandHandler is complex; consider refactoring or adding architecture docs for failure/retry paths.
- Verbose mode is controlled by flow step config `log: step` parameter, not CLI `--verbose` flag. Agent initially assumed control flowed through CLI rather than through flow definition.

<!-- session 92cb6ce8 2026-08-16 -->

- When multiple agents work in parallel on related code, verify integration points early — parameter passing through IPC/message layers (Protocol.ts → CommandHandler → WorkerAdapter → StepQueue) broke silently across 4 files due to `workspaceDir` context not propagating.
- Incremental edits across CommandHandler.ts (lines 09:35–09:36), TemplateRenderer context (09:36:53), and ConditionEvaluator (09:49:48+) — template/condition context shape was unclear; agent had to iterate through multiple file edits in sequence rather than one-shot fixes.
- User has strong preference against web fetching by agents — user explicitly SendMessage'd an agent fork (11:10:55) to stop it. This is environmental constraint, not request-by-request.

<!-- session 543d9d83 2026-08-16 -->

- Agent correctly parallelized independent work across 3+ fork sessions (FlowRegistry, TemplateValidator, UserInterventionValidation fixes) — validates that user expects multi-agent dispatch when issues are decoupled.
- TDD (red-green-refactor) pattern successfully applied across 6+ parallel agent tasks (jsonpath, --project-dir, global env, --inputs alias, etc.) — validated approach for this codebase.
- Loop execution condition (onFailure + hasFailed flag) required multiple debug iterations (09:58:46-11:06:27) to wire failure detection → termination — loop/retry semantics lack clear specification.
- Parallel fork agents used consistently for independent work (npm research, regression tests, model bug fixes, flow validation) — this pattern reduced context and worked well

<!-- session e65b2ff1 2026-08-16 -->

- Pre-existing test failures in flow-engine required investigation before new work could proceed — suggests need for baseline test health validation before feature branches
- RunCommand.ts edited 3 times in 30 seconds (lines 09:01:41/44/47/51/55) suggests first fix attempt was incomplete — agent continued iterating without clear indication what was wrong.
- Exploratory debugging pattern (run test → same error → run test again) consumed time; hypothesis-driven fix (predict → test once) would have shortened 10:59–11:06 cycle.
- User explicitly stopped web fetching: "STOP making web requests, use only local files." Document this as a hard constraint for this project.

<!-- session e98523b0 2026-08-16 -->

- Tried unknown skills (get-timestamp at 22:50:12, check at 06:46:25) — agent did not verify skill availability before calling
- Multiple parallel agents worked on related features (–project-dir, env vars, output extraction, daemon response handling) across chunks 08:10-08:22 — confirms value of fine-grained task parallelization established in memory.
- Naming changes across codebase need exhaustive grep before applying (output→outputs, task→removed from context)
- User (or SendMessage hook) directed agent to stop web fetching and use only local files (11:10:55 warning). This is a pattern worth remembering for future agent behavior.

<!-- session 686db9b5 2026-08-16 -->

- Parallel agent spawning for independent test fixes (agents ac7f, aecb, ad3e, adae for different failing tests) was effective — coordinate independent work across multi-file refactoring rather than sequential fixes.
- Multiple sequential vitest runs (08:11-08:13) instead of combining into single check — context-inefficient; should batch test verification
- agent-browser skill preference not working as expected — user sent explicit "STOP" message (11:10:55) about browser automation behavior; preference should be enforced or documented.
- Streaming implementation required multiple fix rounds (regex, delays, verbose mode, event mapping) across ScriptExecutor, WorkerAdapter, StepRunner — indicates interdependent complexity; streaming changes should trigger full integration test suite, not unit tests alone.

<!-- session f5ca1287 2026-08-15 -->

- User expects assistant to run tests and fix gaps autonomously ("lance toi" — do it yourself), not ask permission. User reserves manual testing for scenarios that can't be automated.
- User rejects solutions that require awkward invocation — CLI must be globally callable via `npm link`/bin entry, not `node dist/cli/TaskIndex.js`. If spec requires `bin`, implementation must deliver it.

<!-- session 0b3d4416 2026-06-19 -->

- User explicitly corrected emoji/unicode in code — cites CLAUDE.md rule "avoid all emojis or special unicode please". Removed all ✅🔲📋✦❓ from plan file after user reminder.
- Subprocess skill invocation had a warning ("NOT YET KNOWN"). May need ToolSearch to load subprocess schema first before calling via Skill, or skill definition needs verification.

<!-- session 44b25955 2026-08-09 -->

- User workflow pattern observed: create comprehensive spec → spawn multiple independent coherence/audit agents → iterate spec based on findings → create plan → create implementation prompt. This is a deliberate heavy-review cycle for specs
- Implementation prompt generation required multiple correction cycles: written once (23:16:49), then "Fix goldfish gaps" (23:40:22) with 15+ plan edits in 2 minutes (23:38:44–23:40:06). Specs incomplete before prompt generation starts.
- Multiple iterative refinements of implementation spec (goldfish-iter3→iter4→iter5→iter5b→goldfish4) with interleaved validation calls suggest specs required multiple external validation passes before finalization

<!-- session 5ca40801 2026-08-09 -->

- Iterative goldfish validation with multiple passes (comprehension, critic, implementation-readiness) feeding back into implementation-prompt.md edits — suggests this three-pass validation is a deliberate quality gate for specs.
- Goldfish validation cycles (iter3→iter4→iter5→iter5b) followed by rapid plan edits — implementation guidance requires iterative refinement; validate spec coherence before generating plans.

<!-- session e99131f8 2026-08-09 -->

- User spawned multiple fresh `claude` subprocesses with `--dangerously-skip-permissions` for parallel exploratory analysis of specs — use subagent tool for this instead of subprocess spawning to avoid context fragmentation and permission-bypass pattern
- Iterative refinement pattern: implementation-prompt.md grew from 5416 to 6926 chars over 5+ read-edit cycles (23:15:28 → 23:40:14) with goldfish validation checks — user prefers gradual improvement with validation over large rewrites

<!-- session 95b0dc3a 2026-08-09 -->

- Multiple uses of `--dangerously-skip-permissions` in bash commands; permission prompts appear to be friction. Consider adding high-frequency tools to the allowlist.

<!-- session c16a2058 2026-08-08 -->

- Multiple goldfish iterations (1-5b) to refine implementation-prompt.md suggests spec clarity issues — iterative fresh-context reviews caught gaps; consider upfront clarity-review before writing specs

<!-- session 0e725353 2026-08-08 -->

- goldfish-review skill was NOT YET KNOWN (22:51:27 WARN), forcing workaround via manual `claude --dangerously-skip-permissions -p` CLI calls for three separate checks instead of using `/goldfish-review` directly.
- Goldfish review process found gaps across 4 iterations, each triggering edits to implementation-prompt.md. Pattern suggests specs/prompts lack sufficient pre-implementation context or validation before handoff — consider running goldfish earlier in spec authoring, or add pre-review checklist for completeness.

<!-- session 75bdb797 2026-08-08 -->

- Parallel agent launches (22:20:00+) for independent reviews work well; back-and-forth edits to decisions.md and scenarios.md (22:33–22:34) suggest spec refinement is iterative — multiple passes are expected, not a sign of error.
- User is running multiple fresh-engineer analysis passes (`-p "You are a fresh engineer with zero context..."`) in parallel, suggesting agent diversity is being used as a validation mechanism — a pattern that should be documented if intentional, or streamlined if redundant.

<!-- session e3b9ff5f 2026-08-08 -->

- Implementation-prompt required goldfish validation cycle (iter1 → edits → iter2) suggesting specs benefit from validation pass before handoff to implementers

<!-- session 4a2fd14d 2026-08-21 -- debug-ci: GitLab npm registry -->

- **Non-destructive write_package_registry probe:** `POST /api/v4/projects/:id/packages/pypi` (empty body) → 401 unauth / 403 no scope / **400 scope OK** (nothing created). This is the only non-destructive write probe for deploy tokens without `api` scope.
- **npmrc: always use same file for READ and WRITE tokens.** Splitting READ into `~/.npmrc` and WRITE into `.npmrc` local caused 403 on npm publish even though the WRITE token was valid. Fix: both tokens appended to `.npmrc` local, WRITE token last (last occurrence wins for duplicate keys in same file). Verified against violations-framework pattern.
- **GitLab deploy token introspection fails without api scope.** `personal_access_tokens/self` → 401, `deploy_tokens/self` → 404. Use indirect probes (read: GET known package, write: POST /packages/pypi).
- **GitLab validation order for Generic Packages:** auth → format → scope. Invalid version format (e.g. `@@`) returns 400 regardless of write scope -- format validated BEFORE scope. Cannot use format-invalid requests as non-destructive write probes.
- **Generic Packages DELETE requires api scope.** `write_package_registry` deploy tokens get 404 (security-by-obscurity) on DELETE. Only manual UI deletion or api scope token can delete.
- **npm "processing" packages:** npm PUT to `/packages/npm/` with empty or malformed body creates a persistent "processing" package. Use PyPI probe instead of npm registry for write validation.

<!-- session 33c79da6 2026-08-08 -->

- User explicitly requested "exact content" without summaries — when analyzing/validating specs, full text matters more than condensed overviews

<!-- session e02d6bbb 2026-08-08 -->

- Skill availability timing inconsistent — "claude-api" and "check" unavailable initially but present in later sessions

<!-- session a11d7129 2026-08-08 -->

- Spawned multiple general-purpose agents sequentially for similar spec cleanup tasks (22:02:39, 22:06:10, 22:32:34) — suggests batching or a specialized spec-audit agent would reduce round-trips
- Agents consistently use bash grep/cat commands instead of Grep/Read tools. At least 6 instances violate "ALWAYS use Grep for search tasks" guidance. Enforce tool-selection rules in agent system prompts or Explore agent.

<!-- session f8f7b481 2026-08-08 -->

- When user requests "full contents" or "raw text", return actual file content via Read tool, not agent summaries or abstractions.
- Goldfish-review skill runs comprehension → critic → implementation-readiness checks sequentially on specs — becoming a standard validation pattern for design documents in this project.

<!-- session b273c373 2026-08-08 -->

- Multiple coherence audit passes (4+) on flow-cli spec before stabilization — user prioritizes spec completeness and cross-consistency; plan for iterative refinement cycles with fresh-context reviews rather than single-pass spec work.
- Three-pass goldfish review pattern (comprehension → critic → implementation readiness) is repeated multiple times, and prompts are saved to temp files before execution. Suggests this is a validated, repeatable analysis pattern agents should recognize.

<!-- session 1d9d9b8b 2026-08-08 -->

- Unnecessary filesystem checks (ls before mkdir, ls before Write) — Write tool handles directory creation; these checks add no value.

<!-- session 6c4d20b9 2026-08-08 -->

- Multiple parallel agents (general-purpose) spawn to read identical spec files and source locations (specs/2026-07-30-flow-cli/_, specs/2026-08-09-zones-attestations/_, packages/flow-engine/src/) — pattern suggests verification or stress-testing of specs, but creates redundant reads when results aren't explicitly shared between agents

<!-- session f39ed56c 2026-08-08 -->

- Multiple agents (ae2b, a3fe, ac24, a359) launched in parallel to audit same spec directory (22:20:00 onwards) — aligns with project instruction "delegate to sub-agents early and often" but shows this pattern is heavily used for spec validation work
- Multiple concurrent agents spawned reading identical files (specs, types.ts, FlowValidator.ts, etc.) at same timestamps — indicates parallelization strategy didn't account for shared dependencies; consider single agent reading shared files then distributing results to dependents.

<!-- session 91f855f6 2026-08-08 -->

- Heavy agent delegation for sequential spec edits (decisions.md, open-questions.md) is acceptable pattern; mix of direct main-agent edits and delegated batches used throughout
- Heavy incremental editing on spec files (daemon-lifecycle.md, decisions.md, open-questions.md) with many single-occurrence replacements — workflow pattern suggests specs require multiple revision passes rather than comprehensive write-once-correct approach

<!-- session 2fb9fc7d 2026-08-08 -->

- Spawned 4+ parallel agents simultaneously for interdependent spec file edits (decisions.md, open-questions.md). Work succeeded but sequencing these edits upfront (not in parallel) would have reduced coordination complexity.

<!-- session 66f53dff 2026-08-08 -->

- Heavy, successful use of general-purpose agents for spec document management (updates to decisions.md, open-questions.md across multiple spec dirs). Multiple coherence audits ran in parallel — suggests quality gates on specs are valued and worth parallelizing.
- Multi-agent spec generation workflow emerged: decisions.md → implementation-prompt.md → implementation plan. This pattern repeated across flow-cli and zones-attestations specs. May warrant a skill or templated workflow to reduce coordination overhead.

<!-- session cac4885a 2026-07-30 -->

- User must correct assistant's daemon/worker communication model understanding repeatedly — assistant kept proposing wrong IPC mechanisms (HTTP, CLI fallback, etc.) without grasping the permanent connection + SDK constraint. Pattern: insufficient context reads before proposing architecture.
- User wants full option analysis (pros/cons/recommendation) upfront, not conclusions. Saying "I think option A is best" violates this — must present alternatives first with consequences, let user decide.
- Subprocess (`claude --print`) audits catch logical consistency issues that managed subagents miss — subprocess fresh context without harness bias. Prefer subprocess for coherence/completeness checks.
- User clarified `input://` concept was about file-path indirection for trust boundaries, not interactive mode. Assistant initially pursued wrong angle before research agent reoriented.
- User interrupted coherence audit mid-execution ("Request interrupted by user"), then returned with narrowed scope: fix audits 2, 3, 4 specifically. Suggests initial open-ended audit task was too large or findings needed absorption time.

<!-- session 1e242f45 2026-07-30 -->

- User explicitly requested "EXACT text for specific sections" then "COMPLETE contents of every file" after receiving apparently truncated/summarized responses—agent was summarizing spec contents when precision/completeness was required.

<!-- session 96446ac4 2026-07-30 -->

- During brainstorming sessions with pros/cons, always propose options and ask for approval before deciding — never make design choices unilaterally (happened multiple times: HTTP POST/SSE, worker communication model)
- When proposing options during design interviews, only include options that are actually viable — don't propose mutually exclusive alternatives when the user has already ruled out one path (e.g., proposing "configurable heartbeat mode" after user said "no, don't make it configurable")
- Maintain cross-decision consistency: refer back to prior decisions before proposing new ones (e.g., user had to remind about log-to-disk decision when proposing daemon-side streaming)
- Multiple independent agents (Explore, general-purpose) read identical spec files sequentially without coordination, causing redundant I/O. Agents should receive shared context or hand off findings rather than re-audit.

## Agent errors

<!-- session 5565878c 2026-08-22 -->

- Asked for approval on incomplete CLAUDE.md instead of completing the full analysis first; user redirected with "actually I need more" rather than approving. For large doc requests, complete the full scope before asking to write.
- Agents repeatedly call Skill with "check" and "run-test" that are marked "*** NOT YET KNOWN ***" instead of using ToolSearch to load skill schemas first. Pattern: backend-dev tries `Skill run-test` → WARN → later general-purpose reads `.claude\skills\run-test\examples.md` to work around the missing schema. This happens ~8 times across the chunk.
- Two backend-dev agents spawned in parallel (ac4c at 08:52:20 and ad31 at 08:51:46) work on overlapping files (ModelProvider.ts, ClaudeModelProvider.ts, OpenCodeModelProvider.ts, types.ts) without visible coordination. Both agents edit the same files in sequence — potential for conflicts or wasted work.
- Agents tried calling unavailable skills without checking first: `check`, `run-test`, `check-parallel-agents` (line 12:34:41, 12:34:43, 12:35:03). These skills were not in the agent's knowledge of available skills.
- Agent attempted `EnterPlanMode`/`ExitPlanMode` tool calls that don't exist in the deferred tool list (13:31:36, 13:31:41). Tool does not appear to be available in this codebase/session.
- backend-dev agent tried calling unavailable skills ("check", "run-test") at 14:46:37, 14:47:02, 14:47:04, 14:48:54 with WARN log; agent should handle gracefully or pre-check skill availability
- Two agents (a762, a430) independently spawned to migrate TypeScript 7 at 16:58:17 and 16:58:31—duplicate parallel work on same task. Agents should check for concurrent execution or use lock mechanism.
- Initial @types/node version wrong: agent set ^26, SendMessage correction at 16:55:05 to use ^24 instead. Version assumption not validated against Node version compatibility.
- Skill call at 19:54:11 shows `[ WARN] Skill Skill - *** NOT YET KNOWN *** skill=check` — agent should have used ToolSearch to load the skill schema before invoking it, not attempted direct invocation.
- Around 19:26-19:27, multiple Grep tool calls with incomplete/malformed patterns (`grep -o` with no actual pattern) — pattern construction for URL regex extraction was failing; should have validated regex before execution.
- Around 17:17-18, manual bash inspection of @testing-library type definitions through multiple cat/grep commands instead of systematic investigation — indicates agent was working around the actual root cause (tsconfig resolution issue) rather than diagnosing it.
- Attempted skill invocation with `skill=check` before schema loaded (`*** NOT YET KNOWN ***`), but recovered gracefully; agent waited for subsequent invocation to succeed. Not a blocker, but suggests early skill loading or graceful fallback needed.

<!-- session e76b8d9c 2026-08-21 -->

- OpenCode `XDG_CONFIG_HOME` isolation wipes auth — subprocess fails immediately because it can't read credentials. Mitigation: copy global `config.json` into tempDir before spawn.
- Agent made ModelStepExecutor changes without verifying build/tests afterward. Only discovered 29 test failures on manual check.
- Wrong event name in mock (`emit('close')` vs `emit('exit')`) caused 28 test timeouts. Suggests model provider event contracts aren't documented; mismatch should have been caught before submission.
- Writing stub translator files (TDD phase) with empty implementations then "tests will fail first" is confusing without explicit framing. Better: explain TDD phase upfront or implement real translators so tests pass immediately.
- Path calculation errors repeated 3x before finding correct level: assistant miscounted `..` levels from `packages/flow-engine/src/executor/` to `_test-tasks/` — suggests template-based relative path logic fails on deep nesting.
- JSON.stringify() in shell command generation produces double quotes, breaking grep-in-shell validation — caught late in review rather than at write time.
- Assistant created StreamEventMapper.test.ts via WRITE instead of checking if existing test file existed to be modified — assumption that new files don't have prior state.
- Assumed `npm ci` would resolve lockfile issues; actually needed `npm install --prefer-offline` when lockfile contains optional platform-specific packages with unresolved transitive deps.
- Backend-dev subagent attempted to invoke `parallel-and-todos` and `run-test`/`check` skills (15:11:25, 15:23:42, 15:23:44) that weren't available in its execution context, producing "NOT YET KNOWN" warnings instead of executing. Subagents have restricted skill registries compared to the main environment.
- backend-dev agent attempted to use `Skill run` with bash command as argument (line 17:13:37) — skills don't take arbitrary commands, only registered skill names. Agent lacks skill discovery mechanism.
- backend-dev agent encountered "NOT YET KNOWN" for skills `check`, `run-test`, `run` multiple times despite these being in system-reminder available skills list — subagent skill context differs from main context.

<!-- session acc25325 2026-08-19 -->

- Created test files with expected outcomes WITHOUT running them first — assumptions about `flow run` output were wrong. Missing `--wait` flag caused silent exit.
- JSONPath bracket notation `$.tags[0]` fails silently; must normalize to `$.tags.0` before parsing.
- Parallel agents modifying same file (OutputExtractor.ts + test) caused concurrent writes — risk of data loss. Coordinate file ownership or serialize.
- Template validation errors (missing required input "priority") were silently swallowed; error only surfaced via workaround, not fixed DX.
- Skill "spec" invocation failed with "NOT YET KNOWN" at 2026-08-19 19:51:32 — possible timing issue or skill-loading race condition when user tried to invoke a spec mode.
- Bulk sed regex replacements on code files (line 21:09:22: `sed -i "s/{ type: 'string' }/...`) are fragile and error-prone; agent should use Edit tool for precision changes instead.
- Multiple concurrent agents (55a79144, de603161, 274a5f98, e9704d0a) read identical spec folder files (lines 21:04:54–21:05:08) — suggests missed deduplication or poor task coordination when spawning parallel agents.
- LoopHandler test file lookup: agent searched `src/orchestration/LoopHandler.test.ts` (wrong), then `find` to locate it, then succeeded with `src/processing/LoopHandler.test.ts`. Document the correct location or add a lint rule to catch misplaced test files.
- Skill invocation failures: backend-dev agent attempted `skill:run` and `skill:check` which were not registered in the deferred tools list at runtime (21:20:51, 21:52:41). When agents try unavailable skills, they WARN but don't fail loudly — this causes silent work gaps. Skill availability should be validated before agent launch or skills should fail hard on unknown names.
- npm install → workspace config edit → npm install again (21:21:31 → 21:22:21 → 21:22:47). Agent ran install before validating workspace config. Clarify when to validate package.json workspaces array before running npm operations.
- Spawned second backend-dev agent (4a2fd14d:A:a839) while first one (e9704d0a:A:ae6b) was still running; both performed overlapping greps/reads (StepRunner, UpdaterMain, FlowConfig, PluginRegistry). Wasted context investigating same areas. Should wait for first agent to complete before spawning a second, or explicitly kill the first if abandoning its work.

<!-- session 1dcbd5b4 2026-08-21 -->

- OpenCodeModelProvider subprocess event handling required multiple refinement cycles — stdin closure timing, close vs exit event ordering, and timeout safety weren't immediately clear from code inspection; debugged via iterative edits and test runs before arriving at final pattern (close stdin → wait for close event → timeout fallback).
- OpenCode executable resolution fell back through multiple paths before finding the right approach — tried direct exe locations, .cmd wrapper, shutil.which — unclear upfront that Windows PATH resolution differs from *nix; settled on fallback chain but discovery was iterative (log lines 22:23:07 → 22:47:56).

<!-- session 2157a0f8 2026-08-20 -->

- Two backend-dev agents working in parallel on overlapping files (McpServer.ts, Worker.ts, WorkerAdapter.ts) from ~22:00 onwards — suggests duplicate/concurrent edits on same targets without coordination mechanism.
- Skills "check" and "run-test" invoked but returned "NOT YET KNOWN" (lines 22:03:37, 22:06:07, 22:09:57) — agent attempted to call before skill schema was loaded, causing fallback behavior.
- Backend-dev agents performing heavy iteration on McpServer/StepRunnerConfig integration (15+ grep patterns for `mcpConfigPath`, `McpServer`, `configPath` across multiple reads/searches) — suggests unclear/missing type definitions or architectural contracts for how these components wire together.
- Parallel audit forks (quality/security/consistency) write findings to `.claude/specs/.../audits/YYYY-MM-DD_<type>/report.md` but lack file:line cross-references. Backend-dev agent then manually greps to locate code — consider: audit format should include concrete code locations or the audit agent should draft targeted fixes inline.
- Test mock type fixes required multiple iterations to find all occurrences of `process.exit` mocking — search comprehensively with grep before bulk replacing, not file-by-file edits. Type signature correction: `(number)` → `(string | number | null)` for process.exit mocks.
- Agent used multiple targeted grep searches for specific patterns (validateString, validateLaunchOptions, null byte, `\x00`, `code ?? 0`, `exitCode`) — indicates uncertainty about where validation logic should be applied or already existed; had to hunt rather than know from context reading.

<!-- session 6d59c129 2026-08-20 -->

- Used skill syntax with pipe args (`skill=run | args=bash...`) instead of standard tool parameters — unexpected format that doesn't match Skill tool schema
- Extended debugging cycle with repeated file reads and incremental one-off edits scattered across 8+ files over 15min (22:00–22:15) before committing to refactoring strategy — suggests changes weren't scoped upfront
- Backend-dev agent attempted to call skills (`check`, `run-test`, `subprocess`, `write-doc`, `run`) that returned "**\_ NOT YET KNOWN _**" — suggests agents don't have reliable skill discovery or these particular skills are not accessible to backend-dev agent type, causing WARN logs but forcing fallback to manual Bash commands
- Test debugging on CliCommand.test.ts and TaskCliCommand.test.ts used trial-and-error (edit, run, repeat) instead of identifying the root issue first. process.exit type signature mismatch (`number` vs `string | number | null`) took multiple iterations to resolve; should have run tests once, read error fully, then fixed once.
- Security/code review subprocess agents (iterations 1, 2, 3 of pentest + code review) suggest initial findings were incomplete or the review scope wasn't precise enough. Re-running full audits indicates either unclear audit briefs or issues missed in first pass.
- "Full review iteration 4 - final check" indicates multiple prior iterations; the specific grep patterns (skipPermissions, exitCode, currentProcess = null, providers.\*Map, result !== undefined) suggest earlier iterations missed or incompletely fixed these issues — agent should validate comprehensively in first pass rather than requiring multi-iteration reviews

<!-- session 0455fbe4 2026-08-20 -->

- Repeated "**\_ NOT YET KNOWN _**" warnings for skills (check, run-test, write-doc, subprocess at 09:59:33, 09:59:37, 19:26:46, 19:26:49, 19:26:51, 19:33:01, 19:34:05, 19:34:11) — agents lack upfront skill definitions, causing fallback searches and latency spikes.
- Inefficient partial file reads — backend-dev agents repeatedly Read files with small offsets (50 lines) that didn't capture full context, requiring multiple sequential reads instead of one full read upfront.
- backend-dev agent attempted unknown skills "check" and "run-test" (20:15:33–35) — skills exist but agent wasn't aware of them, requiring workarounds

<!-- session 95141215 2026-08-20 -->

- Agents repeatedly attempted unavailable skills (`/check`, `/run-test`) at 22:03:37, 22:06:07, 22:09:57, 22:15:50 — skill NOT KNOWN warnings recurred without retry. After blocks, agents pivoted to `npm run build` + grep filtering instead of reengaging the skill.
- Agents repeatedly attempted to invoke unavailable skills (`check`, `run-test`, `write-doc`, `run`, `subprocess`) with WARN logs; expected availability but weren't loaded in session context. Agents should validate skill availability or fall back to direct tool calls.
- Test-writing agents created tests with incorrect mock type signatures (`mockImplementation((_code?: number)` vs correct `_code?: string | number | null`); required separate fork agent to fix ESM mocking compatibility. Mock signatures should be validated against actual implementation before committing test files.
- Backend-dev agent invoked unavailable skills ("check", "run-test") and received WARN instead of graceful error — should pre-check skill availability or handle gracefully in agent setup

<!-- session 9ae6da57 2026-08-20 -->

- Agent invoked deferred skills ("check", "run-test") without calling ToolSearch first to load their schemas—resulted in "NOT YET KNOWN" warnings. Must call ToolSearch("select:check,run-test") before invoking these skills.
- Backend-dev agent repeatedly tried to invoke skills (`check`, `run-test`, `write-doc`, `subprocess`) without verifying availability first; fell back to Bash/fork-and-bash pattern. Skills should be pre-fetched or agent should use ToolSearch before assuming.
- Multiple sequential fork agents spawned for parallel audit tasks (quality/security/consistency) succeeded, but earlier backend-dev instances kept creating fresh agents rather than reusing existing ones for related work (e.g., test writing).
- When fixing process.exit mock signature mismatches in test files, agent made 8+ edits across CliCommand.test.ts and TaskCliCommand.test.ts over ~4 minutes without reading the actual type error. Should have: read the full error once, understood the type mismatch, applied the fix consistently
- backend-dev agent spawned with code-review/security-pentest work encountered unknown skill "check" and "run-test", then spawned general-purpose agent to investigate. Skills should be pre-verified or fallback should be clearer

<!-- session 6211d754 2026-08-20 -->

- Two backend-dev agents (e9704d0a, 4a2fd14d) worked in parallel on overlapping code areas (McpServer.ts, Worker.ts, types.ts) with repeated Edit operations, causing a long debugging loop (22:05:40–22:14:49) instead of coordinating or deferring to one agent.
- Agents called `skill=check` and `skill=run-test` multiple times (22:03:37, 22:03:40, 22:06:07, 22:15:50, 22:20:37) but got "NOT YET KNOWN" warnings, then fell back to ad-hoc grep/npm commands instead of asking or using Bash directly first.
- Backend-dev agents repeatedly tried to use "check" skill which is not available — they worked around it by manually searching for `scripts/check-all.js`. The skill should either be available in the agent definition or documented as unavailable.
- Multiple agents tried to invoke skills that don't exist (`run-test`, `subprocess`, `write-doc`, `run`) and logged "**\_ NOT YET KNOWN _**" — suggests agent definitions haven't been updated to include these skills, or they're not available in the agent context.
- ContractValidator.test.ts TypeScript errors were silenced by adding `ContractValidator.test.ts` to tsconfig.json exclude list (19:30:51) rather than fixing the actual test file — this hides rather than resolves the issue.
- Fork agent iterated multiple times on test fixes (CliCommand.test.ts and TaskCliCommand.test.ts) with repeated test runs and edits, suggesting incomplete fixes on first pass.

<!-- session a11724af 2026-08-20 -->

- Backend agents repeatedly attempted to invoke unavailable skills (`check`, `run-test`, `run` as skill vs bash) without graceful fallback — at least 6 failed invocations across timestamps 22:03:37–22:16:51. After each failure, agents retried the same call instead of using alternative approaches.
- Two backend-dev agents (session ae6b, a839) ran in parallel without visible coordination; both wrote to same files (e.g., `packages/flow-cli/src/cli/commands/CliCommand.ts` at 22:03:05 and 22:08:22, `StepRunner.ts` edited by ae6b multiple times). No merge conflict prevention observed.
- Agents repeatedly tried to invoke deferred skills (check, run-test, write-doc, subprocess) without first fetching schemas via ToolSearch — resulted in "**\_ NOT YET KNOWN _**" warnings. Agents should proactively load skill schemas when attempting to use them, not assume they're available.
- Fork agent repeatedly fixed `process.exit` mock type signature (number → string | number | null) across multiple edits, suggesting initial type mismatch wasn't caught by TypeScript. Mock setup or test environment doesn't validate mock compatibility with implementation.

<!-- session 6c0c8a03 2026-08-19 -->

- Multiple parallel agents read identical spec files independently without context sharing — e9704d0a re-read opencode-step-provider spec files 6+ times across forks (21:04-21:05, again 21:10) and then after goldfish/security reviews, suggesting no shared state between review cycles or insufficient result caching.
- backend-dev agent's `check` skill call [21:00:02] with `args=packages/flow-cli` parameter failed ("NOT YET KNOWN"), indicating skill interface mismatch — doesn't accept scoped package arguments or requires different invocation syntax.
- backend-dev agent attempted to use /run skill with arguments but got "NOT YET KNOWN" warning; fell back to manual bash `npm install` after searching for skill examples via Glob. Indicates skill invocation interface wasn't clear from context.

<!-- session 98c0936a 2026-08-19 -->

- Skill registry incomplete — attempts to invoke "spec" (19:51:32) and "violations" (20:47:34) tools returned "NOT YET KNOWN", requiring ToolSearch to load schemas.
- Deferred tools (ToolSearch, SendMessage, Skill "goldfish"/"subprocess") fetched during session, not pre-loaded — caused WARN "NOT YET KNOWN" delays at 21:08:40-21:08:46.
- Backend-dev agent attempted run skill for npm install, received "NOT YET KNOWN", then fell back to Glob/Read searching skill examples — skill availability not guaranteed across agent types; needs context awareness.

<!-- session 1c8332e4 2026-08-19 -->

- At 19:51, agent tried to invoke `/spec` skill which was not yet known; should have handled gracefully or used available tools instead. Same issue at 20:47 with `violations` skill.
- Extensive grep searching (20:30-20:33) to determine which flow-engine features actually work (statusTransitions, allowRecursion, contract validation, writeOutput, etc.) — suggests agent was uncertain whether features were implemented vs. just declared in types. Thorough investigation, but indicates weak initial mental model of codebase state.
- Agent invoked deferred tools (AskUserQuestion, SendMessage) without calling ToolSearch first to fetch their schemas — led to "NOT YET KNOWN" warnings and tool failures. Should ToolSearch before using deferred tools.
- Agent invoked skills (goldfish, subprocess) that showed "NOT YET KNOWN", then spawned fork agents to retry — symptom of not verifying skill availability or checking skill registry before invoking.
- backend-dev agent invocation of `run` skill failed ("NOT YET KNOWN") at 21:20:51, causing fallback to manual npm install instead of automated verification within the skill
- Multiple fork agents (goldfish + pentest) ran independently without coordinating findings — spec saw 5 cycles of repeated edits to the same files (threat-model.md, provider-abstraction.md, step-model-integration.md) instead of convergent fixes

<!-- session 3f2a20af 2026-08-19 -->

- ToolSearch called for unknown skills ("spec", "violations") before they were available — agent assumed skills were loaded; should check skill availability upfront or fail more gracefully
- Skill/tool invocations returned "NOT YET KNOWN" (check, goldfish, subprocess, SendMessage) — agent tried to use deferred tools without fetching schemas first via ToolSearch; should use `ToolSearch query="select:skill-name"` before invoking unknown tools.
- Spec iteration cycle: opencode-step-provider/\_index.md edited 12+ times across 8 minutes (20:49 to 21:10), followed by goldfish review + security audit + fixes + relaunch. Initial spec unclear or gaps only surfaced during coherence/security review; frontload specification completeness checks before sending to audits.
- Multiple fork agents (a5e1, a828, a14f, ab5e, a5c1, a92b) reading identical spec files in sequence instead of sharing context or parallelizing — each fork re-reads all 6 files independently, ~36 redundant reads total
- Backend-dev agent attempted to invoke `/run skill with complex arguments ("npm install from C:\...") which failed with "**\_ NOT YET KNOWN _**" — agent worked around by using Glob + manual npm install; the skill invocation should validate arguments or document supported input format

<!-- session afdd4652 2026-08-19 -->

- Attempted skill "spec" at 19:51:32 (NOT YET KNOWN) but assistant silently switched to Agent Explore without notifying user the skill failed to load. Implicit fallback worked but masked a missing feature.
- Attempted skill "violations" at 20:47:34 (NOT YET KNOWN) — skill is listed in CLAUDE.md as available but failed to load in this session. Unclear if this is config/loading issue or session-specific availability.
- Repeated "NOT YET KNOWN" warnings for Skill calls: `goldfish`, `subprocess`, `check` (line 21:00:02, 21:03:54, 21:03:58). Agent invoked legitimate tools from skill listing but they failed to load. Also `SendMessage` tool was not yet known when agent tried to send cross-fork status (line 21:08:40).
- Agent attempted to use `SendMessage` to communicate between parallel forked agents (a19e fork, context: parseYAML implementation status) but tool schema was not loaded — required `ToolSearch` call first (line 21:08:40-46).
- Initial test file lookup assumed LoopHandler was in `src/orchestration/LoopHandler.test.ts`, but the actual file is in `src/processing/LoopHandler.test.ts`. Path discovery required search after first run failed. File organization or naming conventions documentation may be unclear.

<!-- session 66138a84 2026-08-19 -->

- Agents launched without knowledge of available skills: "check", "goldfish", "subprocess" are all listed but triggered "**\_ NOT YET KNOWN _**" warnings at 21:00:02, 21:03:54, 21:03:58 — skill registry/availability issue.
- Extensive grep-based investigation for `releaseWorkspace`, `LoopHandler`, condition evaluation (20:47-20:52) without clear resolution path before delegating work — weak root-cause debugging discipline, wasted context on searches that didn't yield answers.
- Inter-agent async messaging (21:08:46): agent a19e sends "parseYAML already implemented, adjust test only" to agent a19e987db154400d7 — indicates agents duplicated work on same feature (parseYAML transform), no shared awareness of parallel tasks before fork.
- Multiple attempts to locate LoopHandler: first searched in `src/orchestration/LoopHandler*`, then used `find`, then finally located in `src/processing/LoopHandler.test.ts`. Wrong assumption about directory structure — agent expected orchestration module to contain LoopHandler but it's in processing module.

<!-- session da343929 2026-08-19 -->

- Multiple agents performed extensive grep searches with similar pattern variants (statusTransition, trigger, event, contract, validateInput) rather than targeted lookups — indicates weak upfront knowledge of what features are actually implemented vs. documented in the codebase.
- parseYAML transform already implemented; agent fork sent mid-task update (`SendMessage` at 21:08:46) instead of discovering this upfront before implementing
- Multiple sequential reads of LoopHandler.test.ts (lines 1-20, 20-30, 30+) suggest incremental line-by-line iteration rather than processing full context at once
- Test file location assumption: agent searched for `LoopHandler.test.ts` in `src/orchestration/` but file is actually in `src/processing/` (line 42 shows correct path after retry). Test file organization doesn't match intuitive naming.

<!-- session 55a79144 2026-08-19 -->

- Assistant fundamentally misunderstood the policy engine architecture, proposing complex protocols (IPC, MCP client wrappers) when the correct design was simply: policy engine = HTTP endpoint registered as hook, calling flow-engine's HTTP API directly — same as MCP server internals. User had to correct this iteratively across 5+ exchanges.
- Failed to read source specs from `origin/laptop-cli` branch (2026-07-30-flow-cli). Multiple `git show` / `git ls-tree` commands failed silently; assistant then created new spec files instead of extracting actual content, producing fundamentally wrong material.
- Attempted to call unavailable skills "violations", "goldfish", "subprocess" without first using ToolSearch to fetch them from deferred tools list — marked as "NOT YET KNOWN" instead of being fetched on demand
- Attempted to use tool "AskUserQuestion" without it being available/loaded
- SendMessage tool called without first loading schema via ToolSearch — agent logged "**\_ NOT YET KNOWN _**" at 21:08:40. Should ToolSearch("select:SendMessage") before calling tool methods not in the initial function list.
- Test file path was guessed wrong — attempted `src/orchestration/LoopHandler.test.ts` at 21:10:20, then had to search and correct to `src/processing/LoopHandler.test.ts` at 21:10:42. No shared documentation on test file locations.
- sed was used for bulk TypeScript code replacement (lines 21:09:22, 21:09:34) — replaced { type: 'string' } patterns and added `name: 'Test Step'` to test fixtures via sed -i. This bypassed type checking and has no verification trail. Should have used Edit tool with explicit context for type safety.

<!-- session de603161 2026-08-19 -->

- Multiple codebase searches for "statusTransition" returned conflicting results (some tests reference it, worker doesn't use it) — suggests feature partially implemented or abandoned but still in specs, creating dead-end investigations
- SendMessage tool was attempted for inter-agent communication during parallel fork work but marked "NOT YET KNOWN"; agents adapted by embedding work directly instead of coordinating results.
- Initially attempted to run tests from `src/orchestration/LoopHandler.test.ts` but file is actually in `src/processing/LoopHandler.test.ts` — directory discovery via ls/find was needed when first path failed

<!-- session 274a5f98 2026-08-19 -->

- At 19:51:32, user invoked non-existent skill "spec"; had to use Agent Explore instead. Skill availability should be validated/documented more clearly.
- At 20:29:23 and 20:47:34, ToolSearch and violations skill both returned "NOT YET KNOWN" — tool schema loading failed silently; need better error messaging when deferred tools aren't available.
- Multiple tool unavailability constraints blocked agent work unnecessarily: AskUserQuestion (20:51:01), SendMessage (21:08:46), goldfish (21:03:54), subprocess (21:03:58) — these were invoked but marked "NOT YET KNOWN", forcing fallbacks instead of running proactively.
- Assumed LoopHandler.test.ts was in src/orchestration/ when it's actually in src/processing/ — required find command to discover correct path

<!-- session e9704d0a 2026-08-19 -->

- Proposed OpenCode invocation design decisions without checking tool's actual flags, MCP config format, or environment variable options upfront. Required user correction to investigate properly.

<!-- session 4a2fd14d 2026-08-17 -->

- Wrote hook-logger.js in ESM (`import` syntax) without verifying `package.json` has `"type": "module"` — would have crashed at runtime. Should verify file compatibility before writing.
- Provided echo hook example that "ne sert à rien" — redundant/unchosen. Need to think through examples before sending.
- Task hook error logging was missing (`TaskIndex.ts:192, :246` — `onError` callback not wired up), while Flow hooks already had logging. Silent failures. User caught this with all-caps: "IL FAUT LOGGER".
- dist-types for flow-engine became stale after TypeScript changes; required explicit rebuild (`npm run build`) before type checking would pass. Type checker consulted stale .d.ts instead of source.
- Agent attempted to call deferred tools (mcp**test**echo, check, spec) without loading them first via ToolSearch — returned "NOT YET KNOWN" but agent proceeded anyway.
- Agent spawned with type "Agent unknown" at 20:08:24 instead of named agent type (backend-dev, Explore, etc).
- Three fork agents (bd4052a0, c898dd1a, 4a2fd14d) working on overlapping plugin/MCP tasks in parallel created duplicate exploration and incomplete coordination; task a620cc73a53a979fd had to be stopped mid-fix.
- ReportFindings tool called twice without pre-fetching schema; code-review agents should ToolSearch before attempting to use it.

<!-- session 5cc3e4d9 2026-08-17 -->

- MCP tool schema availability is non-deterministic in -p mode: ToolSearch query for "echo" returned "NOT YET KNOWN" even though the tool was invoked successfully, suggesting timing-dependent registration or incomplete schema caching.

<!-- session d0c7ba90 2026-08-17 -->

- Assistant initially uncertain about MCP tool availability — should have checked `.claude/settings.json` MCP config or existing tool registry instead of saying "still connecting, try again later"
- Multiple overlapping grep searches for PluginResolver/ConfigLoader across separate edit cycles (19:23, 19:35, 19:36) suggest assistant didn't have a clear mental model of plugin wiring before starting edits
- Aggressive bulk rename via sed (`loadDaemonConfig` → `loadFlowConfig`) across test file without verifying all call sites first — risky refactoring pattern

<!-- session 5ddbec02 2026-08-16 -->

- Tried to invoke unavailable skills (subprocess, check, get-timestamp, SendMessage) — fell back to bash commands instead. Skills flagged as "NOT YET KNOWN" and should have been checked before invocation.
- Multiple agents spawned in parallel for interdependent features at 08:10:31–08:19:35: jsonpath extraction, --project-dir flag, and TASK_PROJECT_DIR env var. Env var implementation logically depends on project-dir flag completion, but both launched concurrently — risks race conditions or incomplete context.
- Module import/build issues at 08:04–08:06: FlowScheduler import resolution required multiple checks (node_modules paths, tsconfig, package.json, node -e tests). Suggests build configuration not transparent or import paths unclear.
- Fork agent changed `output` → `outputs` in template context (09:50-09:52) without validating this was the intended schema; led to cascading edits across ConditionEvaluator, FlowScheduler, and tests that may have been premature.
- Fork agent initially included task-level metadata directly in `when:` evaluation context with unclear keying strategy (09:30:58 message: "context shape must be step-id keyed") — context contract wasn't fully specified, caused rework.
- Attempted direct skill calls for `kill-port`, `subprocess`, and `goldfish` — all marked "NOT YET KNOWN" despite being listed in available skills (12:55, 13:00). Agent fell back to manual bash/taskkill commands. Skills appear registered but not callable; check session skill state registration.
- Agent assumed verbose mode would be controllable via runtime CLI flag when it's actually step configuration (step.log field). Clarify that step logging is declared in flow definition, not runtime-settable.
- Multiple forks launched in parallel (14:18-14:30) working on overlapping concerns: workspace metadata implementation (ac1e), spec round 6 fixes (a350), spec round 4 fixes (a776). Parallel work is good, but forks appear to have run independently without waiting for spec validation results before implementing.
- TypeScript debugging at 14:23–14:28 ran ~6 iterative `tsc --noEmit` checks with different filters rather than reading actual error output. Eventually resolved by rebuilding flow-engine to update dist-types, suggesting the agent didn't understand tsconfig reference resolution upfront.
- Fork (a440, a8dd) test failures visible around 14:40–14:45 (Daemon.test.ts, WorkerAdapter.test.ts) appear incomplete in fork output; main session then stepped in at 14:40 to fix directly. Fork likely hit internal blocker without surfacing root cause.
- Agent (a88b fork, 15:44-15:47) investigated session_file storage pattern without clear understanding of w-learning plugin interface; then revised gitignore twice (.gitignore changed from `w-learning` to `.claude/w-learning/config/**`) suggesting discovered pattern rather than pre-specified.
- Agent attempted to use SendMessage tool before fetching its schema (17:05:11) — attempted tool use without ToolSearch first
- PluginLoader.test.ts edited 6 times in sequence (16:57-16:59) — test design wasn't planned clearly before implementation; should sketch test structure upfront with backend-dev agent
- Two agents (c898dd1a and bd4052a0) made parallel edits to same files (ClaudeLauncher.ts, StepRunner.ts) at 19:48-19:53 without clear coordination — risk of lost changes or merge conflicts; large refactorings need explicit file partitioning.
- ToolSearch queries for "mcp" and "select:mcp**flow**provideSteps" returned "NOT YET KNOWN"—agent wasted a round-trip trying to fetch deferred tools that don't exist. Either register MCP-related tools or fail faster with guidance.

<!-- session c898dd1a 2026-08-16 -->

- Made unilateral decision to use @flow/\* namespace scope for plugin packages without user approval. Should have presented design options (scope vs unscoped, consistency with existing packages) before implementation.
- Underestimated tree-shaking capability when discussing plugin-sdk validators — assumed tree-shaking "doesn't work" but user correctly noted bundlers eliminate unused code, making the concern moot.
- Cross-package import path was incorrect initially — `releaseWorkspace` placed in wrong package, later moved to `plugin-sdk`. Verify package dependencies before extracting shared utilities.
- Used `import ... with { type: 'json' }` which Prettier cannot parse — switched to `fs.readFileSync`. Prettier doesn't support import assertions syntax.
- Stale `packages/cli/` directory (no package.json) included in ESLint checks, causing confusing errors about unrelated packages. Needed manual removal from check-eslint.js.
- Forgot to rebuild new packages before `npm run check` — TypeScript references require built dist files. New packages need `npm run build` before check passes.
- Had to search multiple files via grep to discover API usage patterns (FlowOrchestrator, StepRunner, execa imports); suggests missing API documentation or usage examples
- Agent abe1 corrected ${{ }} template syntax assumption mid-flow (07:28 SendMessage correction), suggesting template syntax should have clearer examples or be enforced consistently in generated code.
- Extensive daemon protocol investigation (20+ greps, reads of raw singleton-daemon-kit .js) suggests agent initially misunderstood how executionId is passed back from daemon to CLI; required deep dive into compiled library code to verify response wrapping behavior
- when: context shape was built with task field, discovered incorrect late (09:48 fork) — agent built wrong shape, tests passed, only later investigation revealed task shouldn't be included
- Fork agents investigating npm workspace shadowing used web searches instead of `npm help workspaces` and local package.json analysis — missed that problem was npm registry fallback, not documentation gap
- Agent invoked unavailable skills without verification: `kill-port`, `subprocess`, `goldfish`, `SendMessage` all marked "NOT YET KNOWN" — should use ToolSearch to load tool schemas before attempting. Pattern: 12:55:49, 13:00:08-15, 13:17:18.
- Concurrent fork agents (a190, aaa8, a9a5) executing independent subtasks (model streaming, writeOutput validation, tool calls) starting 13:16:13 — potential context/coordination risk if forks share mutable state (InMemoryStorage, test files like task-model2.yml). No synchronization visible.
- Multiple spec review/fix cycles (rounds 2,3,4,6,7) suggest initial quality gate or requirements were not fully captured upfront — agent forks repeatedly re-reading and editing spec files without full resolution
- Session metadata (session_file, session_id, resumeSessionId) handling spans types.ts, StepRunner.ts, ClaudeLauncher.ts, Protocol.ts, SimulationValidator.ts with no explicit reference/map — future work searching for it will require grepping multiple files without a clear entry point.
- Spawned agent for "plugin system full implementation (all 10 phases)" as a single task — scope ballooned, created 5 packages + violation rules + loaders + tests in one agent run. Should have been broken into focused phases with explicit phase handoff.
- ReportFindings reported 14 findings at 17:48 with level=high, but findings content was truncated/not visible in logs — backend-review agent completed but results not fully communicated to main context for decision-making
- AskUserQuestion tool invoked at 18:57 but shows "NOT YET KNOWN" — deferred tool not loaded before use; agent had clarification questions about package naming but tool call failed silently with no fallback
- Multiple parallel agents performed overlapping searches (grep for "plugin-sdk", "extension-points") across the same files, suggesting incomplete audit before starting the refactor — should have gathered all import sites in one pass before coordinating edits across 8+ files.
- Path alias refactoring wasn't one-shot — multiple edits to different tsconfig.json files (flow-cli, plugin-\*, flow-engine, shared) suggesting initial scope was underestimated. A refactor of this scale (rename alias across 5+ packages) should have been planned/scoped upfront.

<!-- session 75a0bd3d 2026-08-16 -->

- Repeatedly jumped ahead in spec process without finishing prior decisions (e.g., launched Open Point #3 before user approved Point #2 options). User had to say "on a pas fini" explicitly.
- Misinterpreted a simple location question ("où sont les deux implemntations") as a design question, launched a new debate instead of answering "packages/plugin-none/ and packages/plugin-worktree/".
- In spec mode, wrote complete implementation code instead of illustrative samples. User: "j'espérais voir juste des fichiers sample dans la spec". Spec mode = document decisions, not code.
- Type import resolution checked repeatedly (`grep "from 'flow-engine"` at 06:40:36 and 06:43:33). Suggests path alias or declaration file issues during CommandHandler/Daemon refactoring may not have been fully resolved on first pass — needed manual verification.
- Agent abe1 (07:28:29) corrects itself about "${{ }}" format — initially mischaracterized as legacy, then sent correction: "${{ }} is the standard format, not legacy"
- SendMessage from fork agent failed at 09:30:58 ("NOT YET KNOWN" WARN) — fork a5931923647f13de1 tried to report design issue about when: context shape but message wasn't recognized by harness. Main session worked around it by reading git history instead of receiving fork's analysis.
- Agent a8c1 attempted `npm help` web documentation research at 11:08:44 (despite npm being local CLI). User explicitly blocked web fetching at 11:10:55 ("Stop web fetching, use only local files"). Should use `npm help`, `npm config list`, local code inspection, and `npm explain` instead of external research for npm behavior.
- Multiple agents attempted to call deferred skills (kill-port, subprocess, goldfish) without first using ToolSearch to load their schemas, causing "NOT YET KNOWN" warnings. Agent then fell back to manual bash commands (netstat/taskkill) instead of fetching schema first.
- Spec review produced CRITICAL/HIGH findings across 8 rounds (rounds 3-8 visible), suggesting either incomplete spec before review or validation gaps. Iterative fixing is costly — validate spec completeness upfront.
- TypeScript incremental compilation needed manual `npm run build` to clear dist-types cache after types.ts changes to flow-engine. Project references may not be fully configured for cross-package changes.
- w-learning plugin integration required file exploration to understand memory_paths structure and session file location — agent initially lacked context about external plugin conventions; future work should surface plugin docs upfront if session/metadata features depend on them.

<!-- session e453d841 2026-08-16 -->

- Template variable syntax confusion — assistant initially used syntax later corrected to `${{ }}` as the standard format; corrected via agent fork message (2026-08-16 07:28:29)
- Inconsistent `workspaceDir` parameter naming across context objects (`context.workspaceDir` vs bare `workspaceDir`) without clear naming convention — required multiple edits across files to align
- Spec and run skills were marked "NOT YET KNOWN" early (07:48:57, 07:52:42) but continued operating without visible failure; unclear if they later loaded or if the warning was a false alarm.
- Fork a593 received vague design requirement ("when: context shape must be step-id keyed") without clear implementation spec — had to reverse-engineer from code inspection rather than explicit requirements.
- Used cmd.exe commands in Git Bash (taskkill /PID) instead of POSIX equivalents — violates CLAUDE.md shell guidance. Windows agent should use sh/bash commands or fail explicitly if Windows-only capability required.
- Called deferred skills (subprocess, kill-port, goldfish) directly without ToolSearch to fetch schemas first — resulted in "NOT YET KNOWN" failures. Must check if skill exists and fetch schema before invoking.
- Multiple spec validation rounds (6, 7, 8) with repetitive edits suggest agent was applying fixes without verifying they resolved the underlying issues — likely pattern-matching the violation messages rather than understanding root causes.
- WebSocketServer rewritten completely (Write tool) instead of incremental edits, indicating agent recognized its initial patch approach was inadequate for the architectural issue (port binding/retry logic).
- Test mock updates lagged behind implementation changes — Daemon.test.ts mock for WebSocketServer.start() signature wasn't adjusted until after test failures surfaced.

<!-- session 7d4fb045 2026-08-16 -->

- Excessive trial-and-error on test fixture setup — WorkerAdapter.ts edited 6 times (lines 22:18:32, 22:18:52, 22:19:42 etc) and multiple grep searches for `workspaceDir` context. Should have read full test fixture pattern once instead of iterating.
- CommandHandler.ts first pass incomplete — written at 06:40:13, then rewritten at 06:40:24, then edits at 06:40:31/06:40:35/06:44:15/06:44:18. Suggests insufficient planning/design before implementation.
- Unclear when: condition evaluation contract — assistant had to investigate ConditionEvaluator across flow-engine, then port logic to StepQueue in flow-cli. Multiple fixes needed (06:35:05, 06:37:11, 06:37:18, 06:37:28) suggesting the boundary between engine and daemon scheduling wasn't clear upfront.
- Parallel agent spawns (a0bf, ac4e) both working on --project-dir and TASK_PROJECT_DIR suggests overlapping scope/requirements — potential duplicate effort or unclear task boundaries between agents.
- Initial investigation focused on daemon port files and singleton-daemon-kit implementation details when the real issue was step failure handling in loop contexts — misdirected debugging path.
- When: context refactoring required `outputs[stepId].` keying (not just `output.` or bare `outputs.`), but the full contract wasn't immediately clear to the main session; fork agents (abc9) refactored it, then main session had to reverse-engineer the change through test failures.
- Assumed verbose mode would be driven by CLI flag (e.g. `--verbose`) when it should be step-based config. Required redirection mid-task.
- Spec audit ran 8 iterative fix rounds (visible in fork messages: "Fix round 6 CRITICAL+HIGH", "Fix round 7", "Fix round 8 final"). Instead of fixing all issues in one pass, agents spawned sequentially to address batches. Inefficient — suggests either review tool output wasn't parsed completely, or agents weren't coordinating on findings.
- TypeScript compilation checks repeated 5+ times across ~6 minutes (lines 14:21:56, 14:23:54, 14:24:08, 14:26:32, 14:27:11, 14:27:25, 14:27:47) with incremental edits. Suggests type inference issues weren't straightforward and agent was debugging compiler output iteratively rather than understanding root cause upfront.

<!-- session 53ae965f 2026-08-16 -->

- FlowScheduler refactoring spawned multiple agents to implement features in parallel (phases 1-4 TDD) but the work scope evolved significantly from initial test-failure fixes → feature audit → major refactor; no explicit user redirect visible, but implicit via sequential agent spawn missions suggests iterative discovery
- Three parallel agents (a0bf, ac4e, ac93) spawned on overlapping tasks (global env vars, TASK_PROJECT_DIR, jsonpath support) with no visible coordination points — potential for duplicated/conflicting edits or missed dependencies. **Why:** Main session delegated incrementally without waiting for first agent to complete. **How to apply:** When delegating interdependent features, wait for blocking agent to finish or explicitly brief parallel agents on their scope boundaries.
- Multiple fork agents (a593, abc9, a53e) edited CommandHandler.ts + FlowScheduler.ts in parallel without coordination; main session later had to debug failing tests and revert/fix overlapping changes. SendMessage used as workaround but shows cost of lack of cross-agent communication plan.
- Multiple attempted calls to undefined skills: `subprocess` (13:00:08, 13:00:11) and `goldfish` (13:00:15) returned "NOT YET KNOWN" warnings. Agent should check skill availability before invoking, not rely on ToolSearch to fail gracefully.
- Verbose mode driven by `log:` step parameter, not CLI `--verbose` flag (corrected at 13:17:18) — intuition conflicts with implementation; document this design choice prominently.
- Multiple `tsc --noEmit` attempts (lines 14:21:50 → 14:27:25) without capturing/diagnosing actual error output; escalated to `--force` flag without investigating root cause (likely monorepo path resolution or cache stale issue).

<!-- session 08efa22d 2026-08-16 -->

- Multiple agent forks investigating same failing tests (FlowRegistry, TemplateValidator, UserInterventionValidation) in parallel — no coordinator to prevent duplicate reads or consolidate findings.
- Agents reading files then main session re-reading same files to make edits (e.g., FlowRegistry.test.ts read by agent ac7f, then re-read by main before Edit). Lost context between fork completion and main-thread action.
- Deep investigation into @wadeck/singleton-daemon-kit (reading compiled JS) was needed to understand client/server response handling — library documentation or project integration docs may be incomplete; reverse-engineering from node_modules suggests this pattern should be documented.
- Model step output handling required 3 separate agent forks (a32b/a3f9/a921) to debug — the contract between StepRunner, WorkerAdapter, and ClaudeLauncher for capturing model outputs wasn't clear upfront.
- Multiple agents (a3e0, a690, 92cb6ce8, 5b7b2b1a, 576b7d8d, d300bfbf) spawned in parallel on related spec-fix tasks without work partitioning—resulted in redundant file reads/edits of same `.claude/specs/2026-08-16_09-48_plugin-system/` files. When agents target overlapping components, coordinate by file/section to avoid duplicate work.

<!-- session e9472617 2026-08-16 -->

- Fork agent (afcc) at 06:45:05 tries `check` skill (unknown), falls back to `npm run check` bash. Same pattern at 22:50:12 with `get-timestamp` → bash fallback. Fallbacks succeed, but repeated WARN logs suggest this is discoverable/fixable.
- Module exports from flow-engine to flow-cli unclear — at 08:06+, agents repeatedly grepped for FlowScheduler/FlowCapabilitiesGenerator exports, checked tsconfig path aliases, read node_modules resolution, suggesting exports were missing or undeclared.
- When investigating a failure with unknown root cause (loop execution stuck), agent searched reactively through scattered line ranges of the same files (ExecutionStore, Daemon, CommandHandler at 10:58–11:02) rather than forming a hypothesis first. Debug logging added later (11:04–11:05) revealed the issue, suggesting upfront hypothesis-formation would be more efficient.
- Multiple fork agents spawned for npm workspace shadowing research when they could have been sequenced — parallel agents on interdependent investigation fragments context without acceleration.
- Two forks (aaa8, a9a5) launched in parallel at 13:24:23 modifying same test files simultaneously (StepRunner.test.ts, types.ts) within 1-2 seconds—Edit calls at 13:28:18, 13:28:39, 13:28:45 create conflict risk despite independent features.
- Session e9472617 reads all 11 spec files sequentially instead of searching for specific content first — wastes context. Should grep for issue keywords before opening files.

<!-- session d300bfbf 2026-08-16 -->

- Agents repeatedly verified exports (FlowScheduler, FlowCapabilitiesGenerator) from flow-engine/src/index.ts before using them — suggests unclear contract about what's re-exported vs what's internal-only.
- Fork agent at 09:30 identified design issue with condition context shape, then fork at 09:48 refactored it — suggests first pass incomplete or required iteration. Pattern: sequential forks on same problem area may indicate incomplete initial scope.
- Loop/retry execution: step_failed events not propagating correctly after step failure; loops hang instead of continuing. Issue in Daemon.ts → CommandHandler.ts event flow, not just scheduler logic. Debug logging added at 11:04-11:05 suggests ongoing investigation.
- Fork agent a8c1 web-fetched npm documentation despite problem being locally verifiable; multiple parallel forks spawned (a8c1, ae19, a561, a32b, a3f9, a8a7, ac3a, a921) without coordination, likely inflating context overhead
- Fork agent initially misunderstood verbose mode behavior at 13:16:13; corrected by SendMessage at 13:17:18 about "verbose mode driven by log: step param, not --verbose flag". Suggests verbose mode parameter location/control flow isn't intuitive.
- At 13:34:18, agent spawned with type "unknown" instead of a recognized agent type from available-skills list — likely unintended fallback behavior.

<!-- session bd4052a0 2026-08-16 -->

- Proposed jq workaround instead of implementing the requested jsonpath feature in OutputVariableConfig
- Declared flow "ready" without testing daemon communication — flow was stuck after step failure due to pending skipped steps
- Didn't properly verify the `output.status` context design — it merged outputs flat (ambiguous if multiple deps produce same key) instead of explicit `steps['step-id'].outputs.key`
- Agent opened headed browser windows via agent-browser fork when `headless: true` was required. Fork rule unclear or not checked before delegating.
- Agent invented `constraints` field in skill frontmatter frontmatter that isn't recognized in official spec. Created noise without validation.
- Agent applied `file:` fix to flow-cli only, missed 16 other workspace dep references across 13 packages. Required user to catch incomplete scope.
- `onLogEntry` callback wired in StepRunner but never passed from WorkerAdapter — streaming feature was half-implemented, agent didn't trace the callback chain before declaring done.
- ScriptExecutor multiline regex backtracks to LAST `"` in string, eating path arguments. Broken for `node -e "..."; claude-mock "path"` patterns.
- Template resolution context shape for `when:` conditions is non-obvious — conditions use `output.` prefix but template context wasn't passing the right shape, causing condition evaluation failures
- CommandHandler.onStepFailed ignored retry logic when FlowScheduler.hasFailed() — could cause infinite retries or dropped steps (critical bug)
- TemplateRenderer/FlowDefinition/FlowStep not exported from flow-engine/index.ts, breaking subpath imports in flow-cli packages
- Legacy `output[...]` vs new `outputs[...]` naming — had to reconcile condition evaluation (uses `outputs`) separate from prompt templates (uses `task.` metadata)
- Template syntax support discovered mid-phase: `${{ steps['x'].outputs.y }}` requires both `output.*` and `steps.*` pattern handling in condition evaluator, not obvious upfront.
- Test helper scope: `makeLoopStep` inside `test()` scope vs top-level affects closure state — moved to top-level after discovering stale scope bugs.
- Post-refactoring module import resolution broke — multiple retry cycles (08:04:26-08:05:30) checking FlowScheduler exports, dist paths, tsconfig aliases suggest index.ts re-export or path alias misconfiguration was not caught by build step
- Review agents (forks a034, aaee spawned 06:59:34) produced findings but their output/corrections are not visible in log — fork a183 (07:44:04) was later spawned for same task ("Fix Map.get()! variants with TDD"), suggesting first review agents were ineffective or output was lost
- Multiple concurrent agents spawned (fork a106, a593, abc9) for partially-overlapping issues: --inputs alias fix, global env template resolution, and when:-context refactoring. Lack of upfront sequencing meant duplicate investigation into ConditionEvaluator and TemplateContext.
- Agent attempted to web-fetch npm workspace documentation at 11:10:55 when user sent explicit message "STOP making web fetches, use only local files" — agent should prefer local CLAUDE.md, package.json, and existing code over web fetches
- Agent attempted to use SendMessage (deferred tool) without fetching its schema first

<!-- session 5b7b2b1a 2026-08-16 -->

- Agent used incorrect template variable syntax during FlowScheduler implementation, later self-corrected to standard ${{ }} format
- Agent tried to find "generateExecutionId" function (09:14:01) but couldn't locate it — function may not exist or be named differently.
- Fork at 09:48:52 made major refactoring (renamed `output` → `outputs`, removed `task.` from when: context, added dot-notation conversion) across ConditionEvaluator/FlowScheduler/tests, but no end-to-end feature validation shown—only unit tests passed. Breaking change to evaluation context could silently break existing flows if they reference `task.*` or use `output.` instead of `outputs.`.
- Loop/retry with `onFailure: goto` debugging session (10:58+) involved tracing failure handling through ScriptExecutor → WorkerAdapter → CommandHandler → Daemon, with multiple debug log additions (11:04:20, 11:05:01, 11:05:08) but no final resolution shown—suggests either issue remains unfixed or session ended before confirmation.
- Agents attempted web fetching despite implicit requirement for local-only operations — 11:10:55 SendMessage intervention shows user had to explicitly stop this behavior. Agents need clearer scoping docs on network access.
- Agent a190 misunderstood verbose mode source: assumed `--verbose` CLI flag instead of `log: step` parameter in flow definition — corrected via SendMessage at 13:17:18.

<!-- session 576b7d8d 2026-08-16 -->

- Agent invoked non-existent skills (get-timestamp, subprocess, check) without first using ToolSearch to load them — caused permission/NOT YET KNOWN warnings.
- Agent attempted inter-agent SendMessage with malformed context about `${{ }}` format — message failed with NOT YET KNOWN status.
- Five parallel agents (ac93, a6e4, a0bf, ac4e, a106) working on interdependent features (jsonpath, --project-dir, global env, TASK_PROJECT_DIR) without explicit coordination. Risk of conflicts or duplicate work in FlowDefinition / StepRunner / validation layers.
- Skill lookup failed for "spec" and "run" (marked "NOT YET KNOWN" at 07:48:57, 07:52:42). User worked around by running bash find/grep to locate skill definitions manually, indicating skill registry may be stale or misconfigured.
- abc9 fork completely rewrote ConditionEvaluator.test.ts (Write tool) rather than incremental edits — suggests either wholesale test replacement or unfamiliarity with targeted test changes; main session continued debugging the same area (retry/loop) after fork completed, implying fixes were incomplete.
- Multiple parallel forked agents (a593, abc9, a6e6, a53e) with overlapping scopes created ambiguous state — hard to verify which fork's changes actually fixed what; main session then re-applied fixes to same files afterwards.
- Skill invocations for `subprocess` (doc-audit, security audit) and `goldfish` returned "**\_ NOT YET KNOWN _**" — skill registry may not match name+args tuples or skills lack proper registration.
- Verbose mode is driven by flow step `log: <step>` parameter, not CLI `--log` flag — agent a190 assumed wrong driver after working on streaming features.
- Multiple parallel agents (aaa8, a9a5, a928) working on spec fixes simultaneously — ran 3 audit/fix rounds iteratively; suggests initial spec had undetected CRITICAL/HIGH issues that required re-audit cycles.

<!-- session 32c17c8b 2026-08-16 -->

- Multiple test files had stale mock data (workspace context structure, step output types) that didn't match production after types.ts changes — required reading both test AND implementation files to identify mismatch, not fixable by code inspection alone.
- FlowScheduler extraction assumed changes to flow-engine alone would work in flow-cli; didn't discover until test runs that IPC serialization layer (Protocol.ts) and CommandHandler needed updates — plan cross-package refactors holistically before implementation.
- Multiple agents launched simultaneously for related features (env vars, --project-dir flag, TASK_PROJECT_DIR, jsonpath extraction) — poor task decomposition; should have been batched under one agent or clearly sequenced.
- Agent a106 (fix --inputs and flow run UX) spent 16 minutes (08:57–09:13) with repeated grep/read patterns on same files (CommandHandler.ts, daemon.js, client.js) trying to reverse-engineer daemon response protocol — inefficient exploration; suggests protocol docs are missing or agent wasn't given implementation context.
- Fork agent discovered TemplateRenderer wasn't exported from flow-engine/index.ts (09:54-09:58) — suggests export list may be incomplete or missing refactoring step.
- When-context shape refactoring (task removed, output→outputs, dot notation added, 09:30-09:51) cascaded through SimulationValidator.test.ts — design coupling across validation suggests these contexts need a shared contract/definition file.
- Process termination on Windows proved error-prone: agent at 12:55–12:58 mixed POSIX (netstat, grep) with cmd.exe syntax (taskkill /PID /F), requiring 3 attempts to kill port 47824. Clean solution would be the kill-port skill (available but not invoked).
- Agent fork at 11:12:07 explicitly created to "Save user preference about browser mode to memory" — implies prior agent misunderstood or misapplied browser automation constraints. Investigated agent-browser skill in temp files (11:14:37, 11:18:18), suggesting skill behavior was unclear.
- Agent incorrectly modeled where flow execution control lives—assumed CLI flags drove verbose logging instead of step-level configuration. Indicates misalignment about execution control architecture.

<!-- session 92cb6ce8 2026-08-16 -->

- Template variable syntax: agents initially wrote `when: condition` or custom syntax, but the standard format is `when: ${{ condition }}` with mustache-style delimiters — not documented clearly in type definitions.
- Test assertion pattern: agents wrote `rejects.toThrow()` instead of `expect(...).rejects.toThrow()` — affects multiple test files and requires careful search/replace since the pattern appears similar but is syntactically wrong.
- Multiple re-reads of same files (FlowRegistry.test.ts read 6+ times) suggest initial misunderstanding of test structure or uncertainty about where to make changes — clearer code organization or example tests might reduce this.
- Skill resolution delays: `spec` and `run` skills not found on first invoke (07:48:57, 07:52:42); agent worked around with Bash grep to locate skills manually. Suggests skills may be lazily loaded or have discovery latency.
- Heavy parallelization risk (agents ac93, a835, a0bf, ac4e, a106 running concurrently 08:10–09:00) across related features (jsonpath field, --project-dir, env vars, TASK_PROJECT_DIR, --inputs alias). No visible merge conflicts, but coordination complexity grew. Multiple agents reading/editing CommandHandler and RunCommand simultaneously.
- Design issue flagged at 09:30:58: "when: context shape must be step-id keyed" — agent fork (a593) surfaced disagreement mid-work via SendMessage, suggesting context shape for conditionals needs clearer specification or documentation.
- Multiple retries on daemon/port-file discovery (lines 09:25:14+): agent spent ~90 seconds grepping for port file location, readPortFile behavior, config.port format — indicates no single source of truth for singleton-daemon-kit port storage mechanism.
- Multiple skills called but returned `*** NOT YET KNOWN ***`: `kill-port` (12:55), `subprocess` (12:58, twice), `goldfish` (13:00) — suggests agent didn't fetch skill schemas via ToolSearch before invoking, or agent/harness lost access to deferred tool definitions.
- Agent attempted SendMessage to communicate verbose mode correction but tool was "NOT YET KNOWN" — verbose logging is driven by `log: step` parameter in flow definition, not CLI flags; agent had to investigate with grep to discover this

<!-- session 543d9d83 2026-08-16 -->

- Multiple incorrect assumptions about test context — agent re-read workspaceDir/DeclaredWorkspace setup multiple times (22:18:02–22:18:06) to understand correct structure; early reads missed details that forced rework.
- Agent assumed `${{ }}` template syntax was "legacy"; user corrected mid-work: it's the standard format (line 07:28:29).
- Exploratory debugging without clear hypothesis: 09:25:14-09:26:10 shows multiple similar grep searches for port-file location and client implementation, indicating guessing rather than following a trace path.
- Step failure wasn't terminating loops automatically — 10:58:16-11:06:27 shows investigation into markExecutionFailed, step_failed events, and hasFailed flag handling, suggesting failure-loop integration was incomplete or misunderstood.
- agent-browser skill only supports headless mode, not GUI browser mode — user had to patch skill documentation and restrict usage
- Agent a190 assumed verbose mode was controlled by CLI flag (`--verbose`), but correction shows it's actually driven by flow `log: step` parameter — indicates confusion between CLI-level vs flow-configuration-level behavior control.
- Spec audit (subprocess) discovered HIGH-severity issues in multiple files (extension-points, plugin-manifest, provider-types, workspace-provider, approval-provider, plugin-architecture, threat-model), requiring round 2 fixes — suggests specs need validation against threat-model and architecture guidelines before marking complete.

<!-- session e65b2ff1 2026-08-16 -->

- Context parameter (workspaceDir) not propagated consistently across Protocol.ts, CommandHandler.ts, WorkerAdapter.ts, StepQueue.test.ts — repeated pattern caught piecemeal rather than as single coordinated fix
- Test path/fixture issues in TemplateValidator and FlowRegistry tests — enableAutoDiscovery parameter and test data setup not robust enough to catch mismatches early; required multiple debug cycles
- Agents invoked unknown skills (`/spec`, `/run`, `/flow`) that are listed in available skills but not yet resolved by ToolSearch or skill lookup. This caused fallback investigations instead of using the intended tools.
- --inputs parameter aliasing issue required extensive IPC protocol investigation (lines 08:56-09:20) across daemon, client, and health-server code; unclear if this was a parameter naming problem or response handling problem until deep code inspection.
- Agent-to-agent communication failed at 09:30:58 — SendMessage to a5931923647f13de1 reported status `*** NOT YET KNOWN ***`, suggesting handoff mechanism issue or message format problem.
- Two forked agents (a593, abc9) both worked on output.→outputs renaming and context shape fixes in ConditionEvaluator/FlowScheduler — overlapping work not coordinated; led to duplicate edits.
- Fork agents spent excessive time exploring npm docs/config instead of targeting the root cause directly. Future npm workspace issues: skip WebFetch, check package.json and package-lock.json first.
- Assumed verbose mode was CLI flag (--verbose); actually driven by `log: step` flow parameter — corrected at 13:17:18 SendMessage

<!-- session e98523b0 2026-08-16 -->

- Fork agents made 8+ edits to same files (FlowRegistry.test.ts, FlowScheduler.ts) in single session — no root cause analysis before trial-error debugging
- Multiple test parsing attempts with complex tail/grep filters instead of capturing full test output first; suggests poor test failure triage
- Fork agent at 07:28:29 attempted SendMessage (not available to forks) — indicates context confusion about agent capabilities
- Monorepo import resolution (flow-engine in flow-cli, FlowScheduler/FlowCapabilitiesGenerator exports) required extensive debugging (08:04-08:08) — tsconfig/package.json paths were checked repeatedly, suggesting unclear dependency setup or missing re-exports.
- Initial assumption that task. and taskMetadata objects would be available in when: condition context (they aren't)
- Loop execution misunderstood as iteration counter; actually requires step-failed flag checking + state reset between iterations
- Multiple `subprocess` and `goldfish` skill invocations failed as "NOT YET KNOWN" — these skills either don't exist or aren't in the available list. Agent appears to be guessing at skill names rather than checking documentation first.
- Agent attempted Windows cmd.exe syntax (`taskkill /PID /F`) in Git Bash context — multiple retries with wrong command family before switching to Node.js child_process workaround.
- Fork a190 was corrected mid-task about verbose mode implementation: it should be driven by flow step config (`log: step` parameter), not a CLI flag. Initial brief was incomplete about design decisions.
- Multiple concurrent forks (a190, aaa8, a9a5, a3e0) launched in parallel on overlapping concerns (streaming, output validation, tool calls, specs). No clear scope boundaries communicated. Risk of integration issues / test false negatives.

<!-- session 686db9b5 2026-08-16 -->

- Assistant assumed test pattern structures (e.g., `rejects.toThrow` syntax in FlowRegistry) without first verifying actual test code — led to repeated grep iterations searching for patterns with different syntax variations before finding correct matches.
- Skill "run" marked "NOT YET KNOWN" (07:52), then Skill "flow" marked "NOT YET KNOWN" (08:04) — skill resolution or registration issue prevented use of available skills
- Multiple forks (a593, abc9) worked on overlapping when/output/task context changes without clear task boundary — resulted in duplicate work on ConditionEvaluator.ts and FlowScheduler.ts.
- Fork (a53e) created workspace-shadow violation rule in violations-framework repo while agent-fleet specs being modified in parallel (75a0bd3d) — unclear if both systems needed the rule or if this was coordination gap.
- npm workspace shadowing repeatedly investigated as root cause (11:08-11:14) despite being documented in project memory — agents should consult lessons-learned.md before deep debugging of dependency resolution.
- Direct cmd.exe taskkill call (12:58) instead of abstracting through shell or kill-port skill — breaks portability and violates CLAUDE.md requirement to use POSIX in Bash; should have delegated to skill.
- Multiple concurrent fork agents (a190, aaa8, a9a5, a3e0) modifying shared files (types.ts, validation files, test files) — increases merge complexity and risk of conflicting edits; coordination mechanism needed or sequential ordering.

<!-- session f716f570 2026-08-16 -->

- Attempted to use `subprocess` skill at 22:53:45 without fetching its schema first — got "NOT YET KNOWN skill=subprocess". Deferred tools must be loaded via ToolSearch before invoking them.

<!-- session f5ca1287 2026-08-15 -->

- Assistant initially over-asked permission before running agents; user explicitly delegated ("c'est pas mon role"). Treat test execution and refactor work as default autonomous, not asking first.
- Iterative trial-and-error on shared-orch-worker tsconfig paths (6+ edits with grep/tsc between each) instead of systematic module resolution debugging — should trace tsc --traceResolution output once, understand the full import chain, then fix root cause rather than iterating through configurations.

<!-- session b3d664fc 2026-08-15 -->

- Agent didn't discover that `TaskIndex.ts` existed and was fully implemented — required user to ask "y a pas de task dans flow-cli ???" to surface it. Should have inventoried all command files before declaring what's available.
- Agent asked clarifying questions about which SDK layer to use ("Quand tu dis SDK comme pour flow, tu parles de laquelle des deux?") instead of reading the spec at `specs/2026-07-30-flow-cli/decisions.md` first.
- Agent implemented `task` CLI wiring without first documenting SDK rationale — user had to explicitly say "documente les findings pour SDK !!" to trigger analysis that should have been done upfront.

<!-- session 0b3d4416 2026-06-19 -->

- GenerateCommand model parameter unsafely cast to union without validation — `as "gpt-4-turbo" | ...` silently accepts any string. Should validate before cast.
- Package exports configuration: tried adding "exports" field to flow-engine/package.json, then reverted to only "main". Unclear strategy for module resolution in this monorepo—should clarify with existing packages or docs.

<!-- session 44b25955 2026-08-09 -->

- Attempted to use skills before they existed or were loaded: get-timestamp (2026-08-08 22:04:24), check (2026-08-08 22:18:38), goldfish-review (2026-08-08 22:51:27) → all returned "NOT YET KNOWN" warnings; agent then wrote the missing goldfish-review skill definition
- ReportFindings tool call failed with "NOT YET KNOWN" (2026-08-08 22:13:42) — appears to be a deferred tool that wasn't fetched before use
- Multiple fresh-engineer CLI instances independently read entire spec suite (23:12:17, 23:32:51, 23:40:33) without leveraging prior analysis. Each reads the same 10+ spec files from scratch—context waste. Delegate with targeted reading scope or provide summary.

<!-- session 5ca40801 2026-08-09 -->

- Delegation to agent ae20 for spec gap analysis ran but didn't surface findings in main transcript—user had to command direct file reads instead. When delegating analysis tasks, ensure agent emits summary/findings to main context, not just reads into hidden memory.
- Deferred tool WebFetch required ToolSearch call first (agent a7eb at 22:24:11). Load tool schemas before launching agents that may need them, or surface schema-loading as early step.
- Grep searches for decision references (D31, D34, D37, D23) appear in logs without clear result handling — suggests decision IDs may not be indexed or linked in spec files, forcing manual search rather than direct lookup.
- Multiple grep searches for non-existent patterns (spawn-related: on.*demand, pre.*spawn, pool.\*spawn) — agents assumed terminology from spec that doesn't exist in code; spec and implementation naming mismatch.
- Explore agents redundantly re-read identical spec/source files across multiple invocations — coordination overhead; no context carryover between sub-agents.

<!-- session e99131f8 2026-08-09 -->

- Attempted to read singleton-daemon-kit directory outside primary working directory without verifying scope first, triggering permission blocks
- Launched 4 parallel general-purpose agents (22:20:00) that redundantly read identical spec files, wasting context — should batch similar reads into single agent or use sequential passes
- Partial line-offset reads of decisions.md (5 separate 100-120 line chunks) inefficient for search — when looking for specific content in large files, grep to locate section first, then read that section; or ask user which section is relevant

<!-- session 95b0dc3a 2026-08-09 -->

- Multiple parallel general-purpose agents (ae20, a083, a359, ac24, ae2b) launched simultaneously for overlapping spec coherence reviews and grep work — no clear scope separation. Could have used single focused agent or Explore agent for comprehensive search instead of 4-5 redundant processes.
- Agent ae2b performed 20+ similar grep patterns across decisions.md and other files (bufferSpillMs, SIGKILL, D28, cancelled, etc.) without consolidating results — inefficient repetition of similar searches that could have been batched into single comprehensive grep calls.
- `specs/2026-08-09-zones-attestations/implementation-prompt.md` went through 5+ edits labeled "Fix goldfish gaps" after fresh-engineer and goldfish-review passes, suggesting the initial spec wasn't clear enough to avoid ambiguities on independent reads.
- Attempted to call goldfish-review skill but it was marked "NOT YET KNOWN" — agent improvised by manually constructing goldfish analysis prompts and calling `claude` CLI directly with `--dangerously-skip-permissions` flag instead of using the skill

<!-- session c16a2058 2026-08-08 -->

- Multiple parallel agents independently read identical spec files and source code (23:17–23:21), duplicating context work; e.g., `types.ts`, `decisions.md`, `FlowValidator.ts` read 4+ times by different agents without coordination or caching.
- Four sequential "fresh engineer with zero context" analyses run (22:54, 23:12, 23:16, 23:19, 23:32), each re-reading all specs; pattern suggests previous runs didn't meet requirements or specs were destabilized mid-analysis.
- Several agent operations logged as "Agent unknown" without type specification — agent type selection may need clarification in workflow

<!-- session 0e725353 2026-08-08 -->

- Repeated "NOT YET KNOWN" tool/skill invocations (claude-api, get-timestamp, check, ReportFindings, ToolSearch) — agent should pre-check availability before calling or fail gracefully with user guidance
- Multiple general-purpose agents spawned simultaneously to edit the same spec files (decisions.md, open-questions.md) — risk of git conflicts or out-of-order edits; serial or better coordination needed
- 8+ agent instances (757d92d0, 66f53dff, 91f855f6, 6c4d20b9, b273c373, a11d7129, etc.) performed overlapping reads of identical decision files and source files—redundant context usage.
- Plan file (.claude/plans/2026-08-09-flow-cli-implementation.md) underwent 10+ single-occurrence Replace edits rather than coherent rewrites, indicating iterative correction rather than a clear starting spec.
- General-purpose agent had to grep codebase for implementation details (daemon cwd usage, ValidationError patterns, WebSocket v1 protocol, reconnection logic) that should be surfaced or cross-linked from spec files — specs leave critical details discoverable only by code search.

<!-- session 75bdb797 2026-08-08 -->

- Attempted to invoke skills before they were available in the system: "claude-api" (21:11:29), "check" (22:18:38), "get-timestamp" (22:03:24). Tried ToolSearch without fetching it first (22:24:11). Used ReportFindings as a skill instead of as a tool call (22:13:42).
- Tried to invoke `goldfish-review` skill at 22:51:27 but got "NOT YET KNOWN" warning; user worked around by manually writing prompts to temp files and invoking `claude --dangerously-skip-permissions` via bash instead of using the built-in Skill tool.

<!-- session e3b9ff5f 2026-08-08 -->

- Multiple `--dangerously-skip-permissions` flags used in bash-spawned claude processes (23:12, 23:28, 23:32) — agent is bypassing permission checks rather than working within the permission model; indicates friction in delegation workflow.
- Skill attempt at 22:51:27 — goldfish-review flagged as "NOT YET KNOWN" at that time; agent later works around this by invoking claude directly via bash with prompt files instead of using Skill tool.
- general-purpose agent performed sequential grep searches (daemon, ValidationError, D23, WebSocket patterns) then plan edits instead of batching the research phase — could have consolidated discovery before editing

<!-- session 33c79da6 2026-08-08 -->

- Multiple general-purpose agents delegated to edit decisions.md/open-questions.md in sequence, then more edits followed — incomplete initial instructions or lack of coordination between delegations
- Bash grep commands used instead of Grep tool multiple times (grep -r "DAGValidator", grep -n "singleton-daemon-kit") — violates tool selection guidelines
- Fresh-engineer analysis spawned multiple times with different agent IDs reading identical spec/source file ranges — suggests context loss or inefficient task delegation

<!-- session e02d6bbb 2026-08-08 -->

- Multiple "Agent unknown" labels in logs (22:19:56 x4) — agents launched without clear type specification (Review 1–4 for coherence/goldfish/consistency/quality audits)

<!-- session a11d7129 2026-08-08 -->

- Extensive grep patterns across flow-cli spec (session_id, cancel, subtask, SIGTERM, heartbeat, etc. at 22:06–22:25) required many queries to locate decisions — indicates spec lacks clear index or cross-reference structure
- Multiple agents independently re-read identical spec files and source code (flow-cli decisions.md, types.ts, validation files) with no apparent result sharing. At least 8 separate agent sessions performing overlapping reads. Suggests agents don't cache or communicate findings.

<!-- session f8f7b481 2026-08-08 -->

- Agents misinterpreted full-content requests as permission to summarize/digest; led to re-requests for raw output.
- Five or more fresh-engineer analysis attempts on flow-cli specs (22:54:21, 23:12:17, 23:16:59, 23:19:44, 23:21:10) suggest either incomplete completion on first run or unclear requirements — makes output actionable.

<!-- session b273c373 2026-08-08 -->

- Goldfish-review skill marked "NOT YET KNOWN" at 22:51:27 but used successfully later at 22:52:37 via bash workaround (cat > /tmp/goldfish1.txt). Suggests skill availability timing issue or unclear skill initialization.

<!-- session 1d9d9b8b 2026-08-08 -->

- Multiple "Agent unknown" invocations instead of specifying subagent_type — agents default to general-purpose without explicit type, defeating parallelization benefits.
- Exploratory grep patterns with similar keywords repeated across multiple agents (session_id, sessionId, session-id variants; then multiple searches for D28/Q24/etc) — suggests uncertainty about naming conventions; a single targeted search or codebase overview would have been more efficient.
- multiple "Agent unknown" entries (e.g., "Agent unknown - Move v2 decisions") suggest user is labeling manual steps with agent-like names; these don't invoke actual agents but appear to be human-readable task labels

<!-- session 6c4d20b9 2026-08-08 -->

- Multiple skill/tool lookup failures in single session: claude-api, check, get-timestamp skills marked NOT YET KNOWN; ReportFindings tool unavailable when agent tried to use it; ToolSearch attempted but schema not loaded.
- Repeated grep patterns across 4 parallel agents (D28|CANCELLED, D28|cancel|CANCELLED|interrupted, subtask|sub-task|child|parent) — agents duplicating search effort instead of coordinating results.

<!-- session f39ed56c 2026-08-08 -->

- Attempted to invoke skill "claude-api" (21:11:29) that was not available — assistant was researching Claude Code CLI custom tool support and tried an unavailable skill before falling back to manual WebFetch
- Multiple WebFetch attempts to same Medium article (goldfish review, 22:24:55–22:26:53) with incremental prompts suggest difficulty extracting needed information or content access issues
- Attempted to invoke skill "check" (22:18:38) marked as NOT YET KNOWN; skill later discovered via manual lookup at 22:27:48
- Attempted to invoke goldfish-review skill without first fetching schema via ToolSearch — resulted in WARN "NOT YET KNOWN". Deferred tools must be fetched before calling via Skill tool.

<!-- session 757d92d0 2026-08-08 -->

- When reading spec files, agents summarize rather than return full contents — user explicitly corrects by requesting complete file text, indicating a mismatch between agent inference and task intent.
- Four general-purpose agents launched in parallel (ae2b, a3fe, a359, ac24) all glob and read the same spec files redundantly instead of sharing context or dividing work.
- Explore agent attempts multiple WebFetch retries on a paywalled Medium article (drensin.medium.com article on goldfish reviews) without finding cached/alternative source or acknowledging the failure mode clearly.

<!-- session 91f855f6 2026-08-08 -->

- Explore agent attempted ToolSearch (22:24:11) which was a deferred tool not yet loaded, causing failure
- Agent read external singleton-daemon-kit project (22:55:47+) to resolve ExecutionContext/StepConfig/StepOutput/LogEntry types instead of finding them in-repo — suggests types not easily discoverable or documented locally

<!-- session 2fb9fc7d 2026-08-08 -->

- Calling Agent() without subagent_type parameter results in "Agent unknown" entries in logs. Must always specify subagent_type when delegating work.

<!-- session 66f53dff 2026-08-08 -->

- Multiple agent launches used "Agent unknown" label instead of specifying proper subagent_type (general-purpose). Should fail fast or use explicit subagent_type parameter.
- Tried to invoke Skill "claude-api" and "check" without checking availability first; both returned "NOT YET KNOWN" warnings.
- ToolSearch was invoked by an agent but wasn't available; agent attempted WebFetch workaround.
- Agent cac4885a made 7 consecutive Edit operations to decisions.md (22:37:35–22:37:57) without reading between edits, risking inconsistent changes. The agent did later read the file (22:43:38), but establishing a pattern of read→understand→edit would reduce churn on spec files.

<!-- session cac4885a 2026-07-30 -->

- Misread singleton-daemon-kit SDK multiple times (daemon creation, process lifecycle). Pattern: when told to read external repo, read more thoroughly — don't skip sections or make assumptions about what you skimmed.
- Built spec incrementally without cross-document consistency checks. First pass had 20+ contradictions, second audit found 18. Pattern: coherence audits should run _during_ design, not after. Lock decisions in one place, reference everywhere.
- Conflated two distinct architectural concerns (`env:` OS environment injection vs `secrets:` sensitive writes; they'll block without effect.
- Assumed `step.context` was actively used during execution. Required 10+ grep attempts with progressively refined patterns before discovering: "Nobody actually reads `step.context` at runtime." Indicates initial misread of codebase.

<!-- session 1e242f45 2026-07-30 -->

- Four sequential audits (rounds 1-4) with overlapping Explore and general-purpose agents suggests redundant checking rather than focused division of labor; heavy repetitive edits to decisions.md/execution-model.md across ~90 minutes indicates initial spec structure or audit methodology was insufficient.

<!-- session 96446ac4 2026-07-30 -->

- Misread the singleton-daemon-kit repeatedly — made assumptions about IPC and worker models without fully understanding the SDK's scope (CLI↔daemon only, not worker↔daemon)
- Confused subprocess (via Bash `claude --print`) with managed subagent (via Agent tool) — user has prior data showing subprocesses produce better quality for coherence audits, but assistant created managed agents instead
- Over-complicated architecture by trying to re-implement SDK concepts (workers as HTTP clients, re-creating client logic) instead of reusing the CLI binary itself
- "Agent unknown" label at 15:02:03 indicates logging/identification anomaly in agent tracking system.

## Documentation gaps

<!-- session 5565878c 2026-08-22 -->

- No specification for what CLAUDE.md should contain — assistant had to explore extensively to understand expected sections. Existing CLAUDE.md is incomplete (missing commands section and architectural overview), signaling unenforced standard.
- Agents don't recognize available project skills (check, run-test) and fall back to manual Glob/Read patterns to locate and execute scripts like `scripts/check-all.js`. No agent initial context indicates where skills live or how to discover them.
- Agent called SendMessage tool and it returned "NOT YET KNOWN" (12:33:42, 12:35:18). Tool exists but schema was not loaded in agent context at invocation time.
- CLAUDE.md references "check" skill as directive ("Use the skill 'check' and fix the issues") but skill appears unavailable/unknown to agents, causing failures instead of graceful fallback
- `write-doc` skill logged as "NOT YET KNOWN" at 16:23:57—tool schema not pre-loaded. Agent attempted invocation without ToolSearch first.
- @wadeck/shared-cli adoption required creating duplicate `configDir.js` wrapper files in each scrapper package (assurance, whatsapp, chatgpt) — no scaffolding or template pattern documented. Manually replicated same boilerplate 3x.

<!-- session e76b8d9c 2026-08-21 -->

- OpenCode streaming events (`text`, `tool_use`) reach ModelStepExecutor but StreamEventMapper.map() has no cases for them — they don't appear in logs/console. Silent data loss.
- OpenCode event semantics (`exit` vs `close`) and which events trigger `launchBackground()` resolution aren't clearly recorded. Future model provider integrations will need this.
- Mock provider scenario format (how to emit NDJSON events) wasn't immediately clear — required multiple reads of existing examples.
- Tool return type change (single `LiveLogEntry` → `LiveLogEntry[]`) created friction across 3 files; type hints for array-based returns could have been clearer.
- GitLab write token validation in CI workflows — non-obvious that PyPI POST probe (without auth gives 401, with write token gives 201) is the most reliable non-destructive method; initial workflow used destructive test publishes.
- `ci/scripts/generate-platform-packages.sh` created at 15:41:35 but no context given — appears to be undocumented workaround for platform-specific package generation in CI workflows. Platform package constraints and the exclusion strategy required empirical discovery.

<!-- session acc25325 2026-08-19 -->

- `flow run` behavior unclear: command exits immediately without `--wait`, no obvious indication from help text. Required trial-and-error to discover.
- Missing 7+ unit tests for core features: JSONPath bracket notation, parseYAML transform, "from" extraction, contract validation, intermediate loop skip, writeOutput cleanup, statusTransitions.
- OpenCode MCP configuration format required web fetching — assistant didn't have local knowledge of config.json structure for defining MCP servers. Suggests either external docs need to be cached locally or this is a known tool gap.
- Tools not immediately available require discovery via ToolSearch: AskUserQuestion (21:51:01), SendMessage (21:08:40, for inter-agent comms), violations skill (20:47:34), subprocess skill (21:03:58). Skills list should be pre-loaded.

<!-- session 1dcbd5b4 2026-08-21 -->

- Package-lock.json registry URL consistency with CI workflows not initially checked — discovered project-level URLs mixed with group-level URLs; required sed replacement, then full regeneration. Future: verify lockfile URLs match workflow *.npmrc blocks upfront.
- Subprocess stdin lifecycle for OpenCode on Windows (must close stdin _before_ waiting for close event to unblock; use close not exit event) — not previously documented in lessons-learned; prevents future deadlock debugging cycles.

<!-- session 2157a0f8 2026-08-20 -->

- CLI command structure unclear — multiple rewrites to CliCommand.ts, TaskCliCommand.ts, ShowCommand.ts and edits to ShowCommand to replace `ModelFlowStep` references indicate the command factory/hierarchy pattern was not self-evident from existing code.
- Test running patterns for flow-cli (vitest config, path filters, reporters) are embedded in scripts/test-config.js source; no CLAUDE.md guidance. Agents reverse-engineered test syntax from implementation instead of clear documentation.
- npmrc and npm registry config scattered across 4+ projects (agent-fleet, violations-framework, wdrive, singleton-daemon-kit) — changes to registry URL or token names must be coordinated across all CLAUDE.md files and workflow files simultaneously to avoid inconsistency.
- Validation entry points (validateString, validateLaunchOptions) are not discoverable from code reading alone — grep searches suggest these are implicit patterns the codebase expects developers to know about or find via search.

<!-- session 6d59c129 2026-08-20 -->

- Cross-repo dependency introduced abruptly at end (singleton-daemon-kit version bump, compute-version.sh copy logic) with no prior context in transcript — missing requirements doc or integration spec
- Pre-existing TypeScript errors in ContractValidator.test.ts weren't caught until late validation phase — suggests either composite tsconfig.json reference exclusions need review or test files need stricter pre-commit validation (e.g. `tsc --noEmit` on .test.ts files before merge)
- @wadeck npm registry setup (project .npmrc vs global ~/.npmrc precedence, different auth tokens, registry URL) required multiple corrections across 4 projects. CLAUDE.md mentions it but the complexity of local vs. global config isn't clearly documented — caused extra rounds of verification and updates.
- Plugin system architecture (PluginRegistry, PluginLoader, executor field in StepRunner) isn't centrally documented. Agent had to grep multiple files to understand CLI self-check #5. Self-check.md was updated but the plugin design pattern should be upfront.

<!-- session 0455fbe4 2026-08-20 -->

- run-test skill syntax unclear — multiple agents tried different vitest flag combinations (--reporter=verbose/dot, --bail, --testPathPattern patterns) before one spawned general-purpose agent to read .claude/skills/run-test/examples.md at 19:34:09.
- ESM mocking patterns for Node tests not documented — CliCommand.test.ts and TaskCliCommand.test.ts required iteration on process.exit/child_process mocks; agents searched for similar patterns in other test files rather than finding a documented fixture/helper.
- npm registry configuration scattered across 4 projects (agent-fleet, violations-framework, wdrive, singleton-daemon-kit) with inconsistent .npmrc setup; CLAUDE.md files updated after the fact rather than having clear single source of truth

<!-- session 95141215 2026-08-20 -->

- Skill availability not discoverable upfront — agents had to attempt use to discover whether `/check` and `/run-test` existed, burning attempts on repeated same-skill blocks.
- CLAUDE.md instruction "After each task: Use the skill 'check'" assumes skill is always available, but session logs show it wasn't known to agents — either skill wasn't loaded or instruction needs conditional guidance.
- npm @wadeck registry setup required manual CLAUDE.md updates across 4 different projects (agent-fleet, violations-framework, wdrive, singleton-daemon-kit) — no single source of truth; add cross-project setup validation or centralized docs
- Process.exit mock type signature required trial-and-error to discover (string | number | null) — not documented; add to lessons-learned or TypeScript strictness notes

<!-- session 9ae6da57 2026-08-20 -->

- npm registry setup (@wadeck packages, .npmrc config) is scattered across CLAUDE.md files in multiple projects (agent-fleet, violations-framework, wdrive, singleton-daemon-kit) — should be centralized or linked
- Relationship between @wadeck SDK registry URL, npm auth tokens, and CI/CD workflow setup is not documented in one place — agent had to investigate across ~/.npmrc, workflows, and multiple CLAUDE.md files to understand the pattern

<!-- session 6211d754 2026-08-20 -->

- No clear documented way for agents to run TypeScript type-checking. Agents attempted grep-based error filtering (`grep "error TS"`) rather than a proper `tsc --noEmit` or build validation step, suggesting the project's check/validation workflow isn't obvious to subagents.
- OpenCode integration tests require environment variable setup (`OPENCODE_MOCK_PATH`, `OPENCODE_INTEGRATION=1`) but this setup pattern is not documented in visible examples or test setup files.
- No clear guidance on configuring @wadeck registry URL in .npmrc and verifying package visibility — required manual checks with `npm view` and registry validation.

<!-- session a11724af 2026-08-20 -->

- npm registry configuration for @wadeck packages required manual investigation across .npmrc files and publishConfig in multiple repos (agent-fleet, violations-framework, singleton-daemon-kit). No central docs on registry setup or SDK publishing workflow.

<!-- session 6c0c8a03 2026-08-19 -->

- SendMessage tool invocation [21:08:46] to coordinate between agent forks (`to=a19e987db154400d7`) marked "NOT YET KNOWN", suggesting inter-agent communication mechanism is incomplete or undocumented for this pattern.

<!-- session 98c0936a 2026-08-19 -->

- Feature implementation status unclear — extensive grep searches needed to determine what's actually implemented: statusTransitions, event triggers (event_type), allowRecursion, validateInput/validateOutput, contract validation, preProcess/postProcess, writeOutput cleanup, sub-steps. This signals that feature matrix (planned vs implemented vs stub) is not documented.
- writeOutput behavior and workspace cleanup expectations not self-evident — agent had to investigate OutputExtractor.ts logic to understand if workspaces/outputs are auto-cleaned or persist.
- Contract validation UX for missing required inputs — CommandHandler flow doesn't clearly show what error the user sees when required inputs aren't provided; test flow had to be created to discover behavior.
- No clear inventory of which OutputExtractor transforms are implemented vs. stub — agent had to search/grep to learn parseYAML existed, causing wasted exploration.

<!-- session 1c8332e4 2026-08-19 -->

- OpenCode configuration format not documented locally — agent WebFetched opencode.ai docs at 20:29 to find JSON structure for MCP servers. Config should be documented in project or specs.
- Flow-engine feature support unclear: investigation required to determine which features (statusTransitions, event triggers, contract validation, writeOutput, etc.) are actually wired and working vs. present in types.
- Deferred tools and skills require ToolSearch fetch or Skill tool use, but agent context didn't make this obvious — no upfront guidance that certain tools need schema-fetch before calling directly.
- No template or generator for the 10 new CLI distribution packages (platform-specific binaries); backend-dev had to manually create each package.json and bin wrapper

<!-- session 3f2a20af 2026-08-19 -->

- Extensive parallel grep searches for statusTransition, event triggers, allowRecursion, contract validation, writeOutput — suggests unclear implementation status or scattered/undocumented features. Multiple agents repeated identical searches independently, burning tokens.
- No clear test flow examples or patterns in codebase — agents had to create `task-*.yml` test flows from scratch (skip-on-loop, output-jsonpath, output-regex, write-output, contract-inputs)
- Heavy repeated grep patterns for OutputExtractor, JSONPath bracket notation, parseYAML, ContractValidator — suggests implementation details (input discovery, transform handling, contract validation) lack discoverable documentation; developers search multiple times for overlapping concepts across files.

<!-- session afdd4652 2026-08-19 -->

- Spec refinement workflow unclear: goldfish coherence review (line 21:04:12) → security pentest subprocess (line 21:04:24) → fixes applied (line 21:10:06-17) → re-launch goldfish (line 21:10:06). No checklist or completion criteria documented for when spec is done.

<!-- session 66138a84 2026-08-19 -->

- The "spec" skill invoke at 19:51:32 was followed immediately by an Explore agent fork investigating the same question. Unclear whether spec skill was attempted because it wasn't documented as available, or user/agent misconception about its applicability here.
- Spec work contains French text in questions (21:01:01: "Quels événements déclenchent le policy engine...") despite CLAUDE.md requiring English docs — unclear spec language guidelines or inconsistent enforcement across multi-agent work.

<!-- session da343929 2026-08-19 -->

- Initial user request "Read each of these files in full before answering" was truncated mid-transcript; assistant proceeded anyway with partial context, suggesting requirements weren't fully captured.
- "Relaunch goldfish/security audit" pattern (three separate runs) indicates unclear initial spec state or multi-pass refinement cycle not front-loaded

<!-- session 55a79144 2026-08-19 -->

- MCP server abstraction relationship to underlying HTTP API not well documented — user had to explain that the MCP server is merely a JSON-RPC wrapper around flow-engine's HTTP API, with no additional protocol layer.
- Policy engine architectural pattern (HTTP endpoint + hooks) not accessible/documented; required user to explain from first principles in frustration ("PUTAIN NON").

<!-- session de603161 2026-08-19 -->

- OpenCode CLI config path resolution required extensive bash/strings inspection of binary and environment variable exploration — configuration discovery pattern not clearly documented; external WebFetch to opencode.ai/docs needed as fallback
- Contract validation features (validateInputs, preProcess, postProcess, validateContract) scattered across validation/, executor/, processing/ directories — multiple grep searches across different paths suggests inconsistent naming and unclear feature boundaries
- Skills `goldfish` and `subprocess` appeared as "NOT YET KNOWN" despite being in available skills list; agents adapted by spawning fork agents instead — unclear if timing/lazy-load issue or availability gating.

<!-- session 274a5f98 2026-08-19 -->

- Feature completeness (statusTransitions, contract validation, event triggers, writeOutput cleanup) required extensive codebase grepping across multiple packages and agents. Spec files should state upfront what's implemented vs pending, not requiring agents to discover this via code search.
- OpenCode MCP/config format required WebFetch to external docs (opencode.ai/docs/config, opencode.ai/docs/mcp-servers) — should have local reference or link in spec.
- Heavy exploration of ContractValidator, LoopHandler, parseYAML patterns with repeated greps and reads suggests unclear patterns for: test fixtures (inputs/outputs for NormalizedInputDefinition), transform function implementations (parseYAML location/signature), error-handling convention in CLI execution layer (markStepFailed, error message flow through RunCommand → ExecutionStore).

<!-- session e9704d0a 2026-08-19 -->

- `OPENCODE_CONFIG` env var for per-invocation MCP config was missed in initial binary inspection — required guided search (strings extraction + binary scanning) to discover; not surfaced in `--help`.

<!-- session 4a2fd14d 2026-08-17 -->

- No HOOKS.md existed in codebase — had to create from scratch. Hook event types, payload field names, and config formats had no existing reference docs.
- CLI distribution spec lacks concrete details for UpdateManager, self-check suite, and CI pipeline — audits flagged these as named in architecture but unspecified. Same pattern: multiple audit reports finding the same architectural gaps suggests spec needs upfront design validation before implementation.
- MCP config file format/discovery not documented; agents repeatedly grepped for "mcp-config\*", "mcpServers", "url" patterns across codebase.
- PluginLoader resolution strategy unclear to spec; agents had to write tests (TDD) to validate whether spec decisions (require.resolve vs import.meta.url, pluginsDir override) matched implementation.
- Plugin documentation (pluginsDir) scattered across multiple READMEs instead of centralized; agents needed grep across plugin-none, plugin-worktree, plugin-cli-approval separately.
- Workspace configuration (retainDays, maxWorkspaces, basePath) required multi-file discovery (FlowConfig.ts, Daemon.ts, package.json, tsconfig.json) — config structure underdocumented.
- Violations rule for em-dashes ("shared/no-em-dash") exists but wasn't active in project config until "shared" tag was manually added — no discovery path documented for which rules are active by default vs available

<!-- session d0c7ba90 2026-08-17 -->

- MCP server capabilities not self-discoverable from Claude Code environment — assistant had to spawn fork agent to research whether `-p` mode supports MCP at all

<!-- session 5ddbec02 2026-08-16 -->

- Daemon response protocol (executionId wrapping, IPC response structure) required extensive investigation into singleton-daemon-kit internals at 08:57–09:20 — multiple reads of generated client.js, daemon.js, health-server.js. Pattern is non-obvious and not documented in project.
- No upfront specification of which fields are available in `when:` condition evaluation context or how they should be keyed (step-id vs task vs other).
- Loop/retry semantics for failure handling not documented — took multiple debug runs (10:54-11:05) to distinguish when step_failed should trigger retry vs complete execution.
- Model step tool logging and streaming behavior wasn't documented before implementation started. Had to create `.claude/docs/model-step-tool-logging.md` retrospectively to clarify tool-call streaming patterns and logging configuration.
- Workspace metadata architecture (metaDir vs workspacePath vs outputsDir separation) required extensive grepping across multiple files to understand; no central architectural doc found describing the separation.
- w-learning plugin session storage integration not documented — agent spent 15:45-15:58 searching for session_file paths, memory_paths, and gitignore rules; had to coordinate gitignore changes mid-implementation rather than having a clear pattern reference.
- Plugin configuration validation rules and manifest schema weren't documented upfront — led to violations rules being added retroactively during integration phase
- Extension points versioning (workspace v1, approval v1) not specified in specs before implementation — version strategy should be explicit in extension-points.md
- Package naming conventions (extension-points vs plugin-sdk scope) required explicit user clarification via AskUserQuestion at 18:57 — should have been documented upfront in specs or naming guidelines. HistoryCommand.ts integration pattern was unclear (multiple existence checks at 19:48-19:50 suggest uncertainty about where command belongs).
- MCP server setup/testing is manual and exploratory—fork agent writes .cjs files, runs node, manually edits .claude.json with no clear documented approach. Should provide integration testing guide or helpers for MCP server validation.
- Plugin SDK → extension-points migration required coordinated edits across: source imports (8+ files), tsconfig.json paths (5 files), package.json entries (4 files), test imports (3 files). No migration checklist or script—error-prone for future refactors of similar scope.

<!-- session c898dd1a 2026-08-16 -->

- Plugin system spec did not explicitly define package namespace scope (@flow/\* vs unscoped). Led to agent assumption and required later correction.
- Registry path calculation depth in tests wasn't obvious from error messages — "file not found" required manual path tracing to catch off-by-one directory level.
- Violations rule over-matching: plugin-sdk caught by `plugin-*` pattern, requiring manual exclusion — the rule scope/precedence logic needs documented examples
- Output variable extraction format (pattern, jsonpath fields) required extensive searching through `flow docs` output with multiple grep patterns (08:04-08:09). Add structured docs or examples to SchemaValidator/OutputVariableConfig.
- Daemon IPC protocol (execution_started, executionId response format) required agent to read node_modules/@wadeck/singleton-daemon-kit implementation (08:56-08:58). This contract should be documented at application layer.
- singleton-daemon-kit protocol (how responses wrap, health server handling) undocumented — agent had to read compiled .js to understand; no CLAUDE.md or inline docs explaining this dependency
- TemplateContext shape and when: context specification undefined — both discovered as design issues via fork investigation rather than documented beforehand
- StepRunner retry logic ownership was unclear — no doc indicating retry should be delegated to FlowScheduler, not implemented in StepRunner; similarly, flow validation doesn't document that undeclared output keys (steps.X or model result) should be caught
- `metaDir` concept — appears to have been worked out during implementation (widespread refactor from `outputsDir` to `metaDir` across types, WorkspaceManager, StepRunner, Protocol, CommandHandler, WorkerAdapter, and 5+ test files) rather than clearly spec'd upfront; no single source explaining the workspace/.meta/outputs separation pattern
- W-learning plugin gitignore integration unclear — required reading plugin.json, hooks.json, scripts, and plugin plan to understand where `.w-learning` outputs should be ignored. Should document path or add comments to .gitignore entry.
- Spec file editing by multiple agents in parallel (plugin-manifest.md, workspace-provider.md) — no locking visible. Process worked but is fragile if edits overlap.
- Agent couldn't resolve violations skill (showed "NOT YET KNOWN" at 17:05) despite being in available skills list. Fell back to 10+ bash commands (grep/ls) to reverse-engineer violations config, then had to pattern-match from `no-raw-err-in-cli.ts` to create `plugin-rules.ts`. Violations setup docs missing or skill not discoverable in agent context.
- Large-scale package scope rename (affecting ~50+ import statements) executed by agent without visible user approval in this chunk — refactoring rationale and scope should have explicit sign-off before execution
- Unclear MCP configuration API — agent searched repeatedly for CLAUDE_MCP_CONFIG, mcpConfigPath, --mcp-config flags with no upfront discovery. Suggests the ClaudeLauncher subprocess API should be documented more explicitly (which env vars vs. which CLI flags).

<!-- session 75a0bd3d 2026-08-16 -->

- Plugin system architecture (layered config, user-home vs. project-level, instance vs. type semantics) required repeated user explanation. Not captured in existing project docs.
- Output extraction configuration unclear: agent (08:08-08:09) searches repeatedly with different keywords (output, pattern, jsonpath, json_path, jq, OutputVar, OutputVariableConfig) to find flow docs section on output variable extraction — took multiple queries to surface the feature
- Daemon response/IPC protocol opaque: agent a106 (08:57-09:12) spends 15 minutes investigating singleton-daemon-kit internals, Protocol.ts, CommandHandler.handleRun() to understand how executionId is returned from daemon — suggests response contract is not clearly documented in code or comments
- npm workspace package shadowing: when a workspace package name matches a published registry package (e.g., `flow-engine`), `npm install` from a subdirectory can pull the registry version instead of the workspace package. Root cause required external investigation; fix documented as `file:` protocol in package.json. Subtle npm v7+ behavior not self-evident from code or existing docs.
- Model step output handling in flow-cli is not easily discoverable—required tracing through WorkerAdapter → StepRunner → ClaudeLauncher → OutputExtractor chain. Multiple agents had to investigate the same question independently (11:12:08 and 12:08:09), suggesting the flow of "model step output → logging → storage → result extraction" is underdocumented.
- When skills are listed as available in system-reminder but marked deferred, agents don't have a clear protocol: should they ToolSearch first, or attempt direct calls? Current behavior is trial-then-fallback.
- Workspace vs Workspace Metadata separation deemed significant enough for lessons-learned.md entry late in session (14:18:02), but discovery happened during implementation TDD rather than upfront — document complex architectural concerns before delegating implementation.
- Session mode implementation (append/fork/compact) pattern: each mode needs updates across five file groups (types, launcher, runner, tests, validation). This flow wasn't self-evident and required trial-to-fix cycles; documenting the checklist (or using a code review guideline) would accelerate future session modes.
- ClaudeLauncher command-building pattern for flags (`resumeSessionId`, `--auto-compact`, session mode selection) — edge cases around when each flag applies were discovered by test failures, not documentation.

<!-- session e453d841 2026-08-16 -->

- Spec references "Workspace precedence level 3" as undefined concept contradicting other spec sections — refactoring plan relied on undefined precedence semantics
- Daemon response format (executionId wrapping) required extensive code inspection of singleton-daemon-kit client/health-server to understand — the actual response structure wasn't documented inline or in Protocol.ts, forcing manual investigation of node_modules.
- OutputVariableConfig field naming (pattern vs jsonpath) wasn't pre-decided; investigation showed only pattern was used, requiring schema extension design mid-implementation.
- --project-dir flag behavior and execution path resolution (where it's used in flow/task steps) required searching across TaskIndex, StepRunner, FlowOrchestrator — not clearly localized in a single boundary.
- Workspace package shadowing (rogue transitive deps in workspace subdir node_modules) wasn't prevented by existing tooling; required adding no-workspace-shadow violation rule to separate violations-framework repo as post-hoc fix.
- npm workspace package shadowing: nested packages can resolve to registry versions instead of workspace siblings when using non-prefixed workspace protocol. Solution: use `"file:../"` prefix in package.json. Root cause: npm installs rogue package when running from nested directory. Added to lessons-learned as fix.
- Model step `log` parameter behavior undefined — WorkerAdapter needed 3 fixes: pass `streamJson` to ClaudeLauncher, pass `captureOutput: true`, inject `executionConfig` with model config. No prior doc on these requirements.
- Flow validation missing UNDECLARED_OUTPUT_KEY check — flow steps can output keys not declared in flow.outputs, causing silent data loss. Added ValidationCode + SimulationValidator check.
- Workspace metadata separation (metaDir field) not obvious from code — agent had to search with grep for "metaDir|outputsDir|path.\*workspace" to understand the architectural split.

<!-- session 7d4fb045 2026-08-16 -->

- workspaceDir context pattern not obvious — appears in StepQueue.test.ts, WorkerAdapter.test.ts, and CommandHandler.test.ts. Repeated grep searches (22:17:51, 22:30:35, 22:30:38) for `workspaceDir|DeclaredWorkspace|createSharedWorkspace` across files, indicating this is a key test fixture pattern that should be documented centrally.
- Output extraction configuration (jsonpath, pattern fields) required extensive grep searching (07:57-08:09) rather than being documented in flow docs; multiple search variations suggests unclear naming or documentation structure.
- Daemon IPC protocol and response structure not documented; extensive investigation (09:10-09:20) into singleton-daemon-kit internals (client.js, health-server.js) to understand how executionId is returned and response is wrapped.
- RunCommand --inputs flag alias behavior unclear; investigation spans daemon protocol, response handling, and singleton-daemon-kit internals rather than documented usage contract.
- "When: context must be step-id keyed" design constraint was implicit; took investigation (reading scheduler, tests, validation code) to extract it — not documented upfront for coordination.
- Skills marked "NOT YET KNOWN" at runtime: subprocess, goldfish (13:00:08/11/15), kill-port (12:55:49) — skills listed as available but not resolvable during session; caused fallback to manual process management (cmd.exe taskkill).
- How verbose mode is wired in model steps and step runner not clearly documented — led to wrong implementation assumption and correction loop.
- Workspace metadata (metaDir) changes touched 8+ files across packages (WorkspaceManager.ts, StepRunner.ts, types.ts, Protocol.ts, CommandHandler.ts, WorkerAdapter.ts, factories.ts, multiple .test.ts files). No centralized integration guide — cross-cutting concern left to agent to discover file-by-file.

<!-- session 53ae965f 2026-08-16 -->

- Template variable syntax `${{ }}` vs alternatives not clearly documented — correction was needed mid-refactoring (line 07:28:29 shows agent correction on format)
- Daemon response handling and executionId flow is undocumented — agent ac93/a106 traced through compiled singleton-daemon-kit JS, tested Commander option aliases, manually connected client send() to health-server response wrapping. **Why:** Missing docs on how `createDaemonClient().send()` transforms CommandHandler return values into executionId. **How to apply:** Document daemon IPC protocol: what CommandHandler returns → what client receives → what CLI prints.
- FlowDefinition schema validation rules unclear — multiple greps for "additionalProperties", "unknownKey", "validField" across multiple sessions. **Why:** Agents uncertain whether fields like `env` are allowed, what validation error messages mean. **How to apply:** Document which FlowDefinition fields are allowed vs forbidden; link schema validator to actual Zod/validation implementation.
- Template context schema changed (removed `task`, renamed `output→outputs`) but changes weren't documented; fork agents had to reverse-engineer the shape via investigation + test runs.
- Windows daemon port-file location (~/.flow-daemon/config.port) and @wadeck/singleton-daemon-kit internals required extensive Bash exploration; should be documented.
- Template injection risk in flow model steps — when using multi-line templates with Claude output, must escape special characters or use safe patterns. Lesson added to lessons-learned but pattern not yet formalized in code or schema docs.
- Model step tool logging documented mid-implementation (new file: `model-step-tool-logging.md` at 13:29:01) — feature underspecified before development; consider upfront spec for model streaming behavior.

<!-- session 08efa22d 2026-08-16 -->

- singleton-daemon-kit event semantics and interaction with flow-engine state machine required extensive code inspection + test-driven debugging; integration points not well documented
- npm workspace package shadowing solution (file: protocol in package.json) and undeclared output key validation rules weren't documented pre-incident; both were discovered mid-task and added to lessons-learned.
- Template injection risk in model step outputs (multiline patterns with user data) only surfaced during integration testing (agent ac3a), suggesting security implications weren't captured in initial spec.
- Tool logging/streaming path across ScriptExecutor → StreamEventMapper → WorkerAdapter required reverse-engineering via multiple grep/read cycles, then a dedicated doc (`model-step-tool-logging.md`) had to be written. Complex cross-component LLM streaming semantics should be documented upfront in architecture docs.

<!-- session e9472617 2026-08-16 -->

- Skills (check, get-timestamp, subprocess, SendMessage) marked "NOT YET KNOWN" when first invoked by forked agents, despite being in deferred tool list. Fork agents don't inherit parent session's tool visibility.
- OutputVariableConfig schema (jsonpath field) not documented in flow docs — agents spent 8+ minutes (08:04-08:13) grepping for output extraction patterns before implementing.
- Daemon response protocol for executionId undocumented — agents/user spent 20+ minutes (08:57-09:18) reverse-engineering how singleton-daemon-kit wraps responses, investigating CommandHandler return values, reading compiled .js to understand send() contract.
- Workspace dependency resolution strategy is unclear—evidenced by three consecutive edits to flow-cli/package.json (10:51–10:52) attempting "workspace:" protocol, each followed by npm install. Decision appears to be: use root-level `overrides` to force local resolution. This pattern needs documented guidance.
- agent-browser skill has undocumented mode constraints (headless-only, custom browser parameters) requiring custom SKILL.md patches; skill definition or help text is incomplete.
- task-model2.yml rewritten 5+ times across 30 min (13:02:47 → 13:31:09) with different content each time—no clear contract for what this test fixture covers; used as scratch pad for streaming, tool logging, writeOutput tests.
- Plugin system spec requires 4 audit/fix rounds (audit at 13:32:12, fixes at 13:35:41, 13:40:44, 13:45:43) with fresh HIGH/CRITICAL findings each round—suggests spec was either incomplete at start or audit process lacks upfront rigor to catch issues in one pass.
- Pattern of test mode changes (`mode: 'manual'` → `mode: 'isolated'`) across multiple files suggests significant configuration change, but unclear if comprehensive or partially applied across codebase.

<!-- session d300bfbf 2026-08-16 -->

- Daemon response protocol not documented — agent had to reverse-engineer singleton-daemon-kit library code to understand {result: ...} wrapper and executionId handling. Took ~15 min of grepping/reading through compiled JS.
- Flow schema validation rules unclear — multiple attempts to add `env` field to FlowDefinition, then validator rejections. Allowed/disallowed fields should be explicitly listed.
- Model step `log` parameter undiscovered until integration testing — no spec/docs explaining it exists and is required; flow validation does not document that undeclared output keys must be caught (only discovered during test failure); skill `kill-port` not recognized ("NOT YET KNOWN"); skills `subprocess`, `goldfish`, `agent-browser` failed with "NOT YET KNOWN" when user tried to invoke them

<!-- session bd4052a0 2026-08-16 -->

- `--inputs` vs `--input` CLI flag discrepancy: docs claim `--inputs` but CLI only accepts `--input`
- npm workspace shadowing: no project doc on `file:../` vs scoped packages tradeoff. User had to research industry practice with ChatGPT/Gemini.
- Skill frontmatter spec unclear — no doc listing valid fields. Agent invented `constraints` without reference.
- Model step `log: streaming` behavior undocumented. Agent didn't know that Claude in agentique mode (`-p`) emits only final `assistant` event, silencing tool calls.
- `writeOutput` on step outputs is undocumented — user had to ask how to use the feature
- Conflated `when:` condition syntax (`outputs.field`) with template rendering (`${{ output[...] }}`) — they use different contexts and interpolation rules
- JSONPath support for OutputVariableConfig was undocumented — agent had to extensively grep flow docs (08:08:38-08:09:12 lines) to understand expected syntax, eventually requiring implementation of jsonpath field
- CLI-daemon IPC protocol and singleton-daemon-kit integration not well-documented — user spent 20+ minutes grepping node_modules/.js files, reading .flow-daemon directory structure, and reverse-engineering response/result wrapping to understand how `sendToDaemon()` handles executionId and responses.
- `when:` condition evaluation context shape and available variables unclear — required refactoring across ConditionEvaluator, FlowScheduler, and SimulationValidator. The distinction between `task.*`, `output.*`, and newly-added `outputs.*` (dot-notation conversion) suggests prior ambiguity about what data should be accessible in conditions.
- agent-browser skill: user left note preferring headless-only mode (11:12:07) — skill default allows GUI browser, causing friction; should document/gate this
- System shows deferred tool warnings but doesn't guide users to load them via ToolSearch
- Provider implementations (workspace-provider, approval-provider, provider-types) appeared across multiple fix rounds, indicating the provider pattern spec was incomplete or unclear initially.

<!-- session 5b7b2b1a 2026-08-16 -->

- Feature wiring between flow-engine and flow-cli wasn't documented — required explicit audit (grep for: loop, retry, timeout, captureOutput, cancel, skip, iteration) to identify which engine features weren't available in CLI
- User had to extensively search code (07:57-08:04) to understand how projectDir flows through FlowEngine/FlowCLI — no clear doc on context propagation through the system.
- Agent made 8+ grep attempts (08:08:46+) searching "flow docs" output for output extraction / jsonpath docs — command structure or docs may be unclear.
- When: condition evaluation context shape changed significantly (task metadata removed, output field renamed) but no schema or migration guide documented—code readers must grep ConditionEvaluator to understand what's available.
- npm workspace package shadowing (multiple registry installs shadowing local packages) — extensive investigation cycle needed to isolate root cause in WorkerAdapter. Solution: `file:` protocol in package.json dependencies. Now documented in lessons-learned.

<!-- session 576b7d8d 2026-08-16 -->

- `workspaceDir` requirement was not consistently documented in type signatures — had to be added retroactively to Protocol.ts, CommandHandler.ts, WorkerAdapter.ts test fixtures after failures.
- Flow validation rules (depends vs dependsOn, workspace.reusePolicy requirement) caused repeated test failures; constraint is in memory but not enforced early in test setup.
- Daemon IPC response protocol not documented — agent reversed-engineered node_modules/@wadeck/singleton-daemon-kit to understand result wrapping, handler response structure, and how client extracts execution results. This took multiple rounds of grep/cat through minified dist files.
- OutputVariableConfig schema and validation rules unclear — extensive searching for pattern/jsonpath field support, where to add new fields, which validators enforce strictness. SchemaValidator checks not obvious.
- Step failure & loop handling required extensive reads across Daemon.ts, CommandHandler.ts, ExecutionStore.ts, FlowScheduler.ts — flow control state machine semantics not clearly documented; "step_failed" event handling and loop iteration restart conditions were discovered via code archaeology, not docs.
- Model step logging architecture (onStepLog callbacks, liveLogEntries, tool-call parameter passing through WorkerAdapter → StepRunner → ClaudeLauncher) was not documented; required 40+ commands of code tracing to understand the full flow.
- Streaming log output and tool-call injection patterns needed significant iteration (claude-mock delays, timestamp tracking) — not adequately documented before agent attempted implementation.

<!-- session 32c17c8b 2026-08-16 -->

- ConditionContext interface and condition evaluation API not obvious from types.ts — had to trace through ConditionEvaluator.ts to understand how `when:` fields are evaluated; would benefit from example or docstring.
- workspace context structure (workspaceDir, how it serializes through IPC Protocol, lifecycle) not documented — only discovered via test failures that Protocol.ts message format was wrong.
- Daemon response handling opaque — how executionId flows from CommandHandler back to RunCommand required extensive investigation; no protocol docs found.
- Flow validation rules undocumented — multiple validation errors required trial-and-error to determine which fields are allowed in FlowDefinition (env field, jsonpath field); SchemaValidator.ts modified multiple times (lines 08:12:48, 08:20:52).
- Multiple diagnostic bash commands exploring daemon port files, launcher config, Windows PATH (09:20-09:27) suggest daemon/launcher architecture is underdocumented — future daemon work will need this.
- At 13:00:08–13:00:15, three skills blocked/unknown in sequence: subprocess (doc-audit), subprocess (security audit), goldfish. Agent fell back to bash file reads instead. Suggests skill availability or permission documentation was unclear to the agents running at that time.
- Spec audit/fix process required at least 2 rounds (13:27 "Fix HIGH/CRITICAL", then 13:35 "Fix round 2 HIGH"). Suggests either spec consistency rules weren't fully documented upfront, or audit tool reports issues in tiers, causing fixes to cascade.

<!-- session 92cb6ce8 2026-08-16 -->

- Skill availability discovery: both `get-timestamp` and `subprocess` skills were marked "NOT YET KNOWN" during execution, causing brief blockers. Skills need to be pre-listed or lazy-loaded more transparently.
- singleton-daemon-kit internals undocumented: agent a106 spent 10+ minutes reverse-engineering `node_modules/@wadeck/singleton-daemon-kit/dist/` to understand response format, spawn behavior, and result wrapping (09:01–09:13). No project docs on daemon client protocol or executionId return timing.
- CommandHandler `allowAbsolutePaths` configuration option not obvious; discovered via grep + manual instantiation site inspection (09:16–09:16:50). No docstrings or comments explaining when/why to set it.
- User spent 11:12-11:20 manually reading agent-browser SKILL.md and writing temp analysis files — suggests skill documentation was unclear or agent misapplied it (headless-only mode preference was not being honored).
- Verbose mode behavior (`log: step` parameter vs CLI flags) wasn't immediately clear — required grep investigation of multiple files to understand; should be documented in flow definition schema or step reference

<!-- session 543d9d83 2026-08-16 -->

- Skills "check", "subprocess", "get-timestamp" showed NOT YET KNOWN warnings (22:50:07, 22:53:45, 06:46:08), forcing agent to use bash workarounds or re-invoke.
- Daemon response handling in @wadeck/singleton-daemon-kit required extensive investigation (08:56:37–09:20:04) — reading dist files to understand client.send() response format, executionId return, and result wrapping; type definitions or JSDoc would have saved round-trips.
- when: context shape underwent major refactoring (task.field → outputs[stepId].field, then task removed entirely) across 5+ test files — abstraction was underspecified and repeatedly refactored.
- kill-port skill was not available in initial attempt — user had to manually kill process with cmd.exe taskkill /PID
- Flow-level `log: step` parameter and its effect on verbosity/streaming behavior may not be discoverable or clearly documented in code comments.

<!-- session e65b2ff1 2026-08-16 -->

- Skills "check", "subprocess", "get-timestamp" requested but marked "NOT YET KNOWN" — discoverability/availability issue with skill definitions
- Daemon response protocol (how executionId is returned, response wrapping by singleton-daemon-kit) is not documented in project context — agent had to read node_modules code to discover that responses are wrapped with `{ result: {...} }` structure instead of being returned directly.
- npm workspace shadowing (flow-engine rogue copy in flow-cli/node_modules) required 8-minute investigation; no monorepo troubleshooting docs exist for detecting/preventing nested workspace bundling.
- Loop/retry execution flow (step failure → cleanup → next iteration vs. exit) unclear; debugging took 7+ minutes with multiple identical test runs to understand state machine.
- npm workspace package shadowing fix (file: protocol vs workspace protocol) not documented — captured only in lessons-learned.md after the fact. Model step logging requirements (parameter name, mock Claude, log extraction) required investigation; not in FlowCapabilitiesGenerator or flow docs.
- Verbose mode behavior not clearly documented; mismatch between expected CLI flag and actual `log: step` parameter caused agent misconception

<!-- session e98523b0 2026-08-16 -->

- Spec files read at start but not used; implementation started without clear TDD plan despite 4-phase FlowScheduler refactoring being complex
- Daemon IPC protocol (request/response format, executionId return path) not documented — agent a106 reverse-engineered from decompiled singleton-daemon-kit code (09:12-09:15) instead of having a clear contract.
- TemplateContext available variables undocumented — taskMetadata and task.\* should NOT be exposed to condition evaluators
- agent-browser skill limitation (headless-only mode) discovered mid-session and documented as lesson-learned, suggesting skill docs don't state this constraint upfront.
- Configuration pattern for flow steps (e.g., `log: step` to enable verbose mode) not obvious enough to fork agents — had to be corrected after work started. Needs clearer design doc link in fork briefs.

<!-- session 686db9b5 2026-08-16 -->

- Plugin system work requires reading all spec files before answering design questions — user explicitly instructed this at session start, suggesting specs-driven approach is critical for this domain.
- Daemon IPC response handling required extensive exploration of node_modules/@wadeck/singleton-daemon-kit internals (client.js, health-server.js) to understand how executionId is returned — daemon communication contract undocumented in project
- CommandHandler's allowAbsolutePaths parameter discovered via code search rather than clear naming/comments — suggests low visibility of this configuration point
- Skills marked "NOT YET KNOWN" at 13:00 (subprocess, goldfish, kill-port) — skill registration or availability documentation is incomplete or skills aren't discoverable by ToolSearch when agent context is stale.
- Tool logging feature (model-step-tool-logging.md) newly documented — indicates feature complexity; future work on model steps needs this reference to understand toolLog, request_user_input, streaming interactions.

<!-- session f716f570 2026-08-16 -->

- Plan file mentions "FlowOrchestrator.ts path is contradictory — orchestration/ vs executor/" but contradiction is not resolved in session. File naming/structure expectations should be documented in naming-conventions.md or similar.

<!-- session f5ca1287 2026-08-15 -->

- Configuration inheritance pattern (global `~/.task/config.yml` + project overrides) wasn't documented in spec — user had to clarify it by referencing wdrive pattern. Environment variable injection for hooks (TASK_PROJECT_NAME, TASK_PROJECT_PATH) is essential but wasn't obvious.
- Module resolution in monorepo with path aliases: reference guide needed showing how to interpret tsc --traceResolution output, when to check node_modules symlinks vs dist-types, expected directory structure for re-exports, and how path aliases are resolved through tsconfig inheritance chain.

<!-- session 0b3d4416 2026-06-19 -->

- Mock ESM import patterns unclear — multiple attempts to fix mockImplementation/mockReturnValue in vitest tests before settling on correct pattern. Project lacks clear examples for mocking flow-engine exports.
- Flow skill definition (flow/SKILL.md) required extensive iteration to document generation constraints (model preferences, flow structure rules, output format). This detail wasn't obvious from code alone—consider linking skill docs to architecture docs or constraint definitions.

<!-- session 44b25955 2026-08-09 -->

- Multiple parallel agents (ae2b, a3fe, a359, ac24) independently read the same spec files (specs/2026-07-30-flow-cli/\*) without coordination — no apparent way for agents to share cached reads or coordinate queries
- Specs lack cross-reference index for decisions (agents repeatedly grep for D23, D31, D34, D37 instead of locating them directly). Consider adding decision quick-reference or anchor links.
- Implementation details like daemon working directory semantics, ValidationError format, WebSocket v1 reconnection logic are not centrally documented—agents hunt for them via pattern-matching (grep daemon cwd, grep ValidationError, grep WebSocket.\*reconnect) rather than finding direct references.
- Workspace validation behavior wasn't clearly documented — agent performed multiple grep searches for `workspace.*validation`, `validateWorkspace`, `WorkspaceConfig.*required`, `DeclaredWorkspace` across codebase
- Worker spawning strategy (pre-spawn vs on-demand vs pool sizing) was unclear — agent searched repeatedly for `spawn.*step`, `spawn.*worker`, `on.*demand`, `pre.*spawn`, `WorkerPool` terms

<!-- session 5ca40801 2026-08-09 -->

- Skills get-timestamp, check, goldfish-review invoked with WARN "NOT YET KNOWN"—caused delays and permission prompts. Pre-define skill SKILL.md files before user invokes them, or add schema checks upstream.
- Multiple iterations of implementation-prompt.md (23:34:48 → 23:37:09 → 23:40:03 → 23:40:14) after goldfish checks, with final message "Fix goldfish gaps in implementation prompt" — initial prompt was incomplete; goldfish identified missing context.
- Core types (WorkspaceConfig, DeclaredWorkspaceProvider, InputSpec) required manual grep searches — types.ts lacks comment documentation of these abstractions, forcing discovery work.
- Log-streaming.md and decisions.md required chunk-based reads with offsets — specs exceed practical single-pass size; split into smaller focused docs or add navigation index.

<!-- session e99131f8 2026-08-09 -->

- Deferred tools (check, get-timestamp, ReportFindings, ToolSearch) showed "NOT YET KNOWN" errors during use, causing workflow delays — need explicit ToolSearch fetch before invocation
- Repeated grep searches for "secrets model", "validation error format", "D31|D34|D37", "daemon uses cwd", "ValidationError", "WebSocket.\*v1|reconnect" indicate these architectural decisions are buried in code or scattered across specs instead of being documented upfront — developers must search instead of read

<!-- session 95b0dc3a 2026-08-09 -->

- Skill definitions for "check", "goldfish-review", and "get-timestamp" returned "NOT YET KNOWN" warnings (22:18:38, 22:23:24, 22:51:27) — required manual Bash workarounds. Skills should be documented or pre-loaded before session starts work that depends on them.
- Decisions in `specs/2026-07-30-flow-cli/decisions.md` are referenced by ID (D31, D34, D37) but difficult to locate—multiple agents chunked-read and grepped for specific patterns, suggesting poor indexing. Add decision IDs as searchable anchors or a table of contents.
- When goldfish-review skill fails, the workaround (manual prompt construction + claude CLI bypass) was successful but suggests the skill's availability or invocation requirements should be better documented

<!-- session c16a2058 2026-08-08 -->

- Goldfish review methodology not documented internally — agents WebFetch'd external Medium article multiple times to understand the concept before user created goldfish-review SKILL.md. Internal documentation for specialized review processes should exist before agents attempt them.
- `goldfish-review` skill marked "NOT YET KNOWN" at 22:51:27, forcing user to work around it: create manual temp files + `--dangerously-skip-permissions` bash invocations instead of using the skill directly.
- Flow-cli decision references (D23, D31, D34, D37) searched multiple times across goldfish iterations — decision document may lack clear indexing or cross-references to make patterns locatable

<!-- session 0e725353 2026-08-08 -->

- User emphasized "return FULL content verbatim. Do not summarize" after agent summarized files — indicates implicit expectation not being met; agents may need explicit framing around when verbatim vs. summarized is expected
- Spec-to-code references (D31/D34/D37 decision IDs, secrets model format, DAGValidator usage) triggered multiple bash grepping sessions with no clear resolution, suggesting specs may not map to implementation or implementation is incomplete.
- Large decision files (decisions.md: 800+ lines) require paging through by line offset to find specific decisions — needs better structure or indexed reference layer so agents can find cross-dependencies without chunking reads.

<!-- session 75bdb797 2026-08-08 -->

- WebFetch struggled fetching Medium article with multiple retries and cache variations (22:24:28 onwards) — external resources may need fallback docs or local copies for spec review patterns.
- Goldfish-review skill appears in the available skills list but was not discoverable at runtime — this forced a manual workaround pattern that is error-prone and not idiomatic (bash + temp files instead of Skill tool).

<!-- session e3b9ff5f 2026-08-08 -->

- Repeated grep searches for specific decision references (D31, D34, D37, secrets., validation error format, singleton-daemon-kit) — these details require grep hunts rather than being discoverable from spec structure; consider adding decision index or cross-reference map.
- Code patterns (ValidationError usage, WebSocket reconnection, daemon `cwd` handling) required multiple grep searches to discover; document existing implementation patterns in `.claude/docs/` or `.claude/kb/lessons-learned.md` to avoid repeated discovery work

<!-- session 33c79da6 2026-08-08 -->

- Skills called but marked "NOT YET KNOWN": claude-api, check, get-timestamp — skill availability or registration issue
- Multiple Grep searches for variants of same concept (cancel/CANCELLED/cancelled, session/sessionId/session-id) — spec terminology inconsistency made single-pass search insufficient

<!-- session e02d6bbb 2026-08-08 -->

- WebFetch redirects needed to find Claude Code CLI documentation on MCP/tool support — no local reference available for "Claude Code supports X" questions

<!-- session a11d7129 2026-08-08 -->

- Skills "claude-api" (21:11:29), "check" (22:18:38), "get-timestamp" (22:03:24), and "goldfish-review" were marked NOT YET KNOWN or required manual SKILL.md creation (22:28:03) — skill registry/discovery system incomplete
- Extended WebFetch loop (21:24:55–22:26:53) needed multiple retries to fetch Claude Code CLI documentation — suggests official docs are missing or unclear about custom tools/CLI capabilities
- goldfish-review skill unavailable at 22:51:27, forcing manual workaround: prompts written to temp files (.claude/temp/goldfish-prompt-\*.txt) then executed via subprocess. Skill availability/loading not transparent to agents.

<!-- session f8f7b481 2026-08-08 -->

- Missing/unresolved agent/skill definitions (goldfish-review, check) causing "NOT YET KNOWN" warnings and delays.
- Spec files are read in fragmented chunks (100 lines, 150 lines, etc.) rather than whole-file, indicating large/complex specs that lack clear section indices for navigation and contribute to multiple redundant reads across agents.

<!-- session b273c373 2026-08-08 -->

- Claude Code CLI custom tools / tool definitions support was not documented in available references; assistant had to fetch external Medium article to research goldfish review methodology; consider adding to `.claude/docs/` if this is a design pattern the project uses.
- Decision reference system (D31, D34, D37) appears in grep searches but no visible documentation about numbering scheme or decision structure.

<!-- session 1d9d9b8b 2026-08-08 -->

- "check" skill invoked as "NOT YET KNOWN" despite being referenced in CLAUDE.md as required after each task — skill availability not documented or skill definition incomplete.
- goldfish-review skill invoked before being defined — created mid-session (22:28:12) but pattern suggests it should have been pre-existing or documented earlier.
- goldfish-review skill was unknown/unavailable at 2026-08-08 23:51:27, causing user to work around it with manual temp files and bash subprocess calls instead of using integrated skill

<!-- session 6c4d20b9 2026-08-08 -->

- Architectural decision index (D1-D36) requires grep searches across multiple files to find related decisions — no centralized cross-reference or dependency graph exists; queries like "D28|CANCELLED|cancelled" repeated across 4 parallel agents.
- Claude Code CLI capabilities for custom tools in print mode required external WebFetch research to Medium articles instead of being in CLAUDE.md or internal docs.
- Cancellation semantics (D28), subtask/parent relationships, and dependency handling (depends, onFailure) required multiple grep passes across specs — architectural patterns not indexed or summarized.
- User runs `claude --dangerously-skip-permissions -p "You are a fresh engineer with zero context..."` subprocess tests multiple times with identical prompt to validate specs — suggests specs may lack sufficient stand-alone completeness or examples for context-free onboarding

<!-- session f39ed56c 2026-08-08 -->

- Assistant created `.claude/docs/collaboration-rules.md` mid-session (21:51:36) and edited `CLAUDE.md` — suggests collaboration patterns and agent delegation rules weren't previously documented in the codebase

<!-- session 757d92d0 2026-08-08 -->

- "check" skill and "claude-api" skill referenced at runtime but not yet defined — user discovers availability at point of use rather than via upfront documentation.

<!-- session 91f855f6 2026-08-08 -->

- Incomplete user query at start ("Tell me everything that is missed: faulty assumptions...") cut off mid-sentence with no visible error or clarification request
- Goldfish review process established as a custom skill (22:28:12) mid-session; now codified in .claude/skills/goldfish-review/SKILL.md
- Agent made multiple partial reads of types.ts (offsets 1, 80, 30→413, 40→980) rather than one full read, suggesting either file is too large/monolithic or types lack clear organization/indexing

<!-- session 2fb9fc7d 2026-08-08 -->

- Claude Code CLI capabilities (MCP in -p mode, custom tool support, streaming protocol details) required external WebFetch — not available in built-in knowledge.

<!-- session 66f53dff 2026-08-08 -->

- Had to fetch external goldfish review methodology from Medium article — this pattern/framework should be documented locally (e.g., in CLAUDE.md or .claude/docs/) for consistent application without external lookups.

<!-- session cac4885a 2026-07-30 -->

- Spec file required three separate coherence audits (1, 2, 3+4) to surface issues. 30+ cross-file corrections needed in decisions.md, execution-model.md, ipc-protocol.md, daemon-lifecycle.md (D16, D23, D24, D12, C1, M1, M5, G6, G7, H3, L3, L2, M4, etc.). Suggests spec was underspecified or ambiguous before audit loops.

<!-- session 43383cfd 2026-08-02 -->

- process.env inheritance security threat flagged in ScriptExecutor/ClaudeLauncher but specific threat model details unclear

<!-- session 1e242f45 2026-07-30 -->

- CLAUDE.md specifies "delegate to sub-agents early and often" but lacks: criteria for when/how multiple agents should work in parallel vs. sequentially, spec documentation standards that would reduce audit-fix cycles, or decision-log structure guidance (file references suggest D12, D13, etc. are decision markers but no spec schema is documented).

<!-- session 96446ac4 2026-07-30 -->

- SDK boundary wasn't explicit — the "SDK handles CLI↔daemon, nothing else" constraint needed to be stated upfront before designing worker communication
- Extensive Grep searches for domain concepts (RE-QUEUED, bufferSpill, reconnectTimeout, idleTimeout, drainTimeout, heartbeat monitoring, etc.) suggest spec lacks clear glossary or index of key terms. Future audits should define these upfront.

## Known constraints

<!-- session 5565878c 2026-08-22 -->

- Daemon restart cycle is manual: every code change requires `pkill worker.cjs` + rebuild bundle + restart (observed at 11:22:20, 12:51:16). No hot-reload mechanism; each iteration adds ~2–5 min overhead.
- ConfigDir.ts refactoring in shared-cli required explicit `npm run build` rebuild step and re-check cycle before downstream packages (flow-cli, task-cli) could resolve updated types — shared package changes trigger compilation dependencies
- Git unstaging: files (.idea/) staged despite .gitignore update required explicit `git rm --cached -r -f` cleanup, not automatically ignored by git
- TypeScript 7.0.2 breaks tsconfig: `baseUrl` support removed—forces removal across all tsconfig.json files (shared, base, all packages). Widespread change, not a simple version bump.
- typescript-eslint peer dependency conflict with TS7: requires npm `legacy-peer-deps` flag in .npmrc AND custom postinstall script (setup-eslint-ts6.cjs) to symlink typescript@6 into typescript-eslint's node_modules for ESLint compatibility (17:08:06, 17:08:16).
- ts-api-utils hardcodes `Intrinsic` type checks that fail in TS7—workaround is to keep typescript@6 available in a specific location for tools like eslint, not a true fix.
- TypeScript 7 migration required coordinated tsconfig edits across 6+ packages + npm install cycle (17:22-17:23 → 17:28:50) — complex interdependencies between configs; single file edit rarely resolves all issues.
- CalVer version extraction from URL requires careful regex (Project ID 84445653 embedded in registry URL) — brittle if URL format changes; hardcoding vs. parametrization trade-off not documented.
- TypeScript config path resolution changes required cascading edits across 3 separate `tsconfig.json` files (tsconfig.shared.json, tsconfig.build.json, tsconfig.json) to propagate extends/references properly. Fragile point-to-point coupling.

<!-- session e76b8d9c 2026-08-21 -->

- `require.resolve()` in PluginLoader is a runtime call that esbuild doesn't resolve into bundles — remains as filesystem lookup that fails in bundled CLI. Workaround: use `_require()` fallback.
- Bundled flow-cli needs separate worker.cjs bundled + explicit copy to global install. WorkerPool must detect bundled vs. dev mode via file existence check.
- Model ID format for Bedrock/OpenCode differs from displayed format: `amazon-bedrock/anthropic.claude-haiku-4-5` not `claude-haiku-4-5-20251001-v1:0`. Haiku-4-5 fails; Sonnet/Opus work.
- Launcher binary `flow.exe` configDir prefix is baked at build time (`defaultConfigDir` in config.json) — old installed binary stays out of sync with latest source.
- Mock-based testing is non-negotiable — user repeatedly enforces "avec opencode mock !" and "behavior must match reality". Real API calls in tests are forbidden; only mocked OpenCode/Claude.
- Sub-agents (backend-dev fork) frequently lack Bash tool, causing repeated blocked test execution — Bash availability should be listed upfront or alternative verification path provided.
- Parallel agents (`4a2fd14d` and `e9704d0a`) working simultaneously without explicit message passing — coordinator had to send update during work, suggesting async handoff protocol needs definition.
- File locks on Windows node_modules (lightningcss binaries) — use `check-parallel-agents` skill to detect if another agent is holding resources before attempting cleanup.
- npm publish in monorepos: cannot use `npm publish --workspace "packages/$pkg"` (npm 10+ dropped workspace support for publish) — use `(cd "packages/$pkg" && npm publish)` or `npm publish --prefix` instead.
- Optional dependencies with `"*"` version constraint fail npm registry resolution — use `">=0.0.0-0"` instead; affects platform-specific optional packages.
- Windows npm spawning requires `npm.cmd` or `shell:true` — bare `npm` fails via spawnSync. Monorepo uses OS/CPU-tagged platform packages (@wadeck scoped CLIs) that cause install failures without workspace exclusions in package.json.
- Long build gaps (2+ hours between 17:16→19:17 and 19:22→21:37) suggest TypeScript compilation or test suite is blocking; no intermediate status updates during these pauses.

<!-- session acc25325 2026-08-19 -->

- User workflow: test manually first (`flow run --wait <file.yml`), verify actual output, then write test cases. Never assume CLI behavior — verify.
- Sub-steps (nested steps inside a step) do not exist in flow-engine — not implemented, not in specs, not planned. Confirmed through investigation. Useful to document to avoid feature requests.
- writeOutput cleanup has a missing release() call for shared workspaces — file persistence is intentional, but workspace lifecycle management is incomplete. Verified bug.
- Type checking deferred until very end (21:09:49) catches errors only after many edits; should run tsc after each implementation phase to fail fast.
- Git remote branch references need explicit fetch or commit hash: agent made 5+ attempts to read `origin/laptop-cli:.claude/specs/...` with syntax variations before falling back to `git show 1dd3cd6:...` (commit hash). POSIX shell quote handling and git refspec syntax are error-prone in agent subprocesses — pre-fetch remotes or use explicit commit refs.
- Two concurrent backend-dev agents with overlapping work indicates context efficiency issue — delegation guidance says "early and often" but not "in parallel on same task."

<!-- session 1dcbd5b4 2026-08-21 -->

- GitLab npm auth in workflows uses group-level registry (api/v4/packages/npm/) for @wadeck scoped packages, but package-lock.json requires the same — if regenerating lockfile after workflow changes, must rebuild to sync both sources.

<!-- session 2157a0f8 2026-08-20 -->

- Project spawned fork agent mid-session (22:01:07) for orthogonal policy-rules work while main backend-dev agents continued — parallel work on unrelated features consumed context without clear dependency tracking.
- ESM module mocking in Node.js tests: process.exit mocks must accept `string | number | null` (not just `number`) because exit codes can be null on SIGTERM or string on named signals — discovered when writing CliCommand.test.ts, fixed via sed on mock signatures.
- Composite TypeScript projects (flow-cli → flow-engine references) risk masking type errors if test files aren't excluded from tsconfig build. `npm test` passes but `npm run build` fails until exclusions are fixed — caught after multiple audit runs.
- StepRunner/executor configuration validation (Check 4/5) in CliCommand.ts is tightly coupled to self-check.md — changes to executor detection logic require updating self-check.md in parallel.
- Security fix involving null byte injection validation required multiple refinement cycles (test edits → agent review → source edits → format/check); pattern suggests fixes to security validation require careful verification beyond syntax/type checks.

<!-- session 6d59c129 2026-08-20 -->

- "check", "run-test", and "run" skills repeatedly reported as "NOT YET KNOWN" across ~2 minute span — suggests agent attempted to call unavailable skills multiple times without first using ToolSearch to load them
- Audit-then-fix workflow pattern: fork agents spawn independently for quality/security/consistency audits, then backend-dev agent synthesizes and fixes findings — requires explicit coordination and clear output contracts from audit agents so fixes know what to target
- CLI distribution self-checks (Check 4: StepRunner, Check 5: PluginLoader) are embedded in CliCommand.ts/TaskCliCommand.ts as comments, not in a discoverable spec. Made it hard for agent to locate and verify checks without grepping.
- Iterative validation pattern observed: test edits → format/check → fork agent does targeted grep for specific code patterns. This workflow suggests complex validation requirements for this codebase that may benefit from a single comprehensive checklist upfront rather than iterative discovery.

<!-- session 0455fbe4 2026-08-20 -->

- Composite TypeScript references (flow-cli/flow-engine tsconfig setup) requires manual verification — at 19:30:42 and 19:30:51 agent had to check tsconfig.json to exclude test files before builds would pass.
- PluginLoader/StepRunner integration changes required updates to `.claude/specs/.../self-check.md` (Check 4 & 5) — docs were out of sync with implementation changes, caught during CLI self-check verification (20:30–32)

<!-- session 95141215 2026-08-20 -->

- ModelType and StepRunnerConfig changes required coordinated edits across 8+ interdependent files (types.ts, ModelStepExecutor, StepRunner, Worker, McpServer, WorkerAdapter, FlowCapabilitiesGenerator, SchemaValidator, ValidationRules). Build verification cycles had to filter noise (ContractValidator, test files) to identify real errors.
- Pre-existing TypeScript errors in `ContractValidator.test.ts` required tsconfig.json exclusion (`exclude: ["**/*.test.ts"]`) rather than fixing the test — composite package test exclusion pattern is now load-bearing for CI.
- OpenCode subprocess spawn() stdio configuration is security-sensitive (pipe vs inherit) — reviewed in pentest but no final guidance captured on correct pattern

<!-- session 9ae6da57 2026-08-20 -->

- File paths in stdin can have typos unprompted ("ClaudeModelProvider.t" missing .ts)—agent should validate file references exist before proceeding with requests.
- Cross-repo coordination: agent-fleet tasks triggered updates to singleton-daemon-kit (npm version bumps, CLAUDE.md creation); changes should be isolated or communication explicit when packages are interdependent.
- OpenCode integration required multiple experimental reads of OpenCodeModelProvider.ts at different line ranges (lines 60-140, 240-290, 313+) suggesting exploratory debugging; actual integration path not immediately obvious from code.

<!-- session 6211d754 2026-08-20 -->

- Multiple agents modifying the same files (Worker.ts, McpServer.ts, WorkerAdapter.ts) within seconds (22:12:08–22:14:54) — parallel agent use on overlapping code paths is inefficient; one coordinating agent would be faster.
- Test files for CliCommand/TaskCliCommand had type mismatch in process.exit mock (`_code?: number` vs `_code?: string | number | null`). Fixed via sed command (19:34:47) rather than refactored in test files — suggests generated test files may need post-processing validation or there's a pattern mismatch in mocking setup.
- npm registry configuration (@wadeck:registry URL) requires coordination across multiple projects; agent was delegated to verify consistency.

<!-- session a11724af 2026-08-20 -->

- Skill availability is opaque to agents — no graceful degradation when skills don't exist. Agents don't check availability before invoking; they discover failure via warning logs and retry identical calls.
- Integration tests require specific environment variable setup: OPENCODE_MOCK_PATH (path to mock script), OPENCODE_INTEGRATION=1 flag, and LAUNCHER_BUNDLE_OVERRIDE for bundle path. These appear repeatedly in test commands and suggest a pattern the team uses.
- process.exit mock must accept `string | number | null`, not just `number` — affects all CLI test suites. @wadeck npm registry URL configuration needs to be consistent across projects.

<!-- session 6c0c8a03 2026-08-19 -->

- yaml/js-yaml dependency lookup via grep [21:07:43] returned no results; implementation of parseYAML required a workaround instead of using standard library.
- Parallel agents re-reading spec files independently rather than sharing context (multiple sessions read all 6 OpenCode spec files in full). Good discipline but signals high cognitive load on validation phase—consider whether multiple review passes could be consolidated.

<!-- session 98c0936a 2026-08-19 -->

- Worker.ts daemon does NOT handle statusTransitions — confirmed via code inspection that the flow-cli daemon doesn't wire up statusTransitions at all, despite the type existing.
- Multiple agents editing `.claude/specs/2026-08-19_21-51_opencode-step-provider/_index.md` concurrently (e9704d0a: 20 edits between 20:49–21:08); no conflicts logged but high coordination overhead.
- Multiple git show commands accessing origin/laptop-cli branch (Worker.ts, StepExecutor.ts) — undocumented external branch dependency that could break silently if branch is deleted.
- package.json workspace edits (excluding platform packages, adding new package dirs) trigger full npm reinstall multiple times — workspace config changes have broad side effects requiring verification.

<!-- session 1c8332e4 2026-08-19 -->

- `/spec` and `/violations` skills referenced but not available in this session's skill list — attempted invocation failed gracefully but delayed work.
- Multiple parallel agents (acc25325, e9704d0a, 4a2fd14d) working simultaneously on specs and code fixes — high concurrency and good context efficiency, but coordination risk if agents edit overlapping files (e.g., multiple edits to opencode-step-provider spec files).
- Session references `origin/laptop-cli` branch via git show — new CLI packages may depend on code not yet in integration/main branch, blocking eventual npm publish

<!-- session 3f2a20af 2026-08-19 -->

- Multiple concurrent sessions (4+ session IDs active simultaneously) indicate heavy parallel workload; all agents running background tasks without blocking user
- Spec quality gates require multi-pass audits: security pentest + goldfish coherence review run in parallel forks, each triggering file edits, then both audit types re-run (v2→v3→v4→v5 cycles). Expected pattern but worth documenting as "spec audit loops should batch all findings into single pass if possible"

<!-- session afdd4652 2026-08-19 -->

- Deferred tools require explicit schema loading. ToolSearch itself was initially unknown (20:29:23) before WebFetch calls succeeded (20:29:36/46), suggesting a two-step loading pattern for deferred tools.
- Heavy reliance on parallel fork agents for independent tasks (spec refinement, security audits, test implementation, bundling). Three concurrent spec documents being edited iteratively (opencode-step-provider, policy-engine, cli-distribution) with goldfish/security reviews → fixes → re-review cycle.
- Multiple fork agents spawned for spec review (pentest + goldfish audit + fixes applied iteratively). Pattern suggests v2, v3, v4 iterations of same review types within tight timespan (21:13:12–21:18:59), indicating either normal convergence cycle or potential instability in spec validation logic.

<!-- session 66138a84 2026-08-19 -->

- Multiple tool/skill invocations were attempted without pre-loading their schemas: WebFetch (20:29:23), spec skill (19:51:32), violations skill (20:47:34) all triggered **\_ NOT YET KNOWN _** warnings. Pre-fetch deferred tools via ToolSearch before calling them, or accept the round-trip.
- Complex cross-repo coordination across agent-fleet, singleton-daemon-kit, violations-framework, laptop-cli branch — multiple agents reading/writing to different projects without clear isolation or sequencing (21:04:55 onwards: multiple sessions reading spec files + origin/laptop-cli branch simultaneously).
- LoopHandler test file is in `packages/flow-engine/src/processing/LoopHandler.test.ts`, not in an `orchestration/` directory. May indicate unclear naming or documentation about which module owns loop handling.

<!-- session da343929 2026-08-19 -->

- WebFetch was used to fetch external opencode.ai docs to understand MCP config format, implying the project's codebase or local docs don't have clear examples of the configuration structure needed for integration.
- Skill calls with scoped arguments fail silently (e.g., `skill=check | args=packages/flow-cli` returns "NOT YET KNOWN"); skills may not accept positional args via log interface
- Multi-stage spec review workflow: pentest fixes → goldfish coherence check → final security audit (lines 21, 24, 32). Each stage re-reads all spec files independently. This is a deliberate review process, not a bug — preserve if user prefers thorough sequential audits over single pass.

<!-- session 55a79144 2026-08-19 -->

- Spec editing workflow involves repeated single-occurrence replacements across multiple spec files (10+ sequential edits on \_index.md, step-model-integration.md, etc.) — consider batching these into fewer, larger writes to reduce edit overhead
- CLI bundle delivery requires `npm run bundle:all` to combine multiple esbuild outputs (flow.cjs, task.cjs, flow-updater.cjs) — rebuild pattern is: tsc build → bundle:all → verify with node dist-bundle/flow.cjs --version

<!-- session de603161 2026-08-19 -->

- Test flow YAML files created manually and validated only at runtime with `flow run --wait` — no schema validation or IDE tooling catches errors before execution; leads to edit-and-retry cycle
- Bulk sed updates to test fixtures (adding `source: 'auto-discovered'` and `name:` fields) broke TypeScript types in ContractValidator.test.ts, requiring multiple tsc re-runs and iterations to validate.
- The `flow-engine` package organizes test files by responsibility/layer (`src/processing/` for loop/output handling) not by concept (`src/orchestration/`). Future sessions should verify actual test locations rather than inferring from class names.

<!-- session 274a5f98 2026-08-19 -->

- Multiple features appear incomplete or scattered: statusTransitions not wired in daemon worker, contract validation fields exist but preProcess/postProcess not called in execution path, event triggers checked but not fully integrated. Should be listed as "pending" or "not yet wired" in architecture docs to avoid misleading audits.
- Bundle scripts added to flow-cli package.json (bundle, bundle:task, bundle:updater) but test of `npm run bundle:all` at 21:06:51 showed build failures — backend-dev agent created bundles but type errors in ContractValidator.test.ts weren't caught pre-build, delaying validation.

<!-- session e9704d0a 2026-08-19 -->

- User prefers phased delivery: start with simpler scope (Option B), plan enhancement for v2 (Option C) rather than full-scope implementation upfront.

<!-- session 4a2fd14d 2026-08-17 -->

- `execFile` captures stdout/stderr by default (not `stdio: 'inherit'`), making hook output invisible in terminal. User explicitly asked for `debug: true` flag to fix visibility. This is a real API limitation that affects testing experience.
- Plugin resolution must complete before workspace manager access — wiring order matters. Discovered during Phase 9 implementation when CommandHandler needed to resolve plugins before Daemon uses WorkspaceManager.
- Hook system has implicit onError callback requirement at all dispatch() call sites — audit found some callers in CommandHandler/Daemon missing error propagation, creating silent failure paths.
- FlowConfig refactoring (DaemonConfig → FlowConfig) is larger than file rename — impacts config loading merge logic in RunCommand and daemon initialization. Requires coordinated import updates across daemon and CLI layers.
- Workspace cleanup configuration does not exist; agent had to invent retention/pruning strategy from first principles across multiple files (FlowConfig, WorkspaceManager, Daemon).
- StepRunner, WorkspaceManager, CommandHandler all spawned parallel refactoring agents in single session — recurring God class scaling issue in codebase.
- Deferred tools (ReportFindings) and skills (check, run-test, violations) marked NOT YET KNOWN when agents tried direct invocation — auto-fetch or pre-fetch needed.
- Circular dependency pattern: WorkspaceAllocationError and workspace types must be extracted to separate WorkspaceTypes.ts file to avoid circular imports between WorkspaceManager and WorkspaceGitStrategy

<!-- session 5cc3e4d9 2026-08-17 -->

- Parallel agent sessions with MCP tool calls may have unpredictable schema visibility. Tool schema fetch via ToolSearch does not guarantee immediate availability for tool invocation in the same session.
- DaemonConfig → FlowConfig bulk refactoring required cascading sed replacements across multiple files (Daemon.ts, CommandHandler.ts, RunCommand.ts, FlowConfig.test.ts) — no upfront verification that all call sites would be found and updated consistently.

<!-- session d0c7ba90 2026-08-17 -->

- Plugin resolver/loader integration points are scattered (RunCommand, Daemon, CommandHandler, ConfigLoader) — configuration wiring path unclear enough to require multiple grep passes and fork investigation

<!-- session 5ddbec02 2026-08-16 -->

- Multiple concurrent fork agents worked on overlapping flow-engine/flow-cli test failures — some redundancy in parallel reads/edits across abe1fc8, adae, ab1c sessions.
- Skill "spec" returned "NOT YET KNOWN" warning at 07:48:04 but execution continued — unclear if skill availability is eventual, has fallback, or false warning.
- npm workspace protocol allows duplicate nested packages (`flow-engine` in `flow-cli/node_modules`) — shadowing issue only detected at 10:53, should be enforced earlier (via violations framework rule added).
- User preference explicitly sent to agent (11:10): "Stop web fetching, use only local files" — agent-browser and WebFetch tools should be avoided; lessons-learned already updated but should be added to project memory to persist across sessions.
- Plugin system spec underwent 4 rounds of fixes for HIGH/CRITICAL findings (audit → round 2 → round 3 → round 4). Initial spec approval missed ambiguities; independent subprocess audit uncovered gaps. Specs need more rigorous initial review or earlier audit passes.
- WebSocketServer modification at 14:42 added port retry logic but EADDRINUSE root cause (test isolation? lingering process?) not investigated—reactive workaround rather than diagnosis.
- Session continuation modes (append/fork/compact) decomposed into separate agent forks (a56a, a0cc, a6e1) rather than monolithic change — suggests high complexity or interdependencies; each mode required integration test validation before proceeding to next mode.
- ESLint forbids `export *` in addition to being sensitive to .mjs parsing errors — exclude testing files pattern wasn't stable until final eslint.config.mjs edit (16:45:01)
- ClaudeLauncher.ts mcpConfigPath flag behavior required iterative fixes to Pick<> type at 19:53-19:54 — sensitive type constraints should be validated before parallel agent spawning. Large cross-cutting refactorings (@flow/\* scope rename + em-dashes removal) need upfront validation to catch type/lint issues early, not iteratively via npm run check.

<!-- session c898dd1a 2026-08-16 -->

- w-guardrails hook blocks `rm` / `rm -rf` commands on Windows, requiring user manual intervention. Agent cannot delete directories; must ask user to run `rm -rf packages/plugin-sdk` directly.
- Concurrent agent execution on overlapping file paths causes corruption (file writes race condition). Only one agent at a time per file set — document this before user attempts parallel agents.
- Windows path handling differs from Unix — tests need platform-aware validation (use `path.sep`, check drive letters). Initial Unix-only paths failed on Windows.
- ES module import cache causes test pollution when dynamically loading modules — need unique temporary directories per test to avoid cache collisions between test runs.
- ESLint baseIgnores pattern must exclude ALL non-config .mjs files broadly (`**/*.mjs` except known config paths), not just specific ones, to prevent parsing errors.
- Path calculations in tests are fragile — PluginResolver needed 3 levels up from `src/config/` to reach `packages/`; similar issue pattern will recur when adding CLI config loaders
- When implementing context passing through task CLI (projectDir → TASK_PROJECT_DIR env var → FlowOrchestrator → StepRunner), the flow requires understanding TaskIndex, FlowDefinition.env, and step.env. Document this contract explicitly.
- CommandHandler instantiation requires allowAbsolutePaths flag derived from flow config (line 218 fix) — constraint not obvious from constructor signature, discovered via inspection during bug hunt
- npm workspace protocol can silently install from registry even when workspace dependency exists — solution is "file:" protocol (non-obvious; documented post-discovery in lessons-learned.md)
- Model step execution has multiple subtle compatibility bugs in WorkerAdapter (streamJson, tracingConfig, output extraction) — only visible via integration tests, not unit tests
- Windows Git Bash environment: basic `netstat` + `taskkill` commands failed to free port 47824 reliably. Multiple retries (12:58:27–12:58:51) finally succeeded via `cmd.exe /c "taskkill /PID 27364 /F"` — raw Unix commands insufficient for Win32 process management in MSYS2.
- Workspace metadata separation: outputs must write to `workspace.metaDir/outputs`, NOT directly to workspace dir. User explicitly verified with: `ls /c/Workspace_Tooling/_test-tasks/.agent-fleet/workspaces/ | grep .meta/outputs`
- Integration tests (task-model2.yml, task-session-append.yml) taking 60+ seconds without visible feedback on worker pool or WebSocket server startup — slow path not diagnosed or documented.
- SendMessage tool also failed to load ("NOT YET KNOWN" at 17:05). Deferred tools may require explicit ToolSearch fetch before use in forked agents, not just listed availability.
- Two separate agent sessions (c898dd1a and bd4052a0) running concurrently starting 19:41 on overlapping plugin/MCP code — a2d3 fork doing package scope refactoring (@flow/_ → @agent-fleet/_) while a06f fork working on MCP server features; risk of missed updates or conflicting changes in shared files
- TypeScript build doesn't fail fast — session shows repeated pattern: `npm run build` → `grep "error TS"` → `cat ts-errors.log` → fix. Using a tighter feedback loop (e.g., `npx tsc --noEmit` with `--bail` equivalent) would cut round-trips.

<!-- session 75a0bd3d 2026-08-16 -->

- In spec mode with user expertise clear: prioritize capturing decisions over proposing alternatives. User corrected naming (`plugins.` prefix), semantics (`use:` = instance name, not type path), and scope multiple times—spec is for documentation, not redesign.
- Skill lookups failing — `get-timestamp` and `subprocess` not in registry, causing workarounds (bash script, manual subprocess ID). Skills listed in system-reminder but not resolving via Skill tool call.
- Worker fork boilerplate states "NOT a continuation of that agent" — appears 3× in chunk, indicating established pattern but also potential context loss between fork phases if forks diverge.
- Map.get()! is an identified anti-pattern: agent a183 (07:44) explicitly searches for ".get()!" patterns (non-null assertions on Map operations) to fix with TDD, indicating this should be caught earlier (linting, code review, or architectural guidance)
- npm workspace shadowing breaks daemon singleton — when child package has node_modules/@wadeck/singleton-daemon-kit, it shadows root version and breaks daemon client. Solution: use npm overrides in root package.json to force consistent version from root (applied 10:51-10:53).
- `when:` condition context API changed significantly — removed `task` field, renamed `output` to `outputs` with step-id keying. Spread across multiple test files and ConditionEvaluator (lines 09:49-09:53), needs migration notes or deprecation warning for existing flows.
- Template injection vulnerability: model step outputs used in script templates can inject shell commands. Documented at 12:42:13 as RC (release critical) risk. Safe pattern: use YAML multiline (`|-`) to preserve literal output without template interpretation.
- Deferred tool calls must be loaded via ToolSearch before invocation; attempting direct calls on deferred tools results in InputValidationError. System-reminder lists deferred tools but doesn't signal which ones need schema fetch before use.
- WebSocket daemon port binding conflicts (EADDRINUSE) required fixes to WebSocketServer.ts and WorkerPool.ts wsPort handling during execution tests — this is a recurring pain point needing better error handling or port selection logic.
- Session files resolve to `.claude/projects/` not workspace metaDir — this directory structure choice wasn't obvious and required plugin investigation to confirm.

<!-- session e453d841 2026-08-16 -->

- Skill `get-timestamp` not yet implemented — user worked around it with direct Node.js script (2026-08-15 22:50:07)
- Skill `subprocess` not yet available — attempted invocation blocked (2026-08-15 22:53:45)
- Skill `check` not yet available — attempted invocation blocked (2026-08-16 06:45:08)
- Windows path handling in flow validate command works as-is (C:\Workspace_Tooling\...) despite POSIX shell — no path conversion needed.
- Daemon client-daemon communication via port files (~/.flow-daemon/config.port, managed by @wadeck/singleton-daemon-kit) is undocumented in flow-cli source; requires inspecting node_modules to understand the mechanism.
- WebSocketServer port binding fails without retry/backoff — flow execution hangs when daemon can't bind port; requires EADDRINUSE handling in start() method.
- Workspace interface refactoring (outputsDir → metaDir) is cross-cutting — changes in types.ts require cascading updates across StepRunner.ts, factories.ts, test files, and protocol definitions; agents need coordination to avoid missed references.

<!-- session 7d4fb045 2026-08-16 -->

- StepQueue→FlowScheduler deprecation took multiple iterations (completely replaced at 06:42:42/06:44:31/06:44:38/06:44:44) instead of being clearly stated once. Related: BackoffStrategy type had to be grepped for (06:43:03), not obvious from context.
- Skill system ("spec", "run") not yet known on first use attempt (07:48, 07:52) — required manual discovery; indicates skill loader may need pre-warming or indexing.
- Workspace dependency resolution: npm creates shadow copies of workspace packages (flow-engine in flow-cli/node_modules) even with workspace: protocol; requires root package.json `overrides` to suppress — workflow pattern not obvious from package structure alone.
- npm workspace package shadowing: local workspace packages can silently resolve to registry instead if dependency record exists in wrong context. Fix (file: protocol in package.json) required multi-stage investigation of npm resolution behavior before safe application.
- Plugin system spec files (`2026-08-16_09-48_plugin-system`) required 4+ iterative audit-fix rounds with CRITICAL/HIGH findings in each round (lines 13:27:46, 13:35:41, 13:40:44, 13:45:43). Pattern suggests either incomplete spec design upfront or validator discovering issues incrementally; worth documenting final stable state for next work.
- Implementing `metaDir` field required explicit `npm run build` for flow-engine (line 14:28:40) before flow-cli's TypeScript compilation could resolve type changes. Indicates strict composite tsconfig build-order dependency — changes to flow-engine types must be built before dependent packages can compile.

<!-- session 53ae965f 2026-08-16 -->

- Skills `subprocess`, `check`, `get-timestamp` called but show "NOT YET KNOWN" — verify definitions or correct names in future calls
- Multiple incremental rebuilds (`npm run build --workspace=flow-cli`) triggered after imports fixed, dependency resolution between packages is fragile. **Why:** flow-cli imports from flow-engine not immediately available after edits; requires rebuild cycle. **How to apply:** Document monorepo build order; consider whether flow-cli should use workspace file paths or built artifacts.
- Windows npm workspace dependencies can silently resolve to node_modules copies instead of workspace links; requires `overrides` in root package.json to force workspace protocol resolution.
- Windows flow CLI requires .exe/.cmd binaries for cmd.exe execution; Git Bash shell scripts alone won't work for background daemon invocation.
- Loop/retry step failure handling has undefined behavior — step_failed event doesn't properly break out of loops; requires debug logging and state tracking via ExecutionStore.markStepCompleted/markStepFailed.
- npm workspace packages can shadow by installing from registry even when workspace dependency exists. Fix: use `file:` protocol in package.json (e.g., `"flow-engine": "file:../flow-engine"`). Root cause: npm resolves workspace dependencies only when running from monorepo root; relative installs bypass workspace protocol.
- task-model2.yml used as central validation artifact for multiple independent features (streaming, tool logging, writeOutput) — tightly coupled test; clarify test strategy scope and whether this file should be modularized.
- Workspace interface change required updates across 7+ files (types.ts, WorkspaceManager.ts, StepRunner.ts, CommandHandler.ts, WorkerAdapter.ts, test factories, test files) — coordination overhead for interface-level changes in monorepo with multiple packages.

<!-- session 08efa22d 2026-08-16 -->

- Skills invoked but marked NOT YET KNOWN: `check` (06:45:08), `subprocess` (22:53:45), `get-timestamp` (22:50:12), `SendMessage` (07:28:29) — no pre-loading or schema available at call time.
- Heavy grep-before-edit pattern: searching for test names, variable types, specific assertions (e.g., "rejects.toThrow", "StepOutput", "when condition") before modifying. Suggests test file structure/naming conventions not self-documenting.
- Daemon state lives in `~/.flow-daemon/` with date-keyed NDJSON logs; multiple agents implementing related features (jsonpath, --project-dir, TASK_PROJECT_DIR, --inputs) in parallel will need coordinated merge strategy to avoid conflicts at daemon integration points.
- Workspace packages can be shadowed by npm workspace resolution if not explicitly using overrides in root package.json — manifests as silent nested node_modules/flow-engine copies that break CLI imports
- when: context for conditions must be step-id keyed structure (not flat key-value pairs), else template rendering fails during condition evaluation
- Flow retry/loop logic depends on proper daemon event flow (step_failed, step_completed) — missing event propagation causes flows to get stuck mid-execution
- Windows cmd.exe taskkill is unreliable; user retried multiple times (12:55-12:58) — prefer Node.js child_process.execSync for cross-platform reliability.
- Plugin system spec required 4+ audit-fix rounds (rounds 1–4 visible in 13:27:46 onward). Single-pass spec validation finds HIGH/CRITICAL issues but misses others; either spec complexity is high or audit criteria incomplete—future specs of similar scope may need multi-round validation built in.
- After modifying exported types in packages/flow-engine, must run `npm run build` before downstream package TS checks will resolve imports — tsc --noEmit alone won't pick up the dist-types updates. Agent discovered this through iterative TS error checking cycles rather than doing it upfront.

<!-- session e9472617 2026-08-16 -->

- Parallel fork agents used extensively for independent work — session spawns 3+ concurrent forks around 22:17, then again at 06:59 for reviews. Plan-driven refactoring: write plan (10k chars) → next session executes in TDD phases with iterative test/edit cycles.
- Skills `/spec` and `/run` marked "NOT YET KNOWN" at 08:04, forcing user to manually create spec folder and investigate run mechanics. Skills appear to resolve later in session.
- Fork agent (10:53:34) suddenly switched to violations-framework repo (sibling workspace) while main agent continued testing in agent-fleet. Parallel work across repos without explicit sync or shared context may mask integration failures.
- npm workspace package shadowing — npm will install from registry even when an identically-named workspace package exists at root; workaround: use `"file:../flow-engine"` protocol in package.json to force workspace resolution.
- Model step output handling in flow-cli has 3 edge cases: streamJson config missing from executionConfig, Claude response undefined when execution fails, OutputExtractor returns empty string instead of failing.
- Skill discovery broken for subprocess, goldfish, kill-port — tools return "NOT YET KNOWN" instead of loading; registry lookup or ToolSearch may be incomplete.
- TypeScript cache requires `--force` flag after large refactors; `--noEmit` alone insufficient for full rebuild detection.

<!-- session d300bfbf 2026-08-16 -->

- CommandHandler requires explicit `allowAbsolutePaths` flag to accept --project-dir arguments. Not obvious from usage, required reading constructor signature.
- Workspace package shadowing: despite `workspace: flow-engine` in flow-cli/package.json, npm installs duplicate copy in node_modules — fix requires `overrides` in root package.json to pin workspace path (commit 10:52-10:53).
- Condition context design changed: removed `task` object from when: evaluation context, renamed `output` → `outputs` (plural), added dot notation conversion for template paths. Affects ConditionEvaluator, FlowScheduler, validation, and tests. Step-id keyed context, not flat.
- npm workspace package shadowing — rogue packages install locally in `node_modules` when running `npm` from a subpackage context (even though workspace protocol should prevent it); ClaudeLauncher requires test mocks (claude-mock.mjs) for model step testing — not straightforward; Windows Git Bash environment uses mixed path formats (POSIX `/c/...` and Windows `C:\...`), can cause subtle command failures
- Spec audit required four consecutive fix rounds (13:27:46 → 13:35:41 → 13:40:44 → 13:45:43) to resolve HIGH/CRITICAL findings — indicates either systemic issues in spec or iterative audit-fix-reaudit pattern is normal for this project.

<!-- session bd4052a0 2026-08-16 -->

- Daemon is a separate process (Go launcher + Node child) — TypeScript debug logs added to source won't appear; need to be in built binary or use external logging
- Retry logic in StepRunner silences attempt #1 logs — logs only visible on final attempt. Architectural mismatch: retry should be in FlowScheduler for full observability.
- Skipped steps (when: false) remain pending in ExecutionStore and never get marked completed — execution hangs until scheduler/handler explicitly marks them done
- Windows requires elevation to create symlinks — tests using symlinks fail without conditional logic or alternative approaches
- npm workspace shadowing occurs when `npm install` runs from inside a subpackage instead of repo root — use `file:` protocol or enforce install-from-root to prevent registry packages shadowing workspace packages
- Path traversal validation is critical for writeOutput feature — must block `../` patterns to prevent RCE via template injection
- File deletion not available in this environment — use empty stub files as workaround. Vitest requires at least one test suite per file, so stubs must contain placeholder `describe` blocks.
- dist-types from flow-engine must be built (`npx tsc --build`) before importing via named exports — use direct path imports as fallback to avoid resolution errors.
- Memory system guardrail: writes to `~/.claude/projects/.../memory/` are blocked; correct location is project-relative `./.claude/memory/`.
- Pre-existing test failures (FlowRegistry validation, TemplateValidator auto-discovery) blocked workflow — isolation strategy needed (stubs, skipped tests, parallel agent forks) to avoid cascading fixes.
- Multiple deferred skills failed to load on first use: "check" (06:45:08), "run" (07:52:42), "flow" (08:04:07), and tool "SendMessage" (07:28:22 ToolSearch) — caused workflow delays; skills should be pre-loaded or error should be more explicit
- npm workspace package shadowing: workspace protocol doesn't prevent registry install; rogue `packages/flow-cli/node_modules/flow-engine` appears alongside symlink. Workaround: use npm `overrides` field or `file://` protocol to force exclusion. See lessons-learned.md note "npm workspace package shadowing — solution et limitations"
- Deferred skills (kill-port, subprocess, goldfish) require explicit ToolSearch before use — user attempted them without loading first, forcing fallbacks
- Large multi-file specs (plugin-system) required security audit and multiple fix rounds (round 2 HIGH, round 3 HIGH/CRITICAL), suggesting upfront peer review would catch clarity/correctness issues earlier than post-creation audits.

<!-- session 5b7b2b1a 2026-08-16 -->

- flow-engine had pre-existing test failures across multiple files (FlowRegistry, TemplateValidator, UserInterventionValidation) requiring multi-phase investigation and fixes — tests not running in regular CI
- Daemon response handler doesn't return `executionId` to client (09:13-09:20 shows user debugging this through node_modules/@wadeck/singleton-daemon-kit instead of finding docs). User spent 6+ minutes investigating IPC protocol manually.
- Step failure handling spans 4 layers (ScriptExecutor exception → WorkerAdapter catch → CommandHandler onStepFailed → Daemon step_failed event), making root-cause debugging require reading multiple files. No integration test covering the full failure→retry→next-step path.
- Skills `subprocess`, `goldfish`, `kill-port` called but reported "NOT YET KNOWN" in logs (13:00:08, 13:00:11, 13:00:15, 12:55:49). Schema loading lag or availability issue; user continued trying despite warnings.
- Process cleanup issues: port 47824 hung (likely dev server), required manual `taskkill /PID 27364 /F` (12:58:38-12:58:51). No auto-cleanup or port management observed.
- Spec audit required 3 rounds of fixes: initial audit found issues → agent a3e0 fixed HIGH/CRITICAL → audit round 2 found more → agent ab24 fixed → audit round 3 found more → agent a928 fixed. Suggests either incomplete initial audit or issues that only surfaced after earlier fixes.

<!-- session 576b7d8d 2026-08-16 -->

- Test characterization vs unit tests pattern (`FlowScheduler.characterization.test.ts` created separately) — need explicit guidance on when each is used upfront to avoid later refactoring.
- Recursive condition evaluation in FlowOrchestrator.when tests requires special handling; nested `when:` template scanning was the blocker for several test suites.
- CommandHandler had `allowAbsolutePaths: false` which blocked absolute flow paths — constraint wasn't obvious; user discovered it via validation failures, then changed to `true`. This should be documented or the default reconsidered.
- task-retry.yml and task-loop.yml were rewritten 3+ times (10:55, 10:56, 10:57) with small variations, indicating trial-and-error on flow YAML syntax or semantics rather than clear specification.
- npm workspace package shadowing: bare package names in dependencies can resolve from npm registry instead of workspace packages, even when workspace package exists; mitigation is "file:../path" or "workspace:\*" protocol in package.json.
- Spec auditing uses subprocess skill (doc-audit, goldfish validation) as part of development workflow — comprehensive doc validation is now part of checklist.

<!-- session 32c17c8b 2026-08-16 -->

- Template interpolation syntax: `${{ }}` is standard, NOT legacy (user correction at 07:28:29) — establish as convention.
- Workspace shadowing (flow-engine appearing in flow-cli/node_modules despite workspace: protocol) required npm overrides + new violation rule no-workspace-shadow (10:50-10:58) — this is an npm behavior, now systematized but should be documented.
- User preference: when debugging npm/workspace issues, use only local tools and files — do not web fetch. Blocked an agent fork at 11:10:55 with message "Stop web fetching, use only local files". Preference explicitly saved to memory afterward (11:12:07).
- Spec files (plugin-manifest.md, plugin-architecture.md, plugin-violation-rules.md, threat-model.md, workspace-provider.md, approval-provider.md, extension-points.md) have cross-file consistency dependencies—edits often span multiple files in coordinated sequences.

<!-- session 92cb6ce8 2026-08-16 -->

- File path hunting required many grep iterations to locate context-passing layers (workspaceDir definition site). Consider adding a reference doc mapping "where X is passed through the execution chain" for complex multi-layer features.
- Flow validation schema for `env` field behavior required iterative testing (multiple `flow validate` runs on task-handle-conditional.yml). User was learning rules by trial-and-error rather than from spec.
- Workspace shadowing problem (lines 10:51:47–10:53:12): flow-engine npm module was incorrectly installed in flow-cli/node_modules despite workspace: protocol. Requires root package.json override + npm install retry cycle — not idempotent without overrides block.
- Loop/retry step-failure handling required tracing through ExecutionStore, markStepFailed lifecycle, and Daemon state machine (lines 10:58:56–11:06:27) — no clear trace path for how step failure propagates to retry/loop evaluation.
- subprocess and SendMessage skills showed as "NOT YET KNOWN" early (13:17:18, 13:31:50) but became available later — suggests dynamic tool loading or context initialization delay

<!-- session 543d9d83 2026-08-16 -->

- FlowScheduler refactoring (4 phases, committed c249bf0) required tight flow-engine/flow-cli coordination with cascading test failures; plan written upfront (2026-08-16_flow-scheduler-refactor.md) but still needed ~20 iterative fixes during execution.
- CommandHandler.allowAbsolutePaths configuration at daemon instantiation (line 48 in Daemon.ts) gates absolute path support in flows — easy to miss when spawning daemon.
- npm creates nested copies of flow-engine in flow-cli/node_modules/ despite workspace: protocol — requires explicit overrides in root package.json + no-workspace-shadow violation rule to prevent.
- npm workspace package shadowing: if package.json specifies `"flow-engine": "^X.Y.Z"` (registry version), npm will install from registry even when it's a workspace package; fix is to use `"flow-engine": "workspace:*"` or `"file:../flow-engine"` protocol
- Template injection risk in flow scripts: multi-line model outputs can break YAML if not properly escaped/quoted — requires safe pattern documentation

<!-- session e65b2ff1 2026-08-16 -->

- Multi-package refactoring (FlowScheduler extraction across flow-engine and flow-cli) required coordinated type/import updates in 4+ files across 2 packages to maintain build stability
- Flow CLI daemon communicates via singleton-daemon-kit IPC with response wrapping; executionId is nested in response structure and must be extracted before returning to user.
- TemplateRenderer must be exported from flow-engine/index.ts before CommandHandler can import it — discovered via TypeScript error mid-task.
- Windows: taskkill requires `cmd.exe /c` wrapper; POSIX kill/netstat don't work reliably. Flow validation: undeclared output keys (`steps.X.output` keys not in `outputs:`) should error during validate — was missing, had to add ValidationCode.UNDECLARED_OUTPUT_KEY.
- Path traversal validation added to writeOutput validation in SchemaValidator (13:28+) — file path safety is a security requirement for output configs

<!-- session e98523b0 2026-08-16 -->

- Multiple parallel fork agents (ac7f, aecb, adae, ab1c, a25c) working on coordinated refactoring — caused high context overhead and missed consolidation opportunities
- Skills (spec, run, flow) reported as "NOT YET KNOWN" (07:49, 07:52, 08:04) but agent proceeded anyway — suggests skill resolution may fail silently or skills aren't pre-loaded in subagent context.
- Loop iteration state requires proper step-flag management (markStepRunning/markStepCompleted reset); flows stuck without it, not just iteration counting
- when: context shape is step-id keyed, not flat object; task.\* and taskMetadata references don't exist and cause silent failures
- workspace: protocol with file paths requires npm overrides in root package.json to prevent node_modules shadowing of local packages
- npm workspace package shadowing: when running `npm install` from a subdirectory, npm may fetch a shadowing registry package instead of using the workspace reference. Fix: explicitly use `"file:"` protocol or update package.json from root. Documented as root cause for flow-cli importing wrong flow-engine version.
- Agent-to-agent communication via SendMessage shown at 13:17:18 as problematic — correction had to be sent mid-execution. Suggests fork agents need better pre-briefing on architectural constraints before starting.
- Spec files (plugin system, `.claude/specs/2026-08-16_09-48_plugin-system/`) being edited concurrently with code changes in forks (a3e0 made ~20+ edits). Spec/implementation drift risk if spec changes aren't coordinated with code changes.

<!-- session 686db9b5 2026-08-16 -->

- Multiple tools/skills appear unavailable in agent contexts (subprocess, check, get-timestamp, SendMessage all show "NOT YET KNOWN" warnings) — these are documented skills but not propagated to fork agents.
- Template interpolation / projectDir context passing required multiple grep passes across TemplateRenderer, FlowOrchestrator, CLI to understand flow — architectural layer boundary unclear
- npm workspace: protocol in flow-cli/package.json causes resolution to find a stale copy of flow-engine; use overrides in root package.json instead.
- Loop/retry flows failed repeated re-entry detection; multiple debug iterations (10:55–11:06) added logging but root cause (step state tracking in hasFailed/markStepFailed) not fully resolved in chunk 3.
- Model step logging requires mock Claude for testing — ClaudeLauncher now supports test-mode injection; pattern established but not documented in architecture.
- Path traversal validation being added to SchemaValidator (writeOutput feature) — security-critical validation that needs explicit test coverage in FlowValidator.test.ts; future changes to output paths must validate against this rule.

<!-- session f716f570 2026-08-16 -->

- Multiple test failures across flow-engine and flow-cli required context fixes for `workspaceDir` / `workspacePath` / `DeclaredWorkspace` (FlowRegistry, TemplateValidator, UserInterventionValidation, SimulationValidator, TaskStore, StepQueue, WorkerAdapter). Indicates inconsistent context-passing patterns — should standardize or document the pattern once.

<!-- session f5ca1287 2026-08-15 -->

- Windows ESM loader requires `file://` URL scheme in `--import` flag; relative path calculation from worker to loader is fragile (multiple attempts to get `../../../../` correct).
- TypeScript composite builds: `paths` in tsconfig doesn't reliably resolve cross-package imports in `--build` mode. Pre-existing `export { TaskStatus }` re-export bug in shared-orch-worker — type isn't locally available for use.
- Git commit hooks running full test suite cause 30s+ timeouts; user may need `--no-verify` or manual commit to unblock.
- tsx subprocess spawning requires non-obvious loader path discovery (tsx/cjs vs tsx/dist vs esm hook) — agent spent significant time inspecting node_modules/tsx/ package.json and dist/ structure to find correct require/node --loader invocation.

<!-- session b3d664fc 2026-08-15 -->

- Unused `package.json` bin entries don't expose CLI commands (TaskIndex.ts existed but wasn't callable until added to `package.json` `bin` section).
- Flow-cli implementation decisions are spec-driven at `specs/2026-07-30-flow-cli/` — consult before making CLI/launcher design choices.

<!-- session 0b3d4416 2026-06-19 -->

- flow-cli package NOT included in test-config.js — blocks `run-test` skill, requires manual `npm run test --workspace=flow-cli`. Test infrastructure assumes all packages in specific list.
- TypeScript path aliases with wildcards (`"flow-engine/*"`) do NOT resolve bare imports (`import from "flow-engine"`). Requires explicit bare-name entry: `"flow-engine": ["../flow-engine/src"]` in tsconfig paths.
- FlowCliRunner must load both flows.yml (built-in flows) AND flows-custom.yml (generated flows) via FlowRegistry, not just flows.yml.
- Flow CLI validation requires global npm linking (npm link in flow-cli package, then `flow --version` / `flow show` to verify entire build+link chain works).

<!-- session 44b25955 2026-08-09 -->

- Per CLAUDE.md: "Delegate to sub-agents early and often" — user is following this, with 4+ parallel agents spawned for spec reviews; sessions should anticipate this pattern
- Spec decisions were being clarified mid-analysis: edits to decisions.md, ipc-protocol.md, and implementation-prompt.md happening while planning agents ran (23:27–23:40 range). Indicates specs not finalized before delegating implementation work.
- goldfish-review skill was unknown at 2026-08-08 23:56:24 — skill loading/availability timing issue when agent attempted to use it
- Agent used `--dangerously-skip-permissions` for subprocess calls running spec validation — safety bypass required for goldfish review subprocesses

<!-- session 5ca40801 2026-08-09 -->

- Agent ae2b needed 20+ grep searches across specs to find scattered decision patterns (worker-register, CANCELLED, subtask, dependsOn, onFailure, etc.). Consolidate spec decisions into focused sections rather than spreading related content across files.

<!-- session e99131f8 2026-08-09 -->

- Cross-directory reads outside C:\Users\Wadeck\Workspace\_\_exp\agent-fleet require Bash fallback; Glob/Read fail silently with permissions
- `--dangerously-skip-permissions` used frequently during exploratory phases; user wants reduced permission friction when analyzing specs/code

<!-- session 95b0dc3a 2026-08-09 -->

- WebFetch attempts to goldfish article URL failed repeatedly across 10+ retries (22:24-22:27) with fallback to cached/alternate URLs — target URL or network conditions unreliable. Agent had to pursue alternative information sources.
- Agent used `--dangerously-skip-permissions` flag multiple times when calling claude CLI directly — this pattern may need explicit user authorization or documented fallback guidance

<!-- session c16a2058 2026-08-08 -->

- Specs follow a structured pattern: decisions.md (D1, D2, ...), open-questions.md (Q1, Q2, ...), scenarios.md, index.md — multiple specs coexist (2026-07-30-flow-cli, 2026-08-09-zones-attestations) with parallel coherence audit agents working efficiently on them.
- Skills are dynamically created in .claude/skills/ directory during sessions based on needs (e.g., goldfish-review SKILL.md created after research, not pre-existing).
- Heavy spec editing with multiple "Agent unknown" markers (22:35–22:47: 7 edits, 3 "unknown" labels) suggests spec definition was incomplete or incomplete agent coordination at task start.
- Permission workflow interrupted at iteration 5 — required `--dangerously-skip-permissions` flag to proceed, suggesting permission model friction for iterative spec validation

<!-- session 0e725353 2026-08-08 -->

- Heavy iteration on spec coherence (goldfish reviews, 4 concurrent audit agents, new goldfish-review SKILL written) — specs are being repeatedly validated, suggesting either incomplete up-front spec design or legitimate discovery process that could be streamlined

<!-- session 75bdb797 2026-08-08 -->

- Skills registry isn't discoverable upfront — user had to wait for "not yet known" warnings rather than checking what's available. Need explicit list or better discovery mechanism when delegating to agents.
- Heavy use of multi-agent parallelization (7+ agents visible simultaneously) editing overlapping spec documents — works but suggests tight coordination is needed to avoid conflicts. No tests or `check` skill runs visible in this chunk despite CLAUDE.md requirement.

<!-- session e3b9ff5f 2026-08-08 -->

- Pattern of writing temp prompt files (.claude/temp/goldfish-prompt-\*.txt) and spawning fresh agents via bash rather than using Agent tool — suggests deliberate "fresh context" analysis strategy aligns with CLAUDE.md guidance but implementation is brittle (bash-based).

<!-- session 33c79da6 2026-08-08 -->

- WebFetch loop for goldfish article with multiple redirects (medium.com → webcache → alternate URLs) — external dependency URL reliability issue
- goldfish-review skill not available in registry (attempted 2026-08-08 23:51:27) — user expected it but tool returned "NOT YET KNOWN"
- Multiple `claude --dangerously-skip-permissions` invocations from bash subprocesses — bypassing permission checks in automated flows, potential for unintended actions

<!-- session e02d6bbb 2026-08-08 -->

- Multiple spec audit cycles across 2026-07-30 through 2026-08-09 suggest iterative refinement of flow-cli decisions — new zones-attestations spec being developed in parallel

<!-- session a11d7129 2026-08-08 -->

- ToolSearch invoked for "select:WebFetch" at 22:24:11 but marked NOT YET KNOWN — deferred tools not loadable on demand before calling them
- Several bash commands logged with "No description provided" (e.g., [23:14:42], [23:14:45]). Agents lack context about operation purpose, possibly hindering error diagnosis when commands fail.

<!-- session f8f7b481 2026-08-08 -->

- User iteratively refining architectural specs with coherence audits across sessions; heavy parallel spec validation workflow.
- Subprocess claude invocations consistently use `--dangerously-skip-permissions` flag — appears to be a regular workaround pattern in this project for permission model constraints.

<!-- session b273c373 2026-08-08 -->

- Skill schemas must be fetched before invocation — attempting to call skills like `claude-api`, `check`, `get-timestamp` without first loading via ToolSearch causes WARN messages and fallback behavior; always call ToolSearch with `select:<skill_name>` before invoking unknown skills.
- User repeatedly uses `--dangerously-skip-permissions` flag for fresh engineer analysis passes. Indicates permission prompts are friction for this validated analytical workflow pattern.

<!-- session 1d9d9b8b 2026-08-08 -->

- Multiple sequential edits to decisions.md/scenarios.md/open-questions.md rather than batched updates — each edit appears independent but could have been combined.
- user repeatedly invokes subprocess claude with `--dangerously-skip-permissions` flag; this bypasses permission model and should be scoped (prefer explicit allowlist or lower-privilege invocation)

<!-- session 6c4d20b9 2026-08-08 -->

- Medium article fetch (goldfish review) blocked/rate-limited — 6 attempts via direct URL, cache, alternate domains before giving up; external research dependencies need fallback strategies.
- goldfish-review skill shows "NOT YET KNOWN" at 22:51:27 but is successfully invoked later — indicates skills may have deferred/lazy loading or the first attempt triggers loading

<!-- session f39ed56c 2026-08-08 -->

- User consistently spawns subprocess `claude` instances with `--dangerously-skip-permissions` flag for internal spec/planning work — established pattern for non-interactive flows.

<!-- session 757d92d0 2026-08-08 -->

- Newly created spec directories (2026-08-09-zones-attestations) are immediately followed by ~10 rapid edits to decisions.md, scenarios.md, open-questions.md fields — template or default content needs correction cycle.

<!-- session 91f855f6 2026-08-08 -->

- Deferred tool schemas (claude-api, get-timestamp, check) become "NOT YET KNOWN" on first lookup; agent worked around unavailable claude-api by using WebFetch + general-purpose agent instead of failing
- goldfish-review skill was "NOT YET KNOWN" at 22:51:27 when first attempted; later goldfish checks succeeded (23:02:00+), suggesting skill availability timing or initialization issue

<!-- session 2fb9fc7d 2026-08-08 -->

- Deferred tools (Skills, ReportFindings) must be loaded via ToolSearch before calling them, or they fail with "NOT YET KNOWN". Examples: claude-api, check, ReportFindings all hit this in session.

<!-- session 66f53dff 2026-08-08 -->

- Goldfish-review skill showed as "NOT YET KNOWN" at 22:51:27 despite being used. Skill availability/loading may need pre-warming or better discovery when agents attempt to use unavailable skills.

<!-- session 43383cfd 2026-08-02 -->

- Flow execution model is "organic" (living structure) — graph mutations occur at creation time, during execution, AND at completion; not a fixed pre-built DAG
- Step injection must support three distinct timing points for policy engine to function as designed
- Event indirection pattern (combined B + D) chosen for extensibility and gradual adoption progression

<!-- session 96446ac4 2026-07-30 -->

- For independent evaluations (code review, coherence audit), user prefers subprocess model (`claude --print` via Bash) over Agent tool subagents — subprocess gets fresh context, no harness inertia
- User wrote parse-jsonl.js workaround to parse JSONL logs (multiple edits 15:08–15:09), suggesting built-in tools don't handle JSONL parsing — future sessions may need this capability.
