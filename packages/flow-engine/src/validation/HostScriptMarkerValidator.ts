import type { FlowDefinition, FlowStep } from '../types';
import type { IssueCollector } from './ValidationTypes';
import { ValidationCode } from './ValidationTypes';

const STATIC_FIX = 'Write `host: true` (run on the worker machine) or `host: false` (run in the VM, the default) as a YAML boolean';

/**
 * Checks the `host` marker of script steps: "run this script on the worker's own machine, not in its isolation".
 * The core only validates and carries it; the worker acts on it.
 *
 * Errors: `host` on a step that is not a script; a value that is not the literal boolean (a string, a template).
 * Warning (HOST_SCRIPT_WITH_MODEL_STEPS): a flow with a model step and a `host: true` script, which then runs with the
 * user's rights on files an agent may have written.
 */
export class HostScriptMarkerValidator {
	constructor(private readonly issueCollector: IssueCollector) {}

	/** Errors for one step. */
	validateStep(step: FlowStep): void {
		const raw = step as unknown as { id?: unknown; type?: unknown; host?: unknown };
		if (raw.host === undefined || typeof raw.id !== 'string') {
			return;
		}
		const where = { stepId: raw.id, field: 'host' };
		if (raw.type !== 'script') {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_VALUE,
				message: `Step '${raw.id}' is a ${String(raw.type)} step and cannot have \`host\`: only script steps can ask to run on the worker's machine`,
				location: where,
				suggestion: `Remove \`host\` from '${raw.id}', or turn it into a script step if a command must run on the worker machine`,
			});
			return;
		}
		if (typeof raw.host === 'boolean') {
			return;
		}
		if (typeof raw.host === 'string' && raw.host.includes('${{')) {
			this.issueCollector.addIssue({
				severity: 'error',
				code: ValidationCode.INVALID_VALUE,
				message: `Script step '${raw.id}' host must be a static literal: it is a fact of the definition, not computed from inputs or step outputs, so a template is refused`,
				location: where,
				suggestion: `${STATIC_FIX}. To choose between two behaviours, write two steps and select one with \`when:\``,
				context: { actual: raw.host },
			});
			return;
		}
		this.issueCollector.addIssue({
			severity: 'error',
			code: ValidationCode.INVALID_TYPE,
			message: `Script step '${raw.id}' host must be the boolean true or false`,
			location: where,
			suggestion: `${STATIC_FIX}, not a quoted string`,
			context: { expected: 'boolean', actual: raw.host === null ? 'null' : typeof raw.host },
		});
	}

	/** The warning, once per host script step, when the flow also has a model step. Call after the steps were checked. */
	validateFlow(flow: FlowDefinition): void {
		const steps: unknown = flow.steps;
		if (!Array.isArray(steps)) {
			return;
		}
		const list = steps as { id?: unknown; type?: unknown; host?: unknown }[];
		if (!list.some(step => step?.type === 'model')) {
			return;
		}
		for (const step of list) {
			if (step?.type === 'script' && step.host === true && typeof step.id === 'string') {
				this.issueCollector.addIssue({
					severity: 'warning',
					code: ValidationCode.HOST_SCRIPT_WITH_MODEL_STEPS,
					message: `Script step '${step.id}' has host: true in a flow that also has model steps: it runs with the user's rights on a workspace an agent may have written (project files, .git config and hooks, package scripts)`,
					location: { stepId: step.id, field: 'host' },
					suggestion: `Remove \`host: true\` from '${step.id}' (it then runs in the VM), or keep it only if the script does not read files an agent wrote`,
				});
			}
		}
	}
}
