import type { DaemonResponse } from '../ipc/Protocol.js';

const OPTIONAL_TEXT_FIELDS = ['projectId', 'projectName', 'cwd'] as const;

/**
 * Checks the `origin` a client sent with a `run`: the record keeps it as it is, so a value that is not an Origin
 * (`tool` and `at` text, the other fields text when present) is refused instead of being stored.
 *
 * @returns The refusal to answer with, or undefined when `origin` is absent or well formed.
 */
export function checkRunOrigin(origin: unknown): DaemonResponse | undefined {
	if (origin === undefined) {
		return undefined;
	}
	const refusal = (reason: string): DaemonResponse => ({
		type: 'error',
		code: 'INVALID_ORIGIN',
		message: `The run request carries an invalid origin: ${reason}. The CLI and the daemon are likely of different versions: update both with: flow cli update`,
	});
	if (typeof origin !== 'object' || origin === null || Array.isArray(origin)) {
		return refusal('expected an object');
	}
	const fields = origin as Record<string, unknown>;
	for (const required of ['tool', 'at'] as const) {
		if (typeof fields[required] !== 'string' || fields[required] === '') {
			return refusal(`"${required}" must be a non-empty text`);
		}
	}
	for (const optional of OPTIONAL_TEXT_FIELDS) {
		if (fields[optional] !== undefined && typeof fields[optional] !== 'string') {
			return refusal(`"${optional}" must be a text when present`);
		}
	}
	return undefined;
}
