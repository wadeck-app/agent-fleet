 Threat Model -- Secrets & Env Isolation

Scope: Accidental disclosure prevention. Not adversarial-proof. An attacker with code execution in the worker process is out of scope.

 Trust boundaries

```
CLI process          → daemon (HTTP/. loopback)     [no secret values]
Daemon process       → worker (WebSocket assign msg)  [no secret values -- URIs only]
Worker process       → SecretProvider                 [resolves URI → plaintext, in-process only]
Worker process       → Claude subprocess              [env vars, explicit only]
Worker process       → script subprocess              [env vars, explicit only]
Worker process       → daemon (log/result WebSocket)  [masked before send]
Worker process       → disk (executions/.json)       [masked before write]
Worker process       → disk (logs/.ndjson)           [masked before write]
```

 Provider hierarchy

```
ValueProvider (interface)
   VarsProvider    -- resolves vars: block (env://, file://, value://, input://)
   SecretsProvider -- resolves secrets: block (env://, file://, input://)
                       value:// NOT allowed in secrets
```

 URI schemes

| Scheme              | Allowed in vars: | Allowed in secrets: | Notes                                                          |
| ------------------- | ---------------- | ------------------- | -------------------------------------------------------------- |
| `env://NAME`        | yes              | yes                 | Reads from worker process env at resolve time                  |
| `file://./rel/path` | yes              | yes                 | Relative to workspace dir -- validated                          |
| `file:///abs/path`  | yes              | yes                 | Absolute -- warning or error (configurable)                     |
| `value://literal`   | yes              | NO                  | Plaintext in YAML -- vars only; warns if file is tracked by git |
| `input://name`      | yes              | yes                 | Reads from flow inputs passed at invocation time               |

`cmd://` is NOT a supported scheme (removed -- shell injection surface, no safe parsing).

 Secret object model

Resolved secret values are wrapped in a `Secret` type immediately after resolution:

```typescript
class Secret {
	readonly value: string;
	constructor(value: string) {
		this.value = value;
	}
	use(): string {
		return this.value;
	} // only call site: subprocess spawn
	toString(): string {
		return '[REDACTED]';
	}
	toJSON(): string {
		return '[REDACTED]';
	}
	[Symbol.for('nodejs.util.inspect.custom')]() {
		return '[REDACTED]';
	}
}
```

Plaintext is accessed via `.use()` only at the moment of subprocess env construction. The `Secret` object itself must never be serialized, logged, or included in error messages.

 Masking registration

Before any subprocess runs, the worker registers all resolved secret values with the log masker:

```typescript
const raw = Buffer.from(secret.use());
const b = (buf: Buffer) => buf.toString('base').replace(/=+$/, ''); // strip padding -- matches embedded occurrences

masker.register(secret.use()); // raw
masker.register(b(raw)); // base offset 
masker.register(b(Buffer.concat([Buffer.from([x]), raw])).slice()); // base offset  -- slice() not slice()
masker.register(b(Buffer.concat([Buffer.from([x, x]), raw])).slice()); // base offset  -- slice() not slice()
masker.register(raw.toString('baseurl')); // URL-safe base (no padding by spec)
masker.register(raw.toString('hex')); // hex
```

Why no padding: trailing `=` belongs to the outer encoding when a secret is embedded mid-string. Stripping ensures the masker matches content bytes regardless of context.

Why  base shifts: a secret embedded inside a larger base-encoded blob encodes differently depending on its byte-offset (, , or ) within the -byte base block boundary. All  variants must be registered.

Slice calculation: offset- prepends  null byte → `ceil(/) = ` leading base chars encode the padding, slice() removes them. Offset- prepends  null bytes → `ceil(/) = ` leading chars, slice(). Slicing  in both cases (prior error) removes a full -byte block and cancels the shift entirely.

Masking applies to ALL output paths:

- Claude subprocess stdout/stderr
- Script subprocess stdout/stderr
- Worker's own log entries (before WebSocket send)
- StepOutput before writing to executions/\.json
- Any error message that crosses a process or I/O boundary

 Subprocess env construction

Default env passed to any subprocess: NOTHING.

Steps declare their env explicitly:

```yaml
steps:
    - id: create-pr
      type: model
      env:
          GITHUB_TOKEN: ${{ secrets.github_token }}  secret mapped to env var
          NODE_ENV: ${{ vars.NODE_ENV }}  var mapped to env var
          CUSTOM: 'literal value'  inline literal
```

The worker constructs `{ GITHUB_TOKEN: secret.use(), NODE_ENV: "production", CUSTOM: "literal value" }` -- nothing else. No `PATH`, no `HOME`, no inherited daemon env. If a script needs `PATH`, it must declare it.

 Step isolation

Secrets are resolved EAGERLY at worker startup -- all secret URIs for all steps are resolved before any step executes, wrapped in Secret objects, and registered with the masker. Only the .use() call (writing to subprocess env) is deferred to step execution time. This prevents the TOCTOU race where a parallel step's output passes through the masker before the secret is registered.

Step B cannot access `github_token` if `github_token` is not in step B's `env:` block. Resolved values live only in the worker's in-process memory for the duration of the execution.

 `input://` in secrets: -- URI indirection model

`input://name` in a `secrets:` block declares that the sourcing URI for this secret is provided by the caller at invocation time. The caller passes a URI, never a plaintext value:

```bash
flow run ./deploy.yml --input deploy_key=file://./secrets/deploy_key
flow run ./deploy.yml --input deploy_key=env://MY_DEPLOY_KEY
```

The CLI validates that inputs declared as `type: secret` receive a recognized URI scheme (`env://`, `file://`). Literal values are rejected at CLI validation time. The URI travels through CLI→daemon→worker as a string. The worker resolves it via `SecretProvider` -- the plaintext never leaves the worker process. The trust boundary holds.

Interactive TTY collection is not supported. The CLI is non-interactive by design.

 `vars:` entropy detection

At `flow validate` time and at daemon pre-queue validation, `value://` entries in `vars:` are scanned:

Pass  -- known token prefix scan (error):
Matches against unambiguous secret prefixes: `ghp_`, `github_pat_`, `gho_`, `ghs_`, `AKIA`, `sk-`, `eyJ`, `glpat-`, `xoxb-`, `xoxp-`, `SG.`, `rk_live_`, `sk_live_`, `Bearer `.
Result: error -- move to `secrets:` block.

Pass  -- Shannon entropy scan (warning):
`H = -Σ p(c) × log₂(p(c))`. For values with length ≥ :

- Base charset entropy > . → warning
- Hex charset entropy > . → warning

Human-readable config scores < .. Random tokens score > .. Threshold matches detect-secrets and Gitleaks defaults.

Allowlist: inline comment ` flow-cli: allowlist` disables the warning for that entry. Hashes stored in `.flow-secrets-baseline.json` (same pattern as detect-secrets).

No scanning for values sourced via `env://` or `file://` -- resolved at runtime, not statically analysable.

 Masking configuration

Configurable in `~/.flow-config.yaml`:

```yaml
secrets:
    minLength:
          default: . Secrets shorter than this: masking attempted but warning emitted.
         Industry: GitHub ~, GitLab , CircleCI .  is the safest default.
    charset:
        printable-ascii  default: printable-ascii (x-xE, no newlines/control chars)
         strict: alphanumeric-plus (GitLab set: A-Za-z- @ : . ~ = + _ -)
         none: no restriction -- warning emitted for values outside printable-ascii
```

Why `minLength: `: short values (≤ chars) appear naturally in logs, producing false-positive redactions that make output unreadable.  chars is the industry-validated threshold.

Why charset restriction: masking is regex/line-based. A secret containing `\n` splits across log lines -- undetectable. A secret containing `\`, `"`, `` can break the regex pattern. Control characters may be transformed by JSON serializers or terminal emulators before the masker sees them.

- `printable-ascii`: rejects control chars and newlines; accepts API keys, tokens, passwords.
- `alphanumeric-plus`: GitLab-style; safest masking guarantees; rejects PEM keys, JSON blobs.
- `none`: no restriction; worker warns for each out-of-range character found.

In all cases, charset violations at registration time produce warnings, not errors -- execution proceeds with degraded masking coverage for that value.

 Known residual risks

| Risk                                      | Status                   | Mitigation                                                                                                                                                         |
| ----------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `value://` in secrets                     | Blocked at validate time | Error, not warning                                                                                                                                                 |
| Absolute `file://` paths                  | Configurable             | `warn` or `error` via `validation.absoluteSecretPath` in `~/.flow-config.yaml`                                                                                     |
| `file://` path traversal / symlinks       | Mitigated                | `path.resolve` + `fs.realpath` + workspace prefix check                                                                                                            |
| Claude echoes secret in output            | Mitigated                | All output masked before storage                                                                                                                                   |
| Uncaught exception with secret in scope   | Mitigated                | `Secret` class -- `.toString()` returns `[REDACTED]`                                                                                                                |
| git-tracked YAML with `value://` vars     | Partial                  | Warning if workspace is a git repo and file is tracked                                                                                                             |
| base byte-shift variants                | Mitigated                |  shifted variants registered (offsets //), slice()/slice() -- covers secrets embedded mid-string                                                              |
| `input://` terminal echo                  | Mitigated                | Silent readline (no echo) enforced for input:// in secrets: block                                                                                                  |
| Script temp file with interpolated secret | Mitigated                | Secrets forbidden in script text -- only env: mapping allowed; enforced at validation                                                                               |
| Absolute file:// default                  | Mitigated                | Default is error; warn requires explicit config opt-in                                                                                                             |
| NOTHING default env                       | By design                | Operator must declare PATH and all required vars explicitly; no fallback                                                                                           |
| Hex-encoded secret in output              | Mitigated                | Hex variant registered with masker                                                                                                                                 |
| `vars:` value containing a secret         | Mitigated                | Entropy scan + prefix scan at validate time; known prefixes → error, high entropy → warning                                                                        |
| `charset: none` + multi-line secret       | Partial                  | Masking does NOT work for multi-line values regardless of charset setting -- line-based masker cannot match across line boundaries. Warning explicitly states this. |
| `vars:` resolved values unmasked          | Mitigated                | `vars:` values sourced via `env://`/`file://`/`input://` are also registered with the masker at worker startup                                                     |
| `input://` secret literal at CLI          | Mitigated                | CLI rejects literal values for `type: secret` inputs -- only URI schemes accepted                                                                                   |
