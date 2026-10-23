const OMITTED = '<value omitted>';

function omitValue(assignment: string): string {
	const separator = assignment.indexOf('=');
	return separator === -1 ? OMITTED : `${assignment.slice(0, separator + 1)}${OMITTED}`;
}

/**
 * The line written to the daily log for a CLI invocation. The value of every input option
 * (`-i`, `--input`, `--inputs`, in all their spellings) is omitted, by option name and never by
 * looking at the value: any input may be a secret, and the log is a plain file.
 */
export function describeCommandLine(args: readonly string[]): string {
	const described: string[] = [];
	let previousTakesValue = false;
	for (const arg of args) {
		if (previousTakesValue) {
			described.push(omitValue(arg));
			previousTakesValue = false;
		} else if (arg === '-i' || arg === '--input' || arg === '--inputs') {
			described.push(arg);
			previousTakesValue = true;
		} else if (arg.startsWith('--input=') || arg.startsWith('--inputs=')) {
			const option = arg.slice(0, arg.indexOf('=') + 1);
			described.push(option + omitValue(arg.slice(option.length)));
		} else if (/^-i./.test(arg)) {
			described.push('-i' + omitValue(arg.slice(2)));
		} else {
			described.push(arg);
		}
	}
	return `cmd: flow ${described.join(' ')}`;
}
