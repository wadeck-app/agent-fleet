import { SECRET_EXAMPLE_FLOW_YAML } from './SecretFlowExample';

/** Markdown section about secret inputs, embedded in the generated flow documentation. */
export class SecretsDocumentation {
	public static readonly PASSWORD_TYPE_ROW =
		'| `password` | Secret value (see Section 8): passed as an `env://` or `file://` reference, never written in the flow, masked in outputs |';

	public generate(): string {
		return [
			'## Section 8: Secrets',
			'',
			'### Declare',
			'',
			'A secret is an input with `type: password`. Its name becomes an environment variable name, so it must match `[A-Za-z_][A-Za-z0-9_]*` (for example `API_TOKEN`).',
			'An optional `default:` must itself be a reference (`env://VARIABLE` or `file://relative/path`), never the value.',
			'',
			'### Pass at run time',
			'',
			'- `flow run f.yml -i API_TOKEN=env://MY_VAR` reads `MY_VAR` from the daemon environment (not from the shell running `flow run`; it may be stale).',
			'- `flow run f.yml -i API_TOKEN=file://./secrets/token.txt` reads the file relative to the run directory, at each run. Prefer `file://`.',
			'- A literal value, `input://` and `value://` are refused. `flow show <flow>` lists the declared secrets and the steps using them, never values.',
			'- A secret must be at least 8 characters (after trimming one trailing newline); shorter values are refused.',
			'',
			'### Use in a step',
			'',
			'- Script steps only: `secrets: [API_TOKEN]` sets the environment variable `API_TOKEN` for that step; read it as `$API_TOKEN`.',
			'- `${{ inputs.API_TOKEN }}` also resolves in a script step `env:` value. In the script text it works but triggers a warning (command lines are visible to other local processes): prefer `secrets:` and `$API_TOKEN`.',
			'- Only steps that list or reference a secret receive it.',
			'- Forbidden (validation error): referencing a secret in `model`, `user_intervention` or `subflow` steps, or in the flow-level `env:`. The model or the person would see it. Compute the result in a script step and pass only that result on.',
			'',
			'### Masking',
			'',
			'Outputs, logs and stored execution records replace the exact secret value with `[secret:NAME]`.',
			'Covered encodings of the value: raw, JSON-escaped, URL-encoded, base64 (padded, unpadded, url-safe) and hex (lower and upper case).',
			'NOT covered: substrings or transformations of the value (split, reversed, hashed, case-changed, shell-quoted, embedded in a larger base64 blob such as `user:TOKEN`), environment variables that are not declared as secret inputs, files written by a step, network calls made by a step.',
			'',
			'### Example',
			'',
			'```yaml',
			SECRET_EXAMPLE_FLOW_YAML.trim(),
			'```',
			'',
			'Run it: `flow run call-protected-api.yml -i API_TOKEN=file://./secrets/api-token.txt`',
		].join('\n');
	}
}
