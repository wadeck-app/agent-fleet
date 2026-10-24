import { resolveExpressionValue } from '@wadeck-app/dsl-renderer';

/** The keys a `flow:LogStream` node may carry: the data of the route, nothing that styles the list. */
export const LOG_STREAM_KEYS = ['entries', 'steps', 'runDurationMs', 'emptyMessage'] as const;

export const LOG_LEVELS = ['debug', 'info', 'warning', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

// Statuses of a recorded step, plus the ones of the run itself (the "Run events" row carries the status of the run).
const STEP_STATUSES = ['pending', 'running', 'completed', 'failed', 'queued', 're-queued', 'unknown'] as const;
export type LogStepStatus = (typeof STEP_STATUSES)[number];

/** Step id of the lines about the run itself (flow-core LogWriter.writeExecution). */
export const RUN_EVENTS_STEP = '__execution';

export interface LogStreamProps {
	entries: unknown;
	steps: unknown;
	runDurationMs: unknown;
	emptyMessage: unknown;
	/** Keys of the node outside the contract (the platform checks only the root $type, never the props). */
	unexpectedKeys: string[];
}

/** One log line as the route serves it (ExecutionLogRoutes + LogTimeline). */
export interface LogStreamEntry {
	timestamp: string;
	level: LogLevel;
	stepId: string;
	/** One-line plain text. */
	preview: string;
	/** Whether the line opens a markdown panel. */
	expandable: boolean;
	markdown: string;
	/** 1-based execution order of the step; null for the run events and for a step the record does not know. */
	/** The step a run event is about ("Step plan failed..."); null for the lines of a step and for events about the run. */
	subjectStepId: string | null;
	stepOrder: number | null;
	stepDepth: number;
	/** 1-based attempt the line belongs to; 0 for run events. */
	attempt: number;
	/** Attempts of the step seen in the log; 0 for run events. */
	attempts: number;
	offsetMs: number;
	/** Time since the previous line of the page; null for the first. */
	deltaMs: number | null;
}

/** One row of the step index of the run (tree + execution order). */
export interface LogStreamStep {
	stepId: string;
	order: number | null;
	depth: number;
	parentId: string | null;
	status: LogStepStatus;
	attempts: number;
	/** Lines of the step matching the level and text filters, whatever the page. */
	lineCount: number;
	startOffsetMs: number | null;
	endOffsetMs: number | null;
	durationMs: number | null;
}

/** Reads the node: the declared values resolved against the context, and the undeclared keys. */
export function readLogStreamProps(node: Record<string, unknown>, ctx: Record<string, unknown>): LogStreamProps {
	const declared: readonly string[] = LOG_STREAM_KEYS;
	return {
		entries: resolveExpressionValue(node['entries'], ctx),
		steps: resolveExpressionValue(node['steps'], ctx),
		runDurationMs: resolveExpressionValue(node['runDurationMs'], ctx),
		emptyMessage: resolveExpressionValue(node['emptyMessage'], ctx),
		// "$type", "$if" and the like belong to the engine, not to the node.
		unexpectedKeys: Object.keys(node)
			.filter(key => !key.startsWith('$') && !declared.includes(key))
			.sort(),
	};
}

function fieldOf(row: unknown, field: string): unknown {
	return typeof row === 'object' && row !== null ? Reflect.get(row, field) : undefined;
}

function describe(value: unknown): string {
	return JSON.stringify(value) ?? 'nothing';
}

/** A reader of one row kind: every check names the row and the field that is wrong. */
class RowReader {
	constructor(
		private readonly kind: string,
		private readonly index: number,
		private readonly row: unknown
	) {}

	private fail(expected: string, field: string): never {
		throw new Error(
			`flow:LogStream ${this.kind} ${this.index} needs ${expected} ${field}, got ${describe(fieldOf(this.row, field))}.`
		);
	}

	text(field: string): string {
		const value = fieldOf(this.row, field);
		return typeof value === 'string' ? value : this.fail('a text', field);
	}

	nullableText(field: string): string | null {
		const value = fieldOf(this.row, field);
		return value === null || typeof value === 'string' ? value : this.fail('a text or null', field);
	}

	number(field: string): number {
		const value = fieldOf(this.row, field);
		return typeof value === 'number' && Number.isFinite(value) ? value : this.fail('a number', field);
	}

	nullableNumber(field: string): number | null {
		const value = fieldOf(this.row, field);
		return value === null || (typeof value === 'number' && Number.isFinite(value))
			? value
			: this.fail('a number or null', field);
	}

	nullableWholeNumber(field: string): number | null {
		const value = fieldOf(this.row, field);
		return value === null || (typeof value === 'number' && Number.isInteger(value))
			? value
			: this.fail('a whole number or null', field);
	}

	boolean(field: string): boolean {
		const value = fieldOf(this.row, field);
		return typeof value === 'boolean' ? value : this.fail('a true or false', field);
	}

	oneOf<T extends string>(field: string, allowed: readonly T[]): T {
		const value = fieldOf(this.row, field);
		const found = allowed.find(candidate => candidate === value);
		if (found === undefined) {
			throw new Error(
				`flow:LogStream ${this.kind} ${this.index} has the ${field} ${describe(value)}, expected one of ${allowed.join(', ')}.`
			);
		}
		return found;
	}
}

function requireList(value: unknown, name: string, example: string): unknown[] {
	if (!Array.isArray(value)) {
		throw new Error(
			`flow:LogStream ${name} must be a list (for example ${name}: ${example}), got ${describe(value)}.`
		);
	}
	return value;
}

/** The lines of the `entries` list, or an error that names the line and the field that is wrong. */
export function parseLogStreamEntries(entries: unknown): LogStreamEntry[] {
	return requireList(entries, 'entries', '$sources.logs.entries').map((row, index) => {
		const reader = new RowReader('entry', index, row);
		return {
			timestamp: reader.text('timestamp'),
			level: reader.oneOf('level', LOG_LEVELS),
			stepId: reader.text('stepId'),
			preview: reader.text('preview'),
			expandable: reader.boolean('expandable'),
			markdown: reader.text('markdown'),
			subjectStepId: reader.nullableText('subjectStepId'),
			stepOrder: reader.nullableWholeNumber('stepOrder'),
			stepDepth: reader.number('stepDepth'),
			attempt: reader.number('attempt'),
			attempts: reader.number('attempts'),
			offsetMs: reader.number('offsetMs'),
			deltaMs: reader.nullableNumber('deltaMs'),
		};
	});
}

/** The rows of the `steps` list, or an error that names the step and the field that is wrong. */
export function parseLogStreamSteps(steps: unknown): LogStreamStep[] {
	return requireList(steps, 'steps', '$sources.logs.steps').map((row, index) => {
		const reader = new RowReader('step', index, row);
		return {
			stepId: reader.text('stepId'),
			order: reader.nullableWholeNumber('order'),
			depth: reader.number('depth'),
			parentId: reader.nullableText('parentId'),
			status: reader.oneOf('status', STEP_STATUSES),
			attempts: reader.number('attempts'),
			lineCount: reader.number('lineCount'),
			startOffsetMs: reader.nullableNumber('startOffsetMs'),
			endOffsetMs: reader.nullableNumber('endOffsetMs'),
			durationMs: reader.nullableNumber('durationMs'),
		};
	});
}
