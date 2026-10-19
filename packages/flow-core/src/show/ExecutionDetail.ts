import * as fs from 'node:fs';
import * as path from 'node:path';

import { FlowCoreError, errorMessage } from '../errors.js';
import { looksLikeExecutionId } from '../execution/ExecutionId.js';
import type { ExecutionState, StepState } from '../execution/ExecutionState.js';
import { formatDuration, formatModelCost, formatStarted } from '../history/ExecutionFormat.js';

/** Default number of trailing characters printed for a failed step's stdout/stderr. */
export const DEFAULT_TAIL_CHARS = 2000;

export interface ResolvedExecution {
	record: ExecutionState;
	filePath: string;
}

export interface RenderOptions {
	/** Max trailing characters of stdout/stderr per failed step. Ignored when `full` is set. */
	tail: number;
	full: boolean;
}

export type ExecutionLookupErrorKind = 'invalid-id' | 'not-found' | 'ambiguous' | 'corrupt' | 'invalid-record';

/** Thrown for every resolution failure; the message is already actionable and `kind` tells which one. */
export class ExecutionLookupError extends FlowCoreError {
	constructor(
		message: string,
		override readonly kind: ExecutionLookupErrorKind
	) {
		super(message, kind);
	}
}

/**
 * Finds the execution file for an id or a unique id prefix, then parses it.
 * Matching is done on file names (`<id>.json`) so unrelated, possibly huge, files are never read.
 */
export function resolveExecution(executionsDir: string, idOrPrefix: string): ResolvedExecution {
	if (!looksLikeExecutionId(idOrPrefix)) {
		throw new ExecutionLookupError(
			`'${idOrPrefix}' is not a valid execution id (expected lowercase letters/digits).`,
			'invalid-id'
		);
	}
	const ids = fs.existsSync(executionsDir)
		? fs
				.readdirSync(executionsDir)
				.filter(f => f.endsWith('.json'))
				.map(f => f.slice(0, -'.json'.length))
		: [];
	const exact = ids.filter(id => id === idOrPrefix);
	const matches = exact.length === 1 ? exact : ids.filter(id => id.startsWith(idOrPrefix));
	if (matches.length === 0) {
		throw new ExecutionLookupError(`No execution matches '${idOrPrefix}' in ${executionsDir}.`, 'not-found');
	}
	if (matches.length > 1) {
		throw new ExecutionLookupError(
			`Ambiguous execution id prefix '${idOrPrefix}' matches ${matches.length} executions: ${matches.sort().join(', ')}. ` +
				'Use a longer prefix.',
			'ambiguous'
		);
	}
	const filePath = path.join(executionsDir, `${matches[0]}.json`);
	let record: ExecutionState;
	try {
		record = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ExecutionState;
	} catch (err) {
		throw new ExecutionLookupError(
			`Cannot read execution file ${filePath}: ${errorMessage(err)}. ` +
				'The file is corrupt or unreadable; inspect or delete it.',
			'corrupt'
		);
	}
	if (!record || typeof record !== 'object' || typeof record.steps !== 'object' || record.steps === null) {
		throw new ExecutionLookupError(
			`Execution file ${filePath} is not a valid execution record (missing 'steps'). Inspect or delete it.`,
			'invalid-record'
		);
	}
	return { record, filePath };
}

/** Keeps the last `tail` characters; the marker tells how much was dropped and where the full text lives. */
export function tailText(text: string, tail: number, filePath: string): string {
	if (text.length <= tail) return text;
	const dropped = text.length - tail;
	return `(${dropped} more chars, see ${filePath}) ...${text.slice(-tail)}`;
}

function indent(text: string, prefix: string): string {
	return text
		.split('\n')
		.map(line => prefix + line)
		.join('\n');
}

function stepDuration(step: StepState): string {
	if (!step.startedAt) return '-';
	return formatDuration(step.startedAt, step.completedAt ?? null);
}

/** `  attempts: 3 (total 4m58s)` when the step ran more than once; the duration above is the last attempt only. */
function attemptsLabel(step: StepState): string {
	if (!step.attempts || step.attempts < 2) return '';
	const lastMs =
		step.startedAt && step.completedAt
			? new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()
			: 0;
	const base = new Date(0).toISOString();
	const total = formatDuration(base, new Date((step.priorAttemptsMs ?? 0) + lastMs).toISOString());
	return `  attempts: ${step.attempts} (total ${total})`;
}

function modelOf(step: StepState): string | undefined {
	const meta = step.meta;
	return meta && 'model' in meta ? (meta as { model: string }).model : undefined;
}

export function renderExecutionDetail({ record, filePath }: ResolvedExecution, options: RenderOptions): string {
	const lines: string[] = [];
	lines.push(`Execution: ${record.executionId}`);
	lines.push(`Flow:      ${record.flowId}`);
	lines.push(`File:      ${record.flowFile}`);
	lines.push(`Status:    ${record.status}`);
	lines.push(`Started:   ${formatStarted(record.startedAt)}`);
	if (record.completedAt) lines.push(`Completed: ${formatStarted(record.completedAt)}`);
	lines.push(`Duration:  ${formatDuration(record.startedAt, record.completedAt)}`);
	// lastError is the last step failure ever seen; on a completed run it is a recovered retry, not the outcome.
	if (record.lastError) {
		lines.push(
			record.status === 'completed'
				? `Last error (recovered, run completed): ${record.lastError}`
				: `Error:     ${record.lastError}`
		);
	}
	lines.push(`Record:    ${filePath}`);
	if (record.status === 'running' || record.status === 'queued') {
		lines.push('');
		lines.push(`Note: execution is still ${record.status}; steps below are a snapshot and may change.`);
	}
	lines.push('');
	lines.push('Steps:');

	let totalCostUsd = 0;
	let hasCost = false;
	for (const [stepId, step] of Object.entries(record.steps)) {
		const name = step.injected ? `${stepId}*` : stepId;
		const model = modelOf(step);
		lines.push(
			`  ${name}  [${step.status}]  ${stepDuration(step)}${model ? `  model: ${model}` : ''}${attemptsLabel(step)}`
		);
		for (const [i, relaunch] of (step.relaunches ?? []).entries()) {
			const firstLine = relaunch.feedback.split('\n').find(l => l.trim() !== '') ?? '';
			lines.push(
				`      relaunch ${i + 1} (sub-step failed) ${formatStarted(relaunch.at)}: ${firstLine.slice(0, 160)}`
			);
		}
		if (step.error) lines.push(`      error: ${step.error}`);
		const cost = formatModelCost(step.meta);
		if (cost) lines.push(`      ${cost}`);
		if (step.meta && 'cost' in step.meta) {
			hasCost = true;
			totalCostUsd += (step.meta as { cost: { usd: number } }).cost.usd;
		}
		if (step.status === 'failed') {
			for (const [label, text] of [
				['stdout', step.stdout],
				['stderr', step.stderr],
			] as const) {
				if (!text) continue;
				lines.push(`      ${label}:`);
				lines.push(indent(options.full ? text : tailText(text, options.tail, filePath), '        '));
			}
		}
	}
	if (hasCost) {
		lines.push('');
		lines.push(`  Total cost: $${totalCostUsd.toFixed(4)}`);
	}
	if (Object.values(record.steps).some(s => s.injected)) {
		lines.push('');
		lines.push('  * = dynamically injected step');
	}
	return lines.join('\n');
}
