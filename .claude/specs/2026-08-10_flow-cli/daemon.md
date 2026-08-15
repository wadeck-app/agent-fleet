# Engine Daemon

Source: `packages/flow-cli/src/engine-daemon.ts`

> **Status: PoC.** The daemon uses in-memory state. The full design (see `2026-06-20_flow-driven-development.md`) calls for filesystem-persisted queue, per-run step traces, branch isolation, and crash recovery — none of which are implemented.

## Configuration

| Property      | Value                                             |
| ------------- | ------------------------------------------------- |
| TCP port      | `47832` (static, hardcoded)                       |
| Idle timeout  | `300_000` ms (5 minutes)                          |
| Drain timeout | `30_000` ms (30 seconds)                          |
| SDK           | `@wadeck/singleton-daemon-kit` — `createDaemon()` |

## Daemon entry point

`startEngineDaemon(configDir: string)` creates a `FlowEngine` instance, wires its methods as commands, and calls `createDaemon({ configDir, commands, port, idleTimeout, drainTimeout })`.

The actual OS process entry point (`engine-daemon-entry.js`) does not exist in the TypeScript source tree. It is a compiled build artifact expected to call `startEngineDaemon(process.argv[2])`.

## Commands

### `run-flow`

Payload: `{ flowRef: string, inputs?: unknown }`

Response: `RunResult`

```ts
interface RunResult {
	runId: string;
	status: 'started' | 'queued';
	queuePosition?: number; // only present when status === 'queued'
}
```

Logic:

- Generate UUID `runId`
- If `running.length > 0` (a flow is already running): push to queue, return `{ runId, status: 'queued', queuePosition: queue.length }`
- Otherwise: push `runId` to `running`, schedule `setImmediate` that removes it from `running` and promotes next queued item, return `{ runId, status: 'started' }`

### `queue-status`

Payload: (none)

Response: `QueueStatus`

```ts
interface QueueStatus {
	pending: number; // queue.length
	running: number; // running.length
}
```

### `cancel`

Payload: `{ runId: string }`

Response: `CancelResult`

```ts
interface CancelResult {
	ok: boolean;
	reason?: string;
}
```

Logic:

- In queue → splice, return `{ ok: true }`
- In running → return `{ ok: false, reason: 'Cannot cancel running flow' }`
- Not found → return `{ ok: false, reason: 'runId not found' }`

## FlowEngine internals

```ts
class FlowEngine {
	private queue: Array<{ runId: string; flowRef: string; inputs?: unknown }> = [];
	private running: string[] = []; // acts as a concurrency slot of exactly 1
}
```

- Concurrency: **1 at a time** — the `running` array is treated as a single slot
- Queue promotion: via `setImmediate` (fire-and-forget, simplified PoC — actual flow execution is not wired)
- No persistence: all state is lost on daemon restart
- No real execution: `setImmediate` immediately removes the runId from `running` (simulates instant completion)
