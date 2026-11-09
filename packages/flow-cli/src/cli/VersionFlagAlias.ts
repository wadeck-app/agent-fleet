/**
 * `-v` is accepted as a short alias of `--version` (commander only knows `-V`). Only when it is the first argument after
 * the program name: a `-v` that follows a command belongs to that command.
 *
 * @param argv the full process argv (node, script, then the arguments)
 * @returns a copy of argv with a leading `-v` replaced by `--version`
 */
export function withVersionFlagAlias(argv: readonly string[]): string[] {
	const copy = [...argv];
	if (copy[2] === '-v') {
		copy[2] = '--version';
	}
	return copy;
}
