import type { FlowDefinition, FlowStep } from 'flow-engine/types';

import { FlowCoreError } from '../errors.js';
import type { ExecutionState, StepState } from '../execution/ExecutionState.js';

// Which way a run went. The record only holds, per step: status, the start of its LATEST attempt, its completion,
// the attempt count and (injected steps) its dependencies. It does not hold which dependency released a step, nor
// the value of a `when`. So: what a step did is recorded; why it did not run, and which edges were followed, is
// inferred from the dependencies and the times. `basis` says which one each statement is.

/**
 * - ran: started (the step may have failed)
 * - running: started and not finished
 * - skipped: did not run because of a condition or a branch not taken
 * - not-reached: did not run because the run stopped, or a dependency did not complete
 * - waiting: not started yet, in a run that is still going (or reset to be run again)
 */
export type RunOutcome = 'ran' | 'running' | 'skipped' | 'not-reached' | 'waiting';

/** Why a step ran more than once. Inferred: the record only counts the starts. */
export type AttemptKind = 'retry' | 'loop' | 'relaunch' | 'rerun';

export interface StepRunPath {
	outcome: RunOutcome;
	/** `recorded`: read from the execution record. `inferred`: deduced from the flow definition and the times. */
	basis: 'recorded' | 'inferred';
	/** One sentence, in the words shown to the reader. */
	reason: string;
	/** 1-based position among the steps that started, by the start time of each step's latest attempt. */
	ordinal?: number;
	/** Number of starts, when the step ran more than once. */
	attempts?: number;
	attemptKind?: AttemptKind;
	/** Times the step was started again because a sub-step failed. */
	relaunchCount?: number;
}

/** The part of an edge the traversal needs; keeps this file independent of the graph model. */
export interface EdgeEnds {
	from: string;
	to: string;
	kind: 'dependency' | 'conditional' | 'loop' | 'substep' | 'sequence';
}

const MAX_CONDITION_CHARS = 80;

function startTimeOf(executionId: string, stepId: string, state: StepState): number | undefined {
	if (state.startedAt === undefined) {
		return undefined;
	}
	const time = Date.parse(state.startedAt);
	if (Number.isNaN(time)) {
		throw new FlowCoreError(
			`Execution ${executionId}: step '${stepId}' has startedAt '${state.startedAt}', which is not a date. ` +
				'The execution file is damaged; restore it or delete the run.',
			'invalid-execution-record'
		);
	}
	return time;
}

function ordinalsOf(execution: ExecutionState): Map<string, number> {
	const started = Object.entries(execution.steps)
		.map(([id, state], index) => ({ id, index, time: startTimeOf(execution.executionId, id, state) }))
		.filter((entry): entry is { id: string; index: number; time: number } => entry.time !== undefined);
	started.sort((a, b) => a.time - b.time || a.index - b.index);
	return new Map(started.map((entry, position) => [entry.id, position + 1]));
}

function conditionOf(step: FlowStep): string {
	const clean = (step.when ?? '')
		.replace(/\$\{\{|\}\}/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return clean.length > MAX_CONDITION_CHARS ? `${clean.slice(0, MAX_CONDITION_CHARS - 2)}..` : clean;
}

function attemptKindOf(step: FlowStep | undefined, state: StepState, steps: readonly FlowStep[]): AttemptKind {
	if ((state.relaunches?.length ?? 0) > 0) {
		return 'relaunch';
	}
	const inLoop = step?.onFailure?.goto !== undefined || steps.some(other => other.onFailure?.goto === step?.id);
	if (inLoop) {
		return 'loop';
	}
	return step?.retry !== undefined ? 'retry' : 'rerun';
}

/**
 * The path of one run, per step id (steps of the flow file AND steps only the record knows: injected or removed).
 * Throws FlowCoreError('invalid-execution-record') on a start time that is not a date.
 */
export function computeRunPath(flow: FlowDefinition, execution: ExecutionState): Record<string, StepRunPath> {
	const definitions = new Map(flow.steps.map(step => [step.id, step]));
	const ordinals = ordinalsOf(execution);
	const runActive = ['running', 'queued', 're-queued'].includes(execution.status);
	const resolved = new Map<string, StepRunPath>();
	const visiting = new Set<string>();

	const dependenciesOf = (id: string): string[] =>
		definitions.get(id)?.depends ?? execution.steps[id]?.dependsOn ?? [];

	const blockerOf = (id: string): string | undefined => {
		for (const dependency of dependenciesOf(id)) {
			const path = resolve(dependency);
			const state = execution.steps[dependency];
			if (path.outcome === 'ran' && state?.status === 'completed') {
				continue;
			}
			return path.outcome === 'ran' && state?.status === 'failed'
				? `'${dependency}' failed`
				: `'${dependency}' did not run`;
		}
		return undefined;
	};

	const skipCauseOf = (id: string, definition: FlowStep | undefined): string => {
		if (definition?.when !== undefined) {
			return `its condition '${conditionOf(definition)}' was not met`;
		}
		const blocker = blockerOf(id);
		return blocker === undefined
			? 'no condition is declared, so the branch it belongs to was not taken'
			: `${blocker.replace(/ did not run$/, ' was skipped')}`;
	};

	const classify = (id: string): StepRunPath => {
		const definition = definitions.get(id);
		const state: StepState = execution.steps[id] ?? { status: 'pending' };
		const ordinal = ordinals.get(id);
		const attempts = state.attempts;
		const extra: Partial<StepRunPath> = {
			...(ordinal !== undefined ? { ordinal } : {}),
			...(attempts !== undefined && attempts > 1
				? {
						attempts,
						attemptKind: attemptKindOf(definition, state, flow.steps),
						...((state.relaunches?.length ?? 0) > 0 ? { relaunchCount: state.relaunches!.length } : {}),
					}
				: {}),
		};

		if (state.status === 'running') {
			return { outcome: 'running', basis: 'recorded', reason: 'Running now.', ...extra };
		}
		if (state.status === 'failed' || (state.status === 'completed' && state.startedAt !== undefined)) {
			return { outcome: 'ran', basis: 'recorded', reason: 'Ran.', ...extra };
		}
		if (state.status === 'completed') {
			const cause = skipCauseOf(id, definition);
			return {
				outcome: 'skipped',
				basis: 'recorded',
				reason: `Skipped: the record shows it completed without ever starting. Probable cause (inferred): ${cause}.`,
				...extra,
			};
		}
		// Pending from here on.
		if (state.startedAt !== undefined) {
			return {
				outcome: 'waiting',
				basis: 'recorded',
				reason: 'Reset to run again (resume); its earlier start is kept.',
				...extra,
			};
		}
		if (runActive) {
			return { outcome: 'waiting', basis: 'recorded', reason: 'Not started yet.', ...extra };
		}
		const blocker = blockerOf(id);
		if (blocker !== undefined) {
			return { outcome: 'not-reached', basis: 'inferred', reason: `Not reached: ${blocker}.`, ...extra };
		}
		if (definition?.when !== undefined) {
			return {
				outcome: 'skipped',
				basis: 'inferred',
				reason: `Probably skipped: its condition '${conditionOf(definition)}' was not met (the record marks skipped steps only when a run completes).`,
				...extra,
			};
		}
		return {
			outcome: 'not-reached',
			basis: 'inferred',
			reason: `Not reached: the run ended (${execution.status}) before it was scheduled.`,
			...extra,
		};
	};

	function resolve(id: string): StepRunPath {
		const known = resolved.get(id);
		if (known !== undefined) {
			return known;
		}
		if (visiting.has(id)) {
			throw new FlowCoreError(
				`Step '${id}' depends on itself through a cycle of 'depends'. Remove the cycle in the flow file.`,
				'invalid-flow-graph'
			);
		}
		visiting.add(id);
		const path = classify(id);
		visiting.delete(id);
		resolved.set(id, path);
		return path;
	}

	for (const id of new Set([...flow.steps.map(step => step.id), ...Object.keys(execution.steps)])) {
		resolve(id);
	}
	return Object.fromEntries(resolved);
}

function timeOf(value: string | undefined): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	const time = Date.parse(value);
	return Number.isNaN(time) ? undefined : time;
}

/**
 * Whether the run went along this edge. Inferred, never recorded: the record does not say which dependency released
 * a step. An ordering edge counts when both steps started and the source completed before the target started; a loop
 * edge when its target ran more than once; a sub-step link (stored sub-step -> parent) when the sub-step ran; a
 * 'recorded order' edge when both ran.
 */
export function isEdgeTraversed(edge: EdgeEnds, execution: ExecutionState): boolean {
	const from = execution.steps[edge.from];
	const to = execution.steps[edge.to];
	if (edge.kind === 'substep') {
		return from?.startedAt !== undefined;
	}
	if (from?.startedAt === undefined || to === undefined) {
		return false;
	}
	if (edge.kind === 'loop') {
		return (to.attempts ?? 0) > 1;
	}
	if (to.startedAt === undefined) {
		return false;
	}
	if (edge.kind === 'sequence') {
		return true;
	}
	const finished = timeOf(from.completedAt);
	const started = timeOf(to.startedAt);
	return from.status === 'completed' && finished !== undefined && started !== undefined && finished <= started;
}
