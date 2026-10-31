# Mock fidelity: claude, opencode, codex

Single source for how the LLM CLI mocks are kept identical to the real CLIs.

## Principle

- All tests except the three suites below use mocks (`packages/flow-engine/src/testing/{claude,opencode,codex}-mock.mjs`, selected via `CLAUDE_MOCK_PATH` / `OPENCODE_MOCK_PATH` / `CODEX_MOCK_PATH`). Never real APIs in automated tests.
- Real tokens are spent only when a CLI version changes, to confirm the mock still behaves like the real one.
- CI never runs the real CLIs (`CI` set disables every real-CLI suite and the drift check).

## Pieces

| Piece                                            | Role                                                                                        | Runs                                      | Cost   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------- | ------ |
| `StepRunner.model.integration.test.ts`           | claude real vs mock (flags, NDJSON events, exit codes)                                      | on drift or `CLAUDE_INTEGRATION=1`        | tokens |
| `StepRunner.opencode.integration.test.ts`        | opencode real vs mock                                                                       | on drift or `OPENCODE_INTEGRATION=1`      | tokens |
| `StepRunner.codex.integration.test.ts`           | codex real vs mock: event schema, MCP, hooks, sandbox, resume, tool policy (~14 real calls) | on drift or `CODEX_INTEGRATION=1`         | tokens |
| `processing/ProviderFlagContract.test.ts`        | every flag we emit still appears in each CLI's `--help`; opencode resolved as the provider does | every test run                        | none   |
| `.claude/<cli>-version-tested.json` (gitignored) | `{testedVersion, testedAt}` last version confirmed; written by `testing/VersionBaseline.ts` | n/a                                       | n/a    |
| `scripts/check-mock-drift.js`                    | compares installed `--version` with the cache; fails loudly                                 | `npm run check`, `npm test`, `test:agent` | none   |

A suite records the version only in its `afterAll`, after every comparison passed. A failing run therefore re-triggers until fixed.

## Commands

| Command                                                               | Effect                                                                             |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `npm run mocks:status`                                                | Print the table, exit 0                                                            |
| `npm run mocks:verify`                                                | Table, exit 1 on any drift / never verified / not installed / unparsable           |
| `npm run mocks:verify:run`                                            | Run the real suite of each drifted CLI (spends tokens), then re-verify             |
| `<CLI>_INTEGRATION=1 npm run test --workspace=flow-engine -- <suite>` | Force one suite (e.g. `CODEX_INTEGRATION=1 ... StepRunner.codex.integration.test`) |

States: `OK`, `DRIFT` (installed != cached), `NEVER-VERIFIED` (no cache file), `CACHE-UNREADABLE`, `UNPARSABLE` (`--version` output not recognised), `NOT-INSTALLED`. All but `OK` fail.

A CLI absent on this machine fails by default. Acknowledge explicitly with `MOCK_DRIFT_ALLOW_MISSING=codex,opencode` (reported as `WARN`). Unknown names in that variable are an error.

`ProviderFlagContract.test.ts` has the same rule with its own variable: a CLI whose help cannot be read FAILS the suite (message: resolved path and `--version`). Acknowledge with `FLAG_CONTRACT_ALLOW_MISSING=claude,opencode,codex` (same syntax and parser, unknown names are an error); the skip is logged once per CLI. `scripts/test-config.js` sets it for the flow-engine suite when `CI` is set; nowhere else.

At run time the OpenCode provider probes `<bin> run --help` once per binary path (`OpenCodeFlagProbe`) before a launch that sends `--auto`, and fails the step with version, path, flag and remedy when it is missing. Skipped for `OPENCODE_MOCK_PATH`.

## Where the check is wired

- `npm run check` (`scripts/check-all.js`): "Mock drift" entry.
- `npm test` (`scripts/test-all.js`) and `npm run test:agent*` (`scripts/test-agent.js`, only when the flow-engine suite is selected): `assertMocksUpToDate()` in `scripts/test-runner-utils.js` aborts before any test starts.
- Running vitest directly in `flow-engine` is not gated by the script and has no `FLAG_CONTRACT_ALLOW_MISSING`, so a missing CLI fails `ProviderFlagContract.test.ts` there; the suites still auto-run on drift but skip silently when their CLI is missing. Use `npm run mocks:verify` for the loud check.

## When a CLI is updated

1. Any gate above fails with the exact command; run `npm run mocks:verify:run` (or the single command).
2. Green: the version is recorded, nothing else to do.
3. Red: the real CLI changed. Update the mock (and provider if needed) to match the real behaviour, never loosen the assertion; re-run. Nothing is recorded until green.
4. Flag failures in `ProviderFlagContract.test.ts` are the same problem: fix the provider flag.

## Adding a provider or feature

1. Mock under `src/testing/<cli>-mock.mjs`, selected by a `<CLI>_MOCK_PATH` env var.
2. A real-vs-mock scenario in that CLI's integration suite: same `LaunchOptions` on both, same assertions, event shapes compared; add it to the suite's `EXPECTED_TESTS` so a skipped scenario blocks recording.
3. Flow tests with the mock in `StepRunner.opencode.integration.test.ts` (project rule).
4. New flags: add to `PROVIDER_FLAGS` in `ProviderFlagContract.test.ts`.
5. New CLI: add an entry to `CLIS` in `scripts/check-mock-drift.js` (probe, parser, env var, suite), mirroring the suite's `current<Cli>Version()`; cached strings must be byte-identical. Add a `VersionBaseline` instance in the suite and gitignore the cache (`.claude/*-version-tested.json` already covers it).

## Known unverified gaps (codex 0.163.0)

- `web_search="disabled"`: value accepted, but the default was already off, so the "turns it off" effect is not verified (`CodexToolPolicy.ts`).
- `task` / `todowrite` exclusions cannot be enforced by codex; they only warn.
- `read` / `glob` / `grep` exclusions are only satisfied by disabling the shell.
- `options.env` reaching the model's shell commands was checked by a one-off probe, not by the suite (`CodexModelProvider.ts`).
