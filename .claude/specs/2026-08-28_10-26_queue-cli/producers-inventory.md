# Producers Inventory -- Queue CLI

**Version:** v0.1
**Last updated:** 2026-08-28
**Status:** Draft

## Overview

All known producers, their events, and concrete downstream use cases. Each project is potentially both a producer AND a consumer (pub/sub mesh).

---

## Producers

### flow-cli (`agent-fleet/packages/flow-cli/`)

Agentic flow execution daemon. Steps run Claude/OpenCode subprocesses.

| Event             | Type     | Payload                                                       | Concrete use case                                             |
| ----------------- | -------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| `beforeStepEnd`   | blocking | `{executionId, stepId, daemonApiUrl, daemonToken, flowState}` | policy-engine inspects flowState, can inject a step or abort  |
| `beforeStepStart` | blocking | `{executionId, stepId, daemonApiUrl, daemonToken}`            | policy-engine gates entry to a step                           |
| `onFlowStart`     | async    | `{executionId, flowId, flowFile}`                             | log, monitoring                                               |
| `onFlowEnd`       | async    | `{executionId}`                                               | wdrive uploads artifacts; task-cli marks associated task done |
| `onFlowError`     | async    | `{executionId, error}`                                        | alert subscriber; task-cli creates "flow failed" item         |
| `onStepFailed`    | async    | `{executionId, stepId, error}`                                | alert; policy-engine notified                                 |

**Current state:** HookDispatcher (CLI + HTTP), D32 swallow, no retry.
**Migration:** replace HookDispatcher with `queue push`.

---

### task-cli (`agent-fleet/packages/task-cli/`)

Personal task manager (YAML files in `.tasks/`).

| Event            | Type  | Payload                                                                     | Concrete use case                                                                         |
| ---------------- | ----- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `onTaskCreated`  | async | `{taskId, status, description, taskFile, taskProjectName, taskProjectPath}` | if `taskProjectName == "agent-fleet"` -> auto-start `feature-requirements-interview` flow |
| `onStatusChange` | async | `{taskId, oldStatus, newStatus, taskProjectName, taskProjectPath}`          | `-> done`: mark associated flow execution resolved; `-> in-progress`: assign worker       |

**Current state:** HookDispatcher CLI-only, no HTTP transport.
**Migration:** replace HookDispatcher with `queue push`.

---

### web-backend EventBus (`agent-fleet/packages/web-backend/`)

Internal event bus for ticket lifecycle events. Currently never dispatched externally.

| Event                    | Type  | Payload                                       | Concrete use case                        |
| ------------------------ | ----- | --------------------------------------------- | ---------------------------------------- |
| `onTicketCreated`        | async | `{ticketId, projectId, title, description}`   | auto-start a flow for the ticket         |
| `onTicketStatusChanged`  | async | `{ticketId, projectId, oldStatus, newStatus}` | trigger downstream flow; notify task-cli |
| `onTicketUpdated`        | async | `{ticketId, projectId, changedFields[]}`      | log, monitoring                          |
| `onTicketCommentCreated` | async | `{ticketId, commentId, content, author}`      | notify relevant agents                   |

**Current state:** Node EventEmitter, internal only, fire-and-forget.
**Migration:** wire EventBus.emit() to `queue push` for external consumers.

---

### gemini-generator (`C:/Workspace_Tooling/gemini-generator/`)

Automates image generation on Gemini via Playwright. Manages multiple accounts with quota tracking.

| Event                | Type  | Payload                                                  | Concrete use case                                                |
| -------------------- | ----- | -------------------------------------------------------- | ---------------------------------------------------------------- |
| `onImageGenerated`   | async | `{profileName, prompt, outputPaths[], count, timestamp}` | auto-trigger `image-tooling step 1` -- today 100% manual handoff |
| `onQuotaRateLimited` | async | `{profileName, remainingProfiles}`                       | rotate to next available profile                                 |
| `onGenerationFailed` | async | `{profileName, prompt, error, screenshotPath}`           | alert; today swallowed to stdout                                 |
| `onBatchCompleted`   | async | `{totalImages, prompts[], outputDir, duration}`          | trigger downstream pipeline on full batch                        |

**Current state:** stdout only, no dispatch.
**Migration:** add `queue push` calls at generation completion points.

---

### image-tooling (`C:/Workspace_Tooling/image-tooling/`)

Multi-step sprite pipeline: upscale -> circle (manual) -> extract -> cleanup (manual) -> resize + outlines. State in session object.

| Event                  | Type  | Payload                                   | Concrete use case                                                        |
| ---------------------- | ----- | ----------------------------------------- | ------------------------------------------------------------------------ |
| `onStepCompleted`      | async | `{step: '1'                               | '1b'                                                                     | '2'                                                                | '2b' | '3', baseDir, folders[], outputCount}` | step 1 done -> open Paint.NET automatically |
| `onManualStepRequired` | async | `{step: '1b'                              | '2b', baseDir, paintNetPath}`                                            | create task-cli item "Paint.NET circling required for dagger-icon" |
| `onPipelineCompleted`  | async | `{baseDir, sprites[], outlineVariants[]}` | move sprites to Unity assets; create task-cli "sprites ready for review" |
| `onStepFailed`         | async | `{step, error}`                           | alert; today swallowed                                                   |

**Current state:** `.process-state.json` only, no dispatch.
**Migration:** add `queue push` calls in pipeline step handlers.

---

### wdrive (`C:/Workspace_Tooling/wdrive/`)

Personal Dropbox alternative. chokidar watcher -> AES-256-GCM encrypt -> sync to PHP server. FileEventKind events already exist internally.

| Event            | Type  | Payload                                 | Concrete use case                                     |
| ---------------- | ----- | --------------------------------------- | ----------------------------------------------------- |
| `onFileSynced`   | async | `{relativePath, direction: 'upload'     | 'download', sizeBytes}`                               | new image downloaded -> auto-trigger image-tooling |
| `onFileConflict` | async | `{relativePath, conflictPath, machine}` | create task-cli item "resolve conflict: docs/plan.md" |
| `onSyncStuck`    | async | `{stuckMinutes, configDir}`             | replace existing PowerShell popup with task-cli item  |
| `onFileDetected` | async | `{relativePath, kind: FileEventKind}`   | `*.png` in watch folder -> kick off image-tooling     |

**Current state:** FileEvent internal only; `sync.stuck` fires a PowerShell popup (brittle).
**Migration:** wire FileEventKind handlers to `queue push`.

---

### violations-framework (`C:/Workspace_Tooling/violations-framework/`)

Runs TypeScript/React/C# quality rules. Output: `report.json` + exit code = violation count.

| Event                        | Type  | Payload                                                | Concrete use case                                                    |
| ---------------------------- | ----- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| `onViolationsCheckCompleted` | async | `{totalViolations, rulesRun[], reportPath, duration}`  | trigger auto "fix violations" flow if count > 0                      |
| `onViolationRuleFailed`      | async | `{ruleId, severity, violations[], count, projectRoot}` | monitoring; policy-engine may use this to decide next step injection |
| `onViolationsClean`          | async | `{rulesRun[], projectRoot}`                            | unlock deployment gate                                               |

**Current state:** `report.json` + exit code only, no dispatch.
**Migration:** add `queue push` calls after violations check completes.

---

### orchestrator (`C:/Workspace_Tooling/scrapers/packages/orchestrator/`)

Cron + startup job scheduler daemon. Runs shell commands. No event dispatch today.

| Event            | Type  | Payload                              | Concrete use case                                                      |
| ---------------- | ----- | ------------------------------------ | ---------------------------------------------------------------------- |
| `onJobStarted`   | async | `{jobId, label, pid, startedAt}`     | monitoring                                                             |
| `onJobCompleted` | async | `{jobId, label, exitCode, duration}` | `exitCode != 0` -> create task-cli "scraper failed: assurance-scraper" |
| `onJobFailed`    | async | `{jobId, label, exitCode, error}`    | trigger "re-run" flow after N minutes                                  |

**Current state:** writes to `state.json` only, no dispatch.
**Migration:** 3 native `queue push` calls in `src/scheduler.ts` after exit code capture.

---

## Event clusters

### Cluster 1 -- Blocking gates (`beforeXxx`)

Producer MUST wait for subscriber response before continuing. `{action: 'abort', reason}` stops the producer.

- `beforeStepEnd`, `beforeStepStart` from flow-cli -> policy-engine

### Cluster 2 -- Pipeline triggers (`onXxx` -> starts next step)

Guaranteed delivery required. Fire-and-forget semantically, but lost events break the automation chain.

- `onImageGenerated` -> image-tooling step 1
- `onStepCompleted` -> next pipeline step or Paint.NET notification
- `onFileSynced` (download) -> image-tooling

### Cluster 3 -- Actionable notifications (`onXxx` -> creates a human task)

- `onFileConflict` -> task-cli item
- `onSyncStuck` -> task-cli item (replaces PowerShell popup)
- `onJobFailed` -> task-cli item
- `onManualStepRequired` -> task-cli item

### Cluster 4 -- Monitoring / observability

No direct action, just visibility.

- `onBatchCompleted`, `onJobStarted/Completed`, `onFlowStart/End`, `onTaskCreated`

### Cluster 5 -- Resource management

- `onQuotaRateLimited` -> rotate Gemini profile
- `onViolationsClean` -> unlock deployment gate
