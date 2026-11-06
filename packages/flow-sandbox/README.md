# flow-sandbox

Shared sandbox layer over Docker Sandboxes (`sbx`). Private, not published, no dependency on queue packages. Plan: `.claude/plans/2026-10-25_docker-sandbox-worker.md` (milestone M1).

## Classes

| Class                             | Role                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `SandboxRuntime` (interface)      | create, exec (stdin/env/cwd/streaming/abort), stop, start, remove, list, copy, per-sandbox network rules and secrets      |
| `SbxCliRuntime`                   | the only class that builds `sbx` command lines; also implements `SbxIntrospection` (version, diagnose, policy, settings)  |
| `FakeSandboxRuntime`, `FakeClock` | in-memory runtime for later milestones: records calls, injects failures, idle stop simulated                              |
| `SbxPrerequisiteCheck`            | tool, pinned version, daemon, sign-in, policy initialized; reports network mode and ssh agent forwarding; changes nothing |
| `PathTranslator`                  | `C:\x` <-> `/c/x`, everything must stay inside the two mounts; warns on Windows paths in env or script text               |
| `SandboxOptionsParser`            | strict options (unknown key = error)                                                                                      |

Rules enforced by `SbxCliRuntime`: `shell:false`, hidden window, `MSYS_NO_PATHCONV=1`, explicit `--cpus`/`-m`, `--sandbox` on every rule and secret (no API for a global one), env through a private `--env-file`, secrets read by sbx from a command, version must equal `PINNED_SBX_VERSION` (`src/PinnedSbxVersion.ts`).

sbx location: `binaryPath` option, `SBX_MOCK_PATH`, `SBX_PATH`, `%LOCALAPPDATA%\DockerSandboxes\bin\sbx.exe`, then PATH. A configured but missing path is an error.

## Tests

`npm run test --workspace=flow-sandbox`. Tests run `SbxCliRuntime` against `src/testing/sbx-mock.mjs` through real child processes (state and call log in `SBX_MOCK_STATE_DIR`, failures via `SBX_MOCK_SCENARIO`). `FakeSandboxRuntime` and `SbxCliRuntime` share `testing/SandboxRuntimeContract.ts`.

## Mock fidelity

Real captures (sbx 0.49.2, `fixtures/sbx-0.49.2/`, written by `scripts/CaptureSbxFixtures.mjs`: read-only commands, plus one throw-away `flow-sbx-capture-*` sandbox with one scoped rule so `ls-json` and `policy-ls-json` are populated; it refuses to write them empty): version, `ls --json`, `diagnose --json`, `policy ls --json`, `settings ls --json`, `--help` of the verbs used, "sandbox not found" errors. The mock validates flags against the captured help and `SbxMockFidelity.test.ts` compares its output with the captures.

SYNTHETIC (invented by the mock, verified only by the live check):

- failure outputs of not signed in, policy not initialized, daemon down, unhealthy daemon (a failing `diagnose` check status is assumed to be anything but `pass`)
- success text of create/stop/rm/cp/exec, "already exists" error, `policy allow/rm`, `secret set-custom/rm`
- shape of a user-added per-sandbox policy rule; `secret rm --placeholder` (appears in the help examples but not in its Flags list)
- the `deny-all` policy shape (assumed: no global network allow rule)

No drift check in `scripts/check-mock-drift.js`: it probes a CLI in PATH against a cache written by a real-CLI suite, and sbx is neither. Instead `SbxMockFidelity.test.ts` fails when the fixtures are not from `PINNED_SBX_VERSION`. Real-binary drift is checked by hand: re-run the capture and review `git diff fixtures`.

## Live check (gated, never in CI)

`SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/live/SbxLiveCheck.mjs` creates one `flow-sbx-live-*` sandbox, runs the PoC commands (2 mounts, env + stdin exec, streaming, abort vs stop, restart, copy, scoped allow, scoped secret), and removes everything. It refuses without `SBX_LIVE=1` and when `SBX_MOCK_PATH` is set. `SBX_LIVE_DRY_RUN=1` runs it against the mock to test the script only (bash steps fail there by design).

## Limits

- `PathTranslator` is lexical; symlinks and junctions are rejected by `RunMounts` (M3).
- `start` is an `exec true` (sbx has no start verb).
- Host abort of `exec` does not stop the process in the VM; call `stop`.

## M2: credentials, network rules, tool stores

| Class                                                                 | Role                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HostCredentialEndpoint`                                              | loopback HTTP server in the wrapper; one bearer secret per sandbox mapped to its profile aliases; 401 no secret, 403 unknown secret or alias outside the set; serves `aws configure export-credentials --format process` through `AwsCredentialExporter`; expired SSO gives 503 naming `aws sso login --profile P`; logs issuance, never credentials |
| `AwsCredentialExporter`, `NodeCommandRunner`                          | the only code that runs `aws` (injected `CommandRunner`, `shell:false`, hidden window, time and output limits)                                                                                                                                                                                                                                       |
| `PrivateSecretFile`                                                   | owner-only file read by `sbx secret set-custom --command "cat <path>"`; the secret is never on a command line                                                                                                                                                                                                                                        |
| `SandboxNetworkRules`                                                 | per-sandbox allow rules: `localhost:<endpoint>`, bridge port, model hosts per region and tool (codex adds the mantle host), `extraAllowedHosts`                                                                                                                                                                                                      |
| `ToolStoreRedirect`, `CodexBedrockSettings`                           | `<meta>/sessions/<tool>` through `CLAUDE_CONFIG_DIR` / `CODEX_HOME` (created first) / `XDG_DATA_HOME`; Codex `-c` settings and optional `--disable plugins`                                                                                                                                                                                          |
| `ProviderSecrets`                                                     | API key from a host env var to `sbx secret set <service> --sandbox` (stdin); OAuth refused with the reason                                                                                                                                                                                                                                           |
| `CredentialProcessScript`, `AwsConfigFile`, `CredentialGlueInstaller` | VM-side script and AWS config, installed under `/home/agent/.flow-credentials`                                                                                                                                                                                                                                                                       |
| `SandboxCredentialAccess`                                             | wires all of the above for one sandbox with rollback; `detach()` undoes it                                                                                                                                                                                                                                                                           |

`SandboxRuntime` gained `setServiceSecret`; `SbxCliRuntime` checks the sandbox exists first (sbx 0.49.2 stores a secret for a non-existent sandbox).

Live acceptance: `SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/live/CredentialsLiveCheck.mjs` (options in its header). Results: `.claude/temp/poc-m2/RESULTS.md`.

Mock additions: `help-secret-set` is a real fixture (`CaptureSbxFixtures.mjs --only help-secret-set`). SYNTHETIC-but-copied: the `secret set` output (hand capture, not in `fixtures/`) and the two texts of `policy rm network` for a removed sandbox ("no scoped policy found for sandbox", "is covered by rule ... in sandbox ..."), both seen live.

Limits: command secrets need `cat` on the PATH of the sbx daemon (Git for Windows); the secret reaches every request to host `localhost`, so only wrapper-owned services may listen on allowed ports; Codex 0.164.0 cannot resume with `CODEX_HOME` on the mount (RESULTS.md); the image pins 0.149.1.

## M3: lifecycle, mounts, leftovers

| Class                                                                         | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SandboxLifecycle`                                                            | ONE sandbox per worker. Created at the first step of a run; idle timer (`idleStopMinutes`, re-armed at step end, cleared at step start) and step timeout STOP it; the next step restarts it; only `endRun` (end-of-run or cancel, idempotent) REMOVES it, except reason `daemon_stopping` which STOPS and keeps it (the run may resume; leftovers are removed by the explicit command); `shutdown` (wrapper exit/restart) stops, never removes. Another run while one is live: `worker-busy`. A step after `endRun`: `run-ended`. All operations go through one `SerialQueue` |
| `SandboxCapacity`                                                             | `maxConcurrentSandboxes` over RUNNING plugin sandboxes (`sbx ls` plus in-process reservations); a restart asks again. Cross-process races are possible (guard rail, not a lock)                                                                                                                                                                                                                                                                                                                                                                                               |
| `RunMounts`                                                                   | the run's workspace and `.meta` only; cwd and returned paths through `PathTranslator` plus an `lstat` walk that rejects symlinks and junctions (mount roots included). Warnings below                                                                                                                                                                                                                                                                                                                                                                                         |
| `RunSandboxName`                                                              | `flow-sbx-<wrapperId>-<executionId>`, max 63; wrapperId 1-12 `[a-z0-9]`, executionId `[a-z0-9]` with inner hyphens. Anything else is refused, never normalised                                                                                                                                                                                                                                                                                                                                                                                                                |
| `LeftoverSandboxes`, `LeftoverCommand`                                        | `list`, `reportAtStart`, `reapOwn(wrapperId, aliveRunIds)` (STOPS a restarted wrapper's stale sandboxes), `remove(name)` (exact marker name; refused for a live run or wrapper). CLI: `node --import tsx packages/flow-sandbox/scripts/LeftoverCli.mjs list \| remove <name>`, exit 0 done, 1 refused/failed, 2 usage                                                                                                                                                                                                                                                         |
| `WrapperPresence`                                                             | `<wrapperId>.json` (pid + current run) in a directory; the liveness source of `remove`. CLI directory: `FLOW_SANDBOX_PRESENCE_DIR`, default `~/.config/flow/sandbox-presence`                                                                                                                                                                                                                                                                                                                                                                                                 |
| `Scheduler`, `SystemScheduler`, `FakeScheduler`, `SystemClock`, `SerialQueue` | injected time and ordering; tests never wait                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Project-directory warning (`RunMounts`): the workspace equals the `projectDir` option, or `<workspace>/.git` is a directory (regular checkout; worktrees and submodules have a `.git` file). A `.git` file warns that git does not work in the VM.

Live check: `SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/live/LifecycleLiveCheck.mjs` (about 2 min, 9 steps). It proves STOP/RESTART with `idleStopMinutes: 0.2` (12 s), before sbx's own ~30 s idle stop, and asserts the stop is the wrapper's.

Limits: `endRun('daemon_stopping')` stops without removing and does not mark the run ended (a later step restarts the sandbox); execution ids that are not lowercase `[a-z0-9-]` are refused (flow's real id format is unchecked); a recycled pid makes a dead wrapper look alive (removal refused); `remove` checks liveness then acts (no lock); `scripts/` is outside the eslint config.

## M4: development harness (relay variant, not a product)

A standalone wrapper that a `built-in:command` worker source starts. It registers with the daemon as one worker, runs each assigned step inside a sandbox with the real flow worker bundle, and relays the messages. No core change: routing is by label (`--labels sandbox` on the source, `labels: [sandbox]` in the flow).

Run: declare the source once (full example in the header of `scripts/HarnessWrapper.mjs`), give the steps `labels: [sandbox]`, `flow run`. Options are strict: a bad or missing one prints the usage. Logs: the wrapper writes to stderr (the daemon prints it as `[source <id>] ...`) and to `--log-file`. Live acceptance: `SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/live/HarnessLiveCheck.mjs` (about 1.5 min, 13 assertions, isolated daemon, one real sandbox and one real Bedrock call, everything it created is removed). By default a never-served last step (`parked`) keeps the run, and so the daemon, alive so that the wrapper's own idle timer can be watched; `HARNESS_PARK=0` lets the flow itself complete (the daemon then stops about a second later and the sandbox is stopped through `daemon_stopping`).

| Class (`src/harness/`)                                                                          | Role                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HarnessWrapper`                                                                                | per `assign`: `SandboxLifecycle.runStep` (create/restart), one-time preparation, inner worker running and registered, rewritten `assign` inside, relay back, then the wrapper's own `ready`                                                                                                        |
| `InsideMessageGuard`                                                                            | the closed set inside to daemon: `ready` (never forwarded as is), `log`, `step_started`, `step_progress`, `step_completed`, `step_failed`, `inject_steps` (started model step only). Rebuilds each message from known fields; anything else is dropped and logged (type and reason, never content) |
| `AssignmentRewriter`, `ReturnedPaths`                                                           | daemon to inside: workspace/outputs/cwd/workingDir translated by `PathTranslator`, wrapper env merged (wins), user_intervention refused. Back: `meta.session_file` must stay inside the mounts (else the result becomes a `step_failed`), `files_written` outside entries removed and logged       |
| `HarnessBridge`, `BridgeTokenGuard`                                                             | WebSocket server on 127.0.0.1, 401 without the `x-flow-bridge-token` header value, 409 for a second connection, 1 MiB frame limit, binary frames dropped                                                                                                                                           |
| `RelayRegistration`                                                                             | the `ready` the daemon sees, built only by the wrapper (labels with `sandbox`, `--project-id` ids, `bash` only, features `project-id`, `secrets`, `sub-step-session-resume`); nothing from the inside is used                                                                                      |
| `CredentialedSandboxPreparer`, `VmProxyEnvironment`                                             | M2 credential access + bridge token secret + tool store + the VM proxy variables for model steps; script steps get no environment                                                                                                                                                                  |
| `inner/InnerBridgeShim`                                                                         | runs in the VM (`/opt/flow/inner-bridge.cjs`): starts the unmodified `worker.cjs` on a local port and relays to the bridge with the token header                                                                                                                                                   |
| `DaemonLink`, `HarnessConfig`, `HarnessMain`, `InnerWorkerLauncher`, `EnvironmentCommandRunner` | daemon WebSocket (no reconnect), strict options, wiring, `sbx exec` of the shim, `aws` with the real home when the daemon runs with a redirected one                                                                                                                                               |

Image: `flow-sandbox:m4` = m2 + `/opt/flow/worker.cjs` (same esbuild options as the `worker` entry of `flow-cli/ci/scripts/bundle.ts`, built from `src/worker/Worker.ts`), `mcp-server.cjs`, `inner-bridge.cjs`. Build the three files with `node --import tsx packages/flow-sandbox/scripts/BuildInnerBundles.mjs`, then `image/build-image.mjs --tag flow-sandbox:m4`. The full `npm run bundle` of flow-cli was not used: it also builds flow.cjs, the updater and two app modules (writing into other packages) and starts from a possibly stale `dist/`.

### G1: the bridge token through the sbx proxy (measured, sbx 0.49.2, `scripts/live/BridgeTokenProbe.mjs`)

| Channel of the WebSocket connection    | Proxy substitutes the placeholder                               |
| -------------------------------------- | --------------------------------------------------------------- |
| request header (`x-flow-bridge-token`) | yes, exact value, also with two custom secrets for `localhost`  |
| `Sec-WebSocket-Protocol`               | yes (the connection then fails: the server selects no protocol) |
| query string                           | no                                                              |
| first WebSocket message                | no (frames are opaque after the upgrade)                        |

The harness uses the header. It only works for clients that go through the proxy:

- The VM sets `HTTP(S)_PROXY` and `NODE_USE_ENV_PROXY=1`. Node's built-in `WebSocket`/`fetch` and `curl` use the proxy; the `ws` library and raw sockets do NOT, and then the bridge sees the placeholder text (401). The shim therefore uses the built-in `WebSocket`.
- The flow worker starts a model CLI with an isolated environment (PATH, HOME, step env): the proxy variables are dropped, so `credential_process` (curl) went direct and the endpoint saw the placeholder ("unknown bearer secret"). `VmProxyEnvironment` copies the VM's proxy variables into the model env and fails loudly when the VM has none.
- What the token is for: only the process the wrapper started can open the bridge, not another process of the host. It is NOT a barrier against code in the same VM: the placeholder is in the environment of the shim, readable by any process of the user `agent` (the live check proves a second connection is refused with 409, not that the token is secret from the VM).

### Observations about sbx (one machine, Windows 10, one run each; report to the sbx/threat-model owners)

- A raw TCP connection from the VM (a client that ignores the proxy variables) reached a host port that has NO allow rule (`host.docker.internal:<port>` of a server bound to 127.0.0.1) and the internet by IP (`1.1.1.1:443`); DNS for `example.com` failed. So per-sandbox network rules and the placeholder substitution bind proxy-aware clients only. Cause not investigated. Output in `.claude/temp/m4/g1-rawtcp.json`.
- An isolated flow workspace (`mode: isolated`) is deleted at the end of the run: a stopped sandbox then cannot restart (`422 workspace directory ... no longer exists`) and can only be removed. The harness check uses `mode: shared`.

### Limits of the harness

- One run per wrapper lifetime (no run-end events yet, plan C2): a step of another run fails with `worker-busy`. The sandbox is left STOPPED, never removed (`LeftoverCli.mjs list|remove`). When the daemon goes away the run is interrupted with `daemon_stopping` (stop and keep).
- No reconnect to the daemon (the launch token is one-shot).
- The registered sandbox worker also takes steps WITHOUT labels (routing prefers registered workers; flow-owner finding H4). Do not register it on a daemon whose other flows you do not want in the VM.
- The daemon asks its sources again whenever a step finds no free worker, without a cap on launches: 5 launches of the wrapper for one 4-step run were observed, 4 refused by the wrapper-id lock (`presence`). It also forks a local worker 3 s after asking if none arrived.
- `inject_steps` is relayed from a started model step without re-validating the steps (the daemon validates; to be checked in M6). Secrets are sent into the VM in the `assign` (accepted residual T-02).
- `HarnessMain` (wiring) and `InnerBridgeMain` (VM entry) have no unit test; the live check covers them.
- Windows host paths in step env or script text are logged as warnings, not translated.

## M7: exec variant (prototype, not a product)

Engine ON THE HOST (`flow-cli` `WorkerAdapter` + `StepRunner`), only the step processes run in the run's sandbox through `sbx exec`. Needs the C4 seam (`ProcessLauncher`, landed). No core change was needed to build it.

Run: same source declaration as M4 with `scripts/ExecWrapper.mjs` (same options, header of the script), image `flow-sandbox:m7`, steps `labels: [sandbox]`. Live acceptance: `SBX_LIVE=1 node --import tsx packages/flow-sandbox/scripts/live/ExecLiveCheck.mjs` (about 1.5 min, 14 assertions, same isolation as M4; `EXEC_MCP_MODEL=1` adds a model step that calls `provideSteps`, 15 assertions). Evidence and timings for M8: `.claude/temp/m7/`.

| Class (`src/exec/`)                         | Role                                                                                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SbxProcessLauncher`, `SandboxChildProcess` | `ProcessLauncher` over `SandboxRuntime.exec`; returns a `ChildProcess`-shaped object (synthetic pid >= 2e9, never a host pid)                                                              |
| `StepCommandTranslator`                     | host spawn -> VM command, cwd, env. Refuses what it cannot map (`cmd`, `pwsh`, host programs, paths outside the mounts, UNC)                                                               |
| `VmFileStager`, `McpConfigRewriter`         | engine temp files (script, MCP config, Claude settings; only those names, regular files in the host temp dir) are copied into `/tmp/flow-staged` and removed by the same `exec`            |
| `VmEnvironmentFilter`                       | drops host-only variables and ambient copies of the host environment (see Findings)                                                                                                        |
| `VmExecutableLookup`                        | `lookupExecutable` is synchronous, the VM is not: one `exec` primes `command -v` for claude, codex, opencode, node, bash per sandbox                                                       |
| `McpCallbackRules`                          | per-process `localhost:<port>` rule scoped to the sandbox, removed before the process reports its end                                                                                      |
| `ExecWrapper`, `ExecAssignment`, `ExecMain` | worker registration (reuses `DaemonLink`, `RelayRegistration`, `InsideMessageGuard`, `SandboxLifecycle`, `RunMounts`), per-run `ExecSandboxPreparer` (M2 credentials, no bridge, no token) |

Mapping limits:

- Kill: the process is unreachable from the host, so `kill`/`killTree`/`killTreeAndWait` STOP THE SANDBOX (lifecycle `stopAfterStepTimeout`), then abort the host `exec`. SIGTERM is as hard as SIGKILL (no grace, no traps); the exit-time kill of the engine cannot wait for the stop. Staged files stay if the VM is stopped.
- Exit: only a numeric code is reported; a signal death in the VM is 128+n, `signalCode` is set only for processes the launcher ended. `snapshotDescendants` returns `[]` (the stop kills the tree); `signalProcesses` with pids throws.
- stdin: taken once at start (write + `end()` right after `spawn`); `stdio: 'inherit'` throws; `detached` ignored; `shell: true` command lines run under `/bin/sh -c`.
- Windows paths in script text or env values are warned about, not translated (rendered `${{ context.workspaceDir }}` is a host path).
- Claude only: Codex/OpenCode temp files are refused. Interactive steps and `user_intervention` are refused.
- MCP: the engine's callback server listens on host `127.0.0.1:<random>`. The VM runs `image/mcp-callback-forwarder.cjs` (listens on VM loopback, relays to `host.docker.internal:<port>`, then loads the unmodified `mcp-server.cjs`). The tool answers "Successfully injected" when its local write succeeds, not when the host received it (fire and forget, also without sandbox): a missing rule gives a false positive.

### Findings (reported, not fixed in core)

- `ScriptStepExecutor` runs scripts with `isolateEnv: false`: the whole worker environment is passed to the spawn. Through the launcher it would copy every secret of the wrapper (launch token, profile, tokens) into the VM; the filter drops names that equal the host's and are not declared by the step. A core `isolateEnv: true` or an allow-list for sandbox workers would be the clean fix.
- `ScriptExecutor` resolves bash on the host (`BashShellStrategy`) before the seam: the host needs Git Bash even though the script runs in the VM.
- Injected steps carry no labels (plan H4): an injected step may run outside the sandbox; the MCP surface does not make "the sandbox cannot add steps" true, it makes it "same as a local model today".
- A raw TCP connection from the VM to a host port WITHOUT rule was blocked here (M4 observed the opposite for a 127.0.0.1-bound server); with the rule it passes. Not investigated.

## Image

`image/Dockerfile` (tag `flow-sandbox:m2`, `m7` adds `/opt/flow/mcp-callback-forwarder.cjs`, `flow-sandbox:m4` adds the flow worker files, see M4): base `docker/sandbox-templates:claude-code-docker` pinned by digest, `@openai/codex@0.149.1`, `opencode-ai@1.19.4` (claude 2.1.306 and node 22 come from the base), npm cache cleaned, placeholder files in `/opt/flow` copied with `COPY --chmod=0644` (the flag also applies to the directory, so it is reset to 0755 right after; otherwise `agent` cannot list it).

Codex is pinned to 0.149.1 because 0.164.0 fails `codex exec resume` with `CODEX_HOME` on the mounted dir (`list_turns is not supported yet`). Not isolated whether that is a version regression or mount behaviour; re-test when bumping codex.

Rebuild (host `docker build` is not assumed): `node --import tsx packages/flow-sandbox/image/build-image.mjs [--tag flow-sandbox:m2]`. It creates a builder sandbox (Docker Hub and npm must be reachable), runs `docker build` and `docker save` inside, runs `sbx template load`, then removes the builder and the ~1.3 GB tar. About 3 minutes. Use the image with `image: 'flow-sandbox:m2', pull: 'never'`. Older tags (`m0b`, `poc-m0`) stay in `sbx template ls` until removed with `sbx template rm`.
