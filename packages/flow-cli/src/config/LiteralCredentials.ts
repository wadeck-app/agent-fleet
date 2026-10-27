import { SENSITIVE_FIELDS } from 'extension-points';

const SENSITIVE_FIELD_SET = new Set(SENSITIVE_FIELDS);

/**
 * Refuses an options object that holds a credential as a literal string.
 *
 * A sensitive field (see `SENSITIVE_FIELDS`) must be a whole `${ENV_VAR}` reference, so the secret lives in the
 * environment and never in a file that is read, copied or committed.
 *
 * @param context where the options come from, named in the error (for example `worker source "docker" options`)
 * @throws when a sensitive field holds anything but a `${ENV_VAR}` reference
 */
export function validateNoLiteralCredentials(options: Record<string, unknown>, context: string): void {
	for (const [key, value] of Object.entries(options)) {
		if (SENSITIVE_FIELD_SET.has(key) && typeof value === 'string') {
			const isEnvVar = /^\$\{[^}]+\}$/.test(value);
			if (!isEnvVar) {
				throw new Error(
					`Literal credential value in ${context}: sensitive field "${key}" must use \${ENV_VAR} interpolation, not a literal value`
				);
			}
		}
	}
}
