# Policy Engine — Abstractions

> Spec created 2026-08-19.

## Daemon HTTP API

All endpoints are on `127.0.0.1` only. Authentication via `Authorization: Bearer <token>`.

### POST `/api/executions/:executionId/steps`

Inject steps into the running execution graph.

```
POST /api/executions/abc123/steps
Authorization: Bearer <daemon-token>
Content-Type: application/json

{
  "steps": [
    {
      "id": "security-scan",
      "type": "script",
      "script": "npm run security-check",
      "parent": "implement-feature"   // optional — makes this a sub-step
    }
  ]
}
```

Response `200`:

```json
{ "injected": ["security-scan"] }
```

Response `409` — step ID already exists:

```json
{ "error": "STEP_ALREADY_EXISTS", "stepId": "security-scan" }
```

Response `422` — validation error (unknown parent, invalid type, depth exceeded, etc.):

```json
{ "error": "VALIDATION_ERROR", "message": "..." }
```

---

### POST `/api/executions/:executionId/block`

Suspend execution immediately. The execution stays in `blocked` state until explicitly resumed or cancelled.

```
POST /api/executions/abc123/block
Authorization: Bearer <daemon-token>
Content-Type: application/json

{
  "reason": "Required security scan step is missing"
}
```

Response `200`:

```json
{ "status": "blocked" }
```

---

### GET `/api/executions/:executionId/state` _(v2)_

Read the current flow graph state: step list with statuses, inputs, outputs.

```
GET /api/executions/abc123/state
Authorization: Bearer <daemon-token>
```

Response `200`:

```json
{
	"executionId": "abc123",
	"status": "running",
	"steps": [
		{ "id": "implement-feature", "type": "model", "status": "running" },
		{ "id": "security-scan", "type": "script", "status": "pending" }
	],
	"inputs": { "ticket": "Fix login bug" },
	"outputs": {}
}
```

---

## Hook event payload

The daemon sends this on each event. `daemonApiUrl` and `daemonToken` are included so the recipient can call back.

```typescript
interface PolicyHookPayload {
	event: HookEvent; // 'onStepEnd', 'onStepStart', etc.
	executionId: string;
	daemonApiUrl: string; // e.g. "http://127.0.0.1:3401"
	daemonToken: string; // Bearer token for daemon HTTP API
	stepId?: string; // present on step-level events
	flowState: FlowStateSnapshot;
}

interface FlowStateSnapshot {
	steps: Array<{ id: string; type: string; status: string }>;
	inputs: Record<string, string>;
	outputs: Record<string, Record<string, unknown>>;
}
```

---

## Authentication

The daemon generates a random token at startup (`crypto.randomBytes(32).toString('hex')`).

Distribution:

- Included in every hook payload (`daemonToken` field) → available to the policy engine
- Passed to workers as an environment variable (`FLOW_DAEMON_TOKEN`) → available to `McpServer` callback

All requests without a valid `Authorization: Bearer <token>` header return `401`.

---

## Rule schema (policy engine internal)

```typescript
interface PolicyRule {
	id: string;
	on: HookEvent[]; // events that trigger this rule
	conditions: Condition[]; // ALL must be true (AND semantics)
	actions: Action[];
}

type Condition =
	| { type: 'step_absent'; stepId: string }
	| { type: 'step_status'; stepId: string; status: string }
	| { type: 'output_match'; stepId: string; field: string; pattern: string };

type Action = { type: 'inject'; steps: InjectedStep[] } | { type: 'block'; reason?: string } | { type: 'noop' };
```

---

## Config registration (`.flows/config.yml`)

```yaml
hooks:
    onStepEnd:
        - type: http
          url: http://localhost:3399/policy
    onFlowStart:
        - type: http
          url: http://localhost:3399/policy
```
