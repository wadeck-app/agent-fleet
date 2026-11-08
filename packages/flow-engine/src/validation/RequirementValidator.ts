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

	validateFlow(flow: FlowDefinition): void {
		this.validate(flow.requires, `Flow '${flow.id}'`, { field: 'requires' });
	}

	validateStep(step: FlowStep): void {
		this.validate(step.requires, `Step '${step.id}'`, { stepId: step.id, field: 'requires' });
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
