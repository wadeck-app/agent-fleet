import type { FlowDefinition } from '../types';
import type { IssueCollector } from './ValidationTypes';
import { ValidationCode } from './ValidationTypes';

/**
 * Refuses `workerType`, which was removed in favour of `requires:` / `profile:` (design note
 * `2026-11-08_sandbox-step-requirements-design.md`). Checked at flow and step level, and on whatever value it holds, so a
 * definition stored with the field (run again by `id@version`) is refused with the same actionable message.
 */
export class WorkerTypeRemoval {
	constructor(private readonly issueCollector: IssueCollector) {}

	validate(flow: FlowDefinition): void {
		this.refuse((flow as { workerType?: unknown }).workerType, `Flow '${flow.id}'`, { field: 'workerType' });
		const steps: unknown = flow.steps;
		for (const step of Array.isArray(steps) ? (steps as unknown[]) : []) {
			const { id, workerType } = (step ?? {}) as { id?: unknown; workerType?: unknown };
			if (typeof id === 'string') {
				this.refuse(workerType, `Step '${id}'`, { stepId: id, field: 'workerType' });
			}
		}
	}

	private refuse(workerType: unknown, where: string, location: { stepId?: string; field: string }): void {
		if (workerType === undefined) {
			return;
		}
		const shown = typeof workerType === 'string' ? `"${workerType}"` : JSON.stringify(workerType);
		const replacement =
			workerType === 'sandbox'
				? 'write requires: [sandbox] (any worker whose source guarantees it) or profile: <name> (agent, inspect, untrusted-code, hermetic-test)'
				: 'write requires: [<guarantee>, ...] for what the flow needs from its worker, or profile: <name> (agent, inspect, untrusted-code, hermetic-test); there is no automatic replacement for this value';
		const migration = `workerType was removed: ${replacement}; see 'flow worker source list' for the guarantees your sources declare`;
		this.issueCollector.addIssue({
			severity: 'error',
			code: ValidationCode.WORKER_TYPE_REMOVED,
			// The message carries the whole migration: `flow validate` prints the message only.
			message: `${where}: ${migration} (it is set to ${shown})`,
			location,
			suggestion: `Remove the workerType line and ${replacement}.`,
		});
	}
}
