# Threat Model — agent-fleet

## Plugin system

| ID   | Threat                                               | Status            | Mitigation                                                                                                      |
| ---- | ---------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------- |
| T-01 | Credentials committed in project config              | Mitigated         | Literal values cause a hard error at config load time; only `${ENV_VAR}` interpolation accepted.                |
| T-02 | Plugin reads secrets it should not access            | Accepted (v1)     | v1 plugins are developer-written only; no sandbox. Subprocess isolation deferred to v2.                         |
| T-03 | Misconfigured workspace plugin corrupts source files | Accepted (opt-in) | `none` provider uses `process.cwd()` — user's explicit choice. `worktree` provider exposes only allocated path. |
| T-06 | Cross-task intervention spoofing via web UI          | **OPEN**          | Orchestrator approval plugin must not ship until this is resolved.                                              |

## Flow execution

| ID   | Threat                                                                                              | Status                                           | Mitigation                                                                                                                                                                                                                                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | Untrusted input in a `script:` body runs as shell code (`${{ inputs.* }}` is raw text)              | **Partly mitigated** (warn)                      | `flow validate` warns `SCRIPT_BODY_INTERPOLATION`; values passed through `env:` stay data. No run-time quoting: a flow that ignores the warning stays injectable (bash proven).                                                                                                                                                 |
| F-02 | Unauthenticated worker nudge redirects a worker to a rogue daemon (credential leak, step injection) | **Mitigated** (target pinning + request hygiene) | `NudgeServer` refuses a `wsUrl` that is not the worker's own trusted daemon address (403), non-JSON content types (415), any `Origin`, and any `Host` other than its own loopback address (403). Residual: a same-user local process can still read `worker.port`; remote workers need an explicit allow-list or shared secret. |

## CLI distribution

| ID   | Threat                                             | Status    | Mitigation                                                          |
| ---- | -------------------------------------------------- | --------- | ------------------------------------------------------------------- |
| T-01 | Leaked npm WRITE token                             | Mitigated | Token lives in CI secrets only; never committed to repo.            |
| T-02 | Legacy migration tampering                         | Mitigated | `migrateIfNeeded` exits early if target directory already exists.   |
| T-05 | Auto-updater runs with elevated privileges         | **OPEN**  | Self-check must verify non-root/non-admin before applying update.   |
| T-07 | `launcher.config.json` `UpdateCmd` injection       | **OPEN**  | Deferred — wdrive T8 scope.                                         |
| T-08 | VBScript injection via user-controlled config args | **OPEN**  | All user-controlled args passed to `VbsLauncher` must be sanitized. |

## Notes

- Open threats (T-06, T-05, T-07, T-08) must not be shipped in features that depend on them until resolved.
- CORS: custom headers require explicit `allowedHeaders` configuration and extraction in the lazy-controller-plugin — missing this is a reliability failure, not a security escalation.

## From lessons learned

| ID   | Threat                                                                                                                                                             | Status                  | Mitigation                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| L-01 | `fetch()` in inline Node.js flow scripts crashes on Windows (`STATUS_STACK_BUFFER_OVERRUN`, exit 3221226505)                                                       | Mitigated               | All flow `.yml` inline scripts must use `http.request()` only; regression test in `ScriptExecutor.multiline.test.ts`. |
| L-02 | npm workspace shadowing: `npm install` from a subpackage resolves workspace deps from the registry instead of the monorepo, silently running stale/mismatched code | Active risk             | Always install from monorepo root; add `overrides` block to root `package.json` as permanent guard.                   |
| L-03 | Agent writing plan/doc files to `~/.claude/plans/` instead of `<project>/.claude/plans/` — silently misplaced, never visible in project context                    | Mitigated by guardrails | `cross-home-write` guardrail blocks it; CLAUDE.md priority rule documented in principles.                             |
