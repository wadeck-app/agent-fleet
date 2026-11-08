import type { FlowDefinition } from '../types';
import type { IssueCollector } from './ValidationTypes';
import { ValidationCode } from './ValidationTypes';

/**
 * Warns that `workerType` is deprecated in favour of `requires:` / `profile:` (design note
 * `2026-11-08_sandbox-step-requirements-design.md`). Behaviour of the field is unchanged; this only informs.
 *
 * `workerType` exists at flow level only. A step-level one is not read by anything: it is reported as such rather than
 * left silently ignored.
 */
export class WorkerTypeDeprecation {
	constructor(private readonly issueCollector: IssueCollector) {}

	validate(flow: FlowDefinition): void {
		this.warn((flow as { workerType?: unknown }).workerType, `Flow '${flow.id}'`, { field: 'workerType' }, false);
		const steps: unknown = flow.steps;
		for (const step of Array.isArray(steps) ? (steps as unknown[]) : []) {
			const { id, workerType } = (step ?? {}) as { id?: unknown; workerType?: unknown };
			if (typeof id === 'string') {
				this.warn(workerType, `Step '${id}'`, { stepId: id, field: 'workerType' }, true);
			}
		}
	}

	private warn(
		workerType: unknown,
		where: string,
		location: { stepId?: string; field: string },
		stepLevel: boolean
	): void {
		// A non-string is an error of the schema validator, not worth a second message.
		if (typeof workerType !== 'string') {
			return;
		}
		const replacement =
			workerType === 'sandbox'
				? 'requires: [sandbox] (any worker whose source guarantees it), or profile: <name> for a named set of guarantees (agent, inspect, untrusted-code, hermetic-test)'
				: `requires: [<guarantee>, ...] for what the step needs from its worker, or profile: <name> (agent, inspect, untrusted-code, hermetic-test); "${workerType}" has no automatic replacement`;
		this.issueCollector.addIssue({
			severity: 'warning',
			code: ValidationCode.WORKER_TYPE_DEPRECATED,
			message: stepLevel
				? `${where}: workerType "${workerType}" is deprecated and has no effect on a step (it is read at flow level only)`
				: `${where}: workerType "${workerType}" is deprecated in favour of requires: / profile:; it still works unchanged`,
			location,
			suggestion: `Use ${replacement}. Guarantee availability is checked when the run starts.`,
		});
	}
}
