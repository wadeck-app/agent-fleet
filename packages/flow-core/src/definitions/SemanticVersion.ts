import { FlowCoreError } from '../errors.js';

// Strict semver 2.0.0 without build metadata (two builds of one version would have no defined order).
const NUMERIC = /(0|[1-9]\d*)/.source;
const PRERELEASE_ID = /(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)/.source;
const PATTERN = new RegExp(`^${NUMERIC}\\.${NUMERIC}\\.${NUMERIC}(?:-(${PRERELEASE_ID}(?:\\.${PRERELEASE_ID})*))?$`);

interface ParsedVersion {
	core: [number, number, number];
	prerelease: string[];
}

function parse(version: string): ParsedVersion | undefined {
	const match = PATTERN.exec(version);
	if (!match) {
		return undefined;
	}
	return {
		core: [Number(match[1]), Number(match[2]), Number(match[3])],
		prerelease: match[4] === undefined ? [] : match[4].split('.'),
	};
}

export function isSemanticVersion(version: string): boolean {
	return parse(version) !== undefined;
}

function parseOrThrow(version: string): ParsedVersion {
	const parsed = parse(version);
	if (!parsed) {
		throw new FlowCoreError(
			`'${version}' is not a valid semantic version. Use MAJOR.MINOR.PATCH, optionally with a prerelease ` +
				"(for example '1.2.0' or '1.3.0-rc.1'); build metadata (+...) is not supported.",
			'invalid-version'
		);
	}
	return parsed;
}

function comparePrereleaseIds(a: string, b: string): number {
	const numericA = /^\d+$/.test(a);
	const numericB = /^\d+$/.test(b);
	if (numericA && numericB) {
		return Math.sign(Number(a) - Number(b));
	}
	if (numericA !== numericB) {
		// Numeric identifiers rank below alphanumeric ones.
		return numericA ? -1 : 1;
	}
	return a < b ? -1 : a > b ? 1 : 0;
}

/** Semver precedence: negative when `a` < `b`. Throws FlowCoreError('invalid-version') for a malformed version. */
export function compareSemanticVersions(a: string, b: string): number {
	const left = parseOrThrow(a);
	const right = parseOrThrow(b);
	for (let i = 0; i < 3; i++) {
		const difference = left.core[i]! - right.core[i]!;
		if (difference !== 0) {
			return Math.sign(difference);
		}
	}
	if (left.prerelease.length === 0 || right.prerelease.length === 0) {
		// A release ranks above any prerelease of the same core.
		return Math.sign(right.prerelease.length - left.prerelease.length);
	}
	const shared = Math.min(left.prerelease.length, right.prerelease.length);
	for (let i = 0; i < shared; i++) {
		const result = comparePrereleaseIds(left.prerelease[i]!, right.prerelease[i]!);
		if (result !== 0) {
			return result;
		}
	}
	return Math.sign(left.prerelease.length - right.prerelease.length);
}

/** The highest version of the list by semver precedence, or undefined when the list is empty. */
export function highestSemanticVersion(versions: readonly string[]): string | undefined {
	let highest: string | undefined;
	for (const version of versions) {
		if (highest === undefined || compareSemanticVersions(version, highest) > 0) {
			highest = version;
		}
	}
	return highest;
}
