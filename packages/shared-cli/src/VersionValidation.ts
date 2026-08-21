export class VersionValidation {
	static readonly VERSION_RE = /^\d+\.\d+\.\d+([-+][\w.-]+)?$/;

	static validate(v: string): string {
		if (!VersionValidation.VERSION_RE.test(v)) {
			throw new Error(`Invalid version string: "${v}"`);
		}
		return v;
	}
}
