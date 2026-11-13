/**
 * Reads an `options` declaration of a worker-type plugin manifest: the names of the options a source of this
 * implementation accepts (`flow worker source add --option name=value`).
 */
export class OptionNameList {
	/**
	 * @param where the place for the message, for example `Plugin x: manifest options`
	 * @returns the names, sorted, each once; undefined when nothing is declared (names are not checked); `[]` when the
	 *          implementation declares that it takes no option
	 * @throws when it is not a list of names (non-empty strings with no space or "="). The message gives the fix.
	 */
	static normalise(value: unknown, where: string): string[] | undefined {
		if (value === undefined) {
			return undefined;
		}
		if (!Array.isArray(value)) {
			throw new Error(
				`${where} must be a list, got ${typeof value}: ${JSON.stringify(value)}. Write it as a list of option names, for example options: ["projects"].`
			);
		}
		for (const name of value) {
			if (typeof name !== 'string' || !/^[^\s=]+$/.test(name)) {
				throw new Error(
					`${where} lists ${JSON.stringify(name)}, which is not an option name. Fix: list option names only: non-empty strings with no space and no "=" (the part before "=" in --option name=value).`
				);
			}
		}
		return [...new Set(value as string[])].sort();
	}
}
