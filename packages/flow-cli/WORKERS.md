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
| Relay source              | no relay process ships yet              | --              | --                          | --                        | --                  |

### Daemon-forked

The invisible default: when a step has nobody, the daemon forks a worker for it.

Two things to know. It receives an **allow-listed environment** (T-08) -- not your credentials, not
your ssh agent. And it can never serve a `user_intervention` step: its bundle carries no approval
plugin, so it always reports `interactive=false`.

It is also a built-in worker type, `fork.default` (`plugins.fork.default`), a registration stub: the daemon builds its fork fallback directly (from its own ports, log and masker), and the registered plugin exists to refuse a declared source. It is **not declarable**: `flow worker source add` refuses `--plugin fork.default` and `--provider built-in:fork`, because fork is the daemon's fallback, not a source. To add capacity declare a `built-in:command` source (or `command.default`) or an inbound source.

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

The same kind is also a built-in worker type, `command.default` (`plugins.command.default`), served from the built-in registry by the same code: `flow worker source add factory-local --provider command --plugin command.default --command "flow worker"`. No `--plugins-dir` is needed (one given is ignored, with a warning), and the launch token is lent by the daemon to built-ins only. The `built-in:command` provider string stays valid and unchanged.

**The two forms differ on `${NAME}`.** The plugin form expands `${NAME}` in `command`, `args` and `cwd` from the daemon's environment before launching (and the build fails, naming the variable, when it is unset). The `built-in:command` provider string never expanded anything: `--command "echo ${HOME}"` is left to the shell there and expanded by the daemon in the plugin form.

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

The same kind is also a built-in worker type, `inbound.default` (`plugins.inbound.default`): `flow worker source add laptop --provider inbound --plugin inbound.default --option nudgeUrl=http://127.0.0.1:5555/nudge`. No `--plugins-dir` is needed. The URL comes from `options.nudgeUrl` (`${NAME}` is expanded from the daemon environment) or from the entry's own `nudgeUrl` (which workers write about themselves); two different values are refused. At declaration the URL must be http(s). **A nudgeUrl never carries credentials: only host, port and path are used**, so user info (`http://u:p@h`, also written `http:u:p@h`) and a query key named like a credential (`token`, `key`, `api_key`, `access-token`, ... compared without case, `-` and `_`) are refused whatever their value, a `${NAME}` reference included. The rule goes by the key's NAME, so a harmless `?key=abc` is refused too: remove the query. The same checks apply when declaring a `built-in:inbound` source; entries already stored, and the entries a worker writes about itself, are not re-checked. The path is used and logged: do not put a secret in it. The daemon checks the URL again after expanding it, and no failure message shows user info or query values (a URL in an error, and in `flow worker source list --json`, is printed as scheme, host and path, with `?…` where a query was hidden). The entry's own `nudgeUrl` is never expanded: a `${X}` in its path is POSTed literally.

### Relay worker type -- daemon side only

A relay holds a connection to the daemon and launches a local worker when asked; it runs no steps itself. The daemon side ships (`RelayWorkerSource`, `provide_worker`). **No relay process ships**: until one exists, a declared relay source yields "no relay connected".

Two equivalent ways to declare it, both served by the same code (`RelayWorkerTypePlugin.ts`):

```
flow worker source add build-box --provider relay --plugin relay.default      # worker-type plugin, no directory
flow worker source add build-box --provider built-in:relay                    # legacy provider string, unchanged
```

- `--plugin relay.default` (or `plugins.relay.default`, stored as `relay.default`; the `plugins.` form is understood only for built-ins) is a **built-in** worker type: no `--plugins-dir` is needed. `--provider` is a free label.
- A `--plugins-dir` given with a built-in ref is **ignored**; `source add` prints a `[warn]` and the daemon log says so on every build. To use your own copy from a directory, give it another plugin id.
- **The registry answers before any directory**, for sources and for `PluginProviderLoader`. A stale or planted same-named copy therefore cannot replace a built-in. Which one answered is logged, and `PluginProviderLoader` warns in both directions when a directory is given.
- Entries written before this (`built-in:relay`, or `relay.default` with a directory) keep loading unchanged.
- A built-in that fails to load is reported as a bug of flow (`please report this error`), not with the on-disk plugin advice.

### Plugin source -- a worker type from a plugin

```
flow worker source add sandbox --provider docker-sandbox --plugin <pluginId>.<implName> \
  --plugins-dir <absolute dir> --option image=node:22
```

- Implements the `worker-type` extension point (`extension-points/src/worker-type/v1.ts`). `--provider` is a free label, never `built-in:*`.
- `--plugins-dir` is required for a plugin that is not built-in (a built-in such as `relay.default` needs none, see above). It must be absolute and contain `plugin-<pluginId>/plugin.config.js`: plain, self-contained JS (no `node_modules` beside it). `<pluginId>` and `<implName>` are plain names (letters, digits, `_`, `-`).
- The plugin is trusted code: it runs inside the daemon with its privileges. Nothing confines it to `--plugins-dir` (a symlink or junction inside it is followed); the directory is yours to choose.
- `--option key=value` values reach the plugin unvalidated. A value written as `${ENV_VAR}` is replaced by the daemon with the variable from ITS environment when it builds the instance; an unset variable fails the build with an error naming the source, the option and the variable. Set it where the daemon is started, then restart the daemon.
- Only the keys in the sensitive list (`token`, `password`, `secret`, ...) are checked: a literal there is refused. A secret under any other key (for example `--option dockerPass=...`) is accepted, stored in plain text in `worker-sources.json`, and visible in shell history and the process list. Always pass secrets as `${ENV_VAR}`.
- The daemon builds one instance per source on first contact and reuses it. Loading and the factory are bounded (30s). A load error names the source, plugin, cause and fix, and is only cured by restarting the daemon: Node keeps a module that failed to import, or was edited, as it first loaded it.
- **Launch credential.** For a plugin loaded from `--plugins-dir`, the daemon mints one credential per `obtainWorker` call and passes it in `request.authToken` (nothing is minted when the plugin is never asked). The worker presents it as its token when it registers: it is bound to the source, spent on first use, and valid for 120 s. The plugin never receives the minting service, must never log the request, and should hand the token to the worker through its environment, not its command line. A credential whose ask failed (the plugin threw) is given back at once and redacted from the error that is reported, so a plugin that fails every time keeps reporting its own error; without a token issuer in the daemon the ask fails with a wiring message. The daemon asks again about every 3 s while demand stays unmet, and each ask mints a credential. If `obtainWorker` started no worker (for example one is already running), resolve with `{ launched: false }`: the credential is given back at once. Any other result (`undefined`, `{ launched: true }`, ...) keeps it valid for the starting worker. At most 32 credentials per source may be outstanding at once; beyond that the ask fails with a message naming the source. Built-in worker types are unaffected: `command.default` still gets its token through the daemon.
- `onRunEnded` runs only when a worker of the source declared `run-events` and was handed a step of the run. It runs after the `run_end` acks, once per source per run, bounded by `ackTimeoutSeconds`; a failure or hang is logged and the workspace is released anyway.
- `dispose()` runs when the daemon stops (after the run-end hooks; the whole stop is capped at two ack timeouts plus 30s) and when a source leaves the registry. `source remove` runs in another process, so the daemon disposes at its next contact with sources or at stop. A run that ends after its source was disposed logs a warning naming the source and execution: its leftovers (sandboxes) are yours to remove.

### Requirement-only sources (declaring `guarantees`)

A source whose built `WorkerTypeInstance` declares a non-empty `guarantees` list is **requirement-only**. There is no flag to set.

- **Never receives a step that requires nothing**, injected steps included, whatever labels, projects or acceptance/distribution plugins say. The source is not asked for a worker on behalf of such demand (it is still built at startup).
- **Serves only steps whose requirements it fully guarantees** (see `requires:` below); the source is asked by id when such a step waits.
- **Its workers do not count against `queue.concurrency`**: the source caps them, and the limit exists to bound the host workers the daemon forks for everything else. Without this rule one connected sandbox worker (default limit 1) stalls every step that requires nothing, with nothing forked and nothing said.
- A step that requires nothing and that only a requirement-only worker would have accepted gets one execution-log warning naming the worker and the fix (`requires: [<guarantee>]` or `profile:`), and runs on a host worker (forked if none is connected).
- **Fail-closed.** Until an instance is built the daemon cannot know whether it declares guarantees, so a source whose plugin comes from `--plugins-dir` counts as requirement-only: at startup, after a failed or timed-out build, after dispose. Cost: a plugin declaring no guarantees takes steps that require nothing only once its instance is built, never if the build fails (fix the load error, restart). Built-ins are never requirement-only. If the sources file cannot be read, workers that name a source are kept off steps that require nothing and the cause is logged once per execution.
- **Limit.** A worker still connected after its source was removed from the registry no longer has a declaration, so it is treated as a host worker until it disconnects.
- **A connection keeps the source it was admitted with.** A later `ready` naming another source, or none, is refused and the connection closed, so a worker cannot change its own guarantees.
- **`exclusive` is deprecated** (`WorkerTypeInstance.exclusive`). When `guarantees` are declared it is ignored (one info line in the daemon log). `exclusive: true` WITHOUT guarantees keeps the old effect (no step that requires nothing) but nothing can require what the source does not guarantee, so it can never receive work: the daemon logs a warning at build naming the fix (declare `guarantees`, remove `exclusive`).

### `workerType:` was removed

`workerType` (flow or step level) is a validation error (`WORKER_TYPE_REMOVED`) in `flow validate` and at run start. The message carries the migration: `workerType: sandbox` becomes `requires: [sandbox]` (or `profile: <name>`); any other value has no automatic replacement. A stored version that sets it is refused the same way when run again by `id@version` or when a waiting run starts again. The code `WORKER_TYPE_DEPRECATED` is no longer emitted (the enum value stays so stored results parse).

### Requiring guarantees (`requires:`)

```yaml
requires: [fs=confined] # flow level; a step may add its own `requires:`
```

Field reference: `.claude/docs/flows/schema-reference.md`.

- **Guarantees come from the source, never from worker labels.** Declaring them makes the source requirement-only (see above). A plugin declares them in two places, `guarantees: string[]` (entries `key=value` or keyword):
    - `implementations['worker-type'].<impl>.guarantees` in `plugin.config.js`: the static upper bound, read without building an instance. It tells the daemon which source to ask for a worker and which requirements a flow may name.
    - `WorkerTypeInstance.guarantees`: what the built instance enforces. Routing reads only this. An entry missing from the manifest list makes the build fail; a malformed list does too.
    - **Fail-closed.** No built instance, no declaration, a failed build, a dispose, or a built-in worker type: no guarantee. Existing plugins are unaffected (`worker-type/v1` stays valid).
- **Hard filter in `StepRouter`, before S4 and S3.** A worker whose source does not guarantee every entry never receives the step, whatever an acceptance plugin answers. Matching is AND by equality only; no ordering (`clean=run` does not satisfy `clean=step`).
- **Resolved once, at accept time.** The flow set merged into each step's is stored in the execution record (`requirements: { run, steps }`), outside the definition snapshot and its hash. A waiting run that starts again after a restart uses the record, never the definition. A step injected at run time gets the run's set plus its own `requires`, read at each placement.
- **Run start check.** The daemon reads the declarations (`DeclaredGuarantees`) then refuses an unknown entry (`VALIDATION_FAILED`, with `Did you mean`). If a source's declaration cannot be read, the code is `REQUIREMENT_SOURCES_UNREADABLE` and names it. `flow validate` offline checks the syntax only.
- **Unmet at run time.** The step waits `worker.boundStepWaitSeconds` then fails naming the requirements and the closest workers and sources; when the daemon failed to contact a source that could provide them after the wait began, it adds one sentence per source (`Last contact with source "X" failed at <time> (N consecutive failures since <time>); the error is in the daemon log (flow logs, or <logs dir>).`). Metadata only, never the text of the error: that text is third-party and can hold a credential, so it goes to the daemon log only (treat it like any log of a process that runs plugins). The clock only runs while NO connected worker that meets the requirements and accepts the step exists (a busy one frees up); a worker that refuses the step (label, shell, terminal, project or acceptance plugin) does not hold it open. It fails at once when no declared source declares all the entries (one source has to vouch for the whole set).
- **Demand**: such a step never causes a host worker to be forked (a host worker guarantees nothing); only the sources that declare the whole set are asked, by source id, once while it waits.
- **Requirement-only sources.** Asking for guarantees is an explicit opt-in: a step whose resolved requirements are non-empty and entirely guaranteed by a requirement-only source MAY be served by it (injected steps included, they inherit the run's set); a step that requires nothing, or something the source does not fully guarantee, never is. A worker lost before the step starts is re-dispatched up to 3 times, then the step fails.
- **Accepted workspace kinds (`workspaces: string[]`, optional).** Declared like `guarantees`: statically under `implementations['worker-type'].<impl>.workspaces` in `plugin.config.js` (upper bound, read without building an instance) and on `WorkerTypeInstance.workspaces`, which may only NARROW the manifest list (a kind missing from it fails the build; when the manifest declares none, any known kind may be listed). Entries are the `workspace:` kinds of a flow, built-ins only (`in-place`, `readonly`, `worktree`, `pool`); a configured provider instance (`plugins.instances.<name>`) cannot be named. An unknown kind, a non-list or an empty list fails when the manifest loads, listing the known kinds. Absent: no restriction.
    - **Run start, before any workspace is allocated.** For each requirement set of the run (the flow's, then each step's), S is the declared sources whose static `guarantees` cover the whole set. If S is not empty and EVERY source in S declares `workspaces` without the flow's kind, the run is refused (`WORKSPACE_KIND_NOT_ACCEPTED`) naming the flow, the requirement, the sources with their kinds and the fix. One accepting source, or one with no `workspaces`, is enough. A waiting run that starts again is checked the same way from its stored definition and requirements; it is failed with the reason, nothing allocated. A run without requirements is not checked.
    - **Placement.** Same hard filter as `requires`, before S4 and S3: a step that requires something is never given to a worker whose source (built instance) does not accept the kind of its run; the kind travels as `StepPlacement.workspaceKind`. Fail-closed: an unbuilt instance accepts nothing, and a run whose kind is unknown goes only to unrestricted sources. Steps that require nothing are not filtered.
    - **Not checked offline.** `flow validate` has no knowledge of the worker sources; the check happens when the run starts.
- **`assign` message**: carries the resolved set of the step as `requires?: string[]` (sorted; absent when empty), so a worker or wrapper that can verify a guarantee may refuse the step. The daemon does not require it to; a worker that ignores the field behaves as before.
- **`assign` message, `host`**: `host?: true`, only present for a script step the flow marked `host: true` ("run this one on your own machine, not in your isolation"); absent otherwise, never `false`. The same marker is in `stepConfig.host`; the top-level copy saves a wrapper from parsing the step. Only the literal boolean on a script step counts. The daemon never sets it for an injected step (it refuses them, at any depth): a wrapper that isolates runs every other script in its VM, and may refuse a `host` step it is not allowed to run outside. Routing is not affected: `host` does not change which worker gets the step.

### Requirement profiles (`profile:`)

```yaml
profile: agent # flow level; a step may add its own `profile:` and `requires:`
```

A profile is a named set of requirements, built into the code (`ProfileCatalog` in flow-engine; design note `.claude/plans/2026-11-08_sandbox-step-requirements-design.md`, D2). It is expanded when the run is accepted and added (union, AND) to the `requires:` of the same scope; everything above (hard filter, run start check, unmet-at-run-time, injected steps) then applies to the expanded set.

| Profile          | Expands to                       |
| ---------------- | -------------------------------- |
| `agent`          | `fs=confined`, `env=clean`       |
| `inspect`        | `agent` + `fs=readonly-enforced` |
| `untrusted-code` | `agent` + `ports=private`        |
| `hermetic-test`  | `untrusted-code` + `clean=run`   |

- **Meetable today: all but `inspect`.** The sandbox plugin declares `sandbox`, `fs=confined`, `env=clean`, `ports=private`, `clean=run` (`packages/flow-sandbox/plugin/plugin.config.js`), which covers `agent`, `untrusted-code` and `hermetic-test`. It does NOT declare `fs=readonly-enforced` (no `:ro` mount yet), so `inspect` is refused at run start (`VALIDATION_FAILED`, naming the profile and `fs=readonly-enforced`) until a source declares it.
- **`net=filtered` is in no profile.** The sandbox does not declare it (raw TCP to public destinations is unverified). It is added to `untrusted-code` / `hermetic-test` only when a source declares and verifies it: a deliberate tightening that needs a changelog line.
- **Names are checked offline** (`flow validate`: unknown name is an error with `Did you mean`, and the known list); **availability is checked at run start** by the daemon, against the declared guarantees. `flow validate` prints a note saying so.
- **Recorded, not re-resolved.** The expansion is stored in the execution record (`requirements`, plus `profiles: { run?, steps }` with the names, for display only). A resume uses the record. A step injected at run time inherits the run's set (flow `requires` and `profile`) and adds the expansion of its own `profile`, read at each placement (so a newer binary could expand a name differently for injected steps only).
- **Shown** by `flow show <file>` (`profile:`, `requires:`, `expands:` lines; `profile:`/`requires:` on a step row) and by `flow show <execution>` (`Profile:`, `Requires:`, and per step when it differs from the run).
- **No configuration override yet.** Built-ins only. When `config.yml` overrides are added, the rule is that a config may only TIGHTEN a built-in (the override must contain every requirement of the built-in).

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
  The nudge a worker does publish (loopback only) is a hint, never an instruction: it is refused unless it
  is `application/json`, has no `Origin`, targets the worker's own `127.0.0.1:<port>` Host, and its `wsUrl` equals the
  address the worker would dial itself (`worker.wsPort`, `FLOW_DAEMON_WS_URL` or the `worker.port` file; same
  scheme, host and port, no user info). The worker then dials that address, not the nudged text. A refused nudge
  is logged once as `[nudge] refused ...`; the worker keeps reconnecting by backoff. Known gap: with
  `worker.wsPort` set and the daemon bound elsewhere (port taken), the nudge is refused; align the port. Remote
  workers need an explicit allow-list or shared secret (not built). See threat F-02.
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
| `boundStepWaitSeconds`                      | `120`   | 1 to 600. How long a step with requirements (`requires:`, `profile:`) waits with no worker that meets them connected before it fails                                                       |

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
