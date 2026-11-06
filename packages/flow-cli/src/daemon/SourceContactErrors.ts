import { SENSITIVE_FIELDS } from 'extension-points';

import type { WorkerTypeLookup } from './WorkerTypeCatalog.js';

/** The longest text kept of one error: a failure message is read by a person, not a log parser. */
const MAX_ERROR_TEXT = 300;

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[-_]/g, '');
const SENSITIVE_KEYS = new Set(SENSITIVE_FIELDS.map(normalizeKey));

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
 * One entry per source, replaced by a newer error and dropped by the next successful ask. A wrapper that dies AFTER the
 * ask returned is not a contact error and is not seen here.
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

	/** {@link since} for one type and masker, as the function a bound-step wait asks with the time it started. */
	sinceFor(type: string, typeOf: WorkerTypeLookup, mask: (text: string) => string): (sinceMs: number) => string[] {
		return sinceMs => this.since(type, typeOf, sinceMs, mask);
	}

	/**
	 * The errors, ready to print, of the sources of `type` that are NEWER than `sinceMs`: one line each, labelled with the
	 * source, with user info and query values stripped, credential-named values redacted and `mask` applied.
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

/** One line, no URL user info or query values, no credential-named value, masked, at most 300 characters. */
export function describeContactError(message: string, mask: (text: string) => string): string {
	const cleaned = message
		.replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/?#@]*@/gi, '$1')
		.replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^\s?#]*)\?[^\s#]*/gi, '$1?…')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/\b([A-Za-z0-9_-]+)=[^\s&]+/g, (whole, key: string) =>
			SENSITIVE_KEYS.has(normalizeKey(key)) ? `${key}=<redacted>` : whole
		);
	let masked: string;
	try {
		masked = mask(cleaned);
	} catch {
		// Never the raw text: a masker that throws replaces it.
		return '<masking failed>';
	}
	return masked.length > MAX_ERROR_TEXT ? `${masked.slice(0, MAX_ERROR_TEXT - 1)}…` : masked;
}
