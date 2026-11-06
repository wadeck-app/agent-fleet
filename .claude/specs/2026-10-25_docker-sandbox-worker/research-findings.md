# Research Findings -- Docker Sandbox Worker

**Date:** 2026-10-24
**Source:** docs.docker.com/ai/sandboxes (read from the `docker/docs` repo). The first sections come from the docs; sections from "Measured on this machine" on were measured with sbx 0.49.2 on Windows 10 (2026-10-25/26). "Re-verified" = checked a second time directly.

## sbx facts

| Topic | Fact |
|---|---|
| Nature | Standalone CLI; each sandbox is a microVM with its own kernel and private Docker daemon |
| Platforms | Windows 11 (Windows Hypervisor Platform), macOS 14+ Apple silicon, Ubuntu 24.04+ KVM. Windows 10 not mentioned (re-verified) |
| Cost / auth | CLI free incl. commercial; needs Docker login (`sbx login`, PAT via stdin) |
| Status | 0.49.1 (2026-10-20); GA never stated; `env`, `kit`, `setup`, `skills`, `--volume` experimental; JSON shape changed in 0.48.0 |
| Commands | `create`, `run`, `exec` (docker-exec semantics, no `-d`), `cp`, `ls --json`, `stop`, `rm`, `ports`, `policy`, `secret`, `template save/load`, `ssh <name>.sbx` after `sbx setup ssh` |
| Agents | claude, codex, copilot, cursor, devin, docker-agent, droid, gemini, kiro, opencode, shell. Claude launches with `--dangerously-skip-permissions` by default |
| Concurrency | Distinct `--name` allows several sandboxes per workspace; same path reconnects (re-verified) |
| Workspace | virtiofs mount at the same absolute path, `:ro` suffix; `--clone` = in-sandbox git clone, host repo read-only at `/run/sandbox/source`, `sandbox-<name>` remote on host (re-verified). A git worktree passed as path breaks git for the agent |
| Leak control | Deny-by-default outbound proxy; API keys injected by the proxy (`sbx secret set`), never inside the VM; host `127.0.0.1` unreachable; SSH agent forwarding on by default; default allowlist has broad wildcards |
| Host services | `127.0.0.1` and the LAN IP do not work from inside; `host.docker.internal` does. The proxy rewrites it to `localhost`, so the policy needs `sbx policy allow network localhost:<port>` (docs, `workflows/development`; not yet tested) |
| Remote | No remote daemon / `DOCKER_HOST` support documented (re-verified). Cloud sandboxes exist (paid, Docker-hosted, REST API, no host workspace) |

## flow facts (repo)

| Topic | Fact |
|---|---|
| Worker transport | Worker always dials the daemon over WebSocket (`flow-cli/WORKERS.md:119`); loopback by default; non-loopback requires TLS (`daemon/TransportPolicy.ts`) |
| Provider hook | `WorkerSourceProvider.obtainWorker` (`extension-points/src/worker-source/v1.ts`); closed `switch` in `WorkerSourceContact.ts:137` |
| Workspace | Daemon allocates the path and sends it verbatim in `assign.executionContext`; no path translation exists; a `<workspace>.meta` sibling holds outputs |
| Interaction | No attach command; terminal worker echoes stdin only; approvals via file-approval plugin or TTY plugin |
| Liveness | Socket only; step requeued up to 3 times if the socket closes before start, failed without retry if it closes while executing |

## Script step facts (repo, 2026-10-25)

| Topic | Fact |
|---|---|
| Spawn | `ScriptExecutor.ts`: temp `.sh/.bat/.ps1` via explicit `shell:` (bash, cmd, pwsh), or `spawn(script, {shell:true})`; stdin ignored; no `detached` |
| Env | `isolateEnv: false` -> full worker `process.env` plus step env plus `secrets:` |
| Tree kill | None for scripts: `killProcessTree` is used only by model steps. Generic timeout path calls `child.kill` twice, the second guarded by `!child.killed` (`ScriptExecutor.ts:339-349`). No `timeout` is ever passed (`ScriptStepExecutor.ts:90-99`) |
| Leak modes | A grandchild that inherits stdout/stderr blocks `close` until the 1800s silence watchdog; a detached grandchild survives the step; worker exit does not kill the tree; a script step sends no heartbeat |
| Outputs | stdout via `OutputExtractor`; optional `writeOutput` file under `outputsDir` (in the `.meta` sibling) |
| Host needs | bash (Git Bash on Windows), node, git; scripts may call the daemon HTTP API with `http.request` (never `fetch`, L-01) |

## Measured on this machine (2026-10-25)

Windows 10 Pro 19045, sbx v0.49.2, called from Git Bash, one run each (indicative, not statistics; times include the `sbx.exe` process start). Image `docker/sandbox-templates:shell-docker` (agent `shell`). Test sandboxes and rules were removed afterwards.

| Check | Result |
|---|---|
| Windows 10 | `sbx diagnose` virtualization OK; create, exec, stop, rm all work. Windows 11 is only the documented requirement |
| Guest | Linux x86_64 (kernel 7.0.14). `cmd` / `pwsh` script steps cannot run inside |
| Image tools | bash, sh, node, npm, git, curl, sudo present; wget, nc missing |
| Defaults per sandbox | 20 CPU and 15.9 GiB RAM (50% of host). Pass `--cpus` and `-m` explicitly |
| Create, cold | Includes image pull (~700 MB); not representative |
| Create, warm | 5.4 s alone (2 cpu, 1 g); 7.6-8.1 s when 2 more run in parallel |
| First `exec` after create | 0.6 s |
| `exec` of `true` | 0.39-0.45 s each |
| `stop` / restart + exec | 0.9 s / 3.4 s |
| `rm` | 7.4 s for 4 sandboxes (~1.9 s each) |
| Streaming | `exec` output arrives line by line (+0.46 s, +1.44 s, +2.46 s for a 1 s loop), no buffering |
| stdin | `printf ... \| sbx exec -i SANDBOX -- cat` echoes the input; exit code 7 propagated; stderr separate from stdout |
| Workspace path in VM | Host `C:\Users\<user>\...` appears as `/c/Users/<user>/...` (rw); a path translation is required |
| Same workspace, 4 sandboxes | All four wrote to the same directory: nothing isolates sandboxes from each other on a shared mount |
| Orphans | A process started with `nohup ... &` (PPID 1) survives the end of its `exec`; it is gone after `stop` and restart. PID 3 `sleep infinity` is the sandbox's own keepalive |
| Host reachability | `host.docker.internal:18080` returns the host server only after `sbx policy allow network localhost:18080`; without the rule `exec` prints "Approval required for localhost:18080" and fails fast; `127.0.0.1` never works. `policy allow` defaults to a global scope; `policy rm network` accepts `--sandbox`, and non-TTY calls need `--force` |
| Policy | `sbx policy init <allow-all\|balanced\|deny-all>` is required once per machine (balanced chosen: 195 allow rules) |
| Local setup | `sbx.exe` is in `%LOCALAPPDATA%\DockerSandboxes\bin`; a PATH edit is not seen by an already running Claude Code process |

## PoC results: scripts, models, lifetime (2026-10-25)

Same machine and caveats as above. Run from Git Bash with `MSYS_NO_PATHCONV=1` (otherwise `-w /c/...` is rewritten to `C:/...`; a Node wrapper does not have this problem).

| Check | Result |
|---|---|
| Script via stdin | `sbx exec -i -e FOO=bar -w <vm path> SANDBOX -- bash -s < step.sh` works: env, cwd, multiline, user `agent` (non-root), 1.25 s. A file written under the mount is visible on the host |
| Same port in two sandboxes | Two servers on port 3000 ran side by side, one per sandbox; no collision |
| `exec` vs background child | `exec` waits for a child that keeps stdout open (21.8 s for a `sleep 20`); returns in 0.6 s if the child redirects its stdio. Same hang class as the host `close` event |
| Host-side abort | Killing the host `sbx exec` does NOT stop the process inside (`sleep 300` kept running). `sbx stop` does (0.56 s); restart + exec 2.1 s |
| Idle behavior | Two idle sandboxes were `stopped` without any command (later measured at about 30 s, see "Idle behavior of local sandboxes"); the next `exec` restarts them. Their background processes die with them |
| Parent mount | A sandbox that mounts a parent directory sees subdirectories created on the host afterwards and its writes reach the host. Only the mounted path exists in the VM; siblings in the same host directory are not visible |
| claude in the sandbox | `claude` 2.1.306 at `/home/agent/.local/bin/claude`; image `claude-code-docker`; a `mcp-gateway` MCP server is preconfigured (purpose not investigated) |
| Headless claude via exec | `claude -p ... --output-format stream-json --verbose` streams `system` -> `assistant` -> `result` through `sbx exec`; without credentials: exit 1, `is_error:true`, text "Not logged in" after 1.4 s |
| Credentials | `sbx secret ls` is empty. No real model call was made; it needs `sbx secret set anthropic` with a key |
| Home persistence | Files under `/home/agent` (hence the Claude session store) survive `stop` / restart; they are lost with `rm` |
| Create, claude image | 13.3 s including image pull |
| Exact mounts | `sbx create shell <workspace> <workspace>.meta` mounts exactly those two directories: the VM's view of their shared parent lists only them, a sibling run's directory is not visible, and writes to `<meta>/outputs` reach the host (one run, 2026-10-26) |
| Abort vs stop, re-measured (sbx 0.49.2, 2026-10-26) | Confirms the PoC: with the host `sbx exec` killed, `sleep 300` is still listed 1.4 s later (age 4 s); after `sbx stop` (0.6 s) the next exec restarts the sandbox and the sleep is gone. A live-check failure "the sleep survived stop" was a probe bug, not sbx: `bash -c "pgrep -f 'sleep 300' >/dev/null"` matches its own bash (exit 0 with no sleep at all; without the redirect bash execs pgrep and exit is 1). Use `pgrep -f '[s]leep 300'`. Any process probe run through `bash -c` needs this. |

## Credentials, sessions, plugin and run facts (2026-10-25)

| Topic | Fact |
|---|---|
| sbx secret services | `anthropic, copilot, cursor, devin, droid, github, google, groq, mistral, nebius, openai, openrouter, xai` (`sbx secret set --help`). No `aws`/Bedrock service; the OpenCode doc page lists `aws` anyway (contradiction, untested). Custom hosts: `sbx secret set-custom --host H --env VAR --value V` |
| Proxy injection | The VM sees a placeholder; the proxy swaps in the real key on matching requests. Docs: "Don't set API keys manually inside the sandbox". `-e` values on `exec` are visible to the agent (observed with `FOO=bar`) |
| Bedrock | Not documented for sbx (docs: "not found"). Claude Code Bedrock config (`CLAUDE_CODE_USE_BEDROCK`, `AWS_*`) is non-secret except the credentials; SigV4 signing cannot be done by a header-swapping proxy (inference, untested). User-level `~/.aws` is not available in the VM |
| Codex in sbx | Default launch `codex --dangerously-bypass-approvals-and-sandbox`; OAuth via `sbx secret set openai --oauth` (host browser) or API key; `~/.codex` is not picked up; headless mode and session location undocumented |
| OpenCode in sbx | Launches the TUI with no flags; resume `-- -s <id>`; headless mode and session location undocumented; global custom secret needs sandbox recreation |
| Claude session export | With `CLAUDE_CONFIG_DIR=/home/agent/cfgdir` the session is written to `cfgdir/projects/-c-Users-...-<cwd>/<session_id>.jsonl`, even when authentication fails. `sbx cp SANDBOX:/dir HOSTDIR` took 0.56 s; `sbx cp HOSTDIR/. SANDBOX:/dir` restored it into a new sandbox |
| Resume check | In the new sandbox `claude -p --resume <id>` found the restored session (reached the auth step); a bogus id gave "No conversation found with session ID" on stderr, exit 1. Resuming from a different cwd also found it (single observation, v2.1.306). No authenticated resume was run |
| Plugin framework | `plugin-github` (queue repo, `packages/plugin-github`) is a `RelayPlugin` default export with no manifest: a different framework from agent-fleet's `PluginManifest` + `provider(options)` (`extension-points/src/manifest.ts`). Closest model: `plugin-file-approval` |
| Worker source as plugin | Not possible today: `resolveSourceProvider` (`WorkerSourceContact.ts:137-165`) is a closed switch that throws on unknown providers and `PluginLoader.loadProvider` has no daemon caller. Registering a built-in plugin also touches `BuiltinPlugins.ts`, `flow-cli/package.json`, `BuiltinPluginCatalog.ts`, `PluginCatalog.ts`, the root tsconfig and `BuiltinPlugins.test.ts` |
| Run boundary | `assign` carries `executionId` (`Protocol.ts:12-13`). Daemon-to-worker messages are only `assign`, `idle` (never sent) and `done` (daemon shutdown, forked workers only). No run-finished or cancel signal; no worker affinity (`StepRouter.select`, `StepRouter.ts:137`) |
| Session ids in flow | `session_id` and `session_file` travel in `step_completed.meta` and live in the daemon's in-memory `stepMeta`; `fork` copies `session_file` on the worker's own file system (`ModelStepExecutor.ts:244-250`) |
| Model plumbing | Claude/OpenCode/Codex write temp settings, MCP and hook files to the host `os.tmpdir()`; the MCP bridge listens on host `127.0.0.1:<random>` (`McpServer.ts:111`) and hands the CLI `process.execPath mcp-server.cjs`; none of this exists in a VM by default. Reachability is configurable (`host.docker.internal` plus a sandbox-scoped allow rule, verified with a test server), but the bridge binds `127.0.0.1` on a random port per step (`McpServer.ts:111`), so a rule per step is needed, and the callback host, `process.execPath` and the `mcp-server.cjs` path (`McpServer.ts:126`) are host-only. Spawns to make injectable (counted by grep, correcting an earlier "7"): 8 step-process spawns (`ScriptExecutor.ts:283,430`; `ClaudeLauncher.ts:318` interactive and `:378`; `OpenCodeModelProvider.ts:380` interactive and `:443`; `CodexModelProvider.ts:71` interactive and `:104`), plus `CompactHook.ts:137` and about 9 `execSync` binary lookups. The 3 interactive ones are probably irrelevant to a worker without a TTY (inference). The model providers forward only an env allow-list (Bedrock vars must come from `claudeEnv` / step `env`) |

## Bedrock and kits (2026-10-25)

| Topic | Fact |
|---|---|
| Blog route | veryhappythings.co.uk/post/2026-07-11-docker-sbx: a kit with `bedrock*.amazonaws.com:443` allowed, `CLAUDE_CODE_USE_BEDROCK=1`, `AWS_REGION`; credentials by shipping `.aws/config` and running `aws sso login` inside the sandbox, or an undocumented `claude-bedrock` agent. Third-party, UNVERIFIED |
| `claude-bedrock` | Not in the 11 agents listed by `sbx create --help` on v0.49.2 |
| Kits | `sbx kit` is marked EXPERIMENTAL. Schema v2 (`kind: mixin` / `sandbox`): `permissions.network.allow/deny`, `environment.variables`, `credentials`, `setup.install/startup/files`, `files/home`. The blog's `allowedDomains` is a v1 field and a decode error in v2; docs recommend v3 for new kits |
| Kit limits | A kit cannot read host env vars, files or AWS profiles; credentials come from the secret store with proxy injection (`apiKey.inject` per domain + network allow); `passthrough: true` sends the real token into the VM |
| `sbx kit add` | Only mixins using env, `setup.install`, `setup.startup`, network allow; restarts the sandbox; kits cannot be removed from a running sandbox |
| Network scope | Whether a kit's network allow is per sandbox is not stated; it is applied at creation. Candidate answer to T-08 (per-sandbox rule), untested |

## Bedrock PoC and the colleagues' kits (2026-10-25)

| Topic | Fact |
|---|---|
| This session's auth | `CLAUDE_CODE_USE_BEDROCK` + `AWS_PROFILE` (SSO-style profile in `~/.aws`), region `us-east-1`, no access keys in the environment |
| PoC result | Host resolves short-lived credentials with `aws configure export-credentials --profile P --format env-no-export` into a private env file; `sbx exec --env-file <windows path> ... claude -p ... --model sonnet --output-format stream-json` returned `result: "OK"`, `is_error:false`, exit 0 (one run). Needs `AWS_REGION`, `CLAUDE_CODE_USE_BEDROCK=1`, the model env var, and `bedrock-runtime.<region>.amazonaws.com:443` allowed |
| Scoped policy | `sbx policy allow network --sandbox NAME HOST:PORT` scopes a rule to one sandbox; it disappeared when the sandbox was removed (0 rules left). `sbx exec` has `--env-file` (also `-e`) |
| Path pitfall | With `MSYS_NO_PATHCONV=1`, `sbx.exe` cannot open a POSIX-form `--env-file` path; pass a Windows path (`cygpath -w`) |
| Colleagues' repo | An internal kit repository (name and organisation omitted on purpose): kits at schema v2 (`kind: mixin`), a Python wrapper around `sbx`, and a Python credential daemon |
| Their Bedrock design | Host daemon on `127.0.0.1:19000`; inside the VM `~/.aws/config` has `credential_process = curl http://host.docker.internal:19000/?profile=...`; the sbx proxy injects a Bearer secret (`sbx secret set` with a custom service) so the secret never enters the VM; profiles are whitelisted (others get 403); the daemon runs `aws sso login` when needed; no AWS keys are stored in the VM |
| Their policy hooks | `ANTHROPIC_CUSTOM_HEADERS` carries a Bedrock guardrail id/version; a `UserPromptSubmit` hook uploads session metadata to an S3 log bucket. Whether these apply to flow runs is Q10 |
| Their settings | Dummy `anthropic`/`openai` secrets when prompted; `sbx settings set credentials.failClosed true` recommended; Codex via Bedrock uses the same `credential_process` with its own profile; no OpenCode |
| Their pitfalls | Blocked hosts need `sbx policy allow network`; `--kit` only at creation (use `--name`); two kits merging `.claude/settings.json` can conflict; `localhost`/`127.0.0.1` are not proxied, hence `host.docker.internal`; Windows needs `core.symlinks`; installs track "latest" so they are not reproducible; sbx 0.38.0+ |

## Idle behavior of local sandboxes (2026-10-25)

| Topic | Fact |
|---|---|
| Auto-stop | A local sandbox with no open session is stopped by sbx about 30 s later (first run: stopped within 32 s, polled every 10 s; second run: ~35 s after the session ended, polled every 5 s). No setting exists: `sbx settings ls` has no idle or ttl key; `sbx ttl` is cloud only |
| Open session | An open `sbx exec` session keeps the sandbox running (still running at 95 s with a 100 s exec) |
| What a stop keeps | A file under `/home/agent` survived the auto-stop; background processes were killed (only the keepalive remained); the next `exec` restarted the sandbox (restart + exec 2.1-3.4 s measured earlier) |
| What `rm` loses | Everything VM-local: home (including Claude session files unless exported), installed tools, caches. The host workspace mount is unaffected either way |
| Consequences | Relay variant: the inner worker is a long-lived exec, so the wrapper must own the idle timer. Exec variant: sbx's own ~30 s stop applies between steps, so a leaked process survives back-to-back steps but not longer gaps (non-deterministic unless the wrapper stops explicitly) |

## Diagnostics today (2026-10-25, repo; items marked agent-reported were not re-read)

| Topic | Fact |
|---|---|
| Kept by the daemon | `executions/<id>.json` (step states, `meta` incl. `session_id` and `session_file`, cost, masked input/output; pruned after `retainDays`, default 30); `logs/YYYY-MM-DD.ndjson` with every worker `log` line (30 files by default); `<workspace>.meta` directory created by the daemon (`ExecutionWorkspaces.ts:75-77`, `WorkspaceManager.ts:196-197`) |
| `release` | Calls the provider or manager `release`; the manager removes the workspace path only, never `<workspace>.meta` (grep of `WorkspaceManager.ts`; the pruner removes both after 30 days or beyond 50 workspaces, agent-reported). Isolated workspaces are deleted on success and failure alike (no keep-on-failure option, agent-reported) |
| Written by the worker, on its own disk | `writeOutput` files under the daemon-given `outputsDir` (`WorkerAdapter.ts:146-148,174`); Claude session transcript (`meta.session_file` is only a path); forked-session copies; Codex `hook.log` (deleted with its run dir); all temp configs and scripts (deleted at step end) |
| Shipped to the daemon | `log`, `step_progress`, `step_completed` (outputs, meta, io), `step_failed` (error, stdout, stderr). There is no file or artifact message in the protocol |
| Worker stderr | Only a forked worker's stderr tail reaches the daemon log; terminal, command and inbound workers keep it on their machine. A remote worker's `outputsDir` files and Claude transcripts stay on its disk with no retrieval command (existing gap) |
| If the VM is removed | Lost: Claude/Codex/OpenCode session stores in the VM home (resume across steps breaks), the inner worker's stderr. Kept if the mount covers them: workspace contents, `<workspace>.meta` and `outputs/` |
| Existing gaps noticed | `.meta` of plugin-provided workspaces is never pruned (pruner scans only `.flow/workspaces`); no keep-on-failure for isolated workspaces |

## Validation PoCs for the spec decisions (2026-10-26, one run each unless stated)

| Check | Result |
|---|---|
| Codex in sbx | `codex-cli 0.149.1`; `codex exec` is headless (`resume`, `fork`, `-c key=value`, `-m`); `CODEX_HOME` is preset; state is SQLite databases plus a `sessions` directory under `~/.codex`; without credentials it fails with 401 on `wss://api.openai.com/v1/responses` after ~19 s |
| OpenCode in sbx | `1.18.32`; `opencode run` is headless (`--format json`, `-s <id>`, `--fork`, `-m provider/model`); state is the SQLite database `~/.local/share/opencode/opencode.db`; without credentials it fails in ~3 s with "Missing Authentication header" |
| Agent images | Each agent image contains only its own CLI (claude, codex, opencode are absent from each other's image): a run sandbox that must run all three needs a custom image (decision #20). Cold create: codex 37 s, opencode 59 s (image pull) |
| WebSocket VM to host | A Node 22.22.1 global `WebSocket` in the VM connected to a host `ws` server through `host.docker.internal:<port>` with a sandbox-scoped allow rule; messages flowed both ways. Validates the transport of the relay variant |
| `sbx secret set-custom` | `--host` takes a host WITHOUT port (`localhost`, not `localhost:19001`); the placeholder must be passed to the VM explicitly (`-e VAR=<placeholder>`), sbx does not set it in existing sessions; `--sandbox` scopes it; `--value` and `--command` (secret from a command's stdout) both work; `secret ls` masks a command secret but shows the first characters of a `--value` secret; the secret and the policy rules disappeared with the sandbox |
| Host credential endpoint | With the placeholder in `Authorization: Bearer`, the proxy swapped in the real secret and the host endpoint answered 200; without it, 403. The real secret was never given to the VM |
| Bedrock via `credential_process` | Claude Code in the sandbox, with `AWS_CONFIG_FILE` pointing to a VM file whose profile uses `credential_process = /home/agent/cred.sh` (a curl to the host endpoint), returned `result: "OK"`, `is_error: false`, with no AWS key in the VM. Needs `localhost:<port>` and `bedrock-runtime.<region>.amazonaws.com:443` allowed for that sandbox |
| Session on the mount, resumed elsewhere | With `CLAUDE_CONFIG_DIR` under `<meta>/sessions/claude`, the transcript landed on the host; after removing the sandbox, a NEW sandbox ran `claude -p --resume <id>` and answered the word given in the first run: real cross-sandbox resume works (decision #18 validated for Claude) |
| OpenCode store on the mount | With `XDG_DATA_HOME` under `<meta>/sessions/...`, `opencode.db` plus its `-wal` and `-shm` files were created on the host with no SQLite error; a second run listed the same session; the files remained after the sandbox was removed (unauthenticated runs) |
| Codex store on the mount | With `CODEX_HOME` under `<meta>/sessions/codex` (directory MUST exist first, otherwise "path does not exist"), no SQLite error and the session was found again by `codex exec resume <id>` (same sandbox, unauthenticated). Caveats: Codex no longer reads the image's default config (it ran with `sandbox: read-only` instead of full access), so settings must be passed with `-c`; and at start-up it clones a plugins repository into `CODEX_HOME/.tmp`: 10 284 files were written to the host for a run that did nothing (disk and time cost, needs GitHub access) |
| OpenCode over Bedrock | `opencode run -m amazon-bedrock/us.anthropic.claude-sonnet-5-5 --format json` with `AWS_CONFIG_FILE`/`AWS_PROFILE` pointing to a `credential_process` profile and `XDG_DATA_HOME` on the mount answered `OK`; in a NEW sandbox `-s <id>` answered `PINEAPPLE`. The model id needs the `amazon-bedrock/` prefix and the `us.` inference-profile form; a bare id (what I first used) gives "Unexpected server error" with no hint (already documented in `ModelAliases.ts`) |
| Codex over Bedrock | `codex exec -c model_provider="amazon-bedrock" -c model="openai.gpt-5.6-terra" -c model_providers.amazon-bedrock.aws.profile="codex" -c model_providers.amazon-bedrock.aws.region="us-east-1"` with `CODEX_HOME` on the mount (directory created first) answered `OK`; `resume <id>` in a NEW sandbox answered `PINEAPPLE`. Allowed hosts for that sandbox: `localhost`, `bedrock-runtime.us-east-1.amazonaws.com`, `bedrock-mantle.us-east-1.api.aws`, `github.com` (necessity of the last two not isolated) |
| Two AWS profiles | Claude/OpenCode and Codex use different host profiles (`~/.codex/config.toml` pins a dedicated Codex profile). One host endpoint serves both through a whitelisted alias in the query (`?profile=claude|codex`); an unknown alias gets 403 |
| Result | Claude, OpenCode and Codex each ran a real Bedrock call from a sandbox with no AWS credential in the VM, kept their session on the host mount, and resumed it from a new sandbox (decisions #12, #18, #24 validated locally) |
| Per-sandbox network deny | `sbx create --deny-network '**'` blocked github.com for that sandbox (baseline under the `balanced` policy: github.com and registry.npmjs.org reachable, example.com not), but a later `policy allow network --sandbox` for example.com did NOT reopen it: a deny wins. A "deny all then allow" per sandbox is therefore not possible without changing the machine-wide policy |
| SSH agent forwarding | `sbx settings ls` shows `ssh.agentForwardingEnabled true` by default (a machine-wide setting) |
| Guardrail notes | The guardrails blocked a script containing a `.aws/` path and inline `node -e` / `python` words; worked around with `AWS_CONFIG_FILE` and script files, no bypass requested |

## M2 findings (2026-10-27, sbx 0.49.2, image flow-sandbox:m2; evidence in `.claude/temp/poc-m2/`)

Real Bedrock call from a sandbox with no AWS key, then resume from a NEW sandbox (`live-results-final.json`). Times in ms.

| Tool | Create | Attach (rule, secret, 2 VM files) | Call 1 | Resume call | Answers |
|---|---|---|---|---|---|
| claude 2.1.306 | 25954 (cold), then ~5000 | 1907 | 7096 | 5097 | OK / PINEAPPLE |
| opencode 1.19.4 | 5238 | 1977 | 5461 | 5701 | OK / PINEAPPLE |
| codex 0.149.1 | 5731 | 1984 | 2741 | 4932 | OK / PINEAPPLE |

| Finding | Fact |
|---|---|
| Codex resume | 0.164.0 with `CODEX_HOME` on the mount: `thread/resume failed: list_turns is not supported yet` (also with `--disable plugins`, `-c sandbox_mode`, `-c approval_policy`). Works with `CODEX_HOME` inside the VM (0.164.0) and with 0.149.1 on the mount. Not isolated: version regression vs mount behaviour. Image pinned to 0.149.1; resume verified with the m2 image and no runtime install (`live-codex-image-m2.json`) |
| Codex host | Needs `bedrock-mantle.<region>.api.aws:443`; without it `403 Approval required for bedrock-mantle...`. github.com need not isolated (machine policy already allows it) |
| Rule scoping | Per-sandbox: identical resources in two sandboxes get separate rules; a third sandbox is refused (`RuleScopeProbe.mjs`). `policy rm network` for a removed sandbox fails with two texts, never "not found" |
| Secrets | No AWS key in the VM (env, `/home/agent`, `/tmp`, mounts scanned for patterns and the exact issued key; positive control detected). `secret set` accepts a missing sandbox, an unknown service and empty stdin (the runtime rejects all three). `secret rm` listing shows first and last characters of a key. `set-custom --command "cat <path>"` works on Windows and runs once, at store time |
| Mount writes | Workspace mount: 0 files written; only `<meta>/sessions/<tool>`. Codex store 66 files with `--disable plugins` |
| Not run | API-key provider call (no key in env); real expired-SSO wording; Linux/macOS; concurrent sandboxes |

## To test on a real machine

1. Windows 10 behaviour of `sbx`.
2. Same absolute path inside the VM for a `C:\...` workspace.
3. `sbx exec -i` stdio piping: buffering, TTY mangling, exit codes, streaming of `claude -p --output-format stream-json`.
4. Startup time and memory per sandbox at N concurrent.
5. Whether a `--branch` flag exists (mentioned once in docs, absent from the CLI reference).
6. Controlling `sbx` on a Mac over SSH from another machine (undocumented).
