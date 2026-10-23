# Served text: ANSI stripping only

Free text of a run (errors, step output, relaunch feedback, log lines) leaves the module through flow-core's `stripForServing`, `stripErrorsForServing` and `stripRecordForServing` (`logs/ServingText.ts`). Same code for both modules.

## What is and is not done

- Done: `stripAnsi` (`logs/AnsiStrip.ts`, browser-safe, linear time): CSI, OSC (OSC 8 hyperlink labels stay), DCS/APC/PM/SOS, two-character escapes, other control characters; `\r` progress overwrites keep the last write; a sequence cut at the end is dropped. Cursor movement is not emulated.
- Not done: any secret detection. Guessing by name or shape was removed; it protected little and implied more. What is served is what is stored.
- Secrets are protected at write time: the daemon masks, by exact value, the DECLARED secrets (`type: password` flow inputs) in the execution records and daily logs.
- Not covered by that masking: undeclared secrets (a token the script reads from the environment, a value a tool prints on its own), and every record or log written BEFORE the masking existed. Both may contain secrets and are served unchanged.

## Finding old secrets

Files live in the flow config dir (`<XDG_CONFIG_HOME or ~/.config>/flow`): `executions/<id>.json` (`FlowConfigLayout.ts`) and `logs/YYYY-MM-DD.ndjson`. Recipe, to adapt to the tokens you use:

```
cd ~/.config/flow
grep -rEl 'gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|xox[abprs]-|npm_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.|://[^/:@ ]+:[^/@ ]+@' executions logs
```

Matching files need a manual look; a match is not proof of a live secret and no match is not proof of absence. Rotate what you find, then delete or edit the file.

## Order of cut and strip

Terminal control is stripped **before** any truncation, so a cut cannot split an escape sequence. Consequences:

- Step panel label "last 2000 of 30880 characters": `30880` counts the **stripped** text, not the raw capture. `capText` in `graph/StepIO.ts`.
- `GET /executions/:id` strips the record, then renders and tails it (`tail`, `full`).
- `GET /executions/:id/logs`: the `q` filter matches the stored message.

## Endpoints covered

| Endpoint                         | Fields served                                                        |
| -------------------------------- | -------------------------------------------------------------------- |
| `GET /executions/:id`            | `text`, `lastError`, step `error`, relaunch `feedback`               |
| `GET /executions`                | `lastError`, `errorExcerpt` (stripped before the 30-char cut)        |
| `GET /executions/:id/logs`       | entry `message`, `recordedOutput`                                    |
| `GET /logs`                      | `text` (`human=false`: NDJSON as written, escapes stay JSON-escaped) |
| `GET /widgets/executions`        | failure `error` / `summary` (digest built from stripped errors)      |
| `GET /graph` (flow-chart module) | node `meta.error`, `io.recorded` stdout / stderr / relaunches        |

Not covered because they carry no run text: `GET /flows`, `/workers`, `/widgets/daemon`, `/plugins`. Declared inputs shown by the chart are the flow file's values, as written.
