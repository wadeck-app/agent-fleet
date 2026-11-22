import { editDistance } from './EditDistance';
import { RequirementSyntax } from './RequirementSyntax';

/** The longest name distance still offered as a "did you mean". */
function maxDistance(name: string): number {
	return name.length <= 4 ? 1 : 2;
}

/**
 * Lookup of the `placements:` a flow declares (name -> list of requirements). Pure data: no I/O, no knowledge of the
 * workers. Whether a worker source can meet the requirements is checked by the daemon at run start, as for `requires:`.
 */
export class PlacementCatalog {
	/** The declared placement names, sorted; empty when `placements` is not a map. */
	static names(placements: unknown): string[] {
		return PlacementCatalog.isMap(placements) ? Object.keys(placements).sort() : [];
	}

	/** Declared names that look like `name` (a near miss), never `name` itself. */
	static closest(placements: unknown, name: string): string[] {
		return PlacementCatalog.names(placements).filter(
			candidate => candidate !== name && editDistance(candidate, name) <= maxDistance(name)
		);
	}

	/**
	 * The sorted requirements of a placement.
	 *
	 * @param placements the flow's `placements` as written
	 * @param name the value of a `placement:` field
	 * @param where the place for the message, for example `Step "build"`
	 * @throws when `name` is not a string or not declared (the message lists the declared names and a near miss), or when
	 *         the placement itself is malformed (see {@link assertShape}).
	 */
	static expand(placements: unknown, name: unknown, where: string): string[] {
		if (typeof name !== 'string') {
			throw new Error(
				`${where}: placement must be a single name, got ${name === null ? 'null' : typeof name}: ${JSON.stringify(name)}. Write placement: <name> with a name declared in the flow's placements.`
			);
		}
		const declared = PlacementCatalog.names(placements);
		if (declared.length === 0) {
			throw new Error(
				`${where}: unknown placement ${JSON.stringify(name)}: the flow declares no placements. Add placements: { ${name}: ["sandbox"] } at flow level.`
			);
		}
		if (!Object.hasOwn(placements as object, name)) {
			const near = PlacementCatalog.closest(placements, name);
			throw new Error(
				`${where}: unknown placement ${JSON.stringify(name)}. Declared placements: ${declared.join(', ')}.` +
					(near.length > 0 ? ` Did you mean ${near.map(candidate => `"${candidate}"`).join(' or ')}?` : '')
			);
		}
		const entries = (placements as Record<string, unknown>)[name];
		PlacementCatalog.assertShape(name, entries, where);
		return RequirementSyntax.normalise(entries, `${where}: placement "${name}"`);
	}

	/** @throws when the placement is not a non-empty list (an empty one constrains nothing: almost certainly a mistake). */
	static assertShape(name: string, entries: unknown, where: string): void {
		if (!Array.isArray(entries) || entries.length === 0) {
			throw new Error(
				`${where}: placement "${name}" must be a non-empty list of requirements, got ${JSON.stringify(entries)}. Write it like placements: { ${name}: ["sandbox"] }.`
			);
		}
	}

	/** Whether `placements` is a plain map (not a list, string or null). */
	static isMap(placements: unknown): placements is Record<string, unknown> {
		return typeof placements === 'object' && placements !== null && !Array.isArray(placements);
	}
}
