import type { IssueCollector, ValidationCode } from './ValidationTypes';

/** Counts the errors reported through every reporter derived from the same root. */
interface ErrorCounter {
	errors: number;
}

/**
 * Builds the issues of the host tool validators with one message shape:
 * `Step 's' tool 't': <problem>. Fix: <fix>.` (the tool part is left out for a step-level problem). Every message names the
 * step, the tool, the rule that was broken and what to do.
 */
export class HostToolIssueReporter {
	private constructor(
		private readonly collector: IssueCollector,
		private readonly stepId: string,
		private readonly toolLabel: string | undefined,
		private readonly fieldPrefix: string,
		private readonly counter: ErrorCounter
	) {}

	static forStep(collector: IssueCollector, stepId: string): HostToolIssueReporter {
		return new HostToolIssueReporter(collector, stepId, undefined, 'hostTools', { errors: 0 });
	}

	/**
	 * A reporter for one tool of the list. The label uses the id when it is a usable string; otherwise the position, so a
	 * tool with a broken id can still be found.
	 */
	forTool(index: number, id: unknown): HostToolIssueReporter {
		const label = typeof id === 'string' && id !== '' ? `tool '${id}'` : `tool at position ${index + 1}`;
		return new HostToolIssueReporter(this.collector, this.stepId, label, `hostTools[${index}]`, this.counter);
	}

	/** Errors reported so far by this reporter and every reporter derived from the same root. */
	get errorCount(): number {
		return this.counter.errors;
	}

	error(code: ValidationCode, field: string | undefined, problem: string, fix: string): void {
		this.counter.errors++;
		this.add('error', code, field, problem, fix);
	}

	warning(code: ValidationCode, field: string | undefined, problem: string, fix: string): void {
		this.add('warning', code, field, problem, fix);
	}

	private add(
		severity: 'error' | 'warning',
		code: ValidationCode,
		field: string | undefined,
		problem: string,
		fix: string
	): void {
		const subject =
			this.toolLabel === undefined ? `Step '${this.stepId}'` : `Step '${this.stepId}' ${this.toolLabel}`;
		this.collector.addIssue({
			severity,
			code,
			message: `${subject}: ${problem}. Fix: ${fix}.`,
			location: {
				stepId: this.stepId,
				field: field === undefined ? this.fieldPrefix : `${this.fieldPrefix}.${field}`,
			},
		});
	}
}
