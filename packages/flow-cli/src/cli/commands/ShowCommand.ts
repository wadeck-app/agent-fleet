import { ConfigDir } from '@wadeck-app/shared-cli';
import type { Command } from 'commander';
import type { FlowDefinition, FlowStep, ModelFlowStep, SubFlowStep, UserInterventionStep } from 'flow-engine/types';
import * as fs from 'node:fs';
import * as path from 'node:path';

// violations-suppress: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { loadYaml } from '../../utils/loadYaml';
import {
	DEFAULT_TAIL_CHARS,
	ExecutionLookupError,
	type ResolvedExecution,
	looksLikeExecutionId,
	renderExecutionDetail,
	resolveExecution,
} from './ExecutionDetail';

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function pad(s: string, width: number): string {
	return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

function stepType(step: FlowStep): string {
	if (step.type === 'model') return (step as ModelFlowStep).model ?? 'model';
	if (step.type === 'script') return 'script';
	if (step.type === 'subflow') return `subflow:${(step as SubFlowStep).flowId}`;
	if (step.type === 'user_intervention') {
		const s = step as UserInterventionStep;
		return s.interventionType;
	}
	throw new Error(`Unknown step type: ${(step as { type: string }).type}`);
}

function shortWhen(expr: string): string {
	// Strip template syntax and simplify to the core condition
	const clean = expr.replace(/\$\{\{|\}\}/g, '').trim();
	// Remove common "steps.X.outputs." prefix to keep it short
	const simplified = clean.replace(/steps\.[^.]+\.outputs\./g, '');
	return simplified.length > 30 ? simplified.slice(0, 28) + '..' : simplified;
}

function stepDepends(step: FlowStep, steps: FlowStep[]): string {
	if (!step.depends || step.depends.length === 0) return '-';

	const nums = step.depends.map((depId: string) => {
		const idx = steps.findIndex(s => s.id === depId) + 1;
		return idx > 0 ? String(idx) : depId;
	});

	if (!step.when) return nums.join(', ');

	// When all depends share the same condition, show it once: "1, 2: if(cond)"
	const cond = shortWhen(step.when);
	return `${nums.join(', ')}: if(${cond})`;
}

function stepOutputs(step: FlowStep): string {
	if (!step.output) return '-';
	const keys = Object.keys(step.output);
	return keys.length > 0 ? keys.join(', ') : '-';
}

function stepLoop(step: FlowStep, steps: FlowStep[]): string {
	if (!step.onFailure?.goto) return '';
	const targetIdx = steps.findIndex(s => s.id === step.onFailure!.goto) + 1;
	const target = targetIdx > 0 ? String(targetIdx) : step.onFailure.goto;
	const max = step.onFailure.maxIterations != null ? `  max:${step.onFailure.maxIterations}x` : '';
	return `  err -> ${target}${max}`;
}

function stepRetry(step: FlowStep): string {
	if (!step.retry) return '';
	return `  retry:${step.retry.maxAttempts}x`;
}

function isBlocking(step: FlowStep): boolean {
	return step.type === 'user_intervention' && (step as UserInterventionStep).blocking !== false;
}

function formatInputs(inputs: FlowDefinition['inputs']): string {
	if (!inputs || Object.keys(inputs).length === 0) return '(none)';
	return Object.entries(inputs)
		.map(([name, spec]) => {
			if (typeof spec === 'string') return `${name} (${spec})`;
			const s = spec as { type?: string; required?: boolean; default?: unknown; description?: string };
			const type = s.type ?? 'string';
			const req = s.required === false ? '' : ', required';
			const def = s.default !== undefined ? `, default: ${String(s.default)}` : '';
			return `${name} (${type}${req}${def})`;
		})
		.join('   ');
}

function formatStatus(flow: FlowDefinition): string {
	if (!flow.statusTransitions) return '';
	const ok =
		typeof flow.statusTransitions.onSuccess === 'string'
			? flow.statusTransitions.onSuccess
			: ((flow.statusTransitions.onSuccess as { task?: string }).task ?? '?');
	const fail =
		typeof flow.statusTransitions.onFailure === 'string'
			? flow.statusTransitions.onFailure
			: ((flow.statusTransitions.onFailure as { task?: string }).task ?? '?');
	return `ok -> ${ok}   fail -> ${fail}`;
}

function formatTrigger(flow: FlowDefinition): string {
	if (!flow.trigger) return '';
	if (flow.trigger.type === 'event') {
		const filter = flow.trigger.filter
			? ' ' +
				Object.entries(flow.trigger.filter)
					.map(([k, v]) => `${k}=${v}`)
					.join(', ')
			: '';
		return `trigger: event:${flow.trigger.event}${filter}`;
	}
	return '';
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

function renderFlow(flow: FlowDefinition): void {
	const steps = flow.steps;

	// --- Header ---
	console.log('');
	console.log(`${flow.id}  v${flow.version}`);
	console.log(flow.name);
	if (flow.description && flow.description !== flow.name) {
		console.log(flow.description);
	}

	const ws = flow.workspace;
	const wsParts: string[] = [ws.mode];
	if (ws.gitStrategy) wsParts.push(`git:${ws.gitStrategy}`);
	if (ws.reusePolicy) wsParts.push(`reuse:${ws.reusePolicy}`);
	console.log(`workspace: ${wsParts.join('  ')}`);
	console.log(`inputs:    ${formatInputs(flow.inputs)}`);
	const status = formatStatus(flow);
	if (status) console.log(`status:    ${status}`);
	const trigger = formatTrigger(flow);
	if (trigger) console.log(trigger);

	// --- Column widths (capped to keep output terminal-friendly) ---
	const COL_NUM = 3;
	const COL_ID = Math.min(30, Math.max(12, ...steps.map((s: FlowStep) => s.id.length + (isBlocking(s) ? 4 : 0)))) + 2;
	const COL_TYPE = Math.min(20, Math.max(10, ...steps.map((s: FlowStep) => stepType(s).length))) + 2;
	const COL_DEPENDS = Math.min(36, Math.max(7, ...steps.map((s: FlowStep) => stepDepends(s, steps).length))) + 2;
	const COL_OUTPUTS = 30;
	const TOTAL = COL_NUM + COL_ID + COL_TYPE + COL_DEPENDS + COL_OUTPUTS;

	const separator = '-'.repeat(TOTAL);

	console.log(separator);
	console.log(
		' ' + pad('#', COL_NUM) + pad('ID', COL_ID) + pad('TYPE', COL_TYPE) + pad('DEPENDS', COL_DEPENDS) + 'OUTPUTS'
	);
	console.log(separator);

	// --- Rows ---
	for (let i = 0; i < steps.length; i++) {
		const step = steps[i];
		const num = String(i + 1);
		const id = step.id + (isBlocking(step) ? ' (!)' : '');
		const type = stepType(step);
		const depends = stepDepends(step, steps);
		const outputs = stepOutputs(step);
		const loop = stepLoop(step, steps);
		const retry = stepRetry(step);

		console.log(
			' ' +
				pad(num, COL_NUM) +
				pad(id, COL_ID) +
				pad(type, COL_TYPE) +
				pad(depends, COL_DEPENDS) +
				outputs +
				loop +
				retry
		);
	}

	console.log(separator);

	// --- Footer summary ---
	const counts: Record<string, number> = {};
	for (const step of steps) {
		const t = step.type === 'model' ? ((step as ModelFlowStep).model ?? 'model') : step.type;
		counts[t] = (counts[t] ?? 0) + 1;
	}
	const summary = Object.entries(counts)
		.map(([t, n]) => `${n} ${t}`)
		.join('   ');
	console.log(`  ${steps.length} steps:  ${summary}`);
	console.log('');
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/** Default location of execution records, resolved lazily so ConfigDir is read at run time. */
function defaultExecutionsDir(): string {
	return path.join(ConfigDir.get('flow'), 'executions');
}

function isExistingFile(target: string): boolean {
	try {
		return fs.statSync(target).isFile();
	} catch {
		return false;
	}
}

function showFlowFile(file: string, opts: { json?: boolean }): void {
	const raw = loadYaml(file);

	const flow = raw as FlowDefinition;
	if (!Array.isArray(flow.steps) || !flow.workspace) {
		console.error(`Invalid flow: missing required fields 'steps' or 'workspace' in ${file}`);
		process.exit(1);
	}

	if (opts.json) {
		process.stdout.write(JSON.stringify(flow) + '\n');
		return;
	}

	renderFlow(flow);
}

function showExecution(
	target: string,
	executionsDir: string,
	opts: { json?: boolean; tail?: number; full?: boolean }
): void {
	const tail = opts.tail ?? DEFAULT_TAIL_CHARS;
	if (!Number.isInteger(tail) || tail < 0) {
		console.error(`Invalid --tail value: expected a non-negative integer (number of characters).`);
		process.exit(1);
	}
	let resolved: ResolvedExecution;
	try {
		resolved = resolveExecution(executionsDir, target);
	} catch (err) {
		if (!(err instanceof ExecutionLookupError)) throw err;
		console.error(err.message);
		if (err.kind === 'not-found') {
			console.error(
				`'${target}' is also not an existing flow file (cwd: ${process.cwd()}).\n` +
					'  List execution ids with: flow history'
			);
		}
		process.exit(1);
	}
	if (opts.json) {
		// Raw record, untruncated (same convention as `flow history --json`).
		process.stdout.write(JSON.stringify(resolved.record) + '\n');
		return;
	}
	console.log(renderExecutionDetail(resolved, { tail, full: opts.full === true }));
}
export function registerShowCommand(program: Command, getExecutionsDir: () => string = defaultExecutionsDir): void {
	program
		.command('show <target>')
		.description(
			'Display a flow YAML file summary, or the steps of a past execution\n' +
				'  <target>       Path to a .yaml file, or an execution id (or unique prefix) from `flow history`\n' +
				'                 An existing file always wins; otherwise <target> is treated as an execution id\n' +
				'  --json         Machine-readable output (execution: raw record, untruncated)\n' +
				`  --tail <n>     Execution only: trailing chars of stdout/stderr of failed steps (default: ${DEFAULT_TAIL_CHARS})\n` +
				'  --full         Execution only: print stdout/stderr of failed steps untruncated'
		)
		.option('--json', 'Machine-readable JSON output')
		.option('--tail <n>', 'Execution only: trailing characters of stdout/stderr shown for failed steps', v =>
			Number(v)
		)
		.option('--full', 'Execution only: do not truncate stdout/stderr of failed steps')
		.action((target: string, opts: { json?: boolean; tail?: number; full?: boolean }) => {
			if (isExistingFile(target)) {
				showFlowFile(target, opts);
				return;
			}
			if (looksLikeExecutionId(target)) {
				showExecution(target, getExecutionsDir(), opts);
				return;
			}
			console.error(
				`'${target}' is neither an existing flow file nor an execution id.\n` +
					`  As a file:       no such file (cwd: ${process.cwd()})\n` +
					'  As an execution: not a valid id (lowercase letters/digits, e.g. a6wug7bh)\n' +
					'  List execution ids with: flow history'
			);
			process.exit(1);
		});
}
