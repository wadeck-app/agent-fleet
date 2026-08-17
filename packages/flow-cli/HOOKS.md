# flow-cli Hooks

Hooks let you run a shell command or call an HTTP endpoint in response to lifecycle events in `flow run` and `task` commands.

All hooks are **fire-and-forget**: if a hook fails (non-zero exit, connection refused, timeout), the failure is silently ignored and execution continues. This is decision D32.

---

## Supported events

### Flow events (triggered by `flow run`)

| Event          | When it fires                          | Payload fields                      |
| -------------- | -------------------------------------- | ----------------------------------- |
| `onFlowStart`  | Execution begins, first steps enqueued | `executionId`, `flowId`, `flowFile` |
| `onStepStart`  | A step is dispatched to a worker       | `executionId`, `stepId`             |
| `onStepEnd`    | A step completed successfully          | `executionId`, `stepId`             |
| `onStepFailed` | A step failed                          | `executionId`, `stepId`, `error`    |
| `onFlowEnd`    | All steps completed successfully       | `executionId`                       |
| `onFlowError`  | Execution terminated with failure      | `executionId`                       |

### Task events (triggered by `task new` / `task set-status`)

| Event            | When it fires                    | Payload fields                                                                      |
| ---------------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| `onTaskCreated`  | `task new` creates a task        | `taskId`, `status`, `description`, `taskFile`, `taskProjectName`, `taskProjectPath` |
| `onStatusChange` | `task set-status` updates a task | `taskId`, `oldStatus`, `newStatus`, `taskProjectName`, `taskProjectPath`            |

---

## Hook types

### CLI hook

Runs a shell command via `execFile`. The payload fields are passed as environment variables in `SCREAMING_SNAKE_CASE` (e.g., `executionId` -> `EXECUTION_ID`).

**Security:** Only `PATH`, `HOME`, `TMPDIR`, `TEMP`, `TMP` (and `SystemRoot`, `USERPROFILE` on Windows) are forwarded from the daemon environment. Credentials like `ANTHROPIC_API_KEY` are NOT forwarded. Additional env vars must be declared explicitly in `env:`.

**`debug: true`** -- pipes the hook's stdout and stderr directly to the calling terminal. For debugging only. Do NOT use in production (output mixes with CLI output, incompatible with `--json` mode). Default: `false`.

```yaml
# .flows/config.yml
hooks:
    onFlowStart:
        - type: cli
          command: my-script
          args: ['--flag', 'value']
          env:
              MY_TOKEN: 'secret-value' # explicitly forwarded
          debug: false # set true to see output in terminal (debugging only)
```

```yaml
# .task/config.yml  -- two formats supported:
hooks:
    # Simple string (no debug output)
    onTaskCreated: my-script --flag value

    # Object format (supports debug)
    onStatusChange:
        command: my-script --flag value
        debug: true # stdout/stderr appear in terminal
```

Note: task hook command strings are split on whitespace. Complex commands must use a script file.

### HTTP hook

POSTs a JSON body to the configured URL. The payload is the raw object (camelCase keys, not SCREAMING_SNAKE_CASE).

```yaml
# .flows/config.yml
hooks:
    onFlowEnd:
        - type: http
          url: https://hooks.slack.com/services/XXX/YYY/ZZZ
          method: POST
          headers:
              Authorization: 'Bearer my-token'
    onStepFailed:
        - type: http
          url: https://my-ci.example.com/notify
          method: POST
```

Both `http://` and `https://` URLs are supported. Timeout is 10 seconds.

---

## Config file locations

### Flow hooks

File: `.flows/config.yml` in the working directory where `flow run` is invoked.

```yaml
hooks:
    <eventName>:
        - type: cli | http
          # ... (see above)
```

Multiple hooks per event are supported and run concurrently (`Promise.all`).

### Task hooks

Two files are merged (project overrides global):

- Global: `~/.task/config.yml`
- Project: `.task/config.yml` (in the directory where `task` is run)

```yaml
hooks:
    onTaskCreated: <command string>
    onStatusChange: <command string>
```

Task hooks only support CLI transport (no HTTP). The command string is split on whitespace.

---

## Receiving hook data in a CLI hook

Payload fields arrive as env vars. Example for `onTaskCreated`:

```
TASK_ID=abc123
STATUS=created
DESCRIPTION=My new task
TASK_FILE=/home/user/.task/projects/myproject/tasks/abc123.json
TASK_PROJECT_NAME=myproject
TASK_PROJECT_PATH=/home/user/myproject
```

Example script (`hook-logger.js`):

```js
'use strict';
const fs = require('fs');
const path = require('path');
const logFile = path.join(__dirname, 'hook-log.txt');
const line = `[${new Date().toISOString()}] TASK_ID=${process.env.TASK_ID} STATUS=${process.env.STATUS}\n`;
fs.appendFileSync(logFile, line, 'utf8');
```

```yaml
# .task/config.yml
hooks:
    onTaskCreated: node /absolute/path/to/hook-logger.js
```

Note: use an absolute path for scripts called from `flow run` (daemon CWD may differ). For `task` commands, `./hook-logger.js` works if the script is in the project directory and `task` is run from there.

---

## HTTP hook payload shape

```json
{
	"executionId": "abc123",
	"flowId": "my-flow",
	"flowFile": "/path/to/flow.yml"
}
```

Keys are camelCase. The exact fields match the table in "Supported events" above.

---

## Limitations (v1)

- **No `on-failure: fail-task`**: hook failures are always ignored (tracked for v2, decision D32)
- **No ordering guarantee**: multiple hooks for the same event run concurrently
- **No retry**: a failed HTTP request is not retried
- **Task hooks**: CLI transport only, no HTTP
- **Blocking hooks**: not supported; hooks cannot influence execution flow

---

## Testing hooks locally

A demo setup exists in `C:\Workspace_Tooling\_test-tasks\`:

```bash
cd /c/Workspace_Tooling/_test-tasks

# Task hooks
task new "my test task"        # fires onTaskCreated
task set-status <id> done      # fires onStatusChange
cat hook-log.txt               # see logged events

# Flow hooks
flow run task-meta-test.yml --wait
cat hook-log.txt
```

`hook-logger.js` in that directory writes all received env vars to `hook-log.txt`.
