# Product Vision — agent-fleet

## Current state

Multi-agent orchestration system for autonomous software development using Claude Code. Two independent subsystems:

- **Web stack**: orchestrator + workers + web UI communicating over WebSocket (port 3738) and REST (port 3737).
- **Daemon CLI**: `flow-cli` — standalone, independently distributed. (`task-cli` moved to its own repo, [wadeck-app/task](https://github.com/wadeck-app/task).)

## Roadmap

### Plugin system

- **v2**: subprocess isolation, CI global config file, timeout contracts on provider methods, orchestrator approval plugin (T-06 gate resolved first — see threat model).
- **v3**: remote config download, plugin input/placeholder schema.

### CLI harmonization

Ordered: T5 (SDK XDG default `~/.config/<appName>`) → T7 (wdrive dead code removal) → T8 (SDK `UpdateCmd`) → T9 (wdrive npm migration).

### Policy engine

Autonomous external CLI receiving orchestrator events via `HookDispatcher` (HTTP hook) and calling daemon HTTP API to enforce rules on flow executions — same endpoint workers use.

### Flow CLI

- OpenCode step provider (alternate Claude provider).
- Meta-hooks.
- Merge of flow-cli feature specs into main branch.
