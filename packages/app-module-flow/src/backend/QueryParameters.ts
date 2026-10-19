import { InvalidQueryError } from 'flow-core';

export type QueryParams = Record<string, string | string[] | undefined>;

/** A parameter given once. Empty means unset: the DSL sends `?flow=` for a filter nobody picked. */
export function optionalString(query: QueryParams, name: string): string | undefined {
	const raw = query[name];
	if (Array.isArray(raw)) {
		throw new InvalidQueryError(`'${name}' must be given once, got ${raw.length} values.`);
	}
	return raw === undefined || raw === '' ? undefined : raw;
}

export interface IntegerBounds {
	min: number;
	max?: number;
}

/** `true` or `false` spelled out; anything else is refused rather than guessed at. */
export function optionalBoolean(query: QueryParams, name: string, fallback: boolean): boolean {
	const raw = optionalString(query, name);
	if (raw === undefined) {
		return fallback;
	}
	if (raw === 'true') {
		return true;
	}
	if (raw === 'false') {
		return false;
	}
	throw new InvalidQueryError(`'${name}' must be 'true' or 'false', got '${raw}'.`);
}

/**
 * A plain decimal integer within bounds. Digits only on purpose: Number() would also accept
 * '1e3', '0x10', ' 3' and '+3', which no client means to send.
 */
export function optionalInteger(query: QueryParams, name: string, bounds: IntegerBounds): number | undefined {
	const raw = optionalString(query, name);
	if (raw === undefined) {
		return undefined;
	}

	const expected =
		bounds.max === undefined ? `an integer >= ${bounds.min}` : `an integer between ${bounds.min} and ${bounds.max}`;
	const parsed = Number(raw);
	if (
		!/^\d+$/.test(raw) ||
		!Number.isSafeInteger(parsed) ||
		parsed < bounds.min ||
		(bounds.max !== undefined && parsed > bounds.max)
	) {
		throw new InvalidQueryError(`'${name}' must be ${expected}, got '${raw}'.`);
	}
	return parsed;
}
