# Daemon Lifecycle

## What singleton-daemon-kit handles automatically

- Daemon detection via `~/.flow-daemon/config.port` (JSON: `{ sdkVersion, port, pid, startedAt }`)
- PID liveness check + mtime freshness check (heartbeat every 30s via `fs.utimes`)
- Single-instance enforcement with automatic takeover (SIGTERM escalation)
- Auth token generation and rotation (`health_token`)
- Idle timer with drain window (`idleTimeout` + `drainTimeout`)
- Lifecycle hooks: `onStart`, `onShutdown`, `onCommand`, `onCommandError`
- Shutdown via `DaemonHandle.stop(reason)` — cleans up port file, closes HTTP server

## What the flow CLI builds on top

Queue management, execution worker spawning, WebSocket server (worker channel), and log persistence (writing worker log entries to disk) — none of these are in singleton-daemon-kit. They live in flow CLI's command handlers.

## Startup sequence

```
flow run ./my-flow.yml
  │
  ├─ read ~/.flow-daemon/config.port
  ├─ check PID alive + mtime fresh
  │
  ├─ YES → POST /run to daemon, receive execution-id, exit
  │
  └─ NO  → call createDaemon({ configDir: ~/.flow-daemon, commands, idleTimeout: null })
              ├─ daemon binds TCP port on 127.0.0.1
              ├─ writes config.port + health_token
              ├─ load ~/.flow-config.yaml (queue config)
              ├─ process the triggering /run command
              └─ enters HTTP event loop
```

## Shutdown

The daemon has `idleTimeout: null` — it does NOT use singleton-daemon-kit's idle timer.
The flow CLI manages its own shutdown: when the ready-step queue drains, the command handler calls `daemonHandle.stop('idle')`.

`flow stop` is deferred to v2 (D34). In v1, the daemon exits automatically when the ready-step queue drains (D13).

## Config directory

```
~/.flow-daemon/
  config.port      ← port file (singleton-daemon-kit)
  health_token     ← auth token (singleton-daemon-kit)
```

`~/.flow-daemon/` must exist before first run. The CLI creates it on first invocation if absent.

## Complete configuration reference

`~/.flow-config.yaml` — all keys are optional, defaults shown:

```yaml
queue:
    concurrency: 1 # max steps executing simultaneously across all flows (D5)

logs:
    retainDays: 30 # daily log files kept; also controls execution file expiry (D17, D22)

worker:
    reconnectTimeoutMs: 30000 # max time a worker has to reconnect after daemon crash (D24)
    bufferSpillMs: 15000 # time before in-memory log buffer spills to disk during reconnection (D23)
    wsPort: <httpPort + 1> # WebSocket port for worker↔daemon channel (H3); default = HTTP port + 1
```
