import { InvalidArgumentError } from 'commander';

/**
 * Commander argument parser of `-p, --project <ref>`: the project may be given once. Commander keeps the last of a repeated
 * option; for the project that would silently run on another project than the first one typed, so a repeat is an error
 * (same rule as the SDK's `extractProjectOption`, which commander's own parsing makes unusable here).
 */
export function singleProjectValue(value: string, previous: string | undefined): string {
	// A project ref (id: hex, name or alias: starts with a letter) never starts with '-'. Commander gives `-p --json` and `--project=--json` the same value here, so both are refused.
	if (value.startsWith('-')) {
		throw new InvalidArgumentError(`"${value}" looks like another option, not a project; give the name, alias or id of a project after -p/--project ("--project=${value}" is refused too)`);
	}
	if (previous !== undefined) {
		throw new InvalidArgumentError(`the project is given twice ("${previous}" then "${value}"); pass it once`);
	}
	return value;
}
