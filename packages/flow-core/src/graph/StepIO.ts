import type { FlowDefinition, FlowStep } from 'flow-engine/types';

import type { StepIoRecord, StepState } from '../execution/ExecutionState.js';
import { formatStepCost, summarizeStepCost } from '../execution/StepCost.js';
import { stripForServing, stripIoForServing } from '../logs/ServingText.js';
import { type StepAttemptView, toStepAttemptViews } from '../view/StepAttemptViews.js';

// What a step received and produced, as far as the flow file and the execution record tell. The declaration
// (references, not whole prompts or scripts) comes from the flow file; the resolved inputs, outputs and stdout/stderr
// tails come from `StepState.io`, which records written before it existed do not have (see ExecutionState.ts).

/**
 * Longest text of a captured stdout/stderr kept; same size as the default tail of `flow show`. The cut is made AFTER
 * the terminal control is stripped and the terminal control stripped, so `totalChars` and the "last N of M characters" label count
 * the cleaned text the panel shows, not the raw capture.
 */
export const MAX_CAPPED_CHARS = 2000;
const MAX_VALUE_CHARS = 200;
const MAX_FEEDBACK_CHARS = 300;

export interface CappedText {
	text: string;
	/** True when `text` is only the end of the original. */
	truncated: boolean;
	/** Length of the original, once terminal control is stripped. */
	totalChars: number;
}

export interface DeclaredInput {
	/** `prompt`, `script`, `env.NAME`, `inputs.NAME`, `when`... */
	name: string;
	/** The value, only for short fields (env, sub-flow inputs), as written in the flow file. Never set for prompts and scripts. */
	value?: string;
	/** The `${{ ... }}` expressions found in the field, without the braces. */
	references: string[];
	/** Length of a prompt or script. */
	length?: number;
}

export interface DeclaredOutput {
	name: string;
	type: string;
	source?: string;
}

export interface StepDataLink {
	stepId: string;
	/** Output names read (`steps.X.outputs.<name>`); empty for a link through context or session. */
	outputs: string[];
	/** Where the reference sits: `prompt`, `script`, `env.NAME`, `inputs.NAME`, `when`, `context.previousOutputs`, `session.continue`. */
	fields: string[];
}

export interface RecordedStepIO {
	stdout?: CappedText;
	stderr?: CappedText;
	exitCode?: number;
	durationMs?: number;
	sessionId?: string;
	ttftMs?: number;
	tokens?: { input: number; output: number; cacheRead: number; cacheWrite: number };
	/** Cost of the whole step over all its attempts (a lower bound when `costComplete` is false); see StepCost. */
	costUsd?: number;
	/** Cost of the last attempt alone; absent when unknown. */
	lastAttemptCostUsd?: number;
	/** False when some attempt cost is unknown. Absent for a step without model cost. */
	costComplete?: boolean;
	/** Ready-to-print cost: `$0.0075`, `$2.7900+ (2 attempts unknown)`, `unknown`. */
	costLabel?: string;
	/** Settled attempts, oldest first; absent on a record without an attempt log. */
	attempts?: StepAttemptView[];
	/** Of the last attempt. */
	turns?: number;
	toolCalls?: { total: number; byTool: Record<string, number> };
	/** Files written through the provider's file tools in the last attempt; `count` is the true total when `paths` is capped. */
	filesWritten?: { paths: string[]; count: number };
	endReason?: string;
	/** One per relaunch caused by a failed sub-step, feedback shortened. */
	relaunches: { at: string; feedback: string }[];
	/** Resolved inputs, outputs and stdout/stderr tails; absent on a record written before they were recorded. */
	io?: StepIoRecord;
}

export interface StepIO {
	declaredInputs: DeclaredInput[];
	declaredOutputs: DeclaredOutput[];
	recorded: RecordedStepIO;
	usesOutputOf: StepDataLink[];
	usedBy: StepDataLink[];
	/** What the record does not hold, so the reader does not look for it. */
	notes: { inputs: string; outputs: string };
}

const NOT_RECORDED = {
	inputs: 'Resolved values not recorded for this run (older record): the references are shown as written in the flow file.',
	outputs: 'Outputs not recorded for this run (older record). Look in the logs of the run.',
};

const EXPRESSION = /\$\{\{([\s\S]*?)\}\}/g;
const TEMPLATE_BLOCK = /\$\{\{([\s\S]*?)\}\}|\{%([\s\S]*?)%\}/g;
const INPUT_REFERENCE = /(?<![\w.])inputs\.([A-Za-z0-9_-]+)/g;
const STEP_REFERENCE = /\bsteps\.([A-Za-z0-9_-]+)(?:\.outputs?\.([A-Za-z0-9_-]+))?/g;

/** Keeps the last {@link MAX_CAPPED_CHARS} characters. */
export function capText(text: string): CappedText {
	return text.length <= MAX_CAPPED_CHARS
		? { text, truncated: false, totalChars: text.length }
		: { text: text.slice(-MAX_CAPPED_CHARS), truncated: true, totalChars: text.length };
}

function cap(value: string, max: number): string {
	return value.length > max ? `${value.slice(0, max - 2)}..` : value;
}

function expressionsOf(text: string): string[] {
	return [...new Set([...text.matchAll(EXPRESSION)].map(match => match[1]!.trim()))];
}

interface TemplateField {
	name: string;
	text: string;
	/** Short fields are shown with their value; prompts and scripts are only summarised. */
	showValue: boolean;
	/** `when` is an expression as a whole, the others hold `${{ }}` expressions. */
	wholeExpression?: boolean;
}

function templateFields(step: FlowStep): TemplateField[] {
	const fields: TemplateField[] = [];
	if (step.type === 'model') {
		fields.push({ name: 'prompt', text: step.prompt, showValue: false });
	}
	if (step.type === 'script') {
		fields.push({ name: 'script', text: step.script, showValue: false });
	}
	if (step.type === 'model' || step.type === 'script') {
		for (const [key, value] of Object.entries(step.env ?? {})) {
			fields.push({ name: `env.${key}`, text: String(value), showValue: true });
		}
	}
	if (step.type === 'subflow') {
		for (const [key, value] of Object.entries(step.inputs ?? {})) {
			fields.push({ name: `inputs.${key}`, text: String(value), showValue: true });
		}
	}
	if (step.when !== undefined) {
		fields.push({ name: 'when', text: step.when, showValue: false, wholeExpression: true });
	}
	return fields;
}

function referenceTexts(field: TemplateField): string[] {
	if (field.wholeExpression) {
		const inner = expressionsOf(field.text);
		return inner.length > 0 ? inner : [field.text.trim()];
	}
	return expressionsOf(field.text);
}

function declaredInputsOf(step: FlowStep): DeclaredInput[] {
	return templateFields(step).map(field => {
		const references = referenceTexts(field);
		if (!field.showValue) {
			return {
				name: field.name,
				references,
				...(field.name === 'prompt' || field.name === 'script' ? { length: field.text.length } : {}),
			};
		}
		return { name: field.name, value: cap(field.text, MAX_VALUE_CHARS), references };
	});
}

function sourceOf(config: { pattern?: string; jsonpath?: string; from?: string }): string | undefined {
	if (config.pattern !== undefined) {
		return `pattern ${config.pattern}`;
	}
	if (config.jsonpath !== undefined) {
		return `jsonpath ${config.jsonpath}`;
	}
	return config.from !== undefined ? `from ${config.from}` : undefined;
}

function declaredOutputsOf(step: FlowStep): DeclaredOutput[] {
	const outputs: DeclaredOutput[] = [];
	for (const [name, config] of Object.entries(step.output ?? {})) {
		if (typeof config === 'string') {
			outputs.push({
				name,
				type: 'string',
				source: cap(config, MAX_VALUE_CHARS),
			});
			continue;
		}
		const source = sourceOf(config);
		outputs.push({ name, type: String(config.type), ...(source !== undefined ? { source } : {}) });
	}
	if (step.type === 'script' && step.captureOutput !== undefined && step.captureOutput !== false) {
		outputs.push({
			name: typeof step.captureOutput === 'string' ? step.captureOutput : 'stdout',
			type: 'string',
			source: 'captured stdout',
		});
	}
	return outputs;
}

/** The flow inputs a step reads (`inputs.NAME` inside `${{ }}` or `{% %}`, or in `when`), once each, in order of appearance. */
export function referencedInputNames(step: FlowStep): string[] {
	const names = new Set<string>();
	for (const field of templateFields(step)) {
		const expressions = field.wholeExpression
			? [field.text]
			: [...field.text.matchAll(TEMPLATE_BLOCK)].map(match => match[1] ?? match[2] ?? '');
		for (const expression of expressions) {
			for (const match of expression.matchAll(INPUT_REFERENCE)) {
				names.add(match[1]!);
			}
		}
	}
	return [...names];
}

/** Step total, last attempt, attempts and (per attempt, not cumulative) tokens: all from the one StepCost computation. */
function addCost(recorded: RecordedStepIO, state: StepState): void {
	const summary = summarizeStepCost(state);
	const label = formatStepCost(summary);
	if (label === undefined) {
		return;
	}
	recorded.costLabel = label;
	recorded.costComplete = summary.complete;
	if (summary.totalUsd !== undefined) {
		recorded.costUsd = summary.totalUsd;
	}
	if (summary.lastAttemptUsd !== undefined) {
		recorded.lastAttemptCostUsd = summary.lastAttemptUsd;
	}
	const attempts = toStepAttemptViews(state, summary);
	if (attempts !== undefined) {
		recorded.attempts = attempts;
		const lastTokens = attempts.at(-1)?.tokens;
		if (lastTokens !== undefined) {
			recorded.tokens = lastTokens;
		}
	}
}

function recordedOf(state: StepState | undefined): RecordedStepIO {
	const recorded: RecordedStepIO = { relaunches: [] };
	if (!state) {
		return recorded;
	}
	if (state.io !== undefined) {
		recorded.io = stripIoForServing(state.io);
	}
	if (state.stdout !== undefined) {
		recorded.stdout = capText(stripForServing(state.stdout));
	}
	if (state.stderr !== undefined) {
		recorded.stderr = capText(stripForServing(state.stderr));
	}
	const meta = state.meta as
		| {
				duration_ms?: number;
				exit_code?: number;
				session_id?: string;
				ttft_ms?: number;
				cost?: {
					input_tokens: number;
					output_tokens: number;
					cache_read_tokens: number;
					cache_write_tokens: number;
					usd: number;
				};
				turns?: number;
				tool_calls?: { total: number; by_tool: Record<string, number> };
				files_written?: string[];
				files_written_count?: number;
				end_reason?: string;
		  }
		| undefined;
	if (meta?.exit_code !== undefined) {
		recorded.exitCode = meta.exit_code;
	}
	if (meta?.duration_ms !== undefined) {
		recorded.durationMs = meta.duration_ms;
	}
	if (meta?.session_id) {
		recorded.sessionId = meta.session_id;
	}
	if (meta?.ttft_ms !== undefined) {
		recorded.ttftMs = meta.ttft_ms;
	}
	if (meta?.cost) {
		recorded.tokens = {
			input: meta.cost.input_tokens,
			output: meta.cost.output_tokens,
			cacheRead: meta.cost.cache_read_tokens,
			cacheWrite: meta.cost.cache_write_tokens,
		};
	}
	addCost(recorded, state);
	if (meta?.turns !== undefined) {
		recorded.turns = meta.turns;
	}
	if (meta?.tool_calls !== undefined) {
		recorded.toolCalls = { total: meta.tool_calls.total, byTool: meta.tool_calls.by_tool };
	}
	if (meta?.files_written !== undefined) {
		recorded.filesWritten = {
			paths: meta.files_written,
			count: meta.files_written_count ?? meta.files_written.length,
		};
	}
	if (meta?.end_reason !== undefined) {
		recorded.endReason = meta.end_reason;
	}
	recorded.relaunches = (state.relaunches ?? []).map(relaunch => ({
		at: relaunch.at,
		feedback: cap(stripForServing(relaunch.feedback), MAX_FEEDBACK_CHARS),
	}));
	return recorded;
}

/**
 * What a step declares (references of its inputs, its outputs) and what its record holds. `step` is undefined for a
 * step only the record knows (injected or removed), `state` for a definition drawn without a run. The data-flow links
 * are filled by {@link findDataLinks}; they are empty here.
 */
export function describeStepIO(step: FlowStep | undefined, state: StepState | undefined): StepIO {
	return {
		declaredInputs: step ? declaredInputsOf(step) : [],
		declaredOutputs: step ? declaredOutputsOf(step) : [],
		recorded: recordedOf(state),
		usesOutputOf: [],
		usedBy: [],
		notes: state?.io !== undefined ? { inputs: '', outputs: '' } : { ...NOT_RECORDED },
	};
}

/** Where a step reads another step: through which field, and which output names. */
function referencesOf(
	step: FlowStep,
	known: ReadonlySet<string>
): Map<string, { outputs: string[]; fields: string[] }> {
	const found = new Map<string, { outputs: string[]; fields: string[] }>();
	const add = (stepId: string, field: string, output?: string): void => {
		if (stepId === step.id || !known.has(stepId)) {
			return;
		}
		const link = found.get(stepId) ?? { outputs: [], fields: [] };
		if (output !== undefined && !link.outputs.includes(output)) {
			link.outputs.push(output);
		}
		if (!link.fields.includes(field)) {
			link.fields.push(field);
		}
		found.set(stepId, link);
	};
	for (const field of templateFields(step)) {
		for (const expression of referenceTexts(field)) {
			for (const match of expression.matchAll(STEP_REFERENCE)) {
				add(match[1]!, field.name, match[2]);
			}
		}
	}
	for (const id of step.context?.previousOutputs ?? []) {
		add(id, 'context.previousOutputs');
	}
	if (step.type === 'model' && step.session?.continue !== undefined) {
		add(step.session.continue, 'session.continue');
	}
	return found;
}

/** For each step of the flow: the steps whose output it reads (`usesOutputOf`) and the steps that read its output (`usedBy`). */
export function findDataLinks(flow: FlowDefinition): Record<string, Pick<StepIO, 'usesOutputOf' | 'usedBy'>> {
	const known = new Set(flow.steps.map(step => step.id));
	const result: Record<string, Pick<StepIO, 'usesOutputOf' | 'usedBy'>> = Object.fromEntries(
		flow.steps.map(step => [step.id, { usesOutputOf: [], usedBy: [] }])
	);
	for (const step of flow.steps) {
		for (const [sourceId, link] of referencesOf(step, known)) {
			result[step.id]!.usesOutputOf.push({ stepId: sourceId, ...link });
			result[sourceId]!.usedBy.push({ stepId: step.id, ...link });
		}
	}
	return result;
}
