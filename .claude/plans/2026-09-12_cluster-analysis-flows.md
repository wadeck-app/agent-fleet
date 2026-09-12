# Session Cluster Analysis & Flow Proposals

**Date:** 2026-09-12  
**Sources:** 35+ sessions (2026-06 to 2026-09), 5 exploration agents covering all w-learning logs, lessons-learned files, guiding-principles, and plans across 10+ Workspace_Tooling projects.

---

## Clusters

### C1 — Deferred tool/skill schema not pre-loaded

**Frequency:** Highest. Every session, every project.

Root cause: agent calls a skill or MCP tool without first invoking `ToolSearch("select:<name>")`. The tool silently fails with "NOT YET KNOWN" and the agent either retries infinitely or falls back to a worse alternative (sleep loops, manual curl, bash hacks).

Recurring victims: `write-doc`, `poll-ci`, `check-npm-published`, `violations`, `check`, `run-test`, `mcp__github-wadeck-app__actions_list`, `get_job_logs`, `SendMessage`, `AskUserQuestion`.

Sub-agents (backend-dev, frontend-dev, fork agents) cannot invoke Skill tools at all — they must use direct tool calls instead.

---

### C2 — "Done" declared before actual testing

**Frequency:** 2nd highest. User correction quote appears verbatim in 8+ sessions: "tu DOIS TESTER TOI MEME AVANT DE ME DIRE QUE TA TACHE EST FINIE."

Pattern: CI passes → agent reports success. Binary never installed, never invoked. Edge cases (trailing newlines, `--force` flag, Windows GUI output) discovered by user during manual testing.

Specific failures documented: `windowsHide` claimed present via grep, not execution; "Phase 6 works" claimed without running a flow; wdrive `--version` claimed supported, GUI binary silently discards output; old published version used to test instead of latest commit.

---

### C3 — CI/release polling via sleep loops

**Frequency:** 20+ sessions, all projects.

Pattern: `sleep 60 && npm view` repeated 10–130+ times instead of using `poll-ci` skill or `ScheduleWakeup`. One session ran 130 iterations over 2 hours with no termination logic. `poll-ci` consistently hits "NOT YET KNOWN" (→ C1), causing the fallback.

Secondary pattern: npm GitHub Packages publish is async (2–5 min delay); tight polling (7–10s intervals) wastes context. GitHub Packages requires auth even for public packages.

---

### C4 — Multi-repo/cross-file scope incomplete

**Frequency:** Every large migration task.

Pattern: initial scope map misses files. Fixes applied to one CLI, identical pattern in others left broken. Scope discovery is reactive (find new files mid-task) instead of proactive (map all before touching any).

Documented misses: `@wadeck/` → `@wadeck-app/` missed Go modules, YAML workflows, shell scripts; `detached:true` fixed in ClaudeLauncher but missed WorkerPool; `RunCommand.ts` fixed but `FlowIndex.ts` left broken; task-cli, violations-cli, wdrive-cli excluded from initial "all CLIs" inventory.

---

### C5 — Parallel agents without file ownership

**Frequency:** Every session using 3+ forks.

Failures documented: JSDoc `/**` corrupted to `/` by concurrent edits; fork hit 200-turn context limit with uncommitted changes, corrupting web-frontend; violations agents removed barrel files without checking importers → circular dependency; 3 parallel scraper agents did near-identical work with no shared template; parallel `@wadeck-app` version bumps across 7 projects with no coordination.

Sub-agents must be given explicit file/directory ownership. Reference files read once in parent and passed as excerpts, not re-read by each agent.

---

### C6 — Debugging loops / speculative parallel changes

**Frequency:** Every complex bug session.

User correction: "tu tournes pas en boucle", "n-ième itération qui tourne en rond."

Pattern: multiple parallel speculative fixes instead of one change → observe. Documented: 3+ incorrect `windowsHide` hypotheses before finding SUBSYSTEM:WINDOWS; 5 separate prettier passes; em-dash fix scripts v2/v3/comprehensive cycling; `flow run` repeated 5+ times with varying waits; 5-step investigation loop on daemon failure (cold-start race → port exhaustion → HTTP fallback → all wrong).

---

### C7 — Documentation & plan quality failures

**Frequency:** Every documentation task.

Three distinct sub-patterns:
1. **Emojis added** despite explicit prohibition — 8 plan files, 40+ min cleanup per session.
2. **`write-doc` skill skipped** — docs written without it, violating CLAUDE.md.
3. **Plans not self-sufficient for /clear continuation** — user asks "donne moi le prompt pour implémenter depuis une session /clear" in 5+ sessions. Plans omit the launch prompt, current branch state, and what was just decided.

---

### C8 — Windows platform specifics rediscovered per session

**Frequency:** Every session touching daemon, spawn, or CLI packaging.

Patterns rediscovered repeatedly: Windows Terminal intercepts console allocation even with `CREATE_NO_WINDOW`; Job Objects kill non-detached children; `spawn({shell:false})` cannot run shell scripts; `/bin/sh` not at POSIX path on Windows Git Bash; `process.kill(pid, 0)` returns ESRCH for VBScript-spawned processes; daemon port file stale after crash → EADDRINUSE; EPIPE from `process.stderr.write()` kills daemon silently.

Reference doc `windows-hidden-process.md` exists but is consulted late, not at investigation start.

---

### C9 — Violations workflow friction

**Frequency:** Every session with code changes.

Pattern: `violations` skill "NOT YET KNOWN" → manual grep; `violations check` skipped after changes; parallel fix agents corrupt files when touching overlapping patterns; `violations cache clear` needed before accurate re-run (undocumented); CLAUDE.md requirement "use `check` skill after each task" violated consistently.

---

### C10 — Over-engineering / unilateral decisions

**Frequency:** Every feature design session.

User quotes: "arrete de regarder trop loin. Fais simple.", "PUTAIN NON... Simple, putain de merde!" (re: worker→daemon WebSocket vs HTTP), "décision unilatérale non validée" (re: `@flow/` package prefix).

Pattern: agent proposes complex architecture without validating trade-off with user; implements beyond spec scope; makes naming/scoping decisions that belong to the user.

---

### C11 — Spec mode approval / plan handoff quality

**Frequency:** Every spec session.

Two failure modes:
1. Spec approved unilaterally: "all questions resolved" treated as "approved" without explicit user confirmation.
2. Plans don't carry forward: user asks for a "prompt for next session" because the plan file alone can't boot a fresh session to the right starting point.

---

## Flow Proposals

### F1 — `session-preflight` (addresses C1)

**Trigger:** Start of any session that will use MCP tools, skills, or sub-agents.

```yaml
steps:
  - name: load-deferred-tools
    action: ToolSearch
    args: "select:write-doc,poll-ci,check-npm-published,violations,check,run-test,get-timestamp"
  - name: load-mcp-tools
    action: ToolSearch
    args: "select:mcp__github-wadeck-app__actions_list,mcp__github-wadeck-app__get_job_logs,mcp__github-wadeck-app__actions_get"
  - name: load-task-tools
    action: ToolSearch
    args: "select:TaskCreate,TaskUpdate,TaskGet,SendMessage,AskUserQuestion"
  - name: validate
    assert: each fetched tool schema is non-empty
    on_fail: report list of unavailable tools before proceeding; do not silently skip
output: confirmed tool map; any unavailable tool surfaced as a warning
```

**Why:** Eliminates the NOT-YET-KNOWN → retry → fallback chain that accounted for hundreds of wasted tool calls across sessions.

---

### F2 — `pre-completion-checklist` (addresses C2)

**Trigger:** Before declaring any task complete.

```yaml
steps:
  - name: install-binary
    condition: task involves a CLI package
    action: |
      npm install -g @wadeck-app/<pkg>@latest
      <cli> --version && <cli> --help
  - name: smoke-test
    action: run the specific scenario the user asked for — not just "tests pass"
  - name: output-sanity
    checks:
      - no trailing newline (verify with xxd if CLI output)
      - no emoji in CLI output
      - no visible terminal window on Windows (if daemon/background process)
  - name: violations-check
    action: ToolSearch("select:violations") → Skill("violations") or Bash("npx violations check")
  - name: type-check
    action: ToolSearch("select:check") → Skill("check")
  - name: declare
    only_when: all checks pass
    output: single ✓ line with binary version and test scenario run
```

**Why:** CI pass and unit test pass are necessary but not sufficient. This closes the gap that caused "marked complete prematurely" in 10+ sessions.

---

### F3 — `push-and-wait` (addresses C3)

**Trigger:** Immediately after any `git push`.

```yaml
steps:
  - name: try-poll-ci
    action: ToolSearch("select:poll-ci") → Skill("poll-ci", {repo, branch, commit})
    on_skill_unavailable: proceed to fallback
  - name: fallback-gh-cli
    condition: poll-ci unavailable
    action: Bash("gh run watch --exit-status")
    on_gh_unavailable: proceed to schedule
  - name: fallback-schedule
    condition: gh also unavailable
    action: ScheduleWakeup(delaySeconds=270, prompt="check CI for <commit> on <repo>")
  - name: on-failure
    action: fetch full job logs via mcp__github-wadeck-app__get_job_logs
    output: full stderr — do not truncate
output: CI pass/fail with actionable logs; never a silent sleep loop
```

For npm package availability: canonical curl pattern using `~/.npmrc` token; retry 3× with `ScheduleWakeup(270s)`, not `sleep`.

---

### F4 — `scope-map-first` (addresses C4)

**Trigger:** Any task touching 3+ repos, renaming a package, or migrating a scope.

```yaml
steps:
  - name: full-discovery
    agent: Explore (very thorough)
    task: |
      Find every file referencing <pattern> across ALL Workspace_Tooling projects.
      Include: TS/JS imports, Go modules (go.mod, go.sum), CI YAML (.github/workflows/),
      shell scripts (.sh, .cmd, launcher templates), test files, package.json.
      Report: file path, line number, match context.
  - name: dependency-ordering
    action: identify which packages publish first (no dependent can install before its dep publishes)
  - name: checklist
    action: Write to .claude/plans/<date>_<migration-name>.md with:
      - complete file list per language/type
      - publish order
      - per-package verification command
  - name: user-approval
    action: present checklist; wait for explicit OK
  - name: execute-with-gates
    for_each: package in publish_order
    steps:
      - apply changes
      - run pre-completion-checklist (→ F2)
      - push and wait for CI (→ F3)
      - verify package published (→ F3 npm variant)
      - only then: update dependents
```

**Why:** Eliminates reactive scope discovery. Every multi-repo migration failure traced back to missing this upfront map.

---

### F5 — `parallel-agent-brief` (addresses C5)

**Trigger:** Before spawning 2+ agents on related work.

```yaml
steps:
  - name: partition
    action: list explicitly which files/directories each agent owns — no overlap allowed
  - name: shared-context
    action: read shared reference files once in parent; pass relevant excerpts in each agent prompt
  - name: agent-type-check
    assert: every Agent() call has an explicit subagent_type — never "unknown" or omitted
  - name: skill-limitation-check
    assert: if agent needs write-doc/check/run-test/violations, use direct tool calls, not Skill()
  - name: sync-point
    after_all_complete: collect results in parent; resolve conflicts before any git commit
  - name: dedup-check
    assert: no two agents edited the same file (compare git diff output)
```

**Why:** Concurrent edits to overlapping files caused corruption in 5+ sessions. Explicit partition eliminates this.

---

### F6 — `structured-debug` (addresses C6)

**Trigger:** Any bug investigation that has failed to converge after 2 attempts.

```yaml
steps:
  - name: evidence-first
    action: collect actual evidence before forming any hypothesis:
      - read relevant log files
      - check process state (port file, pid file)
      - run the failing command once with full output
  - name: hypothesis-list
    action: write numbered list of hypotheses with evidence FOR and AGAINST each
    output: present list to user before touching any code
  - name: single-change
    for_each: hypothesis (test most likely first):
      - make ONE change
      - observe result
      - if fixed: stop; document root cause
      - if not: revert; move to next hypothesis
  - name: escalate
    condition: 4+ hypotheses tested with no convergence
    action: "I don't know — paste the full log/stack trace from <specific command>"
```

**Why:** Multiple speculative parallel changes during debugging are explicitly banned in CLAUDE.md and violated in every complex debugging session.

---

### F7 — `doc-write` (addresses C7)

**Trigger:** Before writing any `.md` file, plan, skill file, or README.

```yaml
steps:
  - name: load-skill
    action: ToolSearch("select:write-doc") → Skill("write-doc")
    on_unavailable: apply rules manually (no emojis, English, terse, no restating code)
  - name: write
    rules:
      - no emojis (U+1F300–U+1F9FF, U+2600–U+27BF)
      - no "It's worth noting that", "As mentioned above"
      - one sentence per bullet
      - state conclusion first, not deliberation
  - name: post-lint
    action: Grep for emoji unicode ranges in written file
    on_match: Edit to remove; log each removal
  - name: violations-check
    action: Bash("npx violations check <file>") — catches em-dash and banned patterns
```

For plan files, always append a `## Continuation prompt` section: the exact prompt to paste after `/clear` to resume implementation from this plan.

---

### F8 — `windows-spawn-check` (addresses C8)

**Trigger:** Any code touching daemon spawn, process launch, or CLI packaging on Windows.

```yaml
steps:
  - name: read-reference
    action: Read("docs/windows-hidden-process.md") BEFORE writing any spawn code
  - name: checklist
    verify before shipping:
      - windowsHide: true alone is NOT sufficient — Windows Terminal intercepts console allocation
      - detached: true required for daemon children to survive parent exit
      - CREATE_BREAKAWAY_FROM_JOB required if parent is under a Windows Job Object
      - Use wscript.exe + SW_HIDE for truly hidden processes (see reference doc)
      - shell: false cannot run .sh scripts on Windows — use .cmd or node path
      - EPIPE from process.stderr.write() kills daemon silently — always handle EPIPE
      - port file stale after crash — check pid liveness before EADDRINUSE error
```

**Why:** Same 8 patterns rediscovered in every project (agent-fleet, orchestrator, wdrive, singleton-daemon-kit). Upfront checklist costs 30 seconds; rediscovery costs 2–3 hours.

---

### F9 — `violations-workflow` (addresses C9)

**Trigger:** After any code change, before any commit.

```yaml
steps:
  - name: cache-clear
    action: Bash("npx violations cache clear")
    note: required for accurate results after file changes — undocumented but essential
  - name: run-check
    action: ToolSearch("select:violations") → Skill("violations") 
    fallback: Bash("npx violations check --reporter compact")
  - name: fix-violations
    strategy: fix one category at a time, sequentially — NOT parallel agents per category
    after_each_fix: re-run violations-workflow from cache-clear
  - name: block-commit
    assert: zero violations before any git commit
```

**Why:** Parallel violation-fix agents caused file corruption in 2 sessions. Sequential single-category fixing is safer and produces cleaner diffs.

---

### F10 — `spec-before-implement` (addresses C10)

**Trigger:** Any feature request involving architecture choices, new abstractions, or external dependencies.

```yaml
steps:
  - name: read-existing-spec
    action: Read all files in .claude/specs/ and .claude/plans/ relevant to this feature
    assert: do not propose architecture that contradicts an approved spec
  - name: options
    action: present 2–3 options with pros/cons; include a "simplest possible" option
    rule: never present a single option as the obvious choice
  - name: user-decision
    action: wait for explicit choice before writing any code
  - name: scope-boundary
    action: write explicit "out of scope for this task" list; get user agreement
  - name: implement
    rule: one minimal change at a time; no additions beyond agreed scope
```

**Why:** "Arrete de regarder trop loin. Fais simple." appeared in 6+ sessions. Unilateral tech decisions (package naming, WebSocket vs HTTP, architecture layer placement) were all flagged by user.

---

### F11 — `plan-with-continuation` (addresses C11)

**Trigger:** End of any spec session or planning session.

```yaml
steps:
  - name: write-plan
    action: Write to .claude/plans/<date>_<name>.md with:
      - decisions made (not the deliberation)
      - current branch + last commit
      - what is done vs. what is next
      - open questions with status
  - name: continuation-prompt
    action: append "## Continuation prompt" section to the plan file with:
      - exact text to paste after /clear
      - includes: branch name, plan file path, "start from step N"
  - name: spec-approval
    rule: "questions resolved" ≠ "approved" — wait for explicit user confirmation
    action: present the spec summary; ask "is this approved?"
  - name: goldfish-check
    condition: spec covers a significant feature (>1 day of work)
    action: Skill("goldfish") on the spec folder to validate self-sufficiency
```

**Why:** User explicitly asked for a continuation prompt in 5+ sessions. Plans that can't boot a fresh session create dependency on conversation history that may be lost.

---

## Priority order

| Priority | Flow | Cluster | Impact |
|----------|------|---------|--------|
| 1 | F1 session-preflight | C1 | Unblocks F3, F9; eliminates ~30% of wasted tool calls |
| 2 | F2 pre-completion-checklist | C2 | Eliminates most "done without testing" incidents |
| 3 | F3 push-and-wait | C3 | Replaces all sleep polling patterns |
| 4 | F7 doc-write | C7 | Eliminates emoji cleanup sessions (40 min each) |
| 5 | F9 violations-workflow | C9 | Prevents CI failures from undetected violations |
| 6 | F4 scope-map-first | C4 | Required for any migration task |
| 7 | F5 parallel-agent-brief | C5 | Required when spawning 3+ agents |
| 8 | F6 structured-debug | C6 | Required after 2 failed debug attempts |
| 9 | F8 windows-spawn-check | C8 | Required for daemon/process work |
| 10 | F10 spec-before-implement | C10 | Required for new features |
| 11 | F11 plan-with-continuation | C11 | Required at end of spec/planning sessions |
