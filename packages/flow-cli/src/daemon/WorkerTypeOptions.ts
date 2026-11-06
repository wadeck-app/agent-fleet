/** Replaces `${NAME}` in every string of the options with the daemon's environment; an unset NAME is an error. */
export function resolveEnvVars(sourceId: string, value: unknown, keyPath = ''): unknown {
	if (typeof value === 'string') {
		return value.replace(/\$\{([^}]+)\}/g, (_reference, name: string) => {
			const resolved = process.env[name];
			if (resolved === undefined) {
				throw new Error(
					`worker source "${sourceId}": option "${keyPath}" references environment variable "${name}", which is not set in the daemon's environment. ` +
						'Set it where the daemon is started and restart the daemon, or declare the source again without it.'
				);
			}
			return resolved;
		});
	}
	if (Array.isArray(value)) {
		return value.map((item: unknown, index) => resolveEnvVars(sourceId, item, `${keyPath}[${String(index)}]`));
	}
	if (typeof value === 'object' && value !== null) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				resolveEnvVars(sourceId, item, keyPath === '' ? key : `${keyPath}.${key}`),
			])
		);
	}
	return value;
}

export function describeDuration(ms: number): string {
	return ms < 1000 ? `${String(ms)}ms` : `${String(Math.round(ms / 1000))}s`;
}
