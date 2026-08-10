# Lessons learned

<!-- Last updated: 2026-08-10T17:48:15.345Z -->

## Recurring feedback

<!-- session 249bf70f 2026-08-09 -->
- Plan files must have inline progress tracking (checkboxes, completion %). User emphasized resumability: "ton plan doit pouvoir être repris si tu crashes" — external task lists don't preserve state. Build progress markers INTO the spec file itself.

<!-- session d8d895df 2026-08-09 -->
- Bash flag `--dangerously-skip-permissions` used repeatedly in fresh-engineer prompts (23:12:17, 23:32:51, 23:40:24) to bypass security checks for analysis. Confirm this is intentional pattern and not a workaround for permission configuration issues.
- 15+ rapid edits to .claude/plans/2026-08-09-flow-cli-implementation.md (00:10–00:14) and implementation-prompt.md (multiple sequences) — suggests very granular incremental edits rather than consolidated changes

<!-- session 709369ee 2026-08-09 -->
- Multiple parallel agents (ae20, abf1, a272, a359, ac24, a3fe, ae2b) read identical spec files in same session without coordination — overlapping work; delegate once, not multiple times per question.
- Repeated file reads with line offsets instead of buffering context — inefficient token use; when reading chunks of same file, read once or batch contiguous ranges.
- User repeatedly calls `claude --dangerously-skip-permissions` with fresh-engineer prompts as subprocess, not via Agent tool — suggests permission prompts are friction during iterative spec validation
- Multiple Goldfish review passes needed (3+ iterations: prompt-1/2/3, then iter1/iter2) before implementation prompt stabilized — iterative refinement pattern, not one-pass validation
- Multiple goldfish review iterations (iter3 → iter4 → iter5 → iter5b) with interspersed file edits on both implementation-prompt.md and flow-cli-implementation.md plan; pattern suggests either incremental refinement working as intended, or uncertainty about spec/plan quality requiring multiple passes

<!-- session 4b92a7f9 2026-08-09 -->
- Technical reviews require full verbatim content, not summaries. User explicitly corrected: "Read all the following files completely and return their full content" after agent provided summaries.
- User invokes claude CLI with `--dangerously-skip-permissions` at least 4 times (23:42:59, 23:53:35, 23:55:43, 00:16:16). This workaround should be replaced with proper permission configuration in .claude/settings.json or project settings.

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
- Multiple parallel agents (general-purpose) spawn to read identical spec files and source locations (specs/2026-07-30-flow-cli/*, specs/2026-08-09-zones-attestations/*, packages/flow-engine/src/) — pattern suggests verification or stress-testing of specs, but creates redundant reads when results aren't explicitly shared between agents

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

<!-- session 249bf70f 2026-08-09 -->
- Started with `NodeNext` module resolution instead of checking existing monorepo patterns first (flow-engine uses `bundler`). Cost multiple compile attempts and a rebuild strategy pivot to esbuild.
- Architecture.md had ASCII box formatting errors (75 vs 76 char widths, inconsistent inner alignment) and topologically wrong dependency arrows. User called this out as "moche" — verify diagram correctness and alignment before committing documentation.
- ESM module mocking failed with `vi.fn()` — attempted to spy on McpServer export but ESM namespaces are read-only. Pivoted to factory injection pattern for testability.
- Top-level `main()` call in TaskIndex.ts executed during test import, breaking tests. Fixed with `import.meta.url === `file://${process.argv[1]}`  guard.

<!-- session d8d895df 2026-08-09 -->
- Implementation-prompt.md is write/edit cycled 8+ times (23:15:28→23:40:14) with each cycle preceded by fresh-engineer validation. Pattern suggests either specs are unstable or validation findings warrant foundational fixes rather than patches.
- goldfish-review skill invoked at 23:56:24 was unknown/not-yet-loaded — agent silently continued without retry, then switched to bash+external claude CLI calls as workaround
- Multiple Explore agents reading identical files in parallel (types.ts, ipc-protocol.md, execution-model.md, decisions.md) — inefficient duplication that violates the "delegate early and often" principle stated in CLAUDE.md; agents should coordinate work division or one agent should handle reads with results shared

<!-- session 709369ee 2026-08-09 -->
- goldfish-review agent fetched a Medium article instead of executing the intended review behavior — skill documentation or naming misleading about what task it performs.
- Multiple "Agent unknown" entries with descriptive task names — placeholder/incomplete agent initialization or test harness noise in logs.
- Plan file receives batch edits after agent analyses (23:38–23:40 block with targeted Greps: D23, daemon cwd, WebSocket, ValidationError) — suggests agent findings not clearly summarized, requiring manual dig-through to apply
- Multiple parallel Explore agents (efd0bc56, e99131f8, 5ca40801) launched around 00:01:30-00:03 reading same spec/source files; potential coordination gap or duplicate work in agent orchestration
- Multiple sequential Explore agents spawned for codebase investigation, causing redundant reads of `ipc-protocol.md`, `execution-model.md`, and `types.ts` — should coordinate with a single agent + comprehensive brief or give agents explicit context of prior findings

<!-- session 4b92a7f9 2026-08-09 -->
- Explore agent returned summaries when detailed analysis required; when user says "technical review", assume full context needed, not high-level navigation.
- Agent spent multiple rounds (WebFetch attempts) looking up "goldfish review" methodology externally instead of checking project documentation first.
- Goldfish review ran 3+ times on implementation-prompt with iterative rewrites (goldfish-prompt-1/2/3 → goldfish-iter1/2), indicating initial spec had gaps; should validate all spec documents through goldfish-review before marking ready for implementation.

<!-- session 44b25955 2026-08-09 -->
- Attempted to use skills before they existed or were loaded: get-timestamp (2026-08-08 22:04:24), check (2026-08-08 22:18:38), goldfish-review (2026-08-08 22:51:27) → all returned "NOT YET KNOWN" warnings; agent then wrote the missing goldfish-review skill definition
- ReportFindings tool call failed with "NOT YET KNOWN" (2026-08-08 22:13:42) — appears to be a deferred tool that wasn't fetched before use
- Multiple fresh-engineer CLI instances independently read entire spec suite (23:12:17, 23:32:51, 23:40:33) without leveraging prior analysis. Each reads the same 10+ spec files from scratch—context waste. Delegate with targeted reading scope or provide summary.

<!-- session 5ca40801 2026-08-09 -->
- Delegation to agent ae20 for spec gap analysis ran but didn't surface findings in main transcript—user had to command direct file reads instead. When delegating analysis tasks, ensure agent emits summary/findings to main context, not just reads into hidden memory.
- Deferred tool WebFetch required ToolSearch call first (agent a7eb at 22:24:11). Load tool schemas before launching agents that may need them, or surface schema-loading as early step.
- Grep searches for decision references (D31, D34, D37, D23) appear in logs without clear result handling — suggests decision IDs may not be indexed or linked in spec files, forcing manual search rather than direct lookup.
- Multiple grep searches for non-existent patterns (spawn-related: on.*demand, pre.*spawn, pool.*spawn) — agents assumed terminology from spec that doesn't exist in code; spec and implementation naming mismatch.
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
- Built spec incrementally without cross-document consistency checks. First pass had 20+ contradictions, second audit found 18. Pattern: coherence audits should run *during* design, not after. Lock decisions in one place, reference everywhere.
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

<!-- session 249bf70f 2026-08-09 -->
- testing-scenarios.md showed implementation details (`node dist/cli/index.js`) instead of user-facing commands (`flow`/`task`). Examples should assume post-deployment environment, not dev build paths.
- package.json `"bin"` entries were declared but no postinstall/linking setup documented. Unclear whether `npm link` or install should make commands available globally.
- Skills scope was unclear — flow-design skill wasn't created until explicitly requested. Should have proactively identified and delivered all skills named in the plan before marking implementation done.
- architecture.md has 5+ incorrect method names (e.g., `enqueueExec()` vs actual `enqueueExecution()`). Doc review at end of session found systematic drift between architecture.md and actual source code.

<!-- session d8d895df 2026-08-09 -->
- Custom skills (check, goldfish-review, get-timestamp) referenced but marked unknown initially; ReportFindings tool marked unknown when invoked — unclear whether skills need pre-registration or if deferred schema loading is expected behavior.
- Grep searches for `singleton-daemon-kit`, `DAGValidator`, `GraphValidator` (23:25:19-23:25:50) return no results. If these are expected abstractions from specs, they may be missing from codebase or named differently than documentation assumes.
- File reads with line-range parameters used repeatedly on same files (decisions.md read at lines 1–50, 200–500, 564–644, etc.) — suggests agent struggled to locate specific content, should have used Grep instead

<!-- session 709369ee 2026-08-09 -->
- Skill "check" and "goldfish-review" initially not recognized — skill registration/discovery mechanism unclear or skills not yet indexed at session start.
- Agents performed extensive Grep searches for undefined patterns (D28, CANCELLED, worker-register, Q24-Q30, bufferSpillMs, heartbeat monitoring) — spec lacks index/cross-reference; decisions and open questions not linked or queryable.
- Implementation prompt expanded mid-session (5416 → 6926 chars, then multiple edits) after Goldfish checks — initial spec had gaps or unclear sections that reviews surfaced
- goldfish-review skill showed as "NOT YET KNOWN" (2026-08-08 23:56:24), forcing fallback to manual claude CLI calls with --dangerously-skip-permissions; should clarify skill availability or correct invocation method

<!-- session 4b92a7f9 2026-08-09 -->
- "goldfish review" methodology not documented in project CLAUDE.md or skill definitions initially—required external research and later skill creation (22:28:12 SKILL.md write).
- Architectural decisions (D23, D31, D34, D37) referenced via grep searches but apparently hard to navigate — spec decisions.md should have a stable index or link anchor system for cross-referencing from implementation prompts.
- Secrets model, ValidationError format, and WebSocket protocol v1 details were search targets but results unclear — these should be extracted into a glossary or reference section, not buried in narrative.
- Daemon `cwd` parameter behavior required grep search to locate — should be documented in ipc-protocol.md or daemon-lifecycle.md with explicit usage examples.
- Workspace-related types require multiple grep searches with varying patterns (WorkspaceConfig, WorkspaceMode, DeclaredWorkspace, DeclaredWorkspaceProvider). Suggests scattered or unclear naming in codebase — add to lessons-learned with discovered type locations and intent.
- Multiple parallel Explore agents read overlapping spec/source files (specs/2026-07-30-flow-cli/decisions.md, packages/flow-engine/src/types.ts) — future exploratory tasks should be consolidated into a single focused search to reduce redundant reads.

<!-- session 44b25955 2026-08-09 -->
- Multiple parallel agents (ae2b, a3fe, a359, ac24) independently read the same spec files (specs/2026-07-30-flow-cli/*) without coordination — no apparent way for agents to share cached reads or coordinate queries
- Specs lack cross-reference index for decisions (agents repeatedly grep for D23, D31, D34, D37 instead of locating them directly). Consider adding decision quick-reference or anchor links.
- Implementation details like daemon working directory semantics, ValidationError format, WebSocket v1 reconnection logic are not centrally documented—agents hunt for them via pattern-matching (grep daemon cwd, grep ValidationError, grep WebSocket.*reconnect) rather than finding direct references.
- Workspace validation behavior wasn't clearly documented — agent performed multiple grep searches for `workspace.*validation`, `validateWorkspace`, `WorkspaceConfig.*required`, `DeclaredWorkspace` across codebase
- Worker spawning strategy (pre-spawn vs on-demand vs pool sizing) was unclear — agent searched repeatedly for `spawn.*step`, `spawn.*worker`, `on.*demand`, `pre.*spawn`, `WorkerPool` terms

<!-- session 5ca40801 2026-08-09 -->
- Skills get-timestamp, check, goldfish-review invoked with WARN "NOT YET KNOWN"—caused delays and permission prompts. Pre-define skill SKILL.md files before user invokes them, or add schema checks upstream.
- Multiple iterations of implementation-prompt.md (23:34:48 → 23:37:09 → 23:40:03 → 23:40:14) after goldfish checks, with final message "Fix goldfish gaps in implementation prompt" — initial prompt was incomplete; goldfish identified missing context.
- Core types (WorkspaceConfig, DeclaredWorkspaceProvider, InputSpec) required manual grep searches — types.ts lacks comment documentation of these abstractions, forcing discovery work.
- Log-streaming.md and decisions.md required chunk-based reads with offsets — specs exceed practical single-pass size; split into smaller focused docs or add navigation index.

<!-- session e99131f8 2026-08-09 -->
- Deferred tools (check, get-timestamp, ReportFindings, ToolSearch) showed "NOT YET KNOWN" errors during use, causing workflow delays — need explicit ToolSearch fetch before invocation
- Repeated grep searches for "secrets model", "validation error format", "D31|D34|D37", "daemon uses cwd", "ValidationError", "WebSocket.*v1|reconnect" indicate these architectural decisions are buried in code or scattered across specs instead of being documented upfront — developers must search instead of read

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
- goldfish-review skill unavailable at 22:51:27, forcing manual workaround: prompts written to temp files (.claude/temp/goldfish-prompt-*.txt) then executed via subprocess. Skill availability/loading not transparent to agents.

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

<!-- session 249bf70f 2026-08-09 -->
- Monorepo module resolution: some packages use `bundler` (no .js extensions), others need `NodeNext` (.js extensions required). Must inspect existing tsconfig patterns before choosing strategy. Check `tsconfig.base.json` and existing package configs.
- Cannot write skill files directly to `~/.claude/skills/` from agent (home directory permission boundary). Must deliver as repo files and document manual copy step, or ask user to authorize the write.
- ESM named exports cannot be mocked directly — use factory functions for injectable dependencies in tests.
- TypeScript `ts-errors.log` contains pre-existing noise from other packages' missing `dist-types` — ignore when validating flow-cli changes.

<!-- session d8d895df 2026-08-09 -->
- Project dynamically creates custom skills mid-session (e.g., goldfish-review SKILL.md); specs follow formalized date-prefixed structure with standard files (index.md, decisions.md, scenarios.md, open-questions.md, implementation-prompt.md); multiple parallel agents for concurrent spec reviews (coherence, goldfish, consistency, quality) is expected workflow.
- Multiple goldfish verification cycles running in rapid succession (fresh-engineer, comprehension, critic, implementation-readiness checks at 23:17, 23:20, 23:24, 23:32, 23:36, 23:40). Each followed by implementation-prompt refinement. Verify whether all passes are needed or if pattern can be consolidated.
- Plan document `2026-08-09-flow-cli-implementation.md` is edited 20+ times sequentially (22:56:34-23:39:49) while zones-attestations specs are also being iteratively refined in parallel. Concurrent mutations on planning docs may indicate unclear ownership or plan scope creep.
- Agent repeatedly invokes external `claude` CLI via bash with `--dangerously-skip-permissions` flag (23:42:43, 23:45:41, 23:47:43, 23:53:35+) — indicates goldfish/fresh-context review requires external process spawning, not in-band tool
- Gap between 00:21 and 07:45 followed by git operation removing `.claude/w-learning/` from tracking — suggests prior attempt to save learning/memory in wrong location or incorrect folder structure created during earlier session

<!-- session 709369ee 2026-08-09 -->
- Spec review process intermixed with spec edits (coherence audit + fix in same pass) — should be separate: read → audit → report, then separately: fix → verify.
- Heavy reliance on Explore agent + general-purpose agents for reading specs/source; findings integrated via manual plan edits rather than structured report — spec completeness varies across documents, no single source of truth for what needs building
- Delegation guidance in CLAUDE.md emphasizes "delegate early and often" but doesn't address sequencing/coordination when multiple agents explore overlapping code paths — redundancy suggests need for explicit handoff protocol between delegated agents

<!-- session 4b92a7f9 2026-08-09 -->
- User invoked multiple fresh-engineer agents with `--dangerously-skip-permissions` to stress-test spec clarity — this is intentional validation, not a mistake; specs must be completable by zero-context engineers without permission prompts.

<!-- session 44b25955 2026-08-09 -->
- Per CLAUDE.md: "Delegate to sub-agents early and often" — user is following this, with 4+ parallel agents spawned for spec reviews; sessions should anticipate this pattern
- Spec decisions were being clarified mid-analysis: edits to decisions.md, ipc-protocol.md, and implementation-prompt.md happening while planning agents ran (23:27–23:40 range). Indicates specs not finalized before delegating implementation work.
- goldfish-review skill was unknown at 2026-08-08 23:56:24 — skill loading/availability timing issue when agent attempted to use it
- Agent used `--dangerously-skip-permissions` for subprocess calls running spec validation — safety bypass required for goldfish review subprocesses

<!-- session 5ca40801 2026-08-09 -->
- Agent ae2b needed 20+ grep searches across specs to find scattered decision patterns (worker-register, CANCELLED, subtask, dependsOn, onFailure, etc.). Consolidate spec decisions into focused sections rather than spreading related content across files.

<!-- session e99131f8 2026-08-09 -->
- Cross-directory reads outside C:\Users\Wadeck\Workspace\__exp\agent-fleet require Bash fallback; Glob/Read fail silently with permissions
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
- Pattern of writing temp prompt files (.claude/temp/goldfish-prompt-*.txt) and spawning fresh agents via bash rather than using Agent tool — suggests deliberate "fresh context" analysis strategy aligns with CLAUDE.md guidance but implementation is brittle (bash-based).

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
