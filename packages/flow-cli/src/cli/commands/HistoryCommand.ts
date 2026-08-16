import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface StepStateRecord {
	status: string;
	startedAt?: string;
	completedAt?: string;
	injected?: boolean;
}

export interface ExecutionRecord {
	executionId: string;
	flowFile: string;
	flowId: string;
	status: string;
	startedAt: string;
	completedAt: string | null;
	steps: Record<string, StepStateRecord>;
}

export interface HistoryOptions {
	limit?: number;
	offset?: number;
	status?: string;
	flow?: string;
	id?: string;
}

export function loadExecutions(dir: string): ExecutionRecord[] {
	if (!fs.existsSync(dir)) return [];
	const results: ExecutionRecord[] = [];
	for (const file of fs.readdirSync(dir)) {
		if (!file.endsWith('.json')) continue;
		try {
			const raw = fs.readFileSync(path.join(dir, file), 'utf8');
			const rec = JSON.parse(raw) as ExecutionRecord;
			if (rec.executionId) results.push(rec);
		} catch {
			// skip malformed
		}
	}
	results.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
	return results;
}

function pad(s: string, width: number): string {
	return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
}

function formatDuration(startedAt: string, completedAt: string | null): string {
	if (!completedAt) return 'running';
	const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
}

function formatStarted(iso: string): string {
	return iso.replace('T', ' ').slice(0, 19);
}

function renderDetailView(exec: ExecutionRecord): string {
	const lines: string[] = [];
	lines.push(`Execution: ${exec.executionId}`);
	lines.push(`Flow:      ${exec.flowId}`);
	lines.push(`File:      ${exec.flowFile}`);
	lines.push(`Status:    ${exec.status}`);
	lines.push(`Started:   ${formatStarted(exec.startedAt)}`);
	if (exec.completedAt) lines.push(`Completed: ${formatStarted(exec.completedAt)}`);
	lines.push(`Duration:  ${formatDuration(exec.startedAt, exec.completedAt)}`);
	lines.push('');
	lines.push('Steps:');

	const COL_STEP = 32;
	const COL_STATUS = 12;
	const COL_DURATION = 12;
	const header = '  ' + pad('STEP', COL_STEP) + pad('STATUS', COL_STATUS) + 'DURATION';
	const sep = '  ' + '-'.repeat(COL_STEP + COL_STATUS + COL_DURATION);
	lines.push(header);
	lines.push(sep);

	for (const [stepId, step] of Object.entries(exec.steps)) {
		const name = step.injected ? `${stepId}*` : stepId;
		const dur = step.startedAt ? formatDuration(step.startedAt, step.completedAt ?? null) : '-';
		lines.push('  ' + pad(name, COL_STEP) + pad(step.status, COL_STATUS) + dur);
	}

	lines.push('');
	lines.push('  * = dynamically injected step');
	return lines.join('\n');
}

export function buildHistoryTable(execs: ExecutionRecord[], opts: HistoryOptions): string {
	// Detail view
	if (opts.id) {
		// Prefix matching: "6u84" matches "6u84r8gf" — lenient like task ID resolution
		const matches = execs.filter(e => e.executionId.startsWith(opts.id!));
		if (matches.length > 1) {
			return `Ambiguous execution ID prefix "${opts.id}" — matches: ${matches.map(e => e.executionId).join(', ')}`;
		}
		const exec = matches[0];
		if (!exec) return `Execution '${opts.id}' not found.`;
		return renderDetailView(exec);
	}

	// List view — apply filters
	let filtered = execs;
	if (opts.status) filtered = filtered.filter(e => e.status === opts.status);
	if (opts.flow) filtered = filtered.filter(e => e.flowId === opts.flow);
	const limit = opts.limit ?? 20;
	const offset = opts.offset ?? 0;
	const total = filtered.length;
	filtered = filtered.slice(offset, offset + limit);

	if (filtered.length === 0) return offset > 0 ? `No more executions (showing ${offset}+).` : 'No executions found.';

	const COL_ID = 12;
	const COL_FLOW = 32;
	const COL_STATUS = 12;
	const COL_STARTED = 22;
	const lines: string[] = [];
	lines.push(
		pad('EXECUTION', COL_ID) +
			pad('FLOW', COL_FLOW) +
			pad('STATUS', COL_STATUS) +
			pad('STARTED', COL_STARTED) +
			'DURATION'
	);
	lines.push('-'.repeat(COL_ID + COL_FLOW + COL_STATUS + COL_STARTED + 12));

	for (const e of filtered) {
		lines.push(
			pad(e.executionId, COL_ID) +
				pad(e.flowId, COL_FLOW) +
				pad(e.status, COL_STATUS) +
				pad(formatStarted(e.startedAt), COL_STARTED) +
				formatDuration(e.startedAt, e.completedAt)
		);
	}

	// Pagination footer
	if (total > offset + limit) {
		lines.push(
			`\n  Showing ${offset + 1}–${offset + filtered.length} of ${total}. Use --offset ${offset + limit} for next page.`
		);
	} else if (offset > 0) {
		lines.push(`\n  Showing ${offset + 1}–${offset + filtered.length} of ${total}.`);
	}

	return lines.join('\n');
}

export function registerHistoryCommand(program: Command): void {
	program
		.command('history')
		.description('List past flow executions')
		.option('-n, --limit <n>', 'Max number of executions to show (default: 20)', parseInt)
		.option('--offset <n>', 'Skip first N executions (for pagination)', parseInt)
		.option('--status <status>', 'Filter by status (completed|failed|running|queued)')
		.option('--flow <flowId>', 'Filter by flow ID')
		.option('--id <executionId>', 'Show detail for a specific execution (steps + injected* markers)')
		.action((opts: { limit?: number; offset?: number; status?: string; flow?: string; id?: string }) => {
			const daemonDir = path.join(os.homedir(), '.flow-daemon');
			const executionsDir = path.join(daemonDir, 'executions');
			const execs = loadExecutions(executionsDir);
			console.log(buildHistoryTable(execs, opts));
		});
}
