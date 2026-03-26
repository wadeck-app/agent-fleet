# Plan — Human-in-the-Loop: Tool-Callable Interventions

**Date:** 2026-03-26
**Branch:** ws2

---

## Context

Current flows require pre-planned `user_intervention` steps in YAML — the LLM cannot dynamically
decide to ask the user something mid-execution. The goal is to provide built-in tools
(`request_user_input`, `request_user_choice`) that any LLM step can call at runtime to pause
the flow, collect user input, and resume. Projects configure which tools are available at the
project/flow/step level (inheritance chain) without modifying the core app.

---

## What Already Exists (do not rebuild)

- `user_intervention` step type (approval/question/choice) — works, keep as-is
- `InterventionManager` (`packages/orchestrator/src/core/InterventionManager.ts`)
- `InterventionsRepository`, `InterventionsService`, `InterventionsController` (web-backend)
- `interventions.contract.ts` (shared-frontend-backend) + B2F WS events
- `Intervention` domain type in `packages/shared-orch-worker/src/domain-types.ts`
- PAUSE/RESUME message types in `FlowWorker` — **stubbed as TODO, must implement**

---

## Missing Pieces (to build)

### 1. Persistent Pause/Resume (flow-engine + worker)

**Why:** Current blocking interventions use an in-memory Promise. App restart = lost flow.

**Files:**

- `packages/worker/src/flow/FlowWorker.ts` — implement stubbed PAUSE/RESUME handlers
- `packages/orchestrator/src/storage/FileBasedOrchestratorStorage.ts` — add flow state persistence
- `packages/flow-engine/src/executor/FlowOrchestrator.ts` — expose serializable state snapshot

**What to store on pause:**

```ts
{
  taskId: string
  stepId: string              // which step was paused
  conversationHistory: Message[]  // Claude messages so far (for tool loop resume)
  completedSteps: string[]    // DAG state
  stepOutputs: Record<string, unknown>
  interventionId: string
}
```

**Resume flow:** when `InterventionsService.respond()` is called → orchestrator sends
`INTERVENTION_RESPONSE` to worker → worker reloads state from disk → StepRunner reinjects
`tool_result` into conversation → Claude continues.

---

### 2. Tool-Callable Mechanism in Model Steps (flow-engine)

**Architecture decision:** MCP server (preferred) vs custom tool_use loop in StepRunner.

**Recommended: local MCP server per FlowWorker process**

- FlowWorker starts an embedded MCP server on a local port/socket
- When launching Claude CLI for a model step, passes `--mcp-config` pointing to this server
- MCP server exposes: `request_user_input`, `request_user_choice`
- When Claude calls a tool → MCP handler creates Intervention → awaits response (blocking)
- This naturally pauses the Claude subprocess without complex conversation serialization

**Alternative (fallback): custom tool_use loop in StepRunner**

- Parse `tool_use` blocks from `stream-json` output
- Create Intervention → save state → pause
- On resume: restart Claude CLI with full conversation + `tool_result` injected

**Files to modify:**

- `packages/flow-engine/src/executor/StepRunner.ts` — tool loop in `executeModelStep()`
- `packages/flow-engine/src/processing/ClaudeLauncher.ts` — add MCP config / tool definitions
- `packages/flow-engine/src/types.ts` — extend `ModelFlowStep` with `tools?: ToolRef[]`
- `packages/worker/src/flow/FlowWorker.ts` — MCP server lifecycle

---

### 3. Tool Configuration & Inheritance (flow-engine + config)

**Inheritance chain:** project → flow → step (each level restricts, never expands beyond parent)

**YAML structure:**

```yaml
# .agent-fleet/project.yml  (project defaults)
defaults:
    tools: [request_user_input, request_user_choice]

# flows.yml (flow level — optional override)
flows:
    - id: feature-requirements-interview
      tools: [request_user_input, request_user_choice] # explicit or inherited
      steps:
          - id: gather-requirements
            type: model
            model: sonnet
            tools: [request_user_input] # subset for this step
            prompt: |
                ...

          - id: confirm-approach
            type: model
            tools: [request_user_choice] # different subset
            prompt: |
                ...
```

**Files:**

- `packages/flow-engine/src/types.ts` — add `tools?: ToolRef[]` to `ModelFlowStep`,
  `FlowDefinition`, `ProjectConfig`
- `packages/flow-engine/src/docs/FlowCapabilitiesGenerator.ts` — document tools + examples
- Tool resolution: new `ToolResolver.ts` in flow-engine that walks the inheritance chain

**Built-in tool definitions (MVP):**

```ts
request_user_input: {
  description: "Pause flow and ask user a free-text question. Use when you need open-ended input.",
  inputSchema: { question: string, context?: string }
  // returns: { value: string }
}

request_user_choice: {
  description: "Pause flow and ask user to pick from options. Use for decisions or approvals.",
  inputSchema: {
    question: string,
    options: Array<{ id: string, label: string, description?: string }>,
    allowComment: boolean
  }
  // returns: { selectedId: string, comment?: string }
}
```

---

### 4. Frontend UI for Interventions

**BLOCKING: delegate to frontend-dev agent.**

**4a. Global "Pending Interventions" indicator**

- Badge in app header/nav showing count of pending interventions
- Click → opens `InterventionsPanelPage` or drawer
- Subscribes to `B2F_INTERVENTION_CREATED`, `B2F_INTERVENTION_ANSWERED`

**4b. Interventions tab in ticket detail (TicketDetailLayoutG)**

- New tab "Interventions" with count badge
- Filter: interventions whose `taskId` belongs to a task linked to this ticket
- File: `packages/web-frontend/src/app/pages/tickets/TicketDetailLayoutG.tsx`
- New section: `InterventionsSection.tsx`

**4c. Response UI components**

- `FreeTextInterventionCard.tsx` — textarea + submit
- `MCQInterventionCard.tsx` — radio/checkbox options + optional comment textarea + submit
- Both: optimistic update (mark answered immediately, rollback on error)

**4d. Hook**

- `useInterventionsByTicket(ticketId)` — fetches + realtime refresh
- `useInterventionRespond()` — POST with optimistic update

---

### 5. Test Flow: `feature-requirements-interview`

**Purpose:** validate the full end-to-end pipeline with the "database debugger/viewer" use case.

```yaml
id: feature-requirements-interview
name: 'Feature Requirements Interview'
description: 'PM interview to gather requirements before generating a spec'
tools: [request_user_input, request_user_choice]
inputs:
    ticket_title: { type: string }
    ticket_description: { type: text }

steps:
    - id: pm-interview
      type: model
      model: sonnet
      tools: [request_user_input, request_user_choice]
      prompt: |
          You are a Senior PM/BA. Your goal is to gather enough information to write
          a complete technical spec for this feature request.

          Ticket: ${{ inputs.ticket_title }}
          Description: ${{ inputs.ticket_description }}

          Interview the user. Ask 3-5 focused questions using request_user_input for
          open questions and request_user_choice for decisions. Do not ask all questions
          at once — wait for each answer before asking the next.

          When done, output a structured requirements document.
      output:
          requirements_doc: { type: markdown }

    - id: generate-spec
      type: model
      depends: [pm-interview]
      model: sonnet
      tools: [] # no tools needed, pure generation
      prompt: |
          Based on these requirements: ${{ steps.pm-interview.outputs.requirements_doc }}
          Generate a detailed technical specification including:
          - Problem statement
          - Proposed solution
          - Data model changes
          - API endpoints
          - Frontend components
          - Open questions
      output:
          spec: { type: markdown }
```

---

## Implementation Phases

| Phase | Scope                                         | Prerequisite                 |
| ----- | --------------------------------------------- | ---------------------------- |
| 1     | Persistent pause/resume (FlowWorker)          | —                            |
| 2     | Tool-callable mechanism (MCP or tool loop)    | Phase 1                      |
| 3     | Tool inheritance config (YAML + ToolResolver) | Phase 2                      |
| 4     | Frontend UI for interventions                 | Phase 1 (API already exists) |
| 5     | FlowCapabilitiesGenerator update              | Phase 3                      |
| 6     | Test flow + end-to-end test                   | Phases 2, 3, 4               |

Phases 1 and 4 are independent — can run in parallel (backend + frontend agents).

---

## Critical Files

| File                                                                  | Change                                                |
| --------------------------------------------------------------------- | ----------------------------------------------------- |
| `packages/worker/src/flow/FlowWorker.ts`                              | Implement PAUSE/RESUME handlers                       |
| `packages/flow-engine/src/executor/StepRunner.ts`                     | Tool loop in executeModelStep                         |
| `packages/flow-engine/src/processing/ClaudeLauncher.ts`               | MCP config or tool injection                          |
| `packages/flow-engine/src/types.ts`                                   | `tools?: ToolRef[]` on ModelFlowStep + FlowDefinition |
| `packages/flow-engine/src/docs/FlowCapabilitiesGenerator.ts`          | Document tools + examples                             |
| `packages/orchestrator/src/storage/FileBasedOrchestratorStorage.ts`   | Flow state persistence                                |
| `packages/web-frontend/src/app/pages/tickets/TicketDetailLayoutG.tsx` | Add interventions tab                                 |
| `.agent-fleet/flows.yml` or `flows-custom.yml`                        | Add test flow                                         |

---

## Verification

1. Create ticket: "J'aimerais une page pour visualiser/debugger le stockage global de toutes les entités"
2. Assign flow `feature-requirements-interview`
3. Flow starts → Claude asks first question → intervention appears in UI (tab + global panel)
4. Respond to each question → verify flow resumes after each response
5. Restart app mid-interview → verify flow resumes correctly after restart
6. Verify final `requirements_doc` + `spec` outputs are coherent with the answers given
