# flow-cli Plugins

Two extension points: `workspace` (how a task gets a working directory) and `approval` (how a `user_intervention` step reaches a human or script). Both are configured in `.flow/config.yml` under `plugins:`.

`workspace` is required -- the daemon refuses to start without one. `approval` is optional; a worker without one reports `interactive: false` and rejects `user_intervention` steps.

## Workspace plugins

| Type string | What it does | Required options |
|---|---|---|
| `plugins.none.default` | Runs every step in the project root; no isolation, no git operations | -- |
| `plugins.worktree.default` | Creates a git worktree per task under `baseDir`; each task gets its own branch | `baseDir` (absolute path) |

### `plugins.none.default`

Use when steps write directly to the project (build tools, scripts that operate in-place). There is no cleanup: whatever a step writes stays.

```yaml
plugins:
  workspace:
    instance:
      type: plugins.none.default
```

### `plugins.worktree.default`

Use when steps must not interfere with each other or with the working tree. Each task gets a fresh branch checked out in a separate directory under `baseDir`.

```yaml
plugins:
  workspace:
    instance:
      type: plugins.worktree.default
      options:
        baseDir: /absolute/path/to/worktrees
        prefix: task-          # optional, prepended to branch names
```

`baseDir` must be absolute; a relative path would resolve against the daemon's working directory, not the project root.

## Approval plugins

| Type string | How it answers | Needs TTY | Use when |
|---|---|---|---|
| `plugins.cli-approval.default` | Reads from stdin | yes | human at a terminal |
| `plugins.file-approval.default` | Polls for a response file | no | script, agent, or headless worker |

### TTY fallback

When no `approval` section is configured and `flow worker` detects a TTY, it loads `plugins.cli-approval.default` automatically. Approvals appear inline in the worker terminal; no config change needed.

When the worker is not a TTY (launched by a source, a script, or another process), the fallback does not fire and the worker stays non-interactive.

### `plugins.cli-approval.default`

Prompts on stdout, reads from stdin. Only usable in a real terminal.

```yaml
plugins:
  approval:
    instance:
      type: plugins.cli-approval.default
```

No options.

### `plugins.file-approval.default`

Publishes a request file, polls for a response file. Neither end needs a terminal, so a script or agent can answer.

```yaml
plugins:
  approval:
    instance:
      type: plugins.file-approval.default
      options:
        dir: /absolute/path/to/approvals   # defaults to FLOW_APPROVAL_DIR, then ~/.config/flow/approvals
        timeoutMs: 1800000                 # default 30 min
        pollIntervalMs: 500               # default 500 ms
        settleMs: 2000                    # grace period for half-written response files
```

**Request file:** `<dir>/<executionId>_<stepId>.request.json` -- describes the question and its shape.
**Response file:** `<dir>/<executionId>_<stepId>.response.json` -- you create this to answer.
**After answer:** both files are moved to `<dir>/answered/`.

`dir` must be absolute. Set `FLOW_APPROVAL_DIR` as an alternative to writing it in config.

## How the daemon picks plugins

The daemon reads `.flow/config.yml` in the project root (resolved by walking up for that file). A worker reads the same file from its launch directory, which is why `--cwd` matters for `built-in:command` sources (see `WORKERS.md`).

Third-party plugins resolve from `node_modules`; built-in plugins (`none`, `cli-approval`, `file-approval`, `worktree`) are bundled inside the CLI and need no install.
