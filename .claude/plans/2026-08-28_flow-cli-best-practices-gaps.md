# Gap remediation — flow-cli CLI best practices

Source: gap analysis against `~/.claude/docs/cli/`.

## Base commands

- [ ] **`flow start` / `flow stop` / `flow status`** — daemon auto-starts on `flow run` but there are no explicit lifecycle commands. Add `start` (spawn detached), `stop` (POST /quit), `status` (running/stopped/version/uptime; JSON when `--json` or no TTY).
- [ ] **`flow cli logs [--follow]`** — add command to read/tail today's NDJSON log from `<configDir>/logs/`.
- [ ] **Exit codes in `--help`** — Commander generates help but no exit codes table; add via `.addHelpText('after', EXIT_CODES_TEXT)`.

## UX

- [ ] **`--json` on `flow run`, `flow show`, `flow history`** — `validate` has it but other commands don't.

## Already implemented (for reference)

- `flow cli update` / `flow cli rollback` / `flow cli self-check` / `flow cli version` — fully implemented in `CliCommand.ts:221-320`.
- `ConfigDir.migrateIfNeeded('flow')` — called in `buildCliCommand()` body (CliCommand.ts:214), which runs unconditionally at FlowIndex.ts:38 on every `flow` invocation. No action needed.

## Auto-update

- [ ] **`scheduleBackgroundUpdate` in `finally {}`** — currently after `await program.parseAsync()` with no `finally`; a thrown command error skips it. Wrap in `try/finally`.

## Dev

- [ ] **`preversion` guard** — add to package.json scripts.
- [ ] **Script `clean` includes `dist-bundle`** — current `clean` only removes `dist`; add `dist-bundle`.
