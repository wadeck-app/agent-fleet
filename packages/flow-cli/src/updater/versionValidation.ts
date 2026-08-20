export const VERSION_RE = /^\d+\.\d+\.\d+([-+][\w.-]+)?$/;

export function validateVersion(v: string): string {
	if (!VERSION_RE.test(v)) {
		throw new Error(`Invalid version string: "${v}"`);
	}
	return v;
}
