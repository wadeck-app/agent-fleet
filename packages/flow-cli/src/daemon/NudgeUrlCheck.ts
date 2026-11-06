import { SENSITIVE_FIELDS } from 'extension-points';

const SENSITIVE_KEYS = new Set(SENSITIVE_FIELDS.map(field => field.toLowerCase()));
const ENV_REFERENCE = /\$\{[^}]+\}/g;
const WHOLE_ENV_REFERENCE = /^\$\{[^}]+\}$/;

/** What is wrong with a nudgeUrl. Never carries the URL: it may hold the secret being reported. */
export type NudgeUrlProblem = { kind: 'invalid' } | { kind: 'credential'; where: string };

/**
 * The first problem of a nudgeUrl, or undefined. The credential check runs BEFORE the syntax check, so a URL that is
 * both malformed and carries a secret is reported as the latter and the caller has no reason to echo it.
 *
 * A false positive by design: a query key whose NAME is on the sensitive list (`token`, `key`, ...) is refused even when
 * its value is harmless (`?key=abc`). Write `${NAME}` instead.
 *
 * @param allowReferences true at declaration, where `${NAME}` is still to be expanded and counts as no literal; false
 *        once the daemon has expanded the options, where any text left is literal
 */
export function nudgeUrlProblem(url: string, allowReferences: boolean): NudgeUrlProblem | undefined {
	if (hasLiteralUserInfo(url, allowReferences)) {
		return { kind: 'credential', where: 'user info' };
	}
	const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0]! : '';
	for (const [key, value] of new URLSearchParams(query)) {
		const isReference = allowReferences && WHOLE_ENV_REFERENCE.test(value);
		if (SENSITIVE_KEYS.has(key.toLowerCase()) && !isReference) {
			return { kind: 'credential', where: `query parameter "${key}"` };
		}
	}
	try {
		// A reference stands for any text, so it is replaced by a placeholder for the syntax check only.
		const parsed = new URL(allowReferences ? url.replace(ENV_REFERENCE, 'x') : url);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? undefined : { kind: 'invalid' };
	} catch {
		return { kind: 'invalid' };
	}
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

/** Whether the authority has user info (that is not made only of `${NAME}` references when those are allowed). */
function hasLiteralUserInfo(url: string, allowReferences: boolean): boolean {
	const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#@]*)@/i.exec(url);
	if (match === null) {
		return false;
	}
	const userInfo = allowReferences ? match[1]!.replace(ENV_REFERENCE, '').replace(/:/g, '') : match[1]!;
	return userInfo !== '';
}
