# Engine Client

Source: `packages/flow-cli/src/engine-client.ts`

## `createEngineClient(configDir: string)`

Wraps `createDaemonClient<EngineCommands>({ configDir, commands: ENGINE_COMMANDS_STUB })` from `@wadeck/singleton-daemon-kit`.

Returns a typed client with methods: `run-flow`, `queue-status`, `cancel`, `isRunning()`.

The `ENGINE_COMMANDS_STUB` satisfies `EngineCommands` and provides no-op defaults used internally by the SDK (not called in production).

## `spawnDaemon(configDir: string)`

Spawns the daemon as a fully detached background process:

```ts
child_process.spawn(
  process.execPath,
  [path.join(import.meta.dirname, 'engine-daemon-entry.js'), configDir],
  { detached: true, stdio: 'ignore' }
)
child.unref()
```

- Uses `spawn` (not `fork`) — important for Windows compatibility
- `stdio: 'ignore'` — no pipe handles kept open, parent exits cleanly
- `detached: true` — child runs independently of parent process
- `child.unref()` — parent event loop does not wait for child
- Entry point: `engine-daemon-entry.js` in the same directory as the compiled client — this is a build artifact, not a TypeScript source file

## `autoStartDaemon(configDir: string)`

Returns the typed client after ensuring the daemon is running.

**Step-by-step:**

1. `createEngineClient(configDir)` → `client`
2. `await client.isRunning()` — if `true`, return `client` immediately
3. `spawnDaemon(configDir)` — detached spawn, no await
4. Record `deadline = Date.now() + 5000`
5. Loop while `Date.now() < deadline`:
   - Sleep 100 ms (`setTimeout` via `Promise`)
   - `await readPortFile(configDir)` — reads the port file the SDK writes when the daemon binds
   - If non-null → return `client`
6. If loop expires → throw:
   ```
   Error: Engine daemon failed to start within 5s — check logs (configDir: <configDir>)
   ```

| Constant | Value |
|---|---|
| `AUTO_START_TIMEOUT_MS` | `5_000` ms |
| `AUTO_START_POLL_INTERVAL_MS` | `100` ms |

## Type contract

```ts
type EngineCommands = {
  'run-flow':     (payload?: unknown) => Promise<RunResult>;
  'queue-status': (payload?: unknown) => Promise<QueueStatus>;
  'cancel':       (payload?: unknown) => Promise<CancelResult>;
} & CommandMap;
```

`RunResult`, `QueueStatus`, `CancelResult` are imported from `engine-daemon.ts` (type-only, not runtime).
