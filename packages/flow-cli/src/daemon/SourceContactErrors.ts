import { SENSITIVE_FIELDS } from 'extension-points';

import { MASKING_FAILED } from '../secrets/SecretMasker.js';
import type { WorkerTypeLookup } from './WorkerTypeCatalog.js';

/** The longest text kept of one error: a failure message is read by a person, not a log parser. */
const MAX_ERROR_TEXT = 300;
const REDACTED = '<redacted>';

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[-_]/g, '');
/** A key is credential-like when its normalised name CONTAINS one of these (client_secret, auth_token, x-session-id, ...). */
const SENSITIVE_SUBSTRINGS = [
	'token',
	'secret',
	'password',
	'passwd',
	'authorization',
	'cookie',
	'credential',
	'apikey',
	'privatekey',
	'session',
];
/** Names from SENSITIVE_FIELDS matched exactly: a bare `key` is a credential, `monkey` is not. */
const SENSITIVE_EXACT = new Set(SENSITIVE_FIELDS.map(normalizeKey));
const isSensitiveKey = (key: string): boolean => {
	const normalized = normalizeKey(key);
	return SENSITIVE_EXACT.has(normalized) || SENSITIVE_SUBSTRINGS.some(word => normalized.includes(word));
};

// ANSI CSI and OSC sequences, then any other control character except tab and newline (flattened later).
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const ANSI = /\u001B\[[0-9;?]*[ -/]*[@-~]|\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)/g;
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
/** A launch token or a source token: 32 random bytes, hex. The masker only knows execution secrets, not these. */
const HEX_TOKEN = /\b[0-9a-f]{64}\b/gi;
/** `scheme://` and everything up to the LAST `@` before the path/query: a password may itself contain `@` or `/`. */
const URL_USER_INFO = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s?#]*@/gi;
const URL_QUERY = /(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#]*)\?[^\s#]*/gi;
/** `user:password@host` without a scheme. */
const BARE_USER_INFO = /(^|[\s(<"'=])[^\s:@/"']+:[^\s@"']*@(?=[A-Za-z0-9[])/g;
const AUTH_SCHEME = /\b(Bearer|Basic|Digest)\s+[^\s,;"']+/gi;
/** key=value, key: value, key = value, "key":"value", KEY="a b": the whole value is replaced when the key is credential-like. */
const KEY_VALUE = /(["']?)([A-Za-z0-9_.-]+)\1(\s*[:=]\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s&,;}\]]+)/g;

/**
 * Replaces the value of every credential-like key. A match for a key that is NOT credential-like is rewound to the start
 * of its value, so `failed: token=abc` is not swallowed whole as the value of `failed`.
 */
function redactKeyValues(text: string): string {
	const pattern = new RegExp(KEY_VALUE.source, 'g');
	let result = '';
	let copiedUpTo = 0;
	for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
		const [whole, quote = '', key = '', separator = '', value = ''] = match;
		if (isSensitiveKey(key)) {
			result += `${text.slice(copiedUpTo, match.index)}${quote}${key}${quote}${separator}${REDACTED}`;
			copiedUpTo = match.index + whole.length;
		} else {
			pattern.lastIndex = match.index + whole.length - value.length;
		}
	}
	return result + text.slice(copiedUpTo);
}

/** What `contactDeclaredSources` tells about each ask of a source. */
export interface ContactOutcome {
	failed(sourceId: string, message: string): void;
	succeeded(sourceId: string): void;
}

interface RecordedError {
	message: string;
	at: number;
}

/**
 * The last error each source reported when the daemon asked it for a worker, so a bound step that no worker of its type
 * ever served can say why, not only the daemon log.
 *
 * One entry per source, replaced by a newer error and dropped by the next successful ask. Two asks of the same source in
 * flight at once: the LAST to finish wins, whatever the order they started in. A wrapper that dies AFTER the ask returned
 * is not a contact error and is not seen here.
 */
export class SourceContactErrors implements ContactOutcome {
	private readonly errors = new Map<string, RecordedError>();

	constructor(private readonly now: () => number = Date.now) {}

	failed(sourceId: string, message: string): void {
		this.errors.set(sourceId, { message, at: this.now() });
	}

	succeeded(sourceId: string): void {
		this.errors.delete(sourceId);
	}

	/** Forgets the sources that are no longer declared, so a removed source's error does not stay for the daemon's life. */
	retainOnly(declared: Iterable<string>): void {
		const keep = new Set(declared);
		for (const sourceId of [...this.errors.keys()]) {
			if (!keep.has(sourceId)) {
				this.errors.delete(sourceId);
			}
		}
	}

	/** {@link since} for one type and masker, as the function a bound-step wait asks with the time it started. */
	sinceFor(type: string, typeOf: WorkerTypeLookup, mask: (text: string) => string): (sinceMs: number) => string[] {
		return sinceMs => this.since(type, typeOf, sinceMs, mask);
	}

	/**
	 * The errors, ready to print, of the sources of `type` that are NEWER than `sinceMs`: one line each, labelled with the
	 * source, cleaned by {@link describeContactError}.
	 */
	since(type: string, typeOf: WorkerTypeLookup, sinceMs: number, mask: (text: string) => string): string[] {
		const lines: string[] = [];
		for (const [sourceId, error] of this.errors) {
			if (typeOf(sourceId) === type && error.at >= sinceMs) {
				lines.push(`reported by source "${sourceId}": ${describeContactError(error.message, mask)}`);
			}
		}
		return lines;
	}
}

/**
 * One line of at most 300 characters with nothing secret in it, for text that reaches step errors, logs, the UI and queue
 * events.
 *
 * Order matters: control characters go first (they do not change whitespace), then `mask` sees the RAW text, so a secret
 * that contains a newline, a tab or a double space still matches; only then is the text flattened, and the cap comes last
 * so no part of a secret can be cut out of a longer masked run. What `mask` cannot know is handled by shape: launch and
 * source tokens (64 hex), `Bearer`/`Basic` credentials, credential-named keys in any of `k=v`, `k: v`, `"k":"v"` and
 * quoted forms, URL user info (also without a scheme) and URL query values.
 *
 * Limit: a credential that has none of these shapes and is not an execution secret (for example a plugin's own option
 * value printed bare) cannot be recognised here.
 */
export function describeContactError(message: string, mask: (text: string) => string): string {
	let masked: string;
	try {
		masked = mask(message.replace(ANSI, '').replace(CONTROL, ''));
	} catch {
		// Never the raw text: a masker that throws replaces it (the constant the execution masks use).
		return MASKING_FAILED;
	}
	const cleaned = redactKeyValues(
		masked
			.replace(HEX_TOKEN, REDACTED)
			.replace(URL_USER_INFO, '$1')
			.replace(URL_QUERY, '$1?…')
			.replace(BARE_USER_INFO, '$1')
			.replace(AUTH_SCHEME, `$1 ${REDACTED}`)
	)
		.replace(/\s+/g, ' ')
		.trim();
	return cleaned.length > MAX_ERROR_TEXT ? `${cleaned.slice(0, MAX_ERROR_TEXT - 1)}…` : cleaned;
}
