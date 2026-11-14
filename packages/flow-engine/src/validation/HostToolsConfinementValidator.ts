import type { HostToolsConfinementPolicy } from '../hosttools/HostToolsConfinementPolicy';
import { ProfileCatalog } from '../requirements/ProfileCatalog';
import { RequirementSyntax } from '../requirements/RequirementSyntax';
import type { FlowDefinition } from '../types';
import type { IssueCollector } from './ValidationTypes';
import { ValidationCode } from './ValidationTypes';

/** The guarantee every confined profile (agent, inspect, untrusted-code, hermetic-test) contains. */
const CONFINED = 'fs=confined';
const SETTING = 'validation.hostToolsUnderConfinedProfile';

interface Carrier {
	/** Where the confinement comes from, for the message. */
	reason: string;
	requirements: string[];
}

/**
 * The finding "hostTools under a confined profile": a host tool runs on the worker's machine, outside the isolation that
 * `profile: agent | inspect | untrusted-code | hermetic-test` (or `requires: [fs=confined]`) promises. Reported as a warning
 * or an error depending on the policy the CALLER passes, which carries the text that says how the mode was decided: this
 * class does not read any configuration.
 *
 * A malformed `profile` or `requires` is ignored here (RequirementValidator reports it on the same flow).
 */
export class HostToolsConfinementValidator {
	/**
	 * @param policy mode and its description, from the user's setting
	 * @param implicitRequires what the daemon adds to every model step on top of the flow (the `agent` profile when a
	 *        confining worker source is configured); empty for an offline validation
	 * @throws when the policy mode is neither `warn` nor `error`
	 */
	constructor(
		private readonly issueCollector: IssueCollector,
		private readonly policy: HostToolsConfinementPolicy,
		private readonly implicitRequires: readonly string[] = []
	) {
		if (policy.mode !== 'warn' && policy.mode !== 'error') {
			throw new Error(
				`HostToolsConfinementPolicy.mode must be 'warn' or 'error', got ${JSON.stringify(policy.mode)} (the caller must map ${SETTING} to one of them)`
			);
		}
	}

	validateFlow(flow: FlowDefinition): void {
		const steps: unknown = flow.steps;
		if (!Array.isArray(steps)) {
			return;
		}
		for (const step of steps as {
			id?: unknown;
			type?: unknown;
			hostTools?: unknown;
			requires?: unknown;
			profile?: unknown;
		}[]) {
			// hostTools on another step type is an error of its own (HostToolValidator); no second finding for it.
			if (
				step === null ||
				typeof step !== 'object' ||
				typeof step.id !== 'string' ||
				step.type !== 'model' ||
				step.hostTools === undefined
			) {
				continue;
			}
			const reasons = this.confinementOf(flow, step);
			if (reasons.length > 0) {
				this.report(step.id, reasons);
			}
		}
	}

	private confinementOf(flow: FlowDefinition, step: { requires?: unknown; profile?: unknown }): string[] {
		const carriers: Carrier[] = [
			...this.fromProfile('flow profile', flow.profile),
			...this.fromRequires('flow requires', flow.requires),
			...this.fromProfile('profile', step.profile),
			...this.fromRequires('requires', step.requires),
			...(this.implicitRequires.length > 0
				? [
						{
							reason: 'the implicit requirements the daemon adds to model steps',
							requirements: [...this.implicitRequires],
						},
					]
				: []),
		];
		return carriers.filter(carrier => carrier.requirements.includes(CONFINED)).map(carrier => carrier.reason);
	}

	private fromProfile(label: string, profile: unknown): Carrier[] {
		if (typeof profile !== 'string') {
			return [];
		}
		const requirements = ProfileCatalog.find(profile);
		return requirements === undefined ? [] : [{ reason: `${label} "${profile}"`, requirements }];
	}

	private fromRequires(label: string, requires: unknown): Carrier[] {
		try {
			const requirements = RequirementSyntax.normalise(requires, label);
			return requirements.includes(CONFINED) ? [{ reason: `${label} "${CONFINED}"`, requirements }] : [];
		} catch {
			// Malformed requires: RequirementValidator already reports it for this flow.
			return [];
		}
	}

	private report(stepId: string, reasons: readonly string[]): void {
		const other = this.policy.mode === 'warn' ? 'error' : 'warn';
		const effect =
			this.policy.mode === 'warn' ? 'make this finding an error' : 'downgrade this finding to a warning';
		this.issueCollector.addIssue({
			severity: this.policy.mode === 'warn' ? 'warning' : 'error',
			code: ValidationCode.HOST_TOOL_UNDER_CONFINED_PROFILE,
			message:
				`Step '${stepId}' declares hostTools under a confined profile (${reasons.join('; ')}): a host tool runs on the worker's machine, ` +
				`outside the isolation that requirement promises. Mode: ${this.policy.description}. ` +
				`Fix: remove hostTools from '${stepId}' or drop the confinement from it; to ${effect}, set ${SETTING}: ${other} in ~/.config/flow/config.yml.`,
			location: { stepId, field: 'hostTools' },
		});
	}
}
