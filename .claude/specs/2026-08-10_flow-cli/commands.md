# Commands

Source: `packages/flow-cli/src/cli.ts`, `packages/flow-cli/src/commands/`

## Registration

`cli.ts` creates a `commander` `Command`, sets name `flow`, version `1.0.0`, then calls four `register*Command(program)` functions — one per command.

---

## `flow show <file>`

**File:** `ShowCommand.ts`

**Signature:** `flow show <file>` — no flags.

**Behavior:**
1. Exit 1 if `file` does not exist (stderr: `File not found: <file>`)
2. Exit 1 if file is empty after YAML parse (stderr: `File is empty: <file>`)
3. Exit 1 on YAML parse error (stderr: `Failed to parse YAML: <message>`)
4. On success: render ASCII table to stdout, exit 0

**Output format:**

```
                              ← blank line
<id>  v<version>
<name>
<description>                 ← only if description differs from name
workspace: <mode>  git:<gitStrategy>  reuse:<reusePolicy>
inputs:    <name> (<type>, required[, default: X])   ...   (none) if empty
status:    ok -> <onSuccess>   fail -> <onFailure>    ← only if statusTransitions present
trigger: event:<event> <k=v>,...                      ← only if trigger.type === 'event'
<separator: dashes of width = COL_NUM+COL_ID+COL_TYPE+COL_DEPENDS+30>
 #  <pad to COL_NUM>ID  <pad to COL_ID>TYPE  <pad to COL_TYPE>DEPENDS  <pad to COL_DEPENDS>OUTPUTS
<separator>
 <n>  <id>[(!)  ]  <type>  <deps>  <outputs>[  err -> N  max:Mx][  retry:Nx]
...
<separator>
  N steps:  <K model_name>   <K script>   ...
                              ← blank line
```

**Column widths (computed per flow):**
- `COL_NUM = 3`
- `COL_ID = min(30, max(12, longest(id.length + blocking_suffix))) + 2`
- `COL_TYPE = min(20, max(10, longest_type_string)) + 2`
- `COL_DEPENDS = min(36, max(7, longest_depends_string)) + 2`
- `OUTPUTS` column: label is 30 chars; actual content is unbounded

All columns are left-padded to their width via `pad(s, width)`. Separator is `-` repeated for `COL_NUM + COL_ID + COL_TYPE + COL_DEPENDS + 30`.

**Step rows — field rules:**

| Field | Rule |
|---|---|
| `#` | 1-based position in `flow.steps` array |
| `ID` | `step.id` + ` (!)` if `type === 'user_intervention'` and `blocking !== false` |
| `TYPE` | `model` → model name string; `script` → `"script"`; `subflow` → `"subflow:<flowId>"`; `user_intervention` → `interventionType` string |
| `DEPENDS` | `-` if no deps; step numbers (1-based) joined by `, `; if `when` present → `"1, 2: if(<cond>)"` where cond has `${{`/`}}` stripped, `steps.X.outputs.` stripped, truncated to 28 chars + `..` if > 30 chars |
| `OUTPUTS` | `-` if no `output` field; otherwise `Object.keys(step.output).join(', ')` |
| Loop suffix | `  err -> N  max:Mx` appended after OUTPUTS if `step.onFailure?.goto` is set; N is 1-based step index of target (falls back to step ID if not found); `max:Mx` only if `maxIterations != null` |
| Retry suffix | `  retry:Nx` appended if `step.retry?.maxAttempts` is set |

**Footer:** `  N steps:  K <type>   K <type>  ...` — grouped by type; for `model` steps the model name is used (not the string `"model"`).

**Inputs format:** `<name> (<type>, required[, default: X])` per input. If `spec` is a plain string, used as the type directly. `required` defaults to true (omit `required` in spec = required). Multiple inputs separated by `   ` (3 spaces).

**Status format:** `ok -> <onSuccess>   fail -> <onFailure>`. Both can be a string or `{ task: string }` object; the `task` field is extracted with `?? '?'` fallback.

**Trigger format:** only `type === 'event'` is rendered; filter entries joined as `k=v, ...`.

**Exit codes:** 0 = success, 1 = any error.

---

## `flow validate <file>`

**File:** `ValidateCommand.ts`

**Signature:** `flow validate <file>` — no flags.

**Behavior:**
1. Exit 1 if file not found, empty, or YAML parse error (same stderr messages as `show`)
2. Calls `new FlowValidator().validate(raw)` from `flow-engine`
3. Splits issues by severity: `error`, `warning`, `info`
4. Prints summary line, then each severity group
5. Exit 0 if `result.valid === true` (warnings do NOT cause exit 1)
6. Exit 1 if `result.valid === false`

**Output format:**

```
✓ Flow is valid[(N warning[s])]
  — or —
✗ Flow has N error[s]

Errors:
  - <message>[ [step: <stepId>][.<field>]]
  ...

Warnings:
  - ...

Info:
  - ...
```

Only non-empty groups are printed. Location: `[step: <stepId>]` if `issue.location?.stepId` is set; `.<field>` if `issue.location?.field` is set.

**Exit codes:** 0 = valid, 1 = file error or validation errors present.

---

## `flow run <flowRef>`

**File:** `RunCommand.ts` + `FlowCliRunner.ts`

**Signature:**

```
flow run <flowRef>
  -i, --inputs <key=value>   Repeatable. Value may contain '=' characters (first '=' is separator).
  --cwd <dir>                Working directory. Default: process.cwd()
```

**`--inputs` parsing:**
- Uses `(val, acc: string[]) => { acc.push(val); return acc; }` accumulator; default `[]`
- Split on first `=` (index via `indexOf('=')`)
- Exit 1 (stderr) if no `=` found: `Invalid input format: '<entry>'. Expected key=value.`
- Exit 1 (stderr) if key is empty: `Invalid input format: '<entry>'. Key cannot be empty.`

**Behavior:**
1. Parse `--cwd` and `--inputs`
2. Construct `new FlowCliRunner(cwd)`
3. Record `start = Date.now()`
4. Call `runner.run({ flowRef, inputs, cwd })` — see [runner.md](runner.md) and [flow-resolution.md](flow-resolution.md)
5. On throw → stderr `Flow execution failed: <message>`, exit 1
6. On `result.success === false` → stderr `Flow failed: <error|'unknown error'>`, exit 1
7. On success → stdout `✓ Flow '<flowRef>' completed in <N>ms`
8. If `result.outputs` is non-empty → print `\nOutputs:\n` then `  <stepId>.<key>: <value>` per entry. Objects are `JSON.stringify`'d; primitives are `String()`'d.

**Exit codes:** 0 = success, 1 = invalid inputs, execution throws, or `result.success === false`.

---

## `flow docs`

**File:** `DocsCommand.ts`

**Signature:**

```
flow docs
  -o, --output <file>   Write to file. Default: stdout.
```

**Behavior:**
1. `new FlowCapabilitiesGenerator().generate()` — produces a Markdown string
2. If `--output` → `fs.writeFileSync(file, content, 'utf-8')` + stdout `✓ Docs written to <file>`
3. If no `--output` → `process.stdout.write(content + '\n')`

**Exit codes:** always 0.
