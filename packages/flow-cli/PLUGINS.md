# flow-cli Plugins

`workspace` (where a run executes, declared by each flow; see below) and `approval` (how a `user_intervention` step reaches a human or script) are the two extension points documented here. They are not the only ones: `packages/extension-points/extension-points.json` registers every extension point with its status.

`approval` is optional; a worker without one reports `interactive: false` and rejects `user_intervention` steps.

## Workspace providers

The flow, not the config, chooses where its steps run: every flow declares `workspace:`. Providers, options and rules: `.claude/docs/flows/schema-reference.md` ("Workspace Configuration").

| Provider   | What it does                                          | Options                                |
| ---------- | ----------------------------------------------------- | -------------------------------------- |
| `in-place` | Runs in the project folder, shared                    | `dir`                                  |
| `readonly` | Same folder, flagged read-only (advisory)             | `dir`                                  |
| `worktree` | A git worktree and branch per run                     | `baseDir` (required), `prefix`         |
| `pool`     | Claims one free slot of prepared folders              | `dir` + `prefix` + `count`, or `slots`; `requireClean` |

```yaml
workspace: in-place
workspace: { provider: worktree, baseDir: ../worktrees }
```

Relative paths resolve against the project folder, never the daemon's working directory.

### Named instances

To reuse a provider with fixed options, or to use a third-party one, name an instance in the USER config (`~/.config/flow/config.yml`; `plugins.instances` is refused in a project config) and refer to it by name:

```yaml
# ~/.config/flow/config.yml
plugins:
    instances:
        my-worktree:
            type: plugins.worktree.default
            options:
                baseDir: /absolute/path/to/worktrees
```

```yaml
# in the flow
workspace: my-worktree
```

A name that is neither built in nor an instance is refused with the list of built-in providers. A sensitive option (token, password...) must be `${ENV_VAR}`; a literal is refused.

### Deprecated: `plugins.workspace`

`plugins.workspace` in the config is no longer a default for flows: the daemon logs a warning at start and ignores it. In a flow that has no `workspace:`, a `plugins.workspace` section is still served, with a deprecation warning. Migrate to `workspace:` (see `schema-reference.md`, "Removed and deprecated").

## Approval plugins

| Type string                     | How it answers            | Needs TTY | Use when                          |
| ------------------------------- | ------------------------- | --------- | --------------------------------- |
| `plugins.cli-approval.default`  | Reads from stdin          | yes       | human at a terminal               |
| `plugins.file-approval.default` | Polls for a response file | no        | script, agent, or headless worker |

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
                dir: /absolute/path/to/approvals # defaults to FLOW_APPROVAL_DIR, then ~/.config/flow/approvals
                timeoutMs: 1800000 # default 30 min
                pollIntervalMs: 500 # default 500 ms
                settleMs: 2000 # grace period for half-written response files
```

**Request file:** `<dir>/<executionId>_<stepId>.request.json` -- describes the question and its shape.
**Response file:** `<dir>/<executionId>_<stepId>.response.json` -- you create this to answer.
**After answer:** both files are moved to `<dir>/answered/`.

`dir` must be absolute. Set `FLOW_APPROVAL_DIR` as an alternative to writing it in config.

## How the daemon picks plugins

The daemon reads the project config in the registry (`<registry>/projects/<project id>/flow/config/config.yml`) of the registered project; `.flow/config.yml` in the repository is an error that gives the `mv` command. In a project config, `plugins` accepts only `workspace`, `tasks`, `secrets`, `approval` (`instances` belongs in `~/.config/flow/config.yml`), and any other key is refused with the file and key. Plugins declared in the config of the folder the daemon was launched from apply only if that folder is a registered project; an unregistered launch folder whose config declares `plugins:` is an error. A worker serves its own project (`FLOW_PROJECT`, else the registered project containing its cwd) plus the ones named by `--project` (see `WORKERS.md`).

Third-party plugins resolve from `node_modules`; built-in plugins (`in-place`, `readonly`, `worktree`, `pool`, `cli-approval`, `file-approval`, `none`) are bundled inside the CLI and need no install.

## Manifest `sensitiveFields` is not applied

A manifest implementation that declares `sensitiveFields` makes the loader print a warning (once per plugin id) and nothing else: the field is ignored, it neither adds nor removes names. Only the built-in `SENSITIVE_FIELDS` list (`packages/extension-points/src/sensitiveFields.ts`) is enforced; a literal under any other option name is accepted. Remove the field and have users pass secret options as `${ENV_VAR}`; to get a name refused as a literal, add it to the built-in list.
