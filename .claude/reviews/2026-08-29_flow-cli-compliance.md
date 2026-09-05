# flow-cli compliance review — 2026-08-29

## Plan completion (`2026-08-28_flow-cli-best-practices-gaps.md`)

| Item                                                | Status | Evidence                                                                                     |
| --------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| `flow start` / `flow stop` / `flow status`          | DONE   | `FlowIndex.ts:38,58,96` — Commander commands registered                                      |
| `flow cli logs [--follow]`                          | DONE   | `CliCommand.ts:322-329` — `cli.command('logs')` with fs.watch                                |
| Exit codes in `--help`                              | DONE   | `FlowIndex.ts:22,164` — `EXIT_CODES_TEXT` + `addHelpText('after',...)`                       |
| `--json` on `flow run`, `flow show`, `flow history` | OPEN   | Not found in `RunCommand.ts`, `ShowCommand.ts`, `HistoryCommand.ts` — only `validate` has it |
| `scheduleBackgroundUpdate` in `finally {}`          | DONE   | `FlowIndex.ts:178` — `finally {` block confirmed                                             |
| `preversion` guard                                  | DONE   | `packages/flow-cli/package.json:21`                                                          |
| `clean` includes `dist-bundle`                      | DONE   | `packages/flow-cli/package.json:22` — `rimraf dist dist-bundle`                              |

**1 item still open: `--json` on run/show/history**

---

## Spec compliance

### development.md

| Spec                                 | Status | Notes                                        |
| ------------------------------------ | ------ | -------------------------------------------- |
| Commander-based command registration | DONE   | `register*Command(program)` pattern          |
| Entry point guard                    | DONE   | `FlowIndex.ts` bottom — `isEntryPoint` check |
| `preversion` guard                   | DONE   | `package.json:21`                            |
| `clean` script                       | DONE   | `package.json:22`                            |
| `vitest --bail=1` tests              | DONE   |                                              |

### ux.md

| Spec                         | Status  | Notes                                                                              |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------- |
| Exit codes documented        | DONE    | `FlowIndex.ts:22-35` — `EXIT_CODES_TEXT` with table                                |
| `[ok]`/`[fail]` symbols      | PARTIAL | self-check uses `[ok]`/`[FAIL]` (uppercase FAIL vs `[fail]`) — spec says lowercase |
| TTY detection + `--json`     | PARTIAL | only `validate` has `--json`; run/show/history missing                             |
| Update notice before command | DONE    | `FlowIndex.ts:150-158` — reads state before `parseAsync`                           |

### base-commands.md

| Spec                                 | Status | Notes                                   |
| ------------------------------------ | ------ | --------------------------------------- |
| `--help` / Commander subcommand help | DONE   | Commander auto-generates per subcommand |
| `--version`                          | DONE   | `.version(VERSION)` in FlowIndex        |
| `<app> cli self-check`               | DONE   | `CliCommand.ts:312`                     |
| `flow start` / `stop` / `status`     | DONE   | `FlowIndex.ts:38,58,96`                 |
| `flow cli logs [--follow]`           | DONE   | `CliCommand.ts:322`                     |
| `flow cli update` + `rollback`       | DONE   | `CliCommand.ts:238`                     |
| `FLOW_CONFIG` env override           | DONE   |                                         |

### config.md (Strategy C two-level)

| Spec                                         | Status | Notes                                                 |
| -------------------------------------------- | ------ | ----------------------------------------------------- |
| User-level plugin instances + project `use:` | DONE   | existing config loader                                |
| `ConfigDir.migrateIfNeeded('flow')`          | DONE   | `CliCommand.ts:214` — called on every flow invocation |

### logging.md

| Spec                                         | Status | Notes               |
| -------------------------------------------- | ------ | ------------------- |
| Daemon file-only logger (`LogWriter` NDJSON) | DONE   |                     |
| Log in `<configDir>/logs/`                   | DONE   |                     |
| `cli logs [--follow]`                        | DONE   | `CliCommand.ts:322` |

### auto-update.md

| Spec                                 | Status | Notes               |
| ------------------------------------ | ------ | ------------------- |
| Background updater in `finally {}`   | DONE   | `FlowIndex.ts:178`  |
| Update state read before dispatch    | DONE   |                     |
| `cli self-check` contract            | DONE   | 7 in-process checks |
| Manual `cli update` + `cli rollback` | DONE   |                     |

---

## Open item detail

**`--json` on `flow run`, `flow show`, `flow history`** — `ValidateCommand.ts` has `--json`; the other three commands output human-readable text only. No `process.stdout.isTTY` check, no `--json` flag. Spec says: add `--json` for machine-parseable output and check TTY. This is the only remaining gap.
