/**
 * Makes text written by git (or by a plugin) safe to show to a user: no URL credentials, no token-like values, and
 * bounded in size. Remote URLs can carry a token (`https://user:token@host/...`) and git echoes them in its errors.
 */

const MAX_LINES = 5;
const MAX_LINE_LENGTH = 300;

const REPLACEMENT = '***';

/** `scheme://userinfo@host`: the whole userinfo goes (greedy up to the last `@` of the authority, a password may contain one). */
const URL_USERINFO = /([a-z][a-z0-9+.-]*:\/\/)[^\s/]*@/gi;

/** Credentials of well-known providers. */
const KNOWN_TOKEN =
	/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,})\b/g;

/** `Authorization: <scheme> <value>` and `Basic|Bearer <value>`. */
const AUTHORIZATION_HEADER = /(authorization\s*[:=]\s*)(?:(?:basic|bearer)\s+)?\S+/gi;
const AUTH_SCHEME_VALUE = /\b(basic|bearer)\s+[A-Za-z0-9+/=._~-]{8,}/gi;

/** `password=...`, `token: ...`, `api_key=...`. */
const NAMED_SECRET = /\b(password|passwd|secret|token|api[_-]?key)(\s*[:=]\s*)\S+/gi;

/** Any long unbroken run of token characters; a plain hash (commit id) is not a secret and is kept. */
const LONG_OPAQUE_RUN = /[A-Za-z0-9_+/=-]{40,}/g;
const HASH = /^[0-9a-f]{40,64}$/i;

function maskSecrets(line: string): string {
	return line
		.replace(URL_USERINFO, `$1${REPLACEMENT}@`)
		.replace(KNOWN_TOKEN, REPLACEMENT)
		.replace(AUTHORIZATION_HEADER, `$1${REPLACEMENT}`)
		.replace(AUTH_SCHEME_VALUE, `$1 ${REPLACEMENT}`)
		.replace(NAMED_SECRET, `$1$2${REPLACEMENT}`)
		.replace(LONG_OPAQUE_RUN, run => (HASH.test(run) ? run : REPLACEMENT));
}

/**
 * Redacts secrets, drops blank lines, keeps the first {@link MAX_LINES} lines of at most {@link MAX_LINE_LENGTH}
 * characters and says how many lines were left out.
 */
export function redactGitText(text: string): string {
	const lines = text
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(line => line.length > 0)
		.map(maskSecrets);
	const kept = lines
		.slice(0, MAX_LINES)
		.map(line => (line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)}…` : line));
	const omitted = lines.length - kept.length;
	if (omitted > 0) {
		kept.push(`(${String(omitted)} more lines omitted)`);
	}
	return kept.join('\n');
}
