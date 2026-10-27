# flow-cli Workers

A worker is what actually runs a step. The daemon never runs one itself; it routes.

Two commands answer "what have I got":

- `flow worker source list` -- what is **declared**. Reads a file, works with no daemon.
- `flow worker list` -- what is **connected**. Only this is capacity.

## The kinds of worker

| Kind                      | You run                                 | Shows as        | Serves `user_intervention`  | Survives a daemon restart | Capped by           |
| ------------------------- | --------------------------------------- | --------------- | --------------------------- | ------------------------- | ------------------- |
| Daemon-forked             | nothing                                 | `daemon-forked` | no                          | no                        | `queue.concurrency` |
| Terminal                  | `flow worker`                           | `external`      | yes, if a plugin can prompt | yes                       | --                  |
| `built-in:command` source | `flow worker source add …`              | `<sourceId>`    | yes                         | yes                       | `--max-workers`     |
| `built-in:inbound` source | `flow worker --source <id> --token <t>` | `<sourceId>`    | yes                         | yes                       | `--max-workers`     |
| `built-in:relay` source   | not implemented                         | --              | --                          | --                        | --                  |

### Daemon-forked

The invisible default: when a step has nobody, the daemon forks a worker for it.

Two things to know. It receives an **allow-listed environment** (T-08) -- not your credentials, not
your ssh agent. And it can never serve a `user_intervention` step: its bundle carries no approval
plugin, so it always reports `interactive=false`.

### Terminal

```
cd <registered project folder>
flow worker                       # serves that project
flow worker --project other-app   # ...and other-app too (repeatable)
```

The project must be registered (`project add "<folder>"`, `project list`). `--project` takes a registered name, alias or id; a folder path is refused with a hint to `project add` it.

Inherits **your whole shell** -- PATH, credentials, agent sockets. That is deliberate, and is what
makes your own tooling usable from a step, but a step dispatched here runs with the reach of that
terminal. Launch it where you would be willing to run the flow's commands yourself.

It records itself as `terminal-<pid>` (provider `built-in:inbound`, capacity 1) so it is listed
while disconnected, and removes that entry on Ctrl-C. Killed hard, the entry is pruned by the next
daemon that starts.

### `built-in:command` -- the daemon launches it

```
flow worker source add factory-local \
  --provider built-in:command \
  --command "flow worker" \
  --cwd C:/path/to/project
```

Use this for anything that must work without you: when a step needs capacity nothing can serve, the
daemon asks this source first and only forks as a fallback (D#66, D#25). An interactive step
therefore gets a worker that can answer it, instead of racing a terminal worker that may not have
reconnected -- the step waits while the source is asked, which is what the 45s bound in the
interactivity policy is for.

Sources are not asked at daemon startup: a daemon with nothing to do stops in about a second, so the
worker it created was disconnected 20ms after connecting.

The command needs no arguments -- everything arrives in its environment: `FLOW_DAEMON_WS_URL`,
`FLOW_WORKER_SOURCE_ID`, `FLOW_WORKER_PROJECTS`, and `FLOW_WORKER_TOKEN`, a credential minted for
that launch alone and valid once. Both tokens printed by `add` are therefore discardable for a local
source; keep the worker token only if you also intend to start that worker by hand.

`--cwd` is still the worker's working directory, and `flow worker` serves the registered project
containing it (or `FLOW_PROJECT`). Without `--cwd` that is the daemon's directory, which is usually
not a project: start the worker from a registered folder, or set `FLOW_WORKER_PROJECTS` /
`--project` to name the projects it serves (it may then start outside any project).

Remote works the same way with `--command "ssh host flow worker"`, with one caveat: ssh does not
carry the environment, so the credential must be passed explicitly -- and a token on an ssh command
line is visible in the remote's process list. Unresolved today.

### `built-in:inbound` -- declared, dials in itself

```
flow worker source add laptop --provider built-in:inbound
flow worker --source laptop --token <worker token>     # wherever that worker lives
```

Nothing can reach such a worker, so nothing nudges it; it inherits the source's labels (D#30) and
counts against its cap.

### `built-in:relay` -- declared but not usable

The daemon side exists (`RelayWorkerSource`, `provide_worker`); the process to run on the remote
machine does not. Declaring one today yields "no relay connected". A relay does no work: it holds a
connection to the daemon and launches a local worker when asked.

### Plugin source -- a worker type from a plugin

```
flow worker source add sandbox --provider docker-sandbox --plugin <pluginId>.<implName> \
  --plugins-dir <absolute dir> --option image=node:22
```

- Implements the `worker-type` extension point (`extension-points/src/worker-type/v1.ts`). `--provider` is a free label, never `built-in:*`.
- `--plugins-dir` must be absolute and contain `plugin-<pluginId>/plugin.config.js`: plain, self-contained JS (no `node_modules` beside it). `<pluginId>` and `<implName>` are plain names (letters, digits, `_`, `-`).
- The plugin is trusted code: it runs inside the daemon with its privileges. Nothing confines it to `--plugins-dir` (a symlink or junction inside it is followed); the directory is yours to choose.
- `--option key=value` values reach the plugin unvalidated. A value written as `${ENV_VAR}` is replaced by the daemon with the variable from ITS environment when it builds the instance; an unset variable fails the build with an error naming the source, the option and the variable. Set it where the daemon is started, then restart the daemon.
- Only the keys in the sensitive list (`token`, `password`, `secret`, ...) are checked: a literal there is refused. A secret under any other key (for example `--option dockerPass=...`) is accepted, stored in plain text in `worker-sources.json`, and visible in shell history and the process list. Always pass secrets as `${ENV_VAR}`.
- The daemon builds one instance per source on first contact and reuses it. Loading and the factory are bounded (30s). A load error names the source, plugin, cause and fix, and is only cured by restarting the daemon: Node keeps a module that failed to import, or was edited, as it first loaded it.
- `onRunEnded` runs only when a worker of the source declared `run-events` and was handed a step of the run. It runs after the `run_end` acks, once per source per run, bounded by `ackTimeoutSeconds`; a failure or hang is logged and the workspace is released anyway.
- `dispose()` runs when the daemon stops (after the run-end hooks; the whole stop is capped at two ack timeouts plus 30s) and when a source leaves the registry. `source remove` runs in another process, so the daemon disposes at its next contact with sources or at stop. A run that ends after its source was disposed logs a warning naming the source and execution: its leftovers (sandboxes) are yours to remove.

### Binding a run to a worker type (`workerType:`)

```yaml
workerType: sandbox # flow level, next to `labels:`
```

- **The type of a worker** is the plugin id of its source's `--plugin <pluginId>.<implName>`: `sandbox.docker` and `sandbox.podman` are both type `sandbox`. A worker of a source without a plugin, or naming no source, has no type. A worker's source is authenticated by its source token.
- **Every step of a bound run runs only on workers of that type**, injected steps included. It never falls back to a host worker, and no acceptance or distribution plugin can widen the set. Labels cannot give this guarantee: flow labels are merged into steps only at run start.
- **Unknown type**: the run is refused (`VALIDATION_FAILED`) listing the known types. `flow validate` checks the name's shape only; the declared sources are per machine.
- **No worker of the type connected**: a step waits `worker.boundStepWaitSeconds`, then fails with a message naming the type and the known ones. A connected worker that is busy keeps the step queued without a deadline; the clock restarts whenever one is connected. A worker lost before the step starts is re-dispatched to the type up to 3 times, then the step fails.
- A bound step can still make the daemon fork host workers for unmet demand; they stay idle for the bound run.
- The binding is recorded in the execution record (`workerType`); `flow resume` keeps it.
- Not set: behavior is unchanged.

## Three rules that explain most surprises

1. **Declared is not available** (D#4). A declared source with nothing attached is intent, not
   capacity, and dispatch only ever targets a live connection.
2. **A worker serves only the projects it announces** -- its own registered project plus each
   `--project`, matched by project id. A worker attached to the wrong project never takes your steps.
   `flow worker list` still shows folder paths (informational); routing uses ids. The daemon refuses
   a worker on an older protocol (no `project-id` feature): run `flow cli update` on the worker's
   machine and restart it (the reason is in the daemon log).
3. **Interactivity comes from the plugin, not the terminal.** No approval plugin means
   `interactive: false` even in a real terminal; `plugins.cli-approval` needs a TTY;
   `plugins.file-approval` does not, which is what lets a script, an agent or a remote reviewer
   answer a checkpoint.

## Credentials

| Kind                  | Presents                                                              | Rotates                                          |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| Terminal, no source   | the daemon's `health_token`, over loopback only                       | on every daemon start -- re-read at each attempt |
| Launched by a source  | a one-shot token minted for that launch, valid once, expires in 2 min | per launch                                       |
| Named source, by hand | that source's registration token from `add`                           | never; `remove` + `add` to rotate                |

Only hashes are stored (T-09), so a token cannot be recovered from
`~/.config/flow/worker-sources.json`. A source credential and a worker credential are never
interchangeable (T-04, T-11).

## How a waiting worker learns the daemon is back

With no daemon there is nothing to register with, so a worker waits and retries: 500 ms, doubling to
30 s. To avoid paying that latency, it also watches the daemon directory and connects the moment
`worker.port` appears -- the daemon publishes it once its listener is bound.

The notification is **advisory**: it resets the wait, it does not force a connection, and losing it
costs only latency. The worker always initiates; nothing ever connects to a worker.

That watch is local-only. Deliberately, because the alternatives are worse:

- **An HTTP nudge to the worker** requires the worker to listen: an inbound surface on every
  machine, TLS for any non-loopback bind, a reachable address per worker, and NAT breaks it.
- **The daemon initiating the work connection** is worse still: the worker would have to
  authenticate the daemon, and a rogue daemon feeding steps to a worker is arbitrary code execution
  on that machine.
- **A rendezvous service both sides call** is a broker, rejected by D#3.

For a remote machine the daemon cannot reach, the answer is a relay: the notification then rides a
connection the remote side opened, so nothing is exposed and the worker still initiates.

## How the daemon knows a worker is broken

The socket is the liveness signal; there is no heartbeat. When it closes, what happens depends on
whether the step had started (D#65): assigned but not started goes back on the queue, up to three
times; already executing is failed, with no automatic retry, because it may have had an effect
already.

A wedged worker never closes its socket, so silence is the second signal: an executing step that
reports nothing for `queue.stepSilenceLimitSeconds` (default 1800) is failed the same way. Any
output counts as progress, so a slow step is not a stuck one. Raise the setting for work that is
legitimately quiet for longer.

## Telling workers a run ended (`run-events`)

A worker that declares the `run-events` feature and was handed a step of a run gets `run_end`
(`completed`, `failed` or `daemon_stopping`) once, and answers `run_end_ack`. Other workers never
receive it. The run's workspace is released only after the ack, the worker's disconnect, or the
timeout; on timeout the daemon logs an error naming the worker, source and execution.

| Key (daemon `config.yml`, section `worker`) | Default | Meaning                                                                                                                                                                                    |
| ------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `runEventsEnabled`                          | `true`  | `false` restores the previous behavior: nothing sent, workspace released at once                                                                                                           |
| `ackTimeoutSeconds`                         | `30`    | 1 to 120. Bounds each wait (served workers settling, the acks, and a plugin's `onRunEnded`), so a finished run can wait up to three times this; stopping the daemon waits up to twice this |
| `boundStepWaitSeconds`                      | `120`   | 1 to 600. How long a step of a run bound to a worker type (`workerType:`) waits with no worker of that type connected before it fails                                                      |

On daemon stop the notice is written before the sockets close, so a worker the daemon did not
create is closed right after it and cannot ack.

Only a daemon-forked worker gets more than that, because only there does the daemon own the process:
a forked pid that never connects is killed after 10s, and its exit is noticed.

## What the messages mean

| You see                                                                                                     | It means                                                                                           |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `interactive: false (no approval plugin configured…)`                                                       | add `plugins.approval` to the project config (see PLUGINS.md)                                      |
| `interactive: false (the configured approval plugin needs a terminal…)`                                     | you are not on a TTY; use `plugins.file-approval`                                                  |
| `[wait] daemon connection closed; waiting to re-register`                                                   | normal with no daemon; it is waiting, not dying                                                    |
| `Step "x" needs a person to answer it. No connected worker declared a user interface in the 45s it waited.` | no interactive worker appeared; check `flow worker list` shows `interactive=true`                  |
| `No worker is connected.` followed by declared sources                                                      | nothing live; the sources listed are contacted when a step needs capacity                          |
| `the worker running this step reported nothing for 1800s, so it is treated as stuck`                        | the step produced no output for that long; raise `queue.stepSilenceLimitSeconds` if that is normal |

Refusals (a stale credential, an undeclared source, a cap reached) are in the daemon log:
`flow logs`.
