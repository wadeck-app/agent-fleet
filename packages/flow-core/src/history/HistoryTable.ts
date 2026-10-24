import { versionColumnOf, versionDetailLineOf } from '../definitions/RecordedVersion.js';
import type { ExecutionState } from '../execution/ExecutionState.js';
import { type ExecutionFilterOptions, filterExecutions } from './ExecutionFilter.js';
import { formatDuration, formatModelCost, formatStarted, padTruncate } from './ExecutionFormat.js';

function indentBlock(text: string): string {
	return text
		.split('\n')
		.map(line => `    ${line}`)
		.join('\n');
}

/** Step-by-step view of one execution (the `flow history --id` output). */
export function renderDetailView(exec: ExecutionState): string {
	const lines: string[] = [];
	lines.push(`Execution: ${exec.executionId}`);
	lines.push(`Flow:      ${exec.flowId}`);
	lines.push(`Version:   ${versionDetailLineOf(exec)}`);
	lines.push(`File:      ${exec.flowFile}`);
	lines.push(`Status:    ${exec.status}`);
	lines.push(`Started:   ${formatStarted(exec.startedAt)}`);
	if (exec.completedAt) {
		lines.push(`Completed: ${formatStarted(exec.completedAt)}`);
	}
	lines.push(`Duration:  ${formatDuration(exec.startedAt, exec.completedAt)}`);
	lines.push('');
	lines.push('Steps:');

	const COL_STEP = 32;
	const COL_STATUS = 12;
	const COL_DURATION = 12;
	lines.push('  ' + padTruncate('STEP', COL_STEP) + padTruncate('STATUS', COL_STATUS) + 'DURATION');
	lines.push('  ' + '-'.repeat(COL_STEP + COL_STATUS + COL_DURATION));

	let hasInjectedStep = false;
	let totalCostUsd = 0;
	let hasCost = false;
	for (const [stepId, step] of Object.entries(exec.steps)) {
		if (step.injected) {
			hasInjectedStep = true;
		}
		const name = step.injected ? `${stepId}*` : stepId;
		const dur = step.startedAt ? formatDuration(step.startedAt, step.completedAt ?? null) : '-';
		lines.push('  ' + padTruncate(name, COL_STEP) + padTruncate(step.status, COL_STATUS) + dur);
		const costLine = formatModelCost(step.meta);
		if (costLine) {
			lines.push('      ' + costLine);
		}
		if (step.meta && 'cost' in step.meta) {
			hasCost = true;
			totalCostUsd += (step.meta as { cost: { usd: number } }).cost.usd;
		}
	}

	if (hasCost) {
		lines.push('');
		lines.push(`  Total cost: $${totalCostUsd.toFixed(4)}`);
	}

	if (hasInjectedStep) {
		lines.push('');
		lines.push('  * = dynamically injected step');
	}

	const failedSteps = Object.entries(exec.steps).filter(([, step]) => step.status === 'failed');
	for (const [stepId, step] of failedSteps) {
		if (!step.error && !step.stdout && !step.stderr) {
			continue;
		}
		lines.push('');
		lines.push(`Step '${stepId}' failed:`);
		if (step.error) {
			lines.push(`  Error:  ${step.error}`);
		}
		if (step.stdout) {
			lines.push('  Stdout:');
			lines.push(indentBlock(step.stdout));
		}
		if (step.stderr) {
			lines.push('  Stderr:');
			lines.push(indentBlock(step.stderr));
		}
	}

	return lines.join('\n');
}

/** The text `flow history` prints: a paginated table, or the detail view when `opts.id` is set. */
export function buildHistoryTable(execs: ExecutionState[], opts: ExecutionFilterOptions): string {
	const { items, total } = filterExecutions(execs, opts);

	if (opts.id) {
		if (items.length > 1) {
			return `Ambiguous execution ID prefix "${opts.id}" -- matches: ${items.map(e => e.executionId).join(', ')}`;
		}
		const exec = items[0];
		if (!exec) {
			return `Execution '${opts.id}' not found.`;
		}
		return renderDetailView(exec);
	}

	const limit = opts.limit ?? 20;
	const offset = opts.offset ?? 0;
	if (items.length === 0) {
		return offset > 0 ? `No more executions (showing ${offset}+).` : 'No executions found.';
	}

	const COL_ID = 12;
	const COL_FLOW = 32;
	const COL_VERSION = 12;
	const COL_STATUS = 12;
	const COL_STARTED = 22;
	const lines: string[] = [];
	lines.push(
		padTruncate('EXECUTION', COL_ID) +
			padTruncate('FLOW', COL_FLOW) +
			padTruncate('VERSION', COL_VERSION) +
			padTruncate('STATUS', COL_STATUS) +
			padTruncate('STARTED', COL_STARTED) +
			'DURATION'
	);
	lines.push('-'.repeat(COL_ID + COL_FLOW + COL_VERSION + COL_STATUS + COL_STARTED + 12));

	for (const e of items) {
		lines.push(
			padTruncate(e.executionId, COL_ID) +
				padTruncate(e.flowId, COL_FLOW) +
				padTruncate(versionColumnOf(e), COL_VERSION) +
				padTruncate(e.status, COL_STATUS) +
				padTruncate(formatStarted(e.startedAt), COL_STARTED) +
				formatDuration(e.startedAt, e.completedAt)
		);
	}

	// Pagination footer
	if (total > offset + limit) {
		lines.push(
			`\n  Showing ${offset + 1}-${offset + items.length} of ${total}. Use --offset ${offset + limit} for next page.`
		);
	} else if (offset > 0) {
		lines.push(`\n  Showing ${offset + 1}-${offset + items.length} of ${total}.`);
	}

	return lines.join('\n');
}
