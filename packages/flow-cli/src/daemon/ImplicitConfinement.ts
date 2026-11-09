import type { RunRequirementsRecord } from 'flow-core';
import { ProfileCatalog } from 'flow-engine';
import type { FlowDefinition } from 'flow-engine';

import type { DeclaredGuarantees } from './DeclaredGuarantees.js';
import { MODEL_STEP_TYPE, resolveRunRequirements } from './RunRequirements.js';

/** The profile a model step implicitly requires when the machine can provide it. */
const IMPLICIT_PROFILE = 'agent';

/**
 * Implicit confinement of model steps: a model step requires the `agent` profile (fs=confined, env=clean) as soon as one
 * declared worker source guarantees all of it, so it is confined or the run is refused / waits with the usual requirement
 * messages. There is no opt-out while such a source exists (fail closed).
 *
 * Decided ONCE, when the daemon accepts a run, from the static manifest declarations (the same data the run-start check uses),
 * and recorded with the other requirements; a resume uses the record and never asks this class again.
 *
 * Without a covering source model steps route exactly as before, and each one is reported by a warning (never silent).
 * `flow validate` and `flow show <file>` have no worker knowledge and say nothing about it.
 */
export class ImplicitConfinement {
	/**
	 * @param declared the declared worker sources; absent (a daemon wired without them) counts as "no covering source"
	 */
	constructor(private readonly declared: Pick<DeclaredGuarantees, 'providersOfAll' | 'unread'> | undefined) {}

	/**
	 * Resolves the requirements of a flow with the implicit set, or the warnings for the model steps left unconfined.
	 *
	 * @returns `requirements` as {@link resolveRunRequirements}; `warnings` one line per declared model step that no source
	 *          confines and that does not require the set itself
	 * @throws like {@link resolveRunRequirements}, for a malformed `requires` or an unknown `profile`
	 */
	resolve(flow: FlowDefinition): { requirements: RunRequirementsRecord | undefined; warnings: string[] } {
		const agent = ProfileCatalog.expand(IMPLICIT_PROFILE, 'The implicit profile');
		const covered = (this.declared?.providersOfAll(agent).length ?? 0) > 0;
		const requirements = resolveRunRequirements(flow, covered ? agent : []);
		if (covered) {
			return { requirements, warnings: [] };
		}
		const unread = this.declared?.unread() ?? [];
		const warnings = flow.steps
			.filter(step => step.type === MODEL_STEP_TYPE)
			.filter(step => !agent.every(entry => requirements?.steps[step.id]?.includes(entry) === true))
			.map(step => unconfinedWarning(step.id, agent, unread));
		return { requirements, warnings };
	}
}

function unconfinedWarning(stepId: string, agent: readonly string[], unread: readonly string[]): string {
	const unreadNote =
		unread.length === 0
			? ''
			: ` (the declaration of worker source ${unread.join(', ')} could not be read, see the daemon log: it may be the one)`;
	return (
		`model step ${stepId} runs unconfined: no worker source guarantees ${agent.join(' and ')}${unreadNote}; ` +
		`declare a sandbox source (flow worker source list) or write profile: ${IMPLICIT_PROFILE} to require it`
	);
}
