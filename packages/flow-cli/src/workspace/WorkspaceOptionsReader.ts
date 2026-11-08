/**
 * Checks the options a flow gives to a workspace provider (`workspace: { provider: pool, dir, count }`): an option the
 * provider does not know is an error naming what it accepts, so a typo never goes unnoticed.
 */
export class WorkspaceOptionsReader {
	constructor(
		private readonly providerName: string,
		private readonly accepted: readonly string[]
	) {}

	read(options: unknown): Record<string, unknown> {
		if (options === undefined || options === null) {
			return {};
		}
		if (typeof options !== 'object' || Array.isArray(options)) {
			throw new Error(
				`Invalid options for workspace provider "${this.providerName}": options must be an object of key: value, got ${Array.isArray(options) ? 'an array' : typeof options}.`
			);
		}
		const given = options as Record<string, unknown>;
		for (const key of Object.keys(given)) {
			if (!this.accepted.includes(key)) {
				const acceptedText =
					this.accepted.length === 0
						? `"${this.providerName}" accepts no options`
						: `Accepted options: ${this.accepted.join(', ')}`;
				throw new Error(
					`Invalid options for workspace provider "${this.providerName}": unknown option "${key}". ${acceptedText}.`
				);
			}
		}
		return given;
	}

	static positiveInteger(providerName: string, name: string, value: unknown): number | undefined {
		if (value === undefined) {
			return undefined;
		}
		if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
			throw new Error(
				`Invalid options for workspace provider "${providerName}": "${name}" must be a positive integer, got ${JSON.stringify(value)}.`
			);
		}
		return value;
	}

	static boolean(providerName: string, name: string, value: unknown): boolean {
		if (value === undefined) {
			return false;
		}
		if (typeof value !== 'boolean') {
			throw new Error(
				`Invalid options for workspace provider "${providerName}": "${name}" must be true or false, got ${JSON.stringify(value)}.`
			);
		}
		return value;
	}

	static string(providerName: string, name: string, value: unknown): string | undefined {
		if (value === undefined) {
			return undefined;
		}
		if (typeof value !== 'string' || value.trim() === '') {
			throw new Error(
				`Invalid options for workspace provider "${providerName}": "${name}" must be a non-empty string, got ${JSON.stringify(value)}.`
			);
		}
		return value;
	}
}
