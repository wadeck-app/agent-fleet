# M8: RELAY vs EXEC vs HOST, measured comparison

Status: indicative. Scripts: `packages/flow-sandbox/scripts/bench/` (gated by `SBX_LIVE=1`, never in `npm test`). Raw data: `.claude/temp/m8/*.json`.
Labels: **MEASURED** = seen in the raw data of this report. **INFERRED** = reasoning or older evidence, not measured here.

## 1. Methodology and caveats (read first)

- One machine, Windows 10, sbx 0.49.2, images `flow-sandbox:m4` (relay), `m7` (exec), 2 cpus / 2g per sandbox, one-word Bedrock call through claude 2.1.306 (sandbox) / 2.1.311 (host).
- The machine was shared and loaded by other sessions, including another agent running unit tests in a separate clone (expected load). Conclusions rest on RELATIVE differences, not on absolute milliseconds.
- Each repetition builds a fresh isolated daemon + one wrapper + one sandbox (a wrapper serves one run). Same flow YAML for all variants; only `labels: [sandbox]` differs. HOST = normal local worker, no sandbox.
- **Series (startup, per-step, model): interleaved** round-robin host, relay, exec per repetition, n=5 each, all 15 runs completed (2026-10-27).
- **Concurrency: NOT interleaved** (variant after variant, n=3 per level), so absolute values are not comparable across variants. Memory guard: no level runs when free memory minus N x 2 GiB < 2.5 GiB; a watchdog aborts a run below 1.2 GiB.
- HOST claude runs with an empty `CLAUDE_CONFIG_DIR`. With the user's real config (SessionStart hooks, plugins) the host one-word step took 21 s once (single run, `smoke-host-realconfig.json`), 7 s with the clean config. A fair baseline needs the clean config.
- Load flagging: run-level only (a run is flagged when its cpu maximum > 80 % or its lowest free memory < 2.5 GiB). Per-sample data and counts of foreign node/sbx processes were NOT kept (only run summaries) - not done. Flagged runs: host 0/5, relay 2/5, exec 3/5 (cpu bursts; free memory never < 9.7 GiB in the series). Medians with and without them differ by < 8 % on every metric checked (largest: exec one-word step, 8.7 s vs 8.1 s); see `Flagged.mjs`.
- Single runs are marked "single run". n and (min-max) are given everywhere else.

## 2. Startup (ms, median (min-max), n=5)

| Metric | host | relay | exec |
|---|---|---|---|
| `flow run` accepted | 687 (612-876) | 693 (634-820) | 807 (607-817) |
| wrapper process start -> registered (prerequisite checks) | - | 2541 (2374-2651) | 2369 (2190-2528) |
| sandbox create | - | 4522 (4262-5647) | 4690 (4623-5945) |
| preparation (credentials, rules, store; relay: until inner worker connected) | - | 3501 (3268-4021) | 2150 (2057-2391) |
| first trivial step as seen by daemon | 41 (39-49) | 8218 (7865-9830) | 7891 (7615-8875) |
| accepted -> first step result (cold, new sandbox) | 417 (382-593) | 10996 (10337-12501) | 10505 (10178-11710) |
| `sbx` restart of the stopped sandbox + exec (warm-ish, after idle stop) | - | 2515 (2506-2854) | 2434 (2251-2472) |

- MEASURED: cold start is about 10.5-11 s in both sandbox variants, about 25x the host. Relay pays about 1.4 s more preparation (bridge token secret, proxy environment, inner worker start).
- NOT measured: restart of the sandbox by the wrapper's own idle timer inside one run (a wrapper serves one run, so no idle gap can be built inside a flow). Only the `sbx` level restart above.

## 3. Per-step overhead (25 chained `echo ok` script steps; 24 warm steps pooled over 5 runs = 120 steps, ms)

| Metric | host | relay | exec |
|---|---|---|---|
| step duration recorded by the daemon | 38 (35-146) | 17 (9-64) | 839 (704-3633) |
| wall between consecutive step completions | 43 (41-158) | 30 (17-116) | 847 (710-3641) |
| daemon gap (next start - previous completion) | 6 (5-12) | 12 (7-93) | 9 (5-18) |
| wrapper-measured step time | - | 13 (6-28) | 836 (701-3630) |
| 25 steps, first done -> last done (per-run, n=5) | 1145 (1027-1333) | 784 (674-956) | 20514 (20176-24395) |

- MEASURED: relay adds no per-step cost over the host (the inner worker is already running, bash is Linux-native); exec costs about 0.83 s per script step.
- MEASURED (process timing lines, `series-results.json`): exec per process = about 430 ms prepare + 400 ms `sbx exec`; claude also +420-560 ms for the MCP callback rule.

## 4. Model steps (ms, median (min-max), n=5)

| Metric | host | relay | exec |
|---|---|---|---|
| one-word step, daemon duration | 7034 (6625-7578) | 6492 (5896-9583) | 8706 (7530-9581) |
| one-word step, time to first token | 6803 (6389-7352) | 6386 (5796-9476) | 8122 (7018-9094) |
| step with one Bash tool call, duration | 9810 (9160-13027) | 6331 (4807-6704) | 8327 (7285-11221) |
| tool calls recorded | 1 | 1 | 1 |

- MEASURED: the model call dominates; host and relay overlap, exec is about 1-2 s higher on the one-word step, consistent with its per-process overhead (section 3). The tool-call step shows no stable order (host highest, run-to-run spread 40 %): load noise, no conclusion.

## 5. Concurrency (N simultaneous runs, one sandbox per run; n=3 per level unless stated)

| Variant | N | ok | per-run total (accept -> done) | all done | Nth sandbox ready | free memory drop (GiB) | cpu mean % | sandbox VM processes (MB, peak - baseline) |
|---|---|---|---|---|---|---|---|---|
| host | 1 | 3/3 | 9865 | 10540 | - | 0.8 | 38 | 0 |
| host | 2 | 3/3 | 11297 | 16828 | - | 0.7 | 39 | 0 |
| host | 3 | 3/3 | 14909 | 24628 | - | 1.3 | 42 | 0 |
| host | 4 | 3/3 | 19533 | 29184 | - | 2.5 | 46 | 0 |
| relay | 1 | 3/3 | 18018 | 18889 | 8509 | 2.2 | 44 | 1748 |
| relay | 2 | 3/3 | 21669 | 22619 | 10537 | 3.3 | 54 | 3368 |
| exec | 1 | 3/3 | 20579 | 21337 | 8234 | 2.6 | 47 | 1514 |
| relay N>=3, exec N>=2 | - | not run | - | - | - | - | - | - |

- MEASURED: host runs share ONE local worker (1 distinct worker at N=4), so host "concurrency" is serialized; the host rows only show queueing, not parallel capacity.
- MEASURED: each sandbox costs about 1.1-1.7 GiB of host memory in the VM process (about 1.5-1.9 GiB peak working set of the VM shim at N=1, 3.4 GiB for two) and about 8-10 s to be ready; two relay sandboxes ran in parallel with only +3.7 s on the total (22.6 s vs 18.9 s).
- Stop reasons (MEASURED, `concurrency-results-part*.json`): relay N=3 not run: free 6.98 GiB, 3 x 2 GiB would leave 0.98 GiB < 2.5 GiB. Exec N=2 not run in pass 1: free 3.71 GiB. Pass 2 (free 9.35 GiB at start) exec N=2 run 1 was aborted by the watchdog: free memory fell to 1.0 GiB (to 0 at the minimum) while the run was going, because of other load on the machine, not shown to be caused by the sandboxes; then free memory was 0.91 GiB and levels 3, 4 and relay N=2..4 were skipped. **Exec N>=2 and relay N>=3 have no data; N=4 only for host.** Free memory at the start of the levels differed (12.9 host, 9.2 relay, 7.0 exec): another reason not to compare across variants here.

## 6. Metadata fidelity (same one-word claude step, n=5 per variant; tool step also compared)

| Field of the execution record | host | relay | exec |
|---|---|---|---|
| status, attempts, `attemptLog`, `turns`, `end_reason`, `cost.reported` | present | same | same |
| `session_id` | present | present | present |
| tokens (input, output, cache read/write) | present; cache write 7.8k | present; 13.1k | present; 13.1k |
| `cost.usd` | 0.021 | 0.034 | 0.034 |
| `tool_calls` (total, by_tool.Bash) | 1 / 1 | 1 / 1 | 1 / 1 |
| `duration_ms`, `ttft_ms` | present | present | present |
| `io` inputs, outputs (response, rawOutput, stdout, stderr), truncation (4150 chars) | present | identical | identical |
| tool_use / tool_result in stored stdout | not in the first 4096 chars | present | present |
| `meta.model` | `claude-sonnet-5-5` | `sonnet` | `sonnet` |
| `meta.session_file` | empty string | host path in `.meta/sessions/claude` | host path in `.meta/sessions/claude` |
| `sourceId` | absent | present (`bench-0`) | present |
| daemon log lines per step (`<config>/logs`, n=1) | 7 | 7, same texts | 7, same texts |

- MEASURED: relay and exec are indistinguishable from each other in the record; both differ from host only in `sourceId`, `session_file`, `meta.model` and token counts (cause not investigated; the host prompt is smaller: 7.8k vs 13.1k cache-write tokens, hence cheaper).

## 7. Cancel and leak behaviour

Flow `pre -> long (sleep 4711) -> after`; `after` never ran in any case.

| Event | host | relay | exec |
|---|---|---|---|
| step `timeout: 8` | failed after 10.1 s; "Script timed out after 8s ... process tree was killed ..." ; no process left | failed after 7.9 s, same message; sandbox stays running, `sleep` gone from the VM | failed after 8.6 s, same message; sandbox STOPPED by the wrapper |
| kill the wrapper mid-step | n/a | daemon noticed within 1 s: step failed "worker disconnected ... code 1006 ... it was not retried", run failed. Sandbox: running at +15 s, stopped at +35 s (sbx idle stop). No host process left | same as relay |
| `flow stop` mid-step | n/a (not run) | step failed "worker disconnected ... code 1005"; sandbox stopped and kept (`daemon_stopping`); the leftover hint is only in the wrapper log | same; VM process check after failed (sbx abort message), not read |
| kill the daemon mid-step | record stays `running` until a new daemon starts, then "interrupted: the daemon restarted ... re-run it with flow run ..."; no process left | record `running` the same way; sandbox running at +15 s, stopped at +35 s; after the restart the record says "interrupted" (one run, with a 110 s first step: loaded sample) | **no data** (harness error, rerun impossible: sbx signed out) |

- MEASURED: no case left a host process; the only leftover is a STOPPED sandbox (kept by design, `sbx ls` shows `stopped`; removal is explicit). `sleep 4711` was absent when checked after the stop; for the kill cases the VM process survives until the sandbox stops (about 15-35 s window): INFERRED from the running -> stopped timeline, not read in the window.
- MEASURED: neither variant leaves a sandbox "running" for long, but only the idle stop of sbx cleans up after a killed wrapper.

## 8. Failure injection: what the user sees, and where

| Injection | Where visible | Text (shortened) | Actionable? |
|---|---|---|---|
| image tag missing (relay and exec, same) | step error in the record and `flow show`, after 8-11 s | `sbx create ... image "flow-sandbox:does-not-exist" is not cached locally and pull_policy=never; pre-pull the image or use pull_policy=missing` | yes: names the image and two remedies |
| `SBX_PATH` points to a missing file (relay and exec, same) | daemon log only (`flow logs`); the step stays `pending` for the whole 150 s observation, 2 wrapper launches; no host fallback seen | `binary-missing: The sbx executable configured through SBX_PATH does not exist ... Fix the path ...` | text yes, but not shown where the user looks (step queued, no error) |
| credential endpoint unreachable (rule removed, verified exit 0) | step error / `flow show`: `claude exited with code 1`, stdout `API Error: Could not load AWS credentials` | cause (endpoint blocked) nowhere in the user-facing text | no |
| invalid profile alias (relay 35.5 s, exec 30.3 s) | same step error; the real reason is in the daemon / wrapper log, repeated about 6 times | log: `credentials NOT issued ... reason=profile-not-found - The AWS profile "bench-no-such-profile" does not exist on the host` | log yes, step error no |
| invalid profile, host | step completed OK | the host worker ignored the bad `AWS_PROFILE` (reason not investigated): **not comparable** | - |

- Not measured: a real expired SSO session (only the invalid-profile simulation).

## 9. Tool and feature coverage

| Feature | host | relay | exec |
|---|---|---|---|
| claude one-word / tool call / `session.continue` (append) | ok / ok / PINEAPPLE recalled | ok / ok / **inconclusive** (first step still running at the 120 s cut; not rerun) | ok / ok / PINEAPPLE recalled (same sandbox) |
| codex (Bedrock model id, pinned 0.149.1 image) | not run | step failed; shown error is the bridge text `meta.session_file "" cannot be used: a sandbox path must be absolute`; the wrapper log shows the real cause: codex got 401 from `wss://api.openai.com` (no Bedrock settings reach it through the harness) | same bridge text; real cause **not read** |
| opencode (`amazon-bedrock/us.anthropic.claude-sonnet-5-5`) | not run | ran to `step_completed` in the VM, then the bridge replaced it by the same session_file failure; the answer was not read | same bridge text; real cause **not read** |
| script `shell: cmd` with the sandbox label | completed | stays `pending` >120 s, no error, no host fallback | same |
| MCP: model calls `provideSteps` | injected step completed | injected step completed | injected step completed |
| bash scripts | ok | ok | ok |

- MEASURED: on exec the documented refusal message for codex/opencode was NOT observed (the bridge's session_file refusal came first). The expected "refused by design" text is unconfirmed.
- MEASURED: the bridge/guard turns any provider result with an empty `session_file` into a failure and hides the provider's real error. This hits relay and exec equally (the exec wrapper reuses the same guard).
- NOT determined: where the injected MCP step ran (my probe script was printed literally, so no hostname); the "injected steps carry no labels" finding of M7 is not re-verified. Resume from a NEW sandbox was not measured (M2 evidence only: all three tools resumed across sandboxes at sandbox layer, `research-findings.md`). The coverage rerun crashed on a syntax error in my script, then sbx was signed out.

## 10. Qualitative comparison

| Axis | RELAY (engine in the VM) | EXEC (engine on host, `sbx exec`) |
|---|---|---|
| Crosses the boundary | whole `assign` incl. secrets (T-02), results, logs over a WebSocket bridge; closed message allow-list (T-01) | process stdin/stdout/env only; MCP callback to a host port through a per-process rule (T-08) |
| Code trusted inside the VM | flow worker bundle + shim (large) | `sbx exec` children only (small) |
| Token / auth | bridge token via header, works for proxy-aware clients only (T-11, G1); not secret from code in the VM | none needed |
| Env leakage | model env built by the wrapper; script steps get no env | M7 finding: `isolateEnv: false` copies the worker env, mitigated by a name filter (not a core fix) |
| Injected steps / labels (H4) | relayed `inject_steps`, registered worker also takes unlabelled steps | injected steps carry no labels; MCP false positive when the rule is missing |
| Raw TCP by IP (T-15) | same VM, same exposure | same |
| Operability | one run per wrapper; daemon restarts kill the inner session; leftover = stopped sandbox | same lifecycle code; leftover = stopped sandbox |
| Core coupling | needs C0-C3 (worker-type extension point, run-end events) for the product form | needs the C4 `ProcessLauncher` seam (landed); also C2 run-end events (INFERRED from README) |
| Windows / macOS | host needs only the wrapper | host needs Git Bash (scripts resolved on host before the seam) |
| Failure modes | bridge refusals hide provider errors (section 9) | same, plus per-step sbx exec failures surface as process errors |
| Tool coverage | unmodified worker: three tools in principle; none of codex/opencode worked through the harness (section 9) | claude only by design (INFERRED from README; refusal text unconfirmed) |
| Cost | 0 s per script step, +1.4 s start | about 0.83 s per script step |

## 11. Recommendation

1. **MEASURED**: both sandbox variants give the same record fidelity, the same cancel/leak behaviour and nearly the same cold start (about 10.5-11 s); both need about 1.1-1.7 GiB of host memory per sandbox. The decisive measured difference is per-step cost: relay about 0 ms, exec about 0.83 s per script step.
2. **Recommendation (INFERRED, the user decides)**: take EXEC as the default product path: smaller code and trust surface in the VM, no bridge protocol or token to maintain, core change limited to the landed C4 seam, and 0.8 s per step is small next to 5-9 s model calls. Ship it with the known exec limits stated (claude only, Git Bash on the host, env filter until `isolateEnv` is fixed in core).
3. **RELAY would win (INFERRED) if**: flows contain many short script steps (about 100 steps cost 83 s on exec vs about 1.5 s on relay; MEASURED per-step figures); codex/opencode must run in the sandbox (needs Bedrock settings routed by the wrapper and the empty-`session_file` rule fixed, neither done); or the engine must later run remotely (the bridge is the reusable part).
4. **Before any default**: fix the guard that hides provider errors behind the `session_file` refusal; surface wrapper start failures and credential reasons in the step error instead of only the daemon log (sections 8-9); re-test exec under N>=2 on a machine with free memory (not measured here).

## 12. Not measured, and why

- Concurrency: exec N>=2, relay N>=3, host in parallel (one worker): memory guard / watchdog; machine memory was taken by other processes.
- Kill of the daemon on exec; `flow stop` on host; VM process checks inside the kill window.
- Resume from a new sandbox; resume on relay in a flow (first step stuck at the cut, not rerun); where the injected MCP step ran; the real cause of the codex/opencode failures on exec; the documented exec refusal message.
- Real expired SSO; invalid profile on host (host ignored the setting).
- Foreign-process counts and per-sample load flags (run-level only).
- Reruns after 2026-10-31 were impossible: sbx was signed out of Docker, and the coverage rerun crashed on a syntax error in the bench script (fixed afterwards, never re-run).
