import { createHash } from 'node:crypto';

function canonical(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(canonical);
	}
	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				.map(([key, child]) => [key, canonical(child)])
		);
	}
	return value;
}

/**
 * Identity of a flow definition: sha256 (hex) of its canonical JSON (keys sorted at every depth, arrays in order).
 * Comments, formatting and key order in the YAML do not change it; any change of content does.
 */
export function hashDefinition(definition: unknown): string {
	return createHash('sha256')
		.update(JSON.stringify(canonical(definition)))
		.digest('hex');
}

/** The 12 first characters of a hash: what snapshot file names and version listings show. */
export function shortHashOf(hash: string): string {
	return hash.slice(0, 12);
}
