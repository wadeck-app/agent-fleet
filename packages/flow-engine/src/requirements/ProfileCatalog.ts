import { editDistance } from './EditDistance';

const AGENT = ['fs=confined', 'env=clean'] as const;
const UNTRUSTED_CODE = [...AGENT, 'ports=private'] as const;

/**
 * The built-in profiles, in code. A profile is a named set of requirements (AND); `profile: <name>` expands to it, added to
 * the `requires:` of the same scope. Contents: design note `2026-11-08_sandbox-step-requirements-design.md`, D2.
 *
 * Each profile contains the previous one it extends, so tightening a scope never loosens it. There is no `strict` profile
 * on purpose. No configuration override exists yet; when one is added it may only TIGHTEN (every requirement of the
 * built-in must stay in the override).
 *
 * `net=filtered` is in NO profile: the sandbox plugin does not declare it (raw TCP to public destinations is unverified;
 * an allow-all machine policy would make it false), so a profile containing it could be met by no source. It is added to
 * `untrusted-code` / `hermetic-test` only when a source declares AND verifies it: a deliberate tightening that needs a
 * changelog line. `inspect` needs `fs=readonly-enforced`, which the sandbox plugin declares since its `:ro` mount was measured.
 */
const PROFILES: Readonly<Record<string, readonly string[]>> = {
	// model steps
	agent: AGENT,
	// review steps that must not write
	inspect: [...AGENT, 'fs=readonly-enforced'],
	// tests, build, anything the agent wrote
	'untrusted-code': UNTRUSTED_CODE,
	// tests that must not see earlier runs
	'hermetic-test': [...UNTRUSTED_CODE, 'clean=run'],
};

/** The longest name distance still offered as a "did you mean". */
function maxDistance(name: string): number {
	return name.length <= 4 ? 1 : 2;
}

/**
 * Lookup of the built-in profiles. Pure data: no I/O, no knowledge of the workers. Whether a worker source can meet the
 * expanded requirements is checked by the daemon at run start, as for `requires:`.
 */
export class ProfileCatalog {
	/** The profile names, sorted. */
	static names(): string[] {
		return Object.keys(PROFILES).sort();
	}

	/** The requirements of a profile as a sorted copy, or undefined for an unknown name. */
	static find(name: string): string[] | undefined {
		return Object.hasOwn(PROFILES, name) ? [...PROFILES[name]!].sort() : undefined;
	}

	/** Known profile names that look like `name` (a near miss), never `name` itself. */
	static closest(name: string): string[] {
		return ProfileCatalog.names().filter(
			candidate => candidate !== name && editDistance(candidate, name) <= maxDistance(name)
		);
	}

	/**
	 * The sorted requirements a declared `profile:` stands for.
	 *
	 * @param profile the value written in the flow or step
	 * @param where the place for the message, for example `Step "build"`
	 * @throws when it is not a single name or not a known profile; the message lists the known profiles and, for a near
	 *         miss, the likely intended one.
	 */
	static expand(profile: unknown, where: string): string[] {
		if (typeof profile !== 'string') {
			throw new Error(
				`${where}: profile must be a single name, got ${profile === null ? 'null' : typeof profile}: ${JSON.stringify(profile)}. ` +
					`Write profile: <name> with one of ${ProfileCatalog.names().join(', ')}; add more requirements with requires: [...].`
			);
		}
		const requirements = ProfileCatalog.find(profile);
		if (requirements !== undefined) {
			return requirements;
		}
		const near = ProfileCatalog.closest(profile);
		throw new Error(
			`${where}: unknown profile ${JSON.stringify(profile)}. Known profiles: ${ProfileCatalog.names().join(', ')}.` +
				(near.length > 0 ? ` Did you mean ${near.map(name => `"${name}"`).join(' or ')}?` : '')
		);
	}
}
