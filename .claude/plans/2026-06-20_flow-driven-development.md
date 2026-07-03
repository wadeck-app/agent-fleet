# Flow-Driven Development — Design Document

_Brainstorming sessions: 2026-06-20 / 2026-06-21_

---

## 1. Core Idea

Separate two levels in every agent task:

- **Plan** — _what_ to do (spec, tasks, files to change)
- **Flow** — _how_ to do it (process, quality gates, feedback loops)

The agent proposes both simultaneously. The human reviews both before execution starts.

Today quality rules live as free text in `CLAUDE.md`. The agent reads them, "understands" them,
then applies them inconsistently. A flow makes them **structural and non-bypassable**:

- The agent cannot "forget" to run tests — the step is in the flow
- The agent cannot skip review — it is a gate
- The feedback loop `err -> step N max:3x` forces corrections before advancing

---

## 2. Agent Roles

Three distinct agents with different permissions:

| Agent | Reads | Writes |
|---|---|---|
| **Compliance agent** | flows, policies | `.agent-fleet/policies/` only |
| **Flow creator agent** | flows, policies (read-only) | `.agent-fleet/flows-custom.yml` |
| **Executor agent** | flows, policies (read-only) | nothing |

The agent executing a step has **no awareness of the flow or policy engine**. It receives a
prompt, produces outputs, terminates. All orchestration is invisible to it.

---

## 3. File Structure

```
.agent-fleet/
  flows.yml              # built-in flow templates (read-only)
  flows-custom.yml       # project-specific flows (flow creator agent)
  policies/
    frontend.yml         # compliance agent only
    security.yml
    migrations.yml
  queue/
    <runId>.json         # { flowFile, inputs, submittedBy, timestamp }
  runs/
    <runId>/
      declared.yml       # flow YAML snapshot at run start
      steps.jsonl        # StepTrace[] — one JSON line per completed step
      policy.jsonl       # policy engine log
      outputs.json       # final flow outputs
      meta.json          # flowId, start, end, status
  engine-config.yml      # max concurrent runs, port, etc.
  engine-config.port     # written by daemon on start, deleted on exit (sibling of config)
```

---

## 4. CLI Surface

| Command | Purpose |
|---|---|
| `flow list` | Compact table of all registered flows — agent entry point before proposing |
| `flow show <file>` | ASCII table summary of a flow file |
| `flow validate <file>` | Schema + rule check |
| `flow validate <file> --policy` | Static lint against active policies |
| `flow run <file> --inputs k=v` | Submit to engine queue |
| `flow docs` | Full capabilities reference |
| `flow policy show <file>` | Which policies apply to this flow (static) |
| `flow policy show --run <id>` | Post-run audit: declared vs actual |

### `flow list` output

```
ID                          INPUTS                        DESCRIPTION
fix-bug                     description, priority         Fix a bug with reproduce → fix → test loop
implement-feature           description, scope            Backend + frontend feature with review gates
db-migration                description                   Schema change with human gate before execution
feature-requirements-inter  -                             HITL interview to refine requirements
```

---

## 5. The Dual Proposal (Plan + Flow)

When an agent proposes work:

1. **Plan** — natural language: what will be done and why
2. **Flow reference** — an existing flow ID or a new `<task>.yml` file
3. **Inputs** — key/value pairs to pass to the flow

The flow YAML is always a **standalone reusable file**, never embedded inline in text.
The queue entry is `{ flowFile, inputs }` — that is all the engine needs.

The agent runs `flow list` first to find a matching flow. If none matches, it proposes a new
YAML, the human reviews via `flow show`, approves the pair, then the queue entry is written.

---

## 6. Flow Engine Daemon

### Design

Single binary `engine.js` with two startup roles:

- **Socket absent** → become the daemon: open socket, manage executors, drain queue
- **Socket present** → forwarder: nudge the running daemon via socket, exit immediately

### Submit flow

1. Write `<runId>.json` to `.agent-fleet/queue/` — **persisted before engine is called**
2. Spawn `engine.js` — becomes daemon or nudges existing one

Engine responds:
- `"accepted"` — executor slot available, execution starts
- `"busy"` — all slots occupied; queue file persisted, will drain when a slot frees

### Sequence

```
Caller              Queue FS         engine.js        Executor
  │                    │                 │                │
  │ write <runId>.json │                 │                │
  │───────────────────►│                 │                │
  │ spawn engine.js    │                 │                │
  │────────────────────────────────────►│                 │
  │                    │         slot available?          │
  │                    │       NO        │      YES       │
  │◄── "busy" ─────────────────│  assign executor         │
  │  (queue persisted)         │────────────────────────►│
  │                    │       │  pick from queue/        │
  │◄── "accepted" ──────────────────────│  execute flow  │
  │                    │                │  write runs/   │
  │                    │                │  delete queue/ │
  │                    │                │◄── "done" ─────│
  │                    │         queue empty?             │
  │                    │       YES       │      NO        │
  │                    │   idle timer   assign next ─────►│
  │                    │   → exit       │                 │
```

### Executors

`FlowExecutor` instances running in-process inside the daemon. Flows are I/O-bound
(waiting on Claude subprocesses) so no child process per run is needed.

Concurrency: simple semaphore, max N runs (default 2-3, configurable in `engine-config.yml`).

### Crash recovery

Queue file written before engine spawn. If daemon crashes, the orphaned `<runId>.json`
survives. Next engine invocation finds it and resumes.

### Progress observation

- **CLI**: tail `.agent-fleet/runs/<runId>/steps.jsonl`
- **Web backend**: file watcher on `runs/` → websocket events. Backend is a queue submitter
  and UI only — it never owns execution.

---

## 7. Policy Engine

### Two modes

**Mode 1 — Static lint** (`flow validate --policy`): validate a proposed flow before execution.
```
WARN  step 3 touches web-frontend but no agent-browser step found
WARN  no test step after implementation steps
OK    human gate present before implementation
```

**Mode 2 — Live observation**: after each step, observe what actually happened and react.
A model step may touch backend, frontend, DB, or nothing — unknown in advance.

### StepTrace

Every completed step produces a `StepTrace`:

```typescript
interface StepTrace {
  stepId: string;
  stageId?: string;
  files: string[];      // modified file paths
  deltas: FileDelta[];  // full diffs
  outputs: Record<string, unknown>;
}
```

### Trigger points

The flow engine calls the policy engine at:
- After each individual step
- At each stage boundary (after all parallel steps in a stage complete)

**Evaluation timing is per-policy, not per-stage.** Each policy declares when it fires:

```yaml
# waits for stage boundary — handles parallel steps
- trigger: files-modified-match("packages/web-frontend/**/*.tsx")
  evaluate-at: stage-boundary
  scope: stage

# fires immediately after any step touching migrations
- trigger: files-modified-match("**/migrations/**")
  evaluate-at: after-step
  scope: last-step
```

Whether to live-reload policy files or use a cached snapshot is an internal decision of the
policy engine — not a concern of the flow.

### File scope primitives

```
scope: last-step          → StepTrace[-1]
scope: last-n-steps(N)    → last N traces combined
scope: since-step(id)     → all traces after named step
scope: stage              → all traces in current stage
scope: all                → entire execution history
```

Per-step attribution is always preserved in `StepTrace[]`, even when querying `scope: stage`.
This is essential for justification verification.

### Policy evaluation

```
step/stage completes
  → PolicyEngine.observe(traces, scope)
  → check triggers against file lists
  → if trigger fires:
      scan remaining steps for required tag
      → tag found downstream? → no injection
      → tag missing?
          → request justification from step agent
          → policy-checker verifies justification:
              confidence: HIGH   → accept, log, continue
              confidence: MEDIUM → subprocess second opinion
              confidence: LOW    → escalate: inject user_intervention gate
```

Justification must be a **falsifiable claim**:
- "only CSS files changed" → checker verifies all paths match `*.css`
- "no render logic changed" → checker scans diffs for JSX patterns
- Vague claims ("it's fine") → LOW confidence automatically

### Multiple policies at same boundary

All policies fire sequentially — no "strictest wins" suppression. Each produces its own
feedback loop. Human gate at the end receives all prior outputs.

```
stage boundary:
  1. agent-browser      → feedback loop if visual regressions
  2. security-review    → feedback loop if vulnerabilities
  3. human-approval     → final gate with full context of 1+2
```

### Policy injection

Steps injected by the policy engine use the `policy:` prefix:

```yaml
- id: policy:verify-frontend-visual
  type: user_intervention
  tags: [agent-browser, quality-gate, protected]
```

`policy:` steps:
- Cannot be authored by agents or flow creators
- Cannot be removed or modified by agents
- Tags come from a trusted registry
- Displayed distinctly in `flow show` with `[POLICY]` marker

### Policy rejection handling

**Default: hard stop.** Flow terminates. Human decides next steps.

**Optional: goto on rejection** (declared in policy file, not the flow):

```yaml
- trigger: files-modified-match("packages/web-frontend/**/*.tsx")
  on-rejection:
    goto: implement-ui
    max: 2
```

Reuses the existing `err -> goto N  max:Mx` primitive. Policy recovery is always the
compliance agent's jurisdiction — the flow creator has no say.

### Compliance agent vs policy engine

**Compliance agent** — authoring time only:
- Invoked when a policy file is created/modified
- Invoked when a new flow is proposed (lints against active policies before approval)
- NOT active during execution

**Policy engine** — runtime enforcer, autonomous:
- Loads policy files at flow start
- Observes, injects, escalates without calling the compliance agent
- Rules are data; the engine enforces them

### Policy registry

```
.agent-fleet/policies/
  frontend.yml     # web-frontend policies
  security.yml     # auth, secrets, CVE-related
  migrations.yml   # DB migration gates
```

Multiple files allow per-domain ownership (git CODEOWNERS). A flow can reference a policy
by ID to provide context but cannot disable or modify it.

---

## 8. Stages

A stage groups steps for policy scoping:

```yaml
stages:
  - id: locate
    steps: [analyze, reproduce]

  - id: implement
    steps: [fix-backend, fix-frontend, add-tests]

  - id: verify
    steps: [run-tests, agent-browser]
```

Stage boundaries are natural injection points — avoid interrupting mid-implementation.
Policies with `evaluate-at: stage-boundary` wait for all parallel steps in a stage to
complete before evaluating the combined `StepTrace[]`.

---

## 9. Crystallization Loop

Bottom-up institutional memory:

1. Agent runs task (free-form or with an existing flow)
2. Session trace stored in `.agent-fleet/runs/<runId>/`
3. Trace analysis surfaces recommendations: "agent-browser injected 3 consecutive times in
   fix-frontend flows — candidate for crystallization into the template"
4. **Human decides** whether to crystallize and how to generalize the YAML
5. Flow template refined → used as starting point for next similar task

Policy engine can recommend new policy rules from observed patterns, but **never auto-applies**
them. Human approval required to promote a recommendation to an active policy.

Risk: over-formalizing too early. Keep free-form mode for exploration; crystallize only
what has proven reproducible.

---

## 10. `flow policy show` — two views

`flow show` shows the declared flow only. Policy coverage is a separate concern:

**`flow policy show <flow.yml>`** — static: which policies would apply to this flow.

**`flow policy show --run <runId>`** — post-run audit:
- **Declared flow** — steps from the original YAML
- **Actual flow** — steps that actually ran (includes `policy:` injected steps)
- **Policy log** — triggers fired, justifications accepted/rejected, gates hit

The declared vs actual diff is crystallization signal: persistent injections → update the template.

---

## 11. Open Questions / Design Decisions

### Policy YAML schema

**One policy per file is the norm.** Multiple policies in a single file are allowed but not encouraged — each file represents one concern, one area of effect (frontend, security, migrations, etc.).

Two expression styles:

**Style A — Declarative** (simple rules, 90% of cases):
```yaml
# .agent-fleet/policies/frontend-visual.yml
version: 1
id: require-agent-browser
trigger:
  files-modified-match: "packages/web-frontend/**/*.tsx"
  scope: stage
evaluate-at: stage-boundary
requires-tag: agent-browser
justification-threshold: high
severity: warn              # warn (non-blocking) | error (blocking)
on-missing:
  inject:
    type: user_intervention
    interventionType: approval
    title: "Frontend render logic changed — visual verification required"
on-rejection:
  goto: implement-ui
  max: 2
```

**Style B — Flow-as-policy** (complex verification):
```yaml
# .agent-fleet/policies/security-auth.yml
version: 1
id: security-audit
trigger:
  files-modified-match: ["**/auth/**", "**/jwt/**"]
  scope: last-step
evaluate-at: after-step
check-flow: verify-security-impact.yml
justification-threshold: medium
severity: error
```

#### How flow-as-policy passes context

The policy engine always provides the same standardized `PolicyContext` as inputs to any
injected step or flow. The injected flow defines how to consume it — fully decoupled from
how it was triggered.

```typescript
// PolicyContext — always the same shape, regardless of which policy triggered
interface PolicyContext {
  policyId: string;
  triggeringStepId: string;
  triggeringStageId?: string;
  matchedFiles: string[];      // file paths matching the trigger pattern (pre-filtered)
  stepTracePath: string;       // path to .agent-fleet/runs/<runId>/steps.jsonl
  runId: string;
}
```

No JSON blobs in inputs. The full trace is already on disk — pass the path, let the
check-flow read only what it needs via a script step:

```yaml
# verify-security-impact.yml
id: verify-security-impact
inputs:
  - name: policyId           type: text
  - name: triggeringStepId   type: text
  - name: matchedFiles       type: json    # ["src/auth/jwt.ts", ...]
  - name: stepTracePath      type: text    # .agent-fleet/runs/<runId>/steps.jsonl
  - name: runId              type: text

steps:
  - id: extract-diffs
    type: script
    script: |
      node scripts/extract-diffs.js \
        --trace {{ inputs.stepTracePath }} \
        --files {{ inputs.matchedFiles }} \
        --output /tmp/{{ inputs.runId }}-security-diffs.json
    outputs: [diffsPath]

  - id: analyze-impact
    type: model
    prompt: |
      Analyze these security-sensitive diffs.
      Verdict options: SAFE | REVIEW_NEEDED | BLOCK

      Files: {{ inputs.matchedFiles }}
      Diffs: {{ steps.extract-diffs.outputs.diffsPath }}
    outputs: [verdict, reasoning]

  - id: gate
    type: user_intervention
    when: "{{ steps.analyze-impact.outputs.verdict != 'SAFE' }}"
    interventionType: approval
    approval:
      title: "Security impact detected"
      description: "{{ steps.analyze-impact.outputs.reasoning }}"
```

**Key design points:**
- Script step extracts only relevant diffs — model receives a small, focused file, not a large blob
- Check-flow is fully standalone and independently testable (pass mock files as inputs)
- Policy engine reads the `verdict` output; any value other than `SAFE` triggers the configured action
- No new primitives — standard flow inputs/outputs/interventions throughout

### `flow validate --policy` output format

Two outputs: JSON for agents/CI, Markdown for humans. Both produced in one command:

```bash
flow validate my-flow.yml --policy                    # prints plain text to stdout
flow validate my-flow.yml --policy --json             # JSON to stdout
flow validate my-flow.yml --policy --report report.md # Markdown file written
```

Plain text (stdout, default):
```
WARN  [frontend-visual]      step 3 touches *.tsx but no agent-browser tag downstream
ERROR [security-auth]        auth/** modified but no security gate found
OK    [require-tests]        test step present downstream
```

Markdown report (for human/agent auditor):
```markdown
# Policy Validation Report — my-flow.yml
Generated: 2026-06-21T10:00:00Z

## Summary
- 1 error (blocking)
- 1 warning
- 1 passed

## Violations

### ERROR — security-auth
Step `implement-api` modifies `src/auth/jwt.ts` but no security gate exists downstream.
**Fix:** Add a step tagged `security-review` after `implement-api`, or add policy exemption.

### WARN — frontend-visual
...
```

Exit code: 0 = ok + warnings only, 1 = any `severity: error` violation.

### Engine config defaults + multi-engine support

```yaml
# .agent-fleet/engine-config.yml  (optional — these are the defaults)
maxConcurrentRuns: 2    # Claude API rate limits make >3 parallel impractical
port: 47832             # localhost TCP port — cross-platform (Windows-safe)
queueDir: .agent-fleet/queue
runsDir: .agent-fleet/runs
logLevel: info          # debug | info | warn | error
```

**On idle:** daemon exits immediately when queue is empty and no executor is active.
No timer — "nothing to do" = exit.

**Port file — atomic, locked, with heartbeat:**

Port file lives **next to the config file** (not in `.agent-fleet/`):
- `engine-config.yml` → `engine-config.port`  (sibling, location-independent)
- `engine-test.yml`   → `engine-test.port`

Content:
```json
{ "port": 47832, "pid": 12345, "startedAt": "2026-06-21T10:00:00Z" }
```

Guarantees:
- **Atomic write** — write to temp sibling, `rename()` (atomic on all OS)
- **Advisory lock** — daemon holds an exclusive lock on the file while running
- **Heartbeat** — daemon updates the file's `mtime` every 5s
- **Stale detection** — caller checks mtime: older than 2× heartbeat interval (10s) → daemon dead → delete and start fresh

**Multiple engines via `--engine-config`** (mirrors wdrive/driver pattern):
```bash
flow run my-flow.yml                                                   # default engine
flow run my-flow.yml --engine-config /any/path/engine-test.yml        # test engine
```

```yaml
# /any/path/engine-test.yml
port: 47833
queueDir: /any/path/test-queue
runsDir: /any/path/test-runs
```

Each config → independent daemon → independent port file (sibling of config).
Integration tests spin up a test engine on a known port, run flows against it, tear it
down — zero interference with any running production daemon. Config can live anywhere.

### Stages in flow YAML (not yet implemented)

Stages are a **top-level section**, not an overlay on `steps`. Steps live inside stages:

```yaml
# With stages — steps are inside each stage
stages:
  - id: locate
    steps:
      - id: analyze
        type: model

  - id: implement
    steps:
      - id: fix-backend
        type: model
        depends: [analyze]
      - id: fix-frontend
        type: model
        depends: [analyze]

  - id: verify
    steps:
      - id: run-tests
        type: script
        depends: [fix-backend, fix-frontend]

# Without stages — use top-level steps shorthand
# treated internally as a single implicit stage: "general"
steps:
  - id: analyze
    type: model
  - id: run-tests
    type: script
    depends: [analyze]
```

`FlowExecutor` needs: read steps from `stages[].steps` (or top-level `steps`), detect when
all steps in a stage have completed, emit `stage-boundary` event.

### LLM context and session management

#### Session continuity

Each model step runs a fresh `claude` subprocess by default. `sessionId` is a **reserved
implicit output** on every model step — always captured from `--output-format json`,
always stored in `StepTrace`, always referenceable via `steps.<stepId>.sessionId`.

Chain two model steps explicitly:
```yaml
steps:
  - id: analyze
    type: model
    prompt: "Analyze the auth module..."
    outputs: [summary, riskLevel]
    # sessionId always captured implicitly — no need to declare

  - id: deep-dive
    type: model
    resume-session: "{{ steps.analyze.sessionId }}"   # chain via step ID
    prompt: "Go deeper on the HIGH risk items..."
    outputs: [findings]
```

`steps.<stepId>.sessionId` → engine passes `--resume <sessionId>` to the subprocess.
Session continuity is explicit opt-in — not the default.

A step can also receive a **file as context** (no session required):
```yaml
- id: review
  type: model
  context-files: ["{{ inputs.stepTracePath }}", "src/auth/jwt.ts"]
```

#### Session compaction before reuse

Before resuming a long session, it can be compacted: a script (or haiku step) reads the
session history, extracts only the essential decisions/outputs, and produces a clean
context file. The resumed step receives the compacted file instead of the full session.
The result must remain valid Claude session format.

#### Strategy A — Structured output contracts (default, always active)

Each step declares its outputs upfront. Only declared outputs survive to subsequent steps.
Steps start with minimal context. Zero cost.

```yaml
- id: analyze
  outputs: [summary, riskLevel, affectedFiles]
```

#### Strategy B — JSON output with XML fallback

Steps request structured responses. Two-tier enforcement:

Step YAML declares the output schema:
```yaml
- id: classify-change
  type: model
  prompt: "Review the diff and classify the impact."
  outputs:
    - name: verdict
      type: enum
      values: [SAFE, NEEDS_REVIEW, BLOCK]
    - name: reasoning
      type: text
    - name: affectedAreas
      type: json   # string[]
```

Engine auto-appends to the prompt:
```
---
Respond with JSON exactly matching this structure:
{
  "verdict": "SAFE" | "NEEDS_REVIEW" | "BLOCK",
  "reasoning": "<one paragraph>",
  "affectedAreas": ["auth", "session"]
}

If you cannot produce valid JSON, use these XML tags instead:
<verdict>SAFE</verdict>
<reasoning>The change only adds a null check...</reasoning>
<affectedAreas>["auth"]</affectedAreas>
```

Engine post-processing (deterministic, no LLM):
```typescript
// 1. Try JSON parse (--output-format json gives full response object)
const json = tryParseJson(claudeOutput.result);
if (json) return extractFromJson(json, outputSchema);

// 2. Fallback: XML marker extraction
return extractFromXmlMarkers(claudeOutput.result, outputSchema);

// 3. Both fail → step error → retry loop or escalate
```

Both options are always in the prompt — the model sees both upfront. JSON succeeds ~95%
of the time; XML catches edge cases where the model adds surrounding prose.

#### Strategy C — Inter-step summary (rare)

Needed only when a step genuinely needs a compressed view of prior step outputs — not the
full session history. A cheap haiku step produces a one-paragraph summary stored in
`StepTrace`. Subsequent steps reference this summary, not the raw prior outputs.
Each step has its own conversation by default; C is an explicit opt-in, rarely needed.

### Step tags registry — TODO (future)

Deferred. Current assumption: tags are freeform strings; `protected` is a reserved tag
enforced by convention.

### CLI independence from agent-fleet server

The flow CLI has **zero dependency** on the agent-fleet backend, orchestrator, or UI.
It operates purely on:
- Local filesystem (`.agent-fleet/`)
- Engine daemon (localhost TCP)
- Claude subprocesses (spawned directly)

The CLI can be used in any project that has a `.agent-fleet/` directory. The agent-fleet
server is a separate, independent product that happens to also use flows.

---

## 12. Flow Authoring DX

### The planner is a PM

The agent responsible for authoring flows is a **planner** (or orchestrator). Its role:
- Receive a task from the user
- Propose a **plan** (natural language) + a **flow YAML** (structured process)
- Iterate on both based on user feedback
- Trigger execution once both are approved

Approving the flow = approving the plan. No separate sign-off. "Go" → `flow run`.

### Where flows live during authoring

The flow YAML is a plain file. During authoring it lives **alongside the spec/plan** that
generated it — wherever the planner chose to put it:

```
.claude/plans/2026-06-21_fix-jwt-expiry.md     ← plan/spec
.claude/plans/fix-jwt-expiry.yml               ← flow being authored
```

No special `proposals/` directory. The flow is just a file the planner is editing.

Once approved and worth reusing, the planner promotes it to `.agent-fleet/flows-custom.yml`
(or a standalone `.agent-fleet/flows/fix-jwt-expiry.yml`). One-off flows stay where they are
or get deleted after the run. The planner decides — no ceremony required.

### The authoring loop

```
User: "fix the JWT expiry bug in the auth service"
        │
        ▼
Planner agent:
  1. flow list                    → no matching flow found
  2. writes fix-jwt-expiry.yml    → .claude/plans/fix-jwt-expiry.yml
  3. flow validate --policy       → clean (run silently, fix before showing)
  4. flow show                    → renders table inline in response

  Outputs to user:
    Plan: "Reproduce the expiry failure, patch AuthService.validateToken(),
           add regression test, run full auth test suite."
    [flow show table]
    Ready: description="JWT expiry bug", priority="high"
        │
        ▼
User: "add a human gate before the fix step, make tests mandatory"
        │
        ▼
Planner agent:
  5. edits fix-jwt-expiry.yml
  6. flow validate --policy       → clean
  7. flow show                    → updated table inline
        │
        ▼
User: "go"
        │
        ▼
Planner agent:
  8. flow run .claude/plans/fix-jwt-expiry.yml \
       --inputs description="JWT expiry bug" priority="high"
```

**Key principle:** the planner always validates silently before showing. The user never sees
a broken flow — errors are fixed by the planner, not surfaced as noise.

### Direct YAML editing

The user can also edit the flow YAML directly and ask the planner to validate:
```
User: [edits fix-jwt-expiry.yml manually]
User: "validate and show"
Planner: flow validate --policy + flow show
```

Or open it with `$EDITOR` for direct manipulation — the planner re-validates after.

### Re-running a past flow

```bash
# re-run from a previous run's snapshot (different inputs)
flow run --from-run <runId> --inputs description="different bug"

# re-run the same flow file
flow run .claude/plans/fix-jwt-expiry.yml --inputs description="different bug"
```

`runs/<runId>/declared.yml` is always a valid, standalone flow file — reusable directly.

### Flow promotion (optional)

If a flow proved useful and is generic enough to reuse:
```bash
flow promote .claude/plans/fix-jwt-expiry.yml          # uses id: field from the YAML
flow promote .claude/plans/fix-jwt-expiry.yml --id fix-bug   # override the ID
```

On ID collision:
```
ERROR  flow 'fix-bug' already exists in flows-custom.yml
       Use --force to overwrite, or --id <new-id> to register under a different name
```

`--force` for deliberate overwrite. No silent data loss. History is git's job, not promote's.

After promotion, `flow list` finds it by ID. Future planners reuse it directly.
Promotion is explicit and optional — not automatic.

---

## 13. Error DX

### `onFailure` vs `onError` — essential distinction

```
onFailure = the step crashed unexpectedly
  - subprocess non-zero for infrastructure reasons (rate limit, auth, OOM)
  - model refusal
  - output extraction failure (JSON + XML both failed)
  - timeout

onError = execution was fine, result was negative
  - script exit 1 because tests failed (expected negative, not a crash)
  - model outputs verdict: "BLOCK" (worked correctly, result is negative)
  - validation script found issues
```

```yaml
- id: run-tests
  type: script
  onError:              # tests ran, exit 1 = tests failed → retry loop
    goto: implement
    max: 3
  onFailure:            # script crashed / timed out → escalate, don't retry blindly
    escalate: human

- id: analyze
  type: model
  onError:              # model ran, produced a negative verdict
    goto: ...
  onFailure:            # [?] granular per-failure-type routing — complex, real-world value uncertain
    subprocess-crash:  retry max:3 backoff:exponential
    timeout:           escalate human
    output-missing:    retry max:1
    model-refusal:     escalate human   # same prompt → same refusal, don't retry
  # Simpler alternative: onFailure: escalate human (one handler for all crash types)
  # Revisit once we have real failure data from production runs
```

`flow show` notation:
- `err -> N  max:Mx` — onError loop (negative result, retry implementation)
- `fail -> human` — onFailure escalation (crash, displayed differently)

### Workspace state + Git snapshot

**The checkpoint alone is not enough.** If a model step partially modifies files before
failing, re-running it against dirty state produces undefined results. Workspace state must
match the checkpoint.

**Strategy: agent commits at the end of each write step.**

The engine does not auto-commit. The agent is responsible for committing its own changes
at the end of the step — it knows what it touched and can stage selectively. Auto-commit
by the engine risks including unwanted files (temp files, logs, generated artifacts).

The step prompt instructs the agent to commit before finishing:
```
... implement the fix ...
When done, commit your changes with:
  git add <specific files>
  git commit -m "flow:<runId>:step:<stepId>: <description>"
```

On step restart:
```
git reset --hard <pre-step-commit-sha>   # restore exact workspace state
# then re-run the step
```

**Branch isolation:** engine creates `flow/<runId>` from current HEAD at flow start.
All flow commits land on this branch. On success: human decides (squash/rebase/merge).
On abort: delete the branch → workspace clean.

**Parallel steps — readonly enforced:** steps running in parallel must not write files.
Engine validates `allowed_tools` at flow start: any parallel step with write tools → validation
error. Parallel write steps → TODO (deferred).

**Clean state enforcement (optional per flow):**
```yaml
enforceCleanStateAfterStep: true
```
After each step: engine checks for uncommitted changes. If found → step considered incomplete.
Forces model steps to finish their work before the engine advances. Can also be enforced via
a policy rule rather than a flow-level flag — cleaner separation.

### Idempotency — derived from `allowed_tools`

No manual declaration needed for model steps. Engine derives idempotency from tool set:

```yaml
- id: analyze
  type: model
  allowed_tools: [Read, Grep, Glob]        # readonly → idempotent, safe to restart
  # no git reset needed on restart

- id: implement
  type: model
  allowed_tools: [Read, Write, Edit, Bash] # write tools → non-idempotent
  # restart requires: git reset --hard <pre-step-sha> first
```

Script steps require explicit declaration:
```yaml
- id: send-notification
  type: script
  idempotent: false    # external side effects — restart requires human confirmation
```

**Restart is always human-triggered.** `flow resume <runId>` — human only. An agent cannot
trigger a restart of a non-idempotent step. Engine pauses and waits.

### Approaches — validated

**Approach D — In-flow routing (`onError.goto`)** [validated] always active
Declared by the flow author for anticipated negative results.
```yaml
- id: run-tests
  onError:
    goto: implement
    max: 3
```

**Approach B — Pause + resume** [validated] default for unexpected failures
```
FAIL Step 'run-tests' — run paused  [run: abc123]
  Workspace restored to pre-step state (git reset).
  Fix the issue then: flow resume abc123
```
Resume re-runs from the failed step. Workspace is clean (git reset already applied).

**Approach C — Partial re-run (`--from-step`)** [validated] power-user escape hatch
```bash
flow run fix-jwt.yml --from-step implement --reuse-run abc123 --inputs description="JWT bug"
```
Injects prior step outputs, resets workspace to pre-step commit, starts at named step.

**Approach A — Re-run from scratch** [validated] always available
```bash
flow run fix-jwt.yml --inputs description="JWT bug"   # fresh branch, fresh start
```

### Approaches — TODO (not yet discussed in depth)

**Approach E — Interactive debugger (`flow debug <runId>`)** [TODO]
Interactive prompt: retry / skip / goto / abort / inspect.
Only for interactive terminal sessions — never in daemon/CI mode.
Open questions: skip semantics with missing outputs, inspect rendering.

---

## 14. Step Prompt Authoring DX

### The problem

Testing a single step prompt today requires running the entire flow — paying for all prior
steps, waiting for them, then seeing if the target step works. Tight feedback loop needed.
This is the crucial DX piece: everything else (batching, context reuse, assertions) is
optional layering on top of the core primitive.

### Core primitive — `flow test-step`

Step inputs are **only what the step itself declares** — not the flow's top-level inputs.
The step has no awareness it's inside a flow, so testing it should not require irrelevant
flow-level inputs (e.g. `priority` is irrelevant when testing the `implement` step in isolation).

```bash
flow test-step fix-jwt.yml implement \
  --input summary="JWT expiry check missing in validateToken()" \
  --input riskLevel=HIGH \
  --input affectedFiles='["src/auth/AuthService.ts"]'
```

Only inputs the target step actually consumes. Nothing from the flow's own input schema.

**Optional context (not core, but useful):**
```bash
flow test-step fix-jwt.yml implement --reuse-run abc123    # inject outputs from a real run
flow test-step fix-jwt.yml implement --context ctx.json    # explicit context file
```
Both are conveniences on top of `--input` — not the core value. `--reuse-run abc123` is
equivalent to `--context` reading from an existing run directory.

**Assertions on a single test-step run** — nice to have, not essential (can be checked by
eye or by an ad-hoc script on the output). Deferred in favor of the batch/suite tooling below,
which is where assertions actually matter.

### Documentation requirement

`flow test-step` must be documented well enough that an LLM agent can debug a misbehaving
flow on its own:
1. How to isolate a failing step
2. How to distinguish prompt-quality issues vs model issues vs malformed inputs
3. How to build a minimal reproducing `--context` file
4. How to interpret batch results (pass-rate vs single failure) — see suite tooling below
5. When to reach for an LLM evaluator vs a deterministic script evaluator

### Flow test suites — testing non-deterministic steps deterministically

Single-run testing isn't enough for LLM steps — same input can produce different output.
Need batch running, statistical assertions, and A/B comparison.

**Layer 1 — Repeatability**
```bash
flow test-step fix-jwt.yml analyze --input description="JWT bug" --runs 10
```
Runs the step N times with identical input, stores all N results under `runs/test-<id>/`.
Determinism levers: `temperature: 0`, pinned model version (not `-latest`), frozen `--context`.

**Layer 2 — Test suite file**
```yaml
# fix-jwt.flow-test.yml
suite: fix-jwt analyze step
step: analyze
flow: .claude/plans/fix-jwt.yml

variants:
  - id: baseline
    inputs: { description: "JWT expiry check missing in validateToken()" }
  - id: vague-input
    inputs: { description: "auth is broken" }
  - id: complex-input
    inputs: { description: "Multiple JWT issues: expiry not checked, refresh token reuse possible" }

runs-per-variant: 10

assertions:
  # structural — always checked
  - output: riskLevel
    type: enum
    values: [LOW, MEDIUM, HIGH, CRITICAL]

  # value — checked per run
  - output: summary
    not-empty: true
    max-length: 500

  # statistical — checked across the batch
  - output: riskLevel
    when: variant == baseline
    passes: "== HIGH"
    min-pass-rate: 0.8       # must pass on 8/10 runs

  # deterministic script evaluator
  - output: affectedFiles
    evaluator: scripts/assert-files-exist.js   # exit 0 = pass, exit 1 = fail

  # LLM judge evaluator — for quality checks a script can't express
  - output: summary
    evaluator-model: haiku
    evaluator-prompt: |
      Does this summary correctly identify a JWT expiry issue?
      Summary: {{ output }}
      Answer YES or NO.
    passes: "== YES"
    min-pass-rate: 0.9
```

**Layer 3 — A/B testing between configurations**
```yaml
ab-tests:
  - name: "detailed vs terse prompt"
    variants: [baseline, terse-prompt]
    compare:
      - metric: summary length (chars)
        prefer: shorter
      - metric: riskLevel accuracy
        evaluator-model: haiku
        prefer: higher-pass-rate

  - name: "sonnet vs haiku"
    model-variants:
      baseline: claude-sonnet-4-6
      fast: claude-haiku-4-5-20251001
    compare:
      - metric: riskLevel accuracy
      - metric: duration
        prefer: faster
```
Compares prompt variants, model choices, output formats — whatever axis is relevant.

**Layer 4 — Running the suite**
```bash
flow test fix-jwt.flow-test.yml                       # run full suite
flow test fix-jwt.flow-test.yml --variant baseline     # single variant
flow test fix-jwt.flow-test.yml --dry-run              # validate config, no LLM calls
```
```
VARIANT  baseline        10/10 runs   assertions: 4 pass  0 fail  duration: avg 3.2s
VARIANT  vague-input     10/10 runs   assertions: 3 pass  1 fail  (riskLevel pass-rate 0.6 < 0.8)
VARIANT  complex-input   10/10 runs   assertions: 4 pass  0 fail

A/B  detailed vs terse: terse-prompt wins on length (avg 120 vs 280 chars), tie on accuracy
```

### CLI surface addition

| Command | Purpose |
|---|---|
| `flow test-step <file> <stepId> [--input k=v] [--reuse-run id] [--context file] [--runs N]` | Run one step in isolation |
| `flow test <suite.flow-test.yml>` | Run a full test suite (batching, assertions, A/B) |
| `flow test <suite.flow-test.yml> --variant <id>` | Run a single variant |

### Status

Discussed and captured; not yet fully validated line-by-line with the user (assertions,
A/B schema, and evaluator types are proposals awaiting explicit sign-off next session).

---

## 15. Discussion Tracker

Tracks what has been validated, what is open, and what is deferred.

### Validated

- Core FDD model: plan + flow proposed together, flow is the contract
- Agent roles: compliance / flow-creator / executor — separate permissions
- File structure: `.agent-fleet/policies/`, `queue/`, `runs/`
- CLI surface: list, show, validate, validate --policy, run, docs, policy show, promote
- Engine daemon: single binary, two roles (daemon vs forwarder), TCP port, atomic port file with heartbeat
- Multi-engine via `--engine-config` (config-sibling port file, location-independent)
- Queue: write-before-spawn, crash recovery via orphaned files
- Executors: in-process `FlowExecutor` instances, semaphore concurrency
- Stages: top-level section, steps live inside stages, implicit `general` stage if absent
- Policy independence: policies never in flows, separate directory, compliance agent owns
- Policy evaluation: per-policy `evaluate-at` (after-step | stage-boundary)
- StepTrace: per-step structured output, `matchedFiles` + `stepTracePath` for policy context
- `PolicyContext`: standardized inputs to any injected step/flow
- Flow-as-policy: check-flow receives `PolicyContext` as standard inputs, script extracts diffs, no blobs
- Multiple policies at boundary: all fire sequentially, no suppression
- Policy rejection: hard stop default, `on-rejection.goto` optional in policy file
- Compliance agent: authoring time only, not active during execution
- Session chaining: `sessionId` implicit output on all model steps, `steps.<id>.sessionId` to resume
- Strategy A (output contracts) + Strategy B (JSON + XML fallback): both active by default
- Strategy C (inter-step summary): explicit opt-in, rarely needed
- Flow authoring DX: flow lives next to spec, no proposals dir, promote is explicit+optional
- Crystallization: human-driven, session traces feed recommendations, no auto-apply
- **Error DX:**
  - `onFailure` (crash) vs `onError` (negative result) — distinct routing
  - Git snapshot per step: `flow/<runId>` branch, agent commits at end of each write step (not engine auto-commit — risks staging unwanted files)
  - Parallel steps must be readonly (write-parallel → TODO deferred)
  - `enforceCleanStateAfterStep` optional flag / policy rule
  - Idempotency derived from `allowed_tools` (write tools → non-idempotent)
  - Restart is human-only (`flow resume`) — agents cannot trigger restart
  - Approach D (onError.goto) always + B (pause+resume) default + C (--from-step) escape hatch

### Open — next to discuss

- **`flow test-step` / `flow test` suite tooling** (section 14): core `test-step` primitive
  agreed on (step-level inputs only, no flow-level noise). Suite file schema (variants,
  assertions, evaluators, A/B tests) is a proposal — needs explicit validation next session:
  - Assertion types (structural / value / statistical / script evaluator / LLM evaluator) — confirm shape
  - A/B test schema — confirm `compare` metrics and `prefer` semantics
  - `--runs N` and pass-rate thresholds — confirm defaults
  - Approach D (manual output assertions on `test-step` itself) — deprioritized, "nice to have,
    not the core value" per user feedback; batch/suite tooling is where assertions matter

### Deferred (not blocking, revisit later)

- **Parallel write steps**: steps running in parallel must be readonly — parallel writes deferred
- **Step tags registry**: trusted registry location + ownership
- **Flow composition depth**: can a subflow call another subflow? Stage/policy propagation into nested flows
- **`flow analyze` (crystallization tooling)**: Step 9 in build plan
- **`flow debug` full design**: interactive debugger — skip semantics, inspect rendering
- **Step prompt templating**: loops, conditionals, multi-file includes — how expressive?
- **Flow schema versioning**: migration path when schema changes

---

## 15. Incremental Build Plan

Each step delivers working software with tests, covering progressively more complex scenarios.
Later steps depend on earlier ones being stable.

### Step 1 — `flow list` command (quick win)
- New `ListCommand.ts` in `flow-cli`
- Scans `flows.yml` + `flows-custom.yml`, prints compact table
- Unit test: mock registry, verify output format
- e2e: `flow list` against `.agent-fleet/flows.yml`

### Step 2 — Run storage (no daemon yet)
- `FlowCliRunner` writes `StepTrace[]` to `.agent-fleet/runs/<runId>/steps.jsonl` after each step
- Writes `declared.yml`, `meta.json`, `outputs.json` on complete/fail
- Unit tests: verify files written, correct schema
- e2e: `flow run` on a simple flow, inspect run directory

### Step 3 — Engine daemon + queue
- `engine.js` binary: socket detection, daemon mode, forwarder mode
- Queue: write `<runId>.json` before spawning, executor picks it up
- Semaphore: max 2 concurrent executors
- Idle auto-exit
- Unit tests: socket lifecycle, queue drain, crash recovery (orphaned queue entry)
- e2e: `flow run` submits to daemon, second `flow run` reuses same daemon

### Step 4 — Stages in flow YAML + FlowExecutor
- Add `stages:` field to flow schema
- `FlowExecutor` tracks current stage, emits stage-boundary event
- `flow show` displays stage groupings
- Unit tests: stage boundary detection, parallel step grouping
- e2e: flow with two stages, verify boundary event fires after all parallel steps

### Step 5 — Policy engine (static lint only)
- `PolicyEngine` class: loads `.agent-fleet/policies/*.yml`, validates flow against rules
- `flow validate --policy` command
- Policy YAML schema v1: `trigger` (files-modified-match), `evaluate-at`, `requires-tag`
- Unit tests: trigger matching, tag scanning, lint output format
- e2e: policy file with frontend rule, validate a flow that violates it

### Step 6 — Policy engine (live observation, no justification yet)
- `PolicyEngine.observe(traces)` hook called by `FlowExecutor` after each step + stage boundary
- Detects violations, injects `policy:` steps into the live flow
- `steps.jsonl` includes injected steps with `policy:` prefix
- Unit tests: injection point correctness, scope queries (last-step, stage, all)
- e2e: flow touches frontend, engine injects agent-browser gate automatically

### Step 7 — Justification + confidence
- After violation detected, executor prompts step agent for justification
- Policy-checker agent verifies the claim against `StepTrace` diffs
- Confidence routing: HIGH → accept, MEDIUM → subprocess, LOW → user_intervention
- Unit tests: confidence routing, falsifiable claim verification
- e2e: CSS-only change justification accepted (HIGH), render logic change escalates to human

### Step 8 — `flow policy show`
- Static view: `flow policy show <file>` — which policies apply
- Post-run view: `flow policy show --run <id>` — declared vs actual, policy log
- Unit tests: diff computation, policy log parsing
- e2e: run a flow with injections, verify post-run audit output

### Step 9 — Crystallization tooling
- `flow analyze --run <id>` — surfaces crystallization candidates from run trace
- Highlights: injected steps that could become template steps, retry hot spots
- No auto-apply — output is recommendations only
- Unit tests: recommendation heuristics
- e2e: run with repeated injection, verify recommendation surfaces
