/**
 * Narrow an unknown value (typically parsed JSON/YAML) to a plain object.
 * Arrays and null are rejected -- they never carry the keys callers read.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
