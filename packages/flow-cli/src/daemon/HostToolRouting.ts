import type { StepPlacement } from 'extension-points';

import { WORKER_FEATURE_HOST_TOOLS } from '../ipc/Protocol';
import type { ReadyStep } from './ReadyStepQueue.js';
import type { RoutingCandidate, StepRouter } from './StepRouter.js';
import type { GuaranteeLookup, RequirementOnlyLookup } from './WorkerTypeCatalog.js';

/**
 * A step with `hostTools` is served ONLY by a worker declaring {@link WORKER_FEATURE_HOST_TOOLS}: a worker without it would
 * run the model without the tools it was promised. This is a hard filter applied before the acceptance plugin (S4), which
 * therefore cannot widen the set back, and the decision to fail the step early when only workers without the feature
 * could otherwise have taken it.
 */
export class HostToolRouting {
	/** True when the step declares at least one host tool (an empty list asks for nothing). */
	static isRequiredBy(step: ReadyStep): boolean {
		const { hostTools } = step.stepConfig as { hostTools?: unknown };
		return Array.isArray(hostTools) && hostTools.length > 0;
	}

	/** The workers that declare the feature. */
	static capable(candidates: RoutingCandidate[]): RoutingCandidate[] {
		return candidates.filter(HostToolRouting.supports);
	}

	private static supports(candidate: RoutingCandidate): boolean {
		return candidate.worker.features.includes(WORKER_FEATURE_HOST_TOOLS);
	}

	constructor(private readonly router: StepRouter) {}

	/**
	 * Called for a step with hostTools that no idle worker takes. Returns the failure message when no connected worker
	 * (idle or busy) declaring the feature could take the step while at least one connected worker without it would have:
	 * waiting would be for nothing. Undefined (keep waiting) when a capable worker exists, or when no worker at all would take
	 * the step now (a host worker may still be forked, a source may still launch one; that worker is checked once it connects).
	 *
	 * @param connections every connected worker, idle or busy.
	 */
	refusal(
		step: ReadyStep,
		placement: StepPlacement,
		connections: RoutingCandidate[],
		requirementOnly: RequirementOnlyLookup | undefined,
		guarantees: GuaranteeLookup | undefined
	): string | undefined {
		const takesIt = (candidate: RoutingCandidate): boolean =>
			this.router.select(placement, [candidate], requirementOnly, guarantees) !== undefined;
		if (connections.some(candidate => HostToolRouting.supports(candidate) && takesIt(candidate))) {
			return undefined;
		}
		const lacking = connections.filter(candidate => !HostToolRouting.supports(candidate) && takesIt(candidate));
		if (lacking.length === 0) {
			return undefined;
		}
		const names = lacking.map(candidate => `'${candidate.worker.workerId}'`);
		const subject = names.length === 1 ? `worker ${names[0]!} does not` : `workers ${names.join(', ')} do not`;
		const fromSource = lacking.some(candidate => candidate.worker.sourceId !== undefined);
		return (
			`Step '${step.stepId}' declares hostTools but ${subject} support hostTools. ` +
			'Fix: run the step on a local worker that supports them (update flow-cli on the worker with `flow cli update` and restart it), or remove hostTools from the step.' +
			(fromSource
				? ' Workers of a declared source (a sandbox, for example) do not offer host tools in the sandbox in this version.'
				: '')
		);
	}
}
