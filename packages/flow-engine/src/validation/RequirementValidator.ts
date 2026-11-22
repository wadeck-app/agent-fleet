import { PlacementCatalog } from '../requirements/PlacementCatalog';
import { ProfileCatalog } from '../requirements/ProfileCatalog';
import { RequirementSyntax } from '../requirements/RequirementSyntax';
import type { FlowDefinition, FlowStep } from '../types';
import type { IssueCollector, ValidationIssue } from './ValidationTypes';
import { ValidationCode } from './ValidationTypes';

const MAX_LISTED_KNOWN = 10;

/**
 * Validates the `requires` of a flow and of its steps (see {@link FlowDefinition.requires}).
 *
 * Without `knownGuarantees` only the syntax is checked: an offline validation cannot know which guarantees the worker
 * sources declare. With it, an entry that is not exactly one of them is an error.
 */
export class RequirementValidator {
	/**
	 * @param issueCollector collector for the issues
	 * @param knownGuarantees guarantee entries declared by the worker sources (for example `['fs=confined', 'sandbox']`);
	 * absent: syntax-only check
	 */
	constructor(
		private readonly issueCollector: IssueCollector,
		private readonly knownGuarantees?: readonly string[]
	) {}

	/** The flow's `placements` as written, kept by {@link validateFlow} for the steps that follow. */
	private placements: unknown;

	validateFlow(flow: FlowDefinition): void {
		this.placements = flow.placements;
		this.validate(flow.requires, `Flow '${flow.id}'`, { field: 'requires' });
		this.validateProfile(flow.profile, `Flow '${flow.id}'`, { field: 'profile' });
		this.validatePlacements(flow.placements, `Flow '${flow.id}'`);
		this.validatePlacementName(flow.placement, `Flow '${flow.id}'`, { field: 'placement' });
	}

	validateStep(step: FlowStep): void {
		this.validate(step.requires, `Step '${step.id}'`, { stepId: step.id, field: 'requires' });
		this.validateProfile(step.profile, `Step '${step.id}'`, { stepId: step.id, field: 'profile' });
		this.validatePlacementName(step.placement, `Step '${step.id}'`, { stepId: step.id, field: 'placement' });
	}

	/** `placements` must be a non-empty map of non-empty requirement lists; the entries follow the `requires` rules. */
	private validatePlacements(placements: unknown, where: string): void {
		if (placements === undefined) {
			return;
		}
		const suggestion =
			'Write placements: { main: ["sandbox"], linux: ["os=linux"] }: a name and a non-empty list of requirements each.';
		if (!PlacementCatalog.isMap(placements) || Object.keys(placements).length === 0) {
			this.report(
				ValidationCode.INVALID_TYPE,
				`${where}: placements must be a non-empty map of name to requirements list, got ${JSON.stringify(placements)}`,
				{ field: 'placements' },
				suggestion
			);
			return;
		}
		for (const [name, entries] of Object.entries(placements)) {
			const location = { field: `placements.${name}` };
			try {
				PlacementCatalog.assertShape(name, entries, where);
			} catch (error) {
				this.report(ValidationCode.INVALID_TYPE, (error as Error).message, location, suggestion);
				continue;
			}
			this.validate(entries, `${where}: placement '${name}'`, location);
		}
	}

	/** A `placement` must be one string naming a declared placement; a near miss gets a did-you-mean. */
	private validatePlacementName(name: unknown, where: string, location: ValidationIssue['location']): void {
		if (name === undefined) {
			return;
		}
		try {
			PlacementCatalog.expand(this.placements, name, where);
		} catch (error) {
			const declared = PlacementCatalog.names(this.placements);
			// A declared name whose own list is malformed is already reported by validatePlacements.
			if (typeof name === 'string' && declared.includes(name)) {
				return;
			}
			this.report(
				typeof name === 'string' ? ValidationCode.INVALID_VALUE : ValidationCode.INVALID_TYPE,
				(error as Error).message,
				location,
				declared.length === 0
					? 'Declare it first: placements: { <name>: ["sandbox"] } at flow level.'
					: `Write placement: <name> with one of: ${declared.join(', ')}.`
			);
		}
	}

	/**
	 * A `profile` must be one known name. The names are built in, so this is checked offline too; with `knownGuarantees`
	 * the requirements it expands to must also be declared by a worker source (otherwise no worker could ever serve it).
	 */
	private validateProfile(profile: unknown, where: string, location: ValidationIssue['location']): void {
		if (profile === undefined) {
			return;
		}
		if (typeof profile !== 'string') {
			this.reportProfile(ValidationCode.INVALID_TYPE, this.profileMessage(profile, where), location);
			return;
		}
		const requirements = ProfileCatalog.find(profile);
		if (requirements === undefined) {
			const near = ProfileCatalog.closest(profile);
			const known = ProfileCatalog.names().join(', ');
			this.reportProfile(
				ValidationCode.INVALID_VALUE,
				`${where}: unknown profile "${profile}".${near.length > 0 ? ` Did you mean ${near.map(name => `"${name}"`).join(' or ')}?` : ''} Known profiles: ${known}`,
				location,
				`Write one of: ${known}. Names are checked here; whether a worker provides their guarantees is checked when the run starts.`
			);
			return;
		}
		const declared = this.knownGuarantees;
		const missing = declared === undefined ? [] : requirements.filter(entry => !declared.includes(entry));
		if (declared === undefined || missing.length === 0) {
			return;
		}
		this.reportProfile(
			ValidationCode.INVALID_VALUE,
			declared.length === 0
				? `${where}: profile "${profile}" cannot be met: no worker source declares any guarantee`
				: `${where}: profile "${profile}" requires ${missing.map(entry => `"${entry}"`).join(', ')}, which no declared worker source guarantees. Declared guarantees: ${this.listed(declared)}`,
			location,
			'Declare a worker source that provides them (flow worker source list shows the declared ones), or use a profile or requires: that the declared sources can meet.'
		);
	}

	private profileMessage(profile: unknown, where: string): string {
		try {
			ProfileCatalog.expand(profile, where);
			return '';
		} catch (error) {
			return (error as Error).message;
		}
	}

	private listed(known: readonly string[]): string {
		const rest = known.length > MAX_LISTED_KNOWN ? ` (and ${known.length - MAX_LISTED_KNOWN} more)` : '';
		return `${known.slice(0, MAX_LISTED_KNOWN).join(', ')}${rest}`;
	}

	private reportProfile(
		code: ValidationCode,
		message: string,
		location: ValidationIssue['location'],
		suggestion = `Write profile: <name> with one of ${ProfileCatalog.names().join(', ')} (one name; add more with requires: [...]).`
	): void {
		this.issueCollector.addIssue({ severity: 'error', code, message, location, suggestion });
	}

	private validate(requires: unknown, where: string, location: ValidationIssue['location']): void {
		if (requires === undefined) {
			return;
		}
		if (!Array.isArray(requires)) {
			this.report(ValidationCode.INVALID_TYPE, this.syntaxMessage(requires, where), location);
			return;
		}
		for (const entry of requires) {
			if (typeof entry !== 'string') {
				this.report(ValidationCode.INVALID_TYPE, this.syntaxMessage([entry], where), location);
				continue;
			}
			const syntaxMessage = this.syntaxMessage([entry], where);
			if (syntaxMessage !== '') {
				this.report(ValidationCode.INVALID_VALUE, syntaxMessage, location);
				continue;
			}
			this.checkKnown(entry, where, location);
		}
	}

	/** The message of the syntax rule broken by `requires`, or an empty string when it is well formed. */
	private syntaxMessage(requires: unknown, where: string): string {
		try {
			RequirementSyntax.normalise(requires, where);
			return '';
		} catch (error) {
			return (error as Error).message;
		}
	}

	private checkKnown(entry: string, where: string, location: ValidationIssue['location']): void {
		const known = this.knownGuarantees;
		if (known === undefined || known.includes(entry)) {
			return;
		}
		if (known.length === 0) {
			this.report(
				ValidationCode.INVALID_VALUE,
				`${where}: unknown requirement "${entry}": no worker source declares any guarantee`,
				location,
				'Declare a worker source that provides it (flow worker source list shows the declared ones), or remove the entry.'
			);
			return;
		}
		const listed = known.slice(0, MAX_LISTED_KNOWN).join(', ');
		const rest = known.length > MAX_LISTED_KNOWN ? ` (and ${known.length - MAX_LISTED_KNOWN} more)` : '';
		const near = RequirementSyntax.closest(entry, known);
		this.report(
			ValidationCode.INVALID_VALUE,
			`${where}: unknown requirement "${entry}". Declared guarantees: ${listed}${rest}`,
			location,
			near.length > 0
				? `Did you mean ${near.map(candidate => `"${candidate}"`).join(' or ')}? Check the declared sources with: flow worker source list`
				: 'Fix the spelling or declare a worker source that provides it (flow worker source list shows the declared ones).'
		);
	}

	private report(
		code: ValidationCode,
		message: string,
		location: ValidationIssue['location'],
		suggestion = `Write requires as a list of keywords or key=value entries, for example requires: ["fs=confined"]; every entry must be met (AND).`
	): void {
		this.issueCollector.addIssue({ severity: 'error', code, message, location, suggestion });
	}
}
