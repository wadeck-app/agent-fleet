# flow-cli Spec Index

Standalone CLI for running, validating, and inspecting agent flows without the backend, orchestrator, or UI.

## Threat model

- [threat-model.md](threat-model.md) — Risques acceptés documentés (AR-1 à AR-8) avec justification et risques résiduels

## Audit reports

- [audit-2026-08-10-initial.md](audit-2026-08-10-initial.md) — Audit initial (sécurité, qualité, consistance, maintenabilité) sur le code original
- [audit-2026-08-10-post-fix.md](audit-2026-08-10-post-fix.md) — Re-audit v1 post-correctifs : vérification finding par finding + nouveaux problèmes découverts
- [audit-2026-08-10-post-fix-v2.md](audit-2026-08-10-post-fix-v2.md) — Re-audit v2 : vérification finale, 12 nouveaux findings résolus, état final

## Spec files

- [commands.md](commands.md) — All four commands: exact signatures, options, output formats, exit codes
- [flow-resolution.md](flow-resolution.md) — How `flow run` resolves a flowRef (file path vs registry ID)
- [runner.md](runner.md) — FlowCliRunner: wiring, ExecutionConfig fields, output printing
- [daemon.md](daemon.md) — Engine daemon: port, timeouts, commands, FlowEngine queue logic
- [engine-client.md](engine-client.md) — autoStartDaemon flow, polling, spawnDaemon detach mechanics
- [launcher.md](launcher.md) — Two invocation modes (dev/tsx vs native Go binary), build script, launcher config
- [dependencies.md](dependencies.md) — Runtime and dev dependencies, workspace vs external

## Related plans

- [2026-06-18_flow-engine-standalone-cli.md](../../plans/2026-06-18_flow-engine-standalone-cli.md) — Original standalone CLI design: phases 1–4, test strategy, `flow show/validate/run/docs` commands
- [2026-06-20_flow-driven-development.md](../../plans/2026-06-20_flow-driven-development.md) — Broader Flow-Driven Development design: daemon architecture, policy engine, CLI surface extensions, quality gate stages (majority NOT yet implemented)
- [2026-03-13_ticket-to-flow-pipeline.md](../../plans/2026-03-13_ticket-to-flow-pipeline.md) — Backend pipeline phases 1–7 that the flow-cli integrates with (FlowExecutor, FlowRegistry, intervention handling)

## Implementation status

| Area                                          | Status                                                         |
| --------------------------------------------- | -------------------------------------------------------------- |
| `flow show`                                   | Implemented                                                    |
| `flow validate`                               | Implemented                                                    |
| `flow run`                                    | Implemented                                                    |
| `flow docs`                                   | Implemented                                                    |
| ThrowInterventionHandler                      | Implemented                                                    |
| Engine daemon (port 47832, in-memory queue)   | PoC only — in-memory state, no real execution                  |
| Engine client / autoStartDaemon               | Implemented                                                    |
| `engine-daemon-entry.ts` (daemon entry point) | Implemented (`src/engine-daemon-entry.ts`)                     |
| Go native launcher binaries                   | Build script + config present; binaries in `launcher-go/dist/` |
| Interactive interventions (readline)          | Deferred — not in v1                                           |
| Filesystem-persisted queue                    | Deferred — full design in 2026-06-20 plan                      |

## Fixes applied (2026-08-10)

| Finding                                    | Fix                                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| SEC-1: `yaml.load` unsafe schema           | All YAML loads now use `{ schema: yaml.JSON_SCHEMA }` via shared `loadYaml` utility             |
| Q/M-DUP: YAML load duplicated              | Extracted to `src/utils/loadYaml.ts` — used by `ShowCommand` and `ValidateCommand`              |
| Q-3: `ShowCommand` crash on missing fields | Guards `steps` and `workspace` before rendering                                                 |
| C-A1: `✗` on stdout                        | `ValidateCommand` now uses `console.error` for the `✗` line                                     |
| C-A3/Q-9: `DocsCommand` unguarded fs write | Wrapped in try/catch + `process.exit(1)`                                                        |
| Q-10/SHOW fallback: `stepType` fallback    | Now throws instead of returning raw type                                                        |
| Q-4/M-4: `flowsFile` dead option           | Removed from `RunOptions`                                                                       |
| M-5: inline workspace construction         | Extracted to `createCliWorkspace()` factory with explicit `: Workspace` return type             |
| M-7: port magic number                     | Named constants `ENGINE_DAEMON_PORT`, `ENGINE_IDLE_TIMEOUT_MS`, `ENGINE_DRAIN_TIMEOUT_MS`       |
| M-8: timeout string in error message       | Uses `AUTO_START_TIMEOUT_MS / 1000` dynamically                                                 |
| M-9: version hardcoded                     | Read from `package.json` via `createRequire`                                                    |
| M-1: missing `engine-daemon-entry.ts`      | Created `src/engine-daemon-entry.ts`                                                            |
| Q-1/7: payload validation in daemon        | Runtime guards on `run-flow` and `cancel` payloads                                              |
| C-1: indentation in engine-client.ts       | Converted to tabs                                                                               |
| C-2: import path inconsistency             | `ValidateCommand` now imports types from `'flow-engine/types'`                                  |
| M-2: tsx path in bin/flow.js               | Uses `require.resolve('tsx/dist/cli.mjs')` with upward fallback + error message                 |
| M-11: `FlowExecutor` positional boolean    | Added inline comment documenting non-interactive intent                                         |
| Q-12/13/14: zero tests                     | Added `ShowCommand.test.ts`, `DocsCommand.test.ts`, `FlowCliRunner.test.ts`, `loadYaml.test.ts` |
| Q-15: T8 timeout                           | Increased from 10s to 15s                                                                       |
