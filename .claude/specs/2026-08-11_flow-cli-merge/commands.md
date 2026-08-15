# Unified CLI — Command Surface

## `flow` binary

| Command | Signature | Description | Source |
|---------|-----------|-------------|--------|
| `flow show` | `flow show <file>` | ASCII table: steps, types, deps, outputs | Repo A |
| `flow validate` | `flow validate <file> [--json\|--human]` | Validate YAML; default human output | Merged A+B |
| `flow run` | `flow run <flowRef> [--input k=v] [--flow-id id] [--wait] [--timeout Xm] [--json\|--human] [--quiet]` | Queue flow via daemon | Repo B + --wait from D3 |
| `flow docs` | `flow docs [-o <file>]` | FlowCapabilitiesGenerator markdown | Repo A |
| `flow list` | `flow list` | List executions from disk | Repo B v2 |
| `flow attach` | `flow attach <id>` | Tail logs for execution | Repo B v2 |
| `flow logs` | `flow logs <id>` | Grep logs for execution | Repo B v2 |
| `flow cancel` | `flow cancel <id>` | Cancel execution | Repo B v2 |

`flowRef` resolves: registry ID (from `.agent-fleet/flows.yml`) first, then file path.

## `task` binary

Unchanged from Repo B. Separate entry point, separate concern.

| Command | Signature |
|---------|-----------|
| `task new` | `task new <description>` |
| `task list` | `task list` |
| `task show` | `task show <id>` |
| `task approve` | `task approve <id>` |
| `task set-status` | `task set-status <id> <status>` |

## Output format (D4)

All commands accept `--json` and `--human`. Default is human-readable.

Global config override: `~/.flow-config.yaml` → `output.defaultFormat: json`
