import { editDistance } from 'flow-engine';

/** An option name that is not one the plugin manifest declares, with the accepted names it nearly matches. */
export interface UnknownOption {
	name: string;
	near: string[];
}

/** The longest distance still offered as a "did you mean" (the rule of the requirement hints). */
function maxDistance(name: string): number {
	return name.length <= 4 ? 1 : 2;
}

/**
 * Checks the option names of a worker source against the names its plugin manifest declares (`options`), and words the
 * result. Names only: the values stay the plugin's to validate.
 */
export class SourceOptionNames {
	/** The names that are not accepted, in the order given, each with the accepted names within a small edit distance. */
	static unknown(names: readonly string[], accepted: readonly string[]): UnknownOption[] {
		return names
			.filter(name => !accepted.includes(name))
			.map(name => ({
				name,
				near: accepted.filter(
					candidate =>
						candidate.toLowerCase() === name.toLowerCase() ||
						editDistance(candidate, name) <= maxDistance(name)
				),
			}));
	}

	/** One sentence per unknown name (with the nearest accepted ones), then the accepted names. */
	static describe(unknown: readonly UnknownOption[], accepted: readonly string[]): string {
		const named = unknown.map(({ name, near }) => {
			const hint =
				near.length === 0 ? '' : ` Did you mean ${near.map(candidate => `"${candidate}"`).join(' or ')}?`;
			return `option "${name}" is not one of the accepted options.${hint}`;
		});
		return `${named.join(' ')} Accepted options: ${accepted.length === 0 ? 'none' : accepted.join(', ')}.`;
	}
}
