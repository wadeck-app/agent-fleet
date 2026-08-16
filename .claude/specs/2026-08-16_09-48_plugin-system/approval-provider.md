# Approval Provider -- Plugin System for flow/task CLI

**Version:** v0.1
**Last updated:** 2026-08-16
**Status:** Draft

## Overview

The `approval` extension point abstracts how human interventions are presented and answered.
The flow-engine creates intervention requests; the provider decides how to surface them
(CLI prompt, web UI, Slack message, etc.) and blocks until a response is received.

This replaces the current coupling between flow-engine/StepRunner and the specific
intervention delivery mechanism (web UI in orchestrator, CLI in flow-cli).

## Decisions

*(Local decision numbering. Global Decision Log reference: Decision #5 in _index.md)*

| # | Decision | Rationale | Date |
|---|---|---|---|
| 5 | Three distinct methods: requestInput / requestChoice / requestApproval (Option A) | Clean typed signatures, no ambiguity on return types, easier to implement and test per case | 2026-08-16 |

## Interface (approval/v1.ts)

```typescript
// packages/extension-points/src/approval/v1.ts

export interface ApprovalProvider {
  requestInput(req: InputRequest): Promise<string>;
  requestChoice(req: ChoiceRequest): Promise<string>;      // returns selected choice id
  requestApproval(req: ApprovalRequest): Promise<boolean>;
}

export interface InputRequest {
  taskId: string;
  stepId: string;
  prompt: string;
  hint?: string;
}

export interface ChoiceRequest {
  taskId: string;
  stepId: string;
  prompt: string;
  choices: Array<{ id: string; label: string; description?: string }>;
}

export interface ApprovalRequest {
  taskId: string;
  stepId: string;
  prompt: string;
  context?: string;
}
```

## Sample: `cli` implementation (packages/plugin-cli-approval)

Blocks the terminal and prompts the user directly. Used by flow-cli running standalone.

```typescript
// SAMPLE -- packages/plugin-cli-approval/src/CliApprovalProvider.ts
export const cliApprovalProvider: ApprovalProvider = {
  async requestInput(req) {
    // print req.prompt, read a line from stdin
    // return the typed string
  },
  async requestChoice(req) {
    // print req.prompt + numbered list of req.choices
    // read a number, return req.choices[n].id
  },
  async requestApproval(req) {
    // print req.prompt + req.context, read y/n
    // return true/false
  },
};
```

Global config example:
```yaml
plugins:
  instances:
    cli-approval:
      type: plugins.cli-approval.default
```

## Sample: `orchestrator` implementation (packages/plugin-orchestrator-approval)

Stores the intervention request in the web backend, returns when the user responds via the web UI.
Used when flow-cli is managed by the orchestrator.

```typescript
// SAMPLE -- packages/plugin-orchestrator-approval/src/OrchestratorApprovalProvider.ts
export function createOrchestratorApprovalProvider(options: OrchestratorOptions): ApprovalProvider {
  return {
    async requestInput(req) {
      // POST /api/interventions { type: "input", ...req }
      // poll or websocket-wait for response
      // return response.value
    },
    async requestChoice(req) {
      // POST /api/interventions { type: "choice", ...req }
      // wait, return response.choiceId
    },
    async requestApproval(req) {
      // POST /api/interventions { type: "approval", ...req }
      // wait, return response.approved
    },
  };
}
```

Global config example:
```yaml
plugins:
  instances:
    web-approval:
      type: plugins.orchestrator-approval.default
      options:
        apiUrl: ${ORCHESTRATOR_URL}
        token: ${ORCHESTRATOR_TOKEN}
```

Note: the transport mechanism (polling vs WebSocket/SSE) between the orchestrator plugin and the web backend is an open question -- it must be decided before the orchestrator plugin is implemented. See Open Questions #11.

---

## Required code adjustments

The current HITL implementation in flow-engine is coupled directly to the web backend.
Migrating to the plugin system requires the following changes:

### 1. StepRunner -- inject ApprovalProvider instead of calling interventions directly

**Current:** `StepRunner` creates `InterventionRequest` objects and emits them via an internal
event bus or direct call to a hardcoded web backend path.

**Required:** `StepRunner` receives an `ApprovalProvider` instance via constructor injection
and calls `provider.requestInput / requestChoice / requestApproval` directly.

File to adjust: `packages/flow-engine/src/executor/StepRunner.ts` (or equivalent)

```typescript
// BEFORE (approximate current pattern)
const interventionId = await this.interventionService.create({ type: "choice", ... });
const response = await this.interventionService.waitForResponse(interventionId);

// AFTER
const choiceId = await this.approvalProvider.requestChoice({ taskId, stepId, prompt, choices });
```

### 2. FlowOrchestrator / FlowExecutor -- pass ApprovalProvider down to StepRunner

The provider instance is resolved from the project/global config at execution start and injected
into the StepRunner. The flow YAML has no `approval:` section -- it uses whatever is configured.

If an approval method is invoked (`requestInput`, `requestChoice`, or `requestApproval`) and no approval provider is configured, the CLI must fail with an explicit error at that point (P-4). No default provider is assumed, and no error is raised at startup for flows that never invoke HITL.

File to adjust: `packages/flow-engine/src/executor/FlowOrchestrator.ts`

### 3. Tool-call parsing (`request_user_input`, `request_user_choice`) maps to provider calls

The existing tool-call parsing that detects `<tool_call>{"tool_call": "request_user_input", ...}` 
in Claude's output should route to `approvalProvider.requestInput(...)` instead of the current
`InterventionRequest` creation path.

File to adjust: `packages/flow-engine/src/tools/ToolCallInjector.ts` (or equivalent)

### 4. Web backend intervention API -- becomes the orchestrator plugin implementation

The current `InterventionRequest` / web UI flow moves into `plugin-orchestrator-approval`.
The web backend API endpoints for interventions are unchanged -- they are now the transport
layer for this specific plugin, not a general flow-engine concern.

Files affected:
- `packages/web-backend/src/` -- intervention controller/service stays, becomes plugin internals
- `packages/web-frontend/src/` -- intervention UI components stay, no change needed

### 5. flow-cli standalone -- wires cli-approval plugin

When flow-cli runs without an orchestrator, it resolves the `cli-approval` plugin.
The terminal prompt replaces the web UI entirely.

File to adjust: `packages/flow-cli/src/` -- config resolution and plugin wiring at startup

---

## Security considerations

- `taskId` + `stepId` in every request: the orchestrator plugin uses these to ensure a response
  is matched to the correct pending intervention (T-06: a user must not answer another task's
  intervention -- cross-task intervention spoofing). The CLI plugin does not need this check (single user, blocking prompt).
- The orchestrator plugin must validate that the responding user is authorized for the given task. **This validation is Open -- v2, not yet specified.** The minimum requirement (e.g., match userId who created the task) must be defined before the orchestrator plugin ships.
- No timeout contract in v1 -- a hung `requestApproval()` or `requestInput()` blocks the CLI indefinitely. This is an accepted risk for developer-controlled environments. Tracked as a v2 hardening item (ref: threat-model.md § Denial of Service).
