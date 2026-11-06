import { SENSITIVE_FIELDS } from 'extension-points';

/** Case, "-" and "_" do not matter: `access_token`, `api-key` and `apiKey` are the same name. */
const normalizeKey = (key: string): string => key.toLowerCase().replace(/[-_]/g, '');
const SENSITIVE_KEYS = new Set(SENSITIVE_FIELDS.map(normalizeKey));
const ENV_REFERENCE = /\$\{[^}]+\}/g;

/** What is wrong with a nudgeUrl. Never carries the URL: it may hold the secret being reported. */
export type NudgeUrlProblem = { kind: 'invalid' } | { kind: 'credential'; where: string };

/**
 * The first problem of a nudgeUrl, or undefined.
 *
 * A nudgeUrl never carries credentials: only its host, port and path are used (see sendNudge), so there is nothing a
 * credential could be for. User info and a query key named like a credential are refused whatever their value, a
 * `${NAME}` reference included. The query-key rule goes by the NAME, so a harmless `?key=abc` is refused too: remove the
 * query. A secret in the PATH is not detected; the path is used and logged, so do not put one there.
 *
 * The credential check runs BEFORE the syntax check, so a URL that is both malformed and carries a secret is reported as
 * the latter and the caller has no reason to echo it. User info is read the way the URL parser reads it (`http:u:p@h`
 * has user info although it has no `//`).
 *
 * @param allowReferences true at declaration, where a `${NAME}` is still to be expanded and stands for any text in the
 *        syntax check; false once the daemon has expanded the options
 */
export function nudgeUrlProblem(url: string, allowReferences: boolean): NudgeUrlProblem | undefined {
	const text = allowReferences ? url.replace(ENV_REFERENCE, 'x') : url;
	let parsed: URL | undefined;
	try {
		parsed = new URL(text);
	} catch {
		parsed = undefined;
	}
	const credential = parsed === undefined ? credentialInText(text) : credentialInUrl(parsed);
	if (credential !== undefined) {
		return { kind: 'credential', where: credential };
	}
	return parsed !== undefined && (parsed.protocol === 'http:' || parsed.protocol === 'https:')
		? undefined
		: { kind: 'invalid' };
}

/** The URL as it may appear in a log or a report: scheme, host and path; no user info, no query values. */
export function redactNudgeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search === '' ? '' : '?…'}`;
	} catch {
		return '<not a valid URL>';
	}
}

function credentialInUrl(parsed: URL): string | undefined {
	if (parsed.username !== '' || parsed.password !== '') {
		return 'user info';
	}
	return sensitiveQueryKey(parsed.searchParams.keys());
}

/** For text the URL parser rejects: the same two rules, read off the text. */
function credentialInText(text: string): string | undefined {
	if (/^[a-z][a-z0-9+.-]*:\/*[^/?#@]*@/i.test(text)) {
		return 'user info';
	}
	const query = text.includes('?') ? text.slice(text.indexOf('?') + 1).split('#')[0]! : '';
	return sensitiveQueryKey(new URLSearchParams(query).keys());
}

function sensitiveQueryKey(keys: Iterable<string>): string | undefined {
	for (const key of keys) {
		if (SENSITIVE_KEYS.has(normalizeKey(key))) {
			return `query parameter "${key}"`;
		}
	}
	return undefined;
}
