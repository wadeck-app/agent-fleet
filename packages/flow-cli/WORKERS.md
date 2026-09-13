# flow-cli Workers

A worker is what actually runs a step. The daemon never runs one itself; it routes.

Two commands answer "what have I got":

- `flow worker source list` — what is **declared**. Reads a file, works with no daemon.
- `flow worker list` — what is **connected**. Only this is capacity.

## The kinds of worker

| Kind                      | You run                                 | Shows as        | Serves `user_intervention`  | Survives a daemon restart | Capped by           |
| ------------------------- | --------------------------------------- | --------------- | --------------------------- | ------------------------- | ------------------- |
| Daemon-forked             | nothing                                 | `daemon-forked` | no                          | no                        | `queue.concurrency` |
| Terminal                  | `flow worker`                           | `external`      | yes, if a plugin can prompt | yes                       | —                   |
| `built-in:command` source | `flow worker source add …`              | `<sourceId>`    | yes                         | yes                       | `--max-workers`     |
| `built-in:inbound` source | `flow worker --source <id> --token <t>` | `<sourceId>`    | yes                         | yes                       | `--max-workers`     |
| `built-in:relay` source   | not implemented                         | —               | —                           | —                         | —                   |

### Daemon-forked

The invisible default: when a step has nobody, the daemon forks a worker for it.

Two things to know. It receives an **allow-listed environment** (T-08) — not your credentials, not
your ssh agent. And it can never serve a `user_intervention` step: its bundle carries no approval
plugin, so it always reports `interactive=false`.

### Terminal

```
cd <project>
flow worker
```

Inherits **your whole shell** — PATH, credentials, agent sockets. That is deliberate, and is what
makes your own tooling usable from a step, but a step dispatched here runs with the reach of that
terminal. Launch it where you would be willing to run the flow's commands yourself.

It records itself as `terminal-<pid>` (provider `built-in:inbound`, capacity 1) so it is listed
while disconnected, and removes that entry on Ctrl-C. Killed hard, the entry is pruned by the next
daemon that starts.

### `built-in:command` — the daemon launches it

```
flow worker source add factory-local \
  --provider built-in:command \
  --command "flow worker" \
  --cwd C:/path/to/project
```

Use this for anything that must work without you: the daemon creates the worker at startup (D#54)
and again whenever demand goes unserved (D#66), so an interactive step never races a worker that has
not reconnected yet.

The command needs no arguments — everything arrives in its environment: `FLOW_DAEMON_WS_URL`,
`FLOW_WORKER_SOURCE_ID`, `FLOW_WORKER_PROJECTS`, and `FLOW_WORKER_TOKEN`, a credential minted for
that launch alone and valid once. Both tokens printed by `add` are therefore discardable for a local
source; keep the worker token only if you also intend to start that worker by hand.

`--cwd` is not cosmetic: `flow worker` finds its project by walking up for `.flow/config.yml`, so
without it the worker serves the daemon's directory instead of yours.

Remote works the same way with `--command "ssh host flow worker"`, with one caveat: ssh does not
carry the environment, so the credential must be passed explicitly — and a token on an ssh command
line is visible in the remote's process list. Unresolved today.

### `built-in:inbound` — declared, dials in itself

```
flow worker source add laptop --provider built-in:inbound
flow worker --source laptop --token <worker token>     # wherever that worker lives
```

Nothing can reach such a worker, so nothing nudges it; it inherits the source's labels (D#30) and
counts against its cap.

### `built-in:relay` — declared but not usable

The daemon side exists (`RelayWorkerSource`, `provide_worker`); the process to run on the remote
machine does not. Declaring one today yields "no relay connected". A relay does no work: it holds a
connection to the daemon and launches a local worker when asked.

## Three rules that explain most surprises

1. **Declared is not available** (D#4). A declared source with nothing attached is intent, not
   capacity, and dispatch only ever targets a live connection.
2. **A worker serves only the projects it announces** — its launch directory plus each `--project`.
   A worker started in the wrong directory will never take your steps.
3. **Interactivity comes from the plugin, not the terminal.** No approval plugin means
   `interactive: false` even in a real terminal; `plugins.cli-approval` needs a TTY;
   `plugins.file-approval` does not, which is what lets a script, an agent or a remote reviewer
   answer a checkpoint.

## Credentials

| Kind                  | Presents                                                              | Rotates                                         |
| --------------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| Terminal, no source   | the daemon's `health_token`, over loopback only                       | on every daemon start — re-read at each attempt |
| Launched by a source  | a one-shot token minted for that launch, valid once, expires in 2 min | per launch                                      |
| Named source, by hand | that source's registration token from `add`                           | never; `remove` + `add` to rotate               |

Only hashes are stored (T-09), so a token cannot be recovered from
`~/.config/flow/worker-sources.json`. A source credential and a worker credential are never
interchangeable (T-04, T-11).

## How a waiting worker learns the daemon is back

With no daemon there is nothing to register with, so a worker waits and retries: 500 ms, doubling to
30 s. To avoid paying that latency, it also watches the daemon directory and connects the moment
`worker.port` appears — the daemon publishes it once its listener is bound.

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

## What the messages mean

| You see                                                                                                     | It means                                                                          |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `interactive: false (no approval plugin configured…)`                                                       | add `plugins.approval` to `.flow/config.yml`                                      |
| `interactive: false (the configured approval plugin needs a terminal…)`                                     | you are not on a TTY; use `plugins.file-approval`                                 |
| `[wait] daemon connection closed; waiting to re-register`                                                   | normal with no daemon; it is waiting, not dying                                   |
| `Step "x" needs a person to answer it. No connected worker declared a user interface in the 45s it waited.` | no interactive worker appeared; check `flow worker list` shows `interactive=true` |
| `No worker is connected.` followed by declared sources                                                      | nothing live; the sources listed are contacted when a daemon starts               |

Refusals (a stale credential, an undeclared source, a cap reached) are in the daemon log:
`flow logs`.
