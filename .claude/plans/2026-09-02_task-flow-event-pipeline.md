# Task↔Flow Event Pipeline

**Date:** 2026-09-02
**Builds on:** `2026-06-20_flow-driven-development.md`, `2026-03-24_ticket-workflow-status-driven.md`

---

## Architecture

Task is a state tracker. Flow is the executor. Queue is the event bus and router. None knows the other's internals.

```
task new "fix JWT bug"
    │
    └─► onTaskCreated ──► queue push
                              │
                         .queue/subscribers.yml (project-local)
                         subscriber → flow run triage.yml --inputs taskId=...
                                           │ classify → task set-type bug
                                           │ [user_intervention: approval]
                                           │ task set-status todo
                                           │
                                           └─► onStatusChange { status:todo, type:bug } → queue push
                                                       │
                                                  subscriber (when: $.status=='todo' && $.type=='bug')
                                                       │
                                                  flow run fix-bug.yml --inputs taskId=...
                                                       │
                                                  ├─► task set-status in-progress
                                                  └─► task set-status done
```

Key invariants:
- All events go through queue — no direct hook dispatch.
- `task set-status` and `task set-type` are the only bridges from flow → task state. Flows call them as script steps.
- Approval steps are zero or more — a property of the flow, not of the task schema.
- Task status names are project-defined strings. `todo`, `in-progress`, `done` are conventions, not enforcement.

---

## Queue: Project-Local Config

Queue already supports two config layers, merged at runtime (`ConfigLoader.ts`):

| Layer | Path | Scope |
|---|---|---|
| Global | `~/.config/queue/subscribers.yml` | System-wide subscribers (retry infra, etc.) |
| Project | `<project-root>/.queue/subscribers.yml` | Project-specific routing |

`ConfigLoader` walks up the directory tree from `cwd` to find `.queue/subscribers.yml`. **No changes needed to queue.**

Project routing example:

```yaml
# <project-root>/.queue/subscribers.yml
subscribers:
  onTaskCreated:
    - type: cli
      command: flow run .agent-fleet/flows/triage.yml --inputs taskId=$TASK_ID description=$TASK_DESCRIPTION

  onStatusChange:
    - type: cli
      when: "$.status == 'todo' && $.type == 'bug'"
      command: flow run .agent-fleet/flows/fix-bug.yml --inputs taskId=$TASK_ID
    - type: cli
      when: "$.status == 'todo' && $.type == 'feature'"
      command: flow run .agent-fleet/flows/implement-feature.yml --inputs taskId=$TASK_ID
```

---

## Task Metadata (labels, type, priority)

The triage flow classifies the task and writes metadata onto it. Queue subscriber routing filters on that metadata via `when:` (PayloadFilter, JSONPath).

**Task metadata is a standalone required feature** — every project needs to classify and label tasks, independent of this pipeline.

Required primitives in task-cli:

| Command | Purpose |
|---|---|
| `task set-type <id> <type>` | Set the task type (freeform string: bug / feature / question / ...) |
| `task add-label <id> <label>` | Add a label (multiple allowed) |
| `task remove-label <id> <label>` | Remove a label |
| `task set-meta <id> <key> <value>` | Generic key/value metadata |

Types and labels are project-defined — task-cli enforces no enum.

Metadata must be included in every event payload pushed to queue so subscribers can filter on it:

```json
{ "taskId": "abc", "status": "todo", "type": "bug", "labels": ["auth"], "description": "..." }
```

**Status:** not implemented. `TaskStore` currently stores only `id`, `description`, `status`, `createdAt`, `updatedAt`.

---

## Flow → Task Bridge

A flow updates task state via script steps — already works today:

```yaml
- id: set-type
  type: script
  script: task set-type {{ inputs.taskId }} {{ steps.classify.outputs.taskType }}

- id: mark-todo
  type: script
  script: task set-status {{ inputs.taskId }} todo
```

`task set-status` fires `onStatusChange` → queue push → next subscriber picks up. No new primitives needed.

---

## task-cli → queue Migration (Phase 6)

Currently task-cli dispatches hooks via `HookDispatcher` (direct CLI command). It must be migrated to `queue push` so all events go through the queue (persistence, retry, DLQ).

This is Phase 6 of the queue implementation plan (`2026-08-28_queue-cli-implementation.md`). Nothing blocks it now — `orch add --once` (Phase 0) is already implemented.

---

## Task Skill for Agents

An agent creates tasks on behalf of the user via a Claude Code skill wrapping `task new`.

**Status:** not formalized. The Bash tool works but is not a documented agent interface.

---

## Open Questions

- What env vars does `onStatusChange` currently pass to hook commands? Metadata fields (`TASK_TYPE`, `TASK_LABELS`) must be added alongside `TASK_ID` / `TASK_STATUS` for the queue push payload to be complete.
- If `triage.yml` reaches a HITL rejection, what happens to the task status? It must not silently stay at `created` — the flow must either reset it or leave an explicit signal.

---

## Implementation Order

1. **Task metadata** (`set-type`, `add-label`, `set-meta`) + include metadata in event payloads.
2. **task-cli → queue migration** (Phase 6): replace `HookDispatcher` with `queue push`.
3. **Task skill** — formalize `task new` as an agent-callable skill.
