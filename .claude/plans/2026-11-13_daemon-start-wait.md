# Daemon start wait: alive-aware, capped, no fixed 10 s

Status: implemented, not committed. Scope: `flow run` / `flow start` auto-start (`spawnDaemonBackground`).

## Problem

The CLI gave up after a fixed 10 s on the port file, with "recorded no start-up error", even when the daemon was only slow.

## Measurements (isolated daemon, spawn -> `config.port`, 20-core Windows machine, scripts in `.claude/temp/daemon-start/`)

| Layout | Load | n | min / median / max (ms) | Start lock appears (median) |
| --- | --- | --- | --- | --- |
| dev (`node --import tsx FlowIndex.ts`, what the e2e tests use) | idle | 10 | 1022 / 1127 / 1185 | 1053 |
| bundle (`dist-bundle/flow.cjs`, dated Nov 9) | idle | 10 | 96 / 104 / 113 | 83 |
| dev | 20 CPU burners (saturated) | 9 loaded + 1 after burners ended | 2836 (unloaded run) / 35040 / 115300 | 34816 |
| bundle | 20 CPU burners (saturated) | 9 loaded + 1 after | 481 (unloaded run) / 1042 / 1134 | 841 |

- Loaded dev runs: 33-39 s for eight runs, 115 s for one. The 10 s deadline is exceeded by 3-11x.
- Dominant cost: node boot + module load/transpile BEFORE the daemon takes `daemon-start.lock` (dev: ~1.05 of ~1.13 s idle; the same step takes 33-39 s saturated). Everything after the lock (lock -> port file) is 20-80 ms.
- Not the cause: app-core registration (async, logged after the port file; refused fast with `APP_CORE_PORT=1`), reconcile (~10-20 ms), prune.
- The installed bundle stays near 1 s even saturated; the intermittent failures are a dev/tsx-layout and loaded-machine problem. Not measured: the real wscript.exe path, a real user config, moderate (partial) load.
- 20 burners = one per core, far above the "2-3 burners" asked; 2-3 would not load 20 cores.

## Decision

- `timeoutMs` (default 10 s) becomes the grace for a daemon showing NO sign of life. Signature unchanged; a third optional `deps` argument (clock, sleep, pid check, env) exists for tests.
- Liveness signal: `daemon-start.lock` (`DAEMON_START_LOCK_FILE`, written by the daemon itself with its pid, held until the port is published). Works on Windows where the spawned process is the short-lived wscript wrapper. A lock identical to the pre-spawn content (left by a crash) is ignored.
- Lock holder seen: wait up to the hard cap (default 60 s). Lock holder dead: fail at once, naming the pid. Recorded start error: fail at once (unchanged).
- Non-Windows: the spawned process is the daemon; its `exit` event fails at once with pid and exit code/signal.
- `FLOW_DAEMON_START_TIMEOUT_MS`: read only in `DaemonStartTimeout.ts`; non-integer or <= 0 throws before anything is spawned, naming the variable. It also shortens the grace (grace = min(timeoutMs, cap)).
- Timeout message: limit, elapsed, whether the process is still running (pid), the variable, `flow logs` path.
- The spawn-lock wait is `max(timeoutMs, cap) + 5 s` so concurrent callers outlast the longest wait.

## Not done

- Before the lock exists (module load not finished) on Windows there is no liveness signal: a daemon that needs more than 10 s just to load modules is still reported at 10 s. Seen in saturated dev runs (lock after 33-39 s).
- No fix of the load time itself (tsx transpile in dev layout); no wscript PID capture.
- The e2e tests (`SandboxPluginE2e.test.ts`) were not changed.
- Not exercised live: the real wscript path with the new wait; non-Windows `exit` branch ran only with `process.platform` faked.

## Reopen

- If slow starts before the lock still fail: have the VBS launcher or daemon write a pid file at process start (before module load), and treat it as the sign of life.
- If 60 s is too short or long: change `DAEMON_START_CAP_DEFAULT_MS`, or set `FLOW_DAEMON_START_TIMEOUT_MS`.
- Reproduce: `node --import tsx .claude/temp/daemon-start/measure.mts <dev|bundle> <runs> <label>` with `burn.mjs <seconds>` processes running.
