import { InvalidArgumentError } from 'commander';

/**
 * Commander argument parser of `-p, --project <ref>`: the project may be given once. Commander keeps the last of a repeated
 * option; for the project that would silently run on another project than the first one typed, so a repeat is an error
 * (same rule as the SDK's `extractProjectOption`, which commander's own parsing makes unusable here).
 */
export function singleProjectValue(value: string, previous: string | undefined): string {
	if (previous !== undefined) {
		throw new InvalidArgumentError(`the project is given twice ("${previous}" then "${value}"); pass it once`);
	}
	return value;
}
