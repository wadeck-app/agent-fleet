import { editDistance } from './EditDistance';

/** One requirement entry, split. `value` is absent for a keyword. */
export interface ParsedRequirement {
	raw: string;
	key: string;
	value?: string;
}

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The longest key distance still offered as a "did you mean". */
function maxDistance(key: string): number {
	return key.length <= 4 ? 1 : 2;
}

/**
 * Syntax of the `requires:` entries of a flow and of a step: a keyword (`sandbox`) or `key=value` (`fs=confined`).
 *
 * Syntax only. Whether a key exists is known to the sources that declare guarantees, so it is checked by the daemon at
 * run start; an offline validation cannot know it and checks only this.
 */
export class RequirementSyntax {
	/**
	 * @throws when the entry is neither a keyword nor `key=value`; the message names the accepted forms.
	 */
	static parse(entry: string): ParsedRequirement {
		const form = `Write a requirement as a keyword (for example "sandbox") or as key=value (for example "fs=confined"), without spaces; letters, digits, ".", "_" and "-" only. Alternatives such as "a|b" are not supported.`;
		const parts = entry.split('=');
		if (parts.length > 2 || parts.some(part => !TOKEN.test(part))) {
			throw new Error(`Invalid requirement ${JSON.stringify(entry)}. ${form}`);
		}
		const [key, value] = parts as [string, string | undefined];
		return value === undefined ? { raw: entry, key } : { raw: entry, key, value };
	}

	/**
	 * A declared `requires` as a sorted list without duplicates (a stable form to store and compare).
	 *
	 * @param where the place for the message, for example `Step "build"`
	 * @throws when it is not a list of valid entries. A bare string is refused rather than read as one entry.
	 */
	static normalise(requires: unknown, where: string): string[] {
		if (requires === undefined) {
			return [];
		}
		if (!Array.isArray(requires)) {
			throw new Error(
				`${where}: requires must be a list, got ${typeof requires}: ${JSON.stringify(requires)}. Write it as a list, for example requires: ["fs=confined"].`
			);
		}
		for (const entry of requires) {
			if (typeof entry !== 'string') {
				throw new Error(
					`${where}: requires must contain only strings, got ${typeof entry}: ${JSON.stringify(entry)}.`
				);
			}
			try {
				RequirementSyntax.parse(entry);
			} catch (err) {
				throw new Error(`${where}: ${(err as Error).message}`, { cause: err });
			}
		}
		return [...new Set(requires as string[])].sort();
	}

	/**
	 * Known entries that look like what was written: the same key with another value, or a near-miss of a key or of the
	 * whole entry. Never the entry itself.
	 */
	static closest(entry: string, known: readonly string[]): string[] {
		const wanted = RequirementSyntax.parse(entry);
		return known.filter(candidate => {
			if (candidate === entry) {
				return false;
			}
			const parsed = RequirementSyntax.parse(candidate);
			return (
				parsed.key === wanted.key ||
				editDistance(parsed.key, wanted.key) <= maxDistance(wanted.key) ||
				editDistance(candidate, entry) <= maxDistance(entry)
			);
		});
	}
}
