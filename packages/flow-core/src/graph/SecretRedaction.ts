// Best-effort redaction for what the chart shows of a step. The execution record is NOT masked at write time
// (flow-cli's LogMasker is not wired into the daemon), so anything the chart adds on top of the execution detail
// goes through here first. This is a safety net for obvious cases, not a guarantee.

/** What replaces a hidden value. */
export const REDACTED_TEXT = '[redacted]';

// Whole words of a name that mark it secret; compared lower-case, after splitting on punctuation and camelCase.
const SECRET_WORDS = new Set([
	'token',
	'tokens',
	'secret',
	'secrets',
	'password',
	'passwords',
	'passwd',
	'pwd',
	'credential',
	'credentials',
	'authorization',
	'key',
	'apikey',
	'privatekey',
]);

function nameWords(name: string): string[] {
	return name
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.split(/[^A-Za-z0-9]+/)
		.filter(word => word !== '')
		.map(word => word.toLowerCase());
}

/** True for names like `token`, `GITHUB_TOKEN`, `apiKey`, `ssh_key`, `Authorization`, `db.password`. */
export function isSecretName(name: string): boolean {
	return nameWords(name).some(word => SECRET_WORDS.has(word));
}

/** The value, or {@link REDACTED_TEXT} when the name is secret-like. */
export function redactSecretValue(name: string, value: string): string {
	return isSecretName(name) ? REDACTED_TEXT : value;
}

const ASSIGNMENT = /(["']?[A-Za-z][\w.-]*["']?)(\s*[:=]\s*)("[^"]*"|'[^']*'|(?:Bearer\s+|Basic\s+)?[^\s,;&"']+)/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g;
const TOKEN_PREFIXES = /\b(?:gh[pousr]_|github_pat_|sk-|xox[abprs]-)[A-Za-z0-9_-]{10,}/g;

/** Hides the value of `KEY=value` / `key: value` / `"key": "value"` assignments of secret-named keys, bearer tokens and well-known token formats. */
export function redactSecrets(text: string): string {
	return text
		.replace(ASSIGNMENT, (whole: string, key: string, separator: string) =>
			isSecretName(key.replace(/["']/g, '')) ? `${key}${separator}${REDACTED_TEXT}` : whole
		)
		.replace(BEARER, `Bearer ${REDACTED_TEXT}`)
		.replace(TOKEN_PREFIXES, REDACTED_TEXT);
}
