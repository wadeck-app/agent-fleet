export function parseTimeout(value: string): number {
	const match = /^(\d+)(ms|s|m|h)?$/.exec(value);
	if (!match) {
		throw new Error(`Invalid timeout: ${value}. Use e.g. 10m, 30s, 5000ms`);
	}
	const n = parseInt(match[1]!, 10);
	switch (match[2] ?? 's') {
		case 'ms':
			return n;
		case 's':
			return n * 1000;
		case 'm':
			return n * 60 * 1000;
		case 'h':
			return n * 3600 * 1000;
		default:
			throw new Error(`Unknown time unit`);
	}
}

export function parseInputArgs(rawInputs: string[]): Record<string, string> {
	const inputs: Record<string, string> = {};
	for (const entry of rawInputs) {
		const idx = entry.indexOf('=');
		if (idx === -1) {
			console.error(`Invalid input: '${entry}'. Use key=value`);
			process.exit(1);
		}
		inputs[entry.slice(0, idx)] = entry.slice(idx + 1);
	}
	return inputs;
}
