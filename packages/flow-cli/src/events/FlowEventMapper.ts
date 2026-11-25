import { formatStepCost, sumStepCosts, summarizeStepCost } from 'flow-core';

import type { ExecutionState, StepState } from '../ipc/Protocol';
import type { ExecutionTransition, ExecutionTransitionListener, StepDeferral } from '../storage/ExecutionTransition';
import type { FlowEventName, FlowEventPayload, FlowEventPublisher } from './FlowEventPublisher';

/** Longest error text published, ellipsis included. */
const MAX_ERROR_CHARS = 200;

type EventStatus = FlowEventPayload['status'];

/**
 * First non-empty line of `text`, trimmed and cut to `maxChars` (ellipsis included).
 * Undefined when there is nothing to show.
 */
export function firstLineOf(text: string | undefined, maxChars: number): string | undefined {
	const line = text?.split(/\r?\n/).find(candidate => candidate.trim() !== '');
	if (line === undefined) {
		return undefined;
	}
	const trimmed = line.trim();
	return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars - 3)}...`;
}

/** `completedAt` and `durationMs`, or nothing while the run has not finished. */
function finishedFields(
	startedAt: string | undefined,
	completedAt: string | null | undefined
): Pick<FlowEventPayload, 'completedAt' | 'durationMs'> {
	if (completedAt === undefined || completedAt === null) {
		return {};
	}
	const elapsed =
		startedAt === undefined ? Number.NaN : new Date(completedAt).getTime() - new Date(startedAt).getTime();
	return Number.isNaN(elapsed) ? { completedAt } : { completedAt, durationMs: Math.max(0, elapsed) };
}

/**
 * The single place that turns execution-store transitions into queue events.
 *
 * The store is the one authority on a transition: every path (worker report, lost worker, retry,
 * resume) goes through it, and it hands over the record as written, with declared secrets masked.
 * Nothing here reads step inputs or outputs, so they cannot reach the queue.
 */
export class FlowEventMapper implements ExecutionTransitionListener {
	constructor(
		private readonly publisher: FlowEventPublisher,
		/** Where a publisher failure is reported; it never reaches the run. */
		private readonly onError: (error: unknown) => void
	) {}

	onTransition(transition: ExecutionTransition): void {
		try {
			const { event, payload } = this.map(transition);
			this.publisher.publish(event, payload);
		} catch (err) {
			this.onError(err);
		}
	}

	private map(transition: ExecutionTransition): { event: FlowEventName; payload: FlowEventPayload } {
		switch (transition.kind) {
			case 'execution-started':
				return {
					event: 'flow.execution.started',
					payload: this.executionPayload(transition.state, 'running'),
				};
			case 'execution-completed':
				return {
					event: 'flow.execution.completed',
					payload: this.executionPayload(transition.state, 'completed'),
				};
			case 'execution-failed':
				return { event: 'flow.execution.failed', payload: this.executionPayload(transition.state, 'failed') };
			case 'execution-paused':
				return { event: 'flow.execution.paused', payload: this.pausedPayload(transition.state) };
			case 'execution-unpaused':
				return {
					event: 'flow.execution.resumed',
					payload: {
						...this.executionPayload(transition.state, 'running'),
						pausedAt: transition.pausedAt,
						resumedAt: transition.resumedAt,
					},
				};
			case 'step-started':
				return {
					event: 'flow.step.started',
					payload: this.stepPayload(transition.state, transition.stepId, 'running'),
				};
			case 'step-completed':
				return {
					event: 'flow.step.completed',
					payload: this.stepPayload(transition.state, transition.stepId, 'completed'),
				};
			case 'step-failed':
				return {
					event: 'flow.step.failed',
					payload: this.stepPayload(transition.state, transition.stepId, 'failed'),
				};
			case 'step-deferred':
				return {
					event: 'flow.step.deferred',
					payload: this.deferredPayload(transition.state, transition.stepId, transition.deferral),
				};
			default: {
				const unreachable: never = transition;
				throw new Error(`Unknown execution transition: ${JSON.stringify(unreachable)}`);
			}
		}
	}

	private deferredPayload(state: ExecutionState, stepId: string, deferral: StepDeferral): FlowEventPayload {
		const reason = firstLineOf(deferral.reason, MAX_ERROR_CHARS);
		const message = firstLineOf(deferral.message, MAX_ERROR_CHARS);
		return {
			executionId: state.executionId,
			flowId: state.flowId,
			stepId,
			status: 'deferred',
			// The attempt that is waiting to start: the record counts the attempts already started.
			attempt: (state.steps[stepId]?.attempts ?? 0) + 1,
			...(state.projectRoot === undefined ? {} : { projectRoot: state.projectRoot }),
			...(state.projectId === undefined ? {} : { projectId: state.projectId }),
			reason: reason ?? deferral.phase,
			...(message === undefined ? {} : { message }),
			phase: deferral.phase,
			retryAfterSeconds: deferral.retryAfterSeconds,
			...(deferral.workerSource === undefined ? {} : { workerSource: deferral.workerSource }),
		};
	}

	private pausedPayload(state: ExecutionState): FlowEventPayload {
		if (state.paused === undefined) {
			throw new Error(`Execution ${state.executionId} was announced as paused but its record has no 'paused'.`);
		}
		const reason = firstLineOf(state.paused.reason, MAX_ERROR_CHARS);
		return {
			...this.executionPayload(state, 'paused'),
			pausedAt: state.paused.since,
			...(reason === undefined ? {} : { reason }),
		};
	}

	private executionPayload(state: ExecutionState, status: EventStatus): FlowEventPayload {
		const error = status === 'failed' ? firstLineOf(state.lastError, MAX_ERROR_CHARS) : undefined;
		// Not ended: no end time, duration or run total yet.
		const live = status === 'running' || status === 'paused';
		return {
			executionId: state.executionId,
			flowId: state.flowId,
			status,
			startedAt: state.startedAt,
			...(live ? {} : finishedFields(state.startedAt, state.completedAt)),
			...(state.projectRoot === undefined ? {} : { projectRoot: state.projectRoot }),
			...(state.projectId === undefined ? {} : { projectId: state.projectId }),
			...(error === undefined ? {} : { error }),
			...(live ? {} : this.runCostFields(state)),
		};
	}

	/** Cost of the whole run, from the same step summaries `flow show` totals; nothing when no step has a model cost. */
	private runCostFields(state: ExecutionState): Partial<FlowEventPayload> {
		const total = sumStepCosts(Object.values(state.steps).map(step => summarizeStepCost(step)));
		if (formatStepCost(total) === undefined) {
			return {};
		}
		return {
			...(total.totalUsd === undefined ? {} : { totalCostUsd: total.totalUsd }),
			totalCostComplete: total.complete,
			totalCostEstimated: total.estimated === true,
		};
	}

	private stepPayload(state: ExecutionState, stepId: string, status: EventStatus): FlowEventPayload {
		const step = state.steps[stepId];
		const error = status === 'failed' ? firstLineOf(step?.error, MAX_ERROR_CHARS) : undefined;
		return {
			executionId: state.executionId,
			flowId: state.flowId,
			stepId,
			status,
			attempt: step?.attempts ?? 0,
			...(step?.startedAt === undefined ? {} : { startedAt: step.startedAt }),
			...(status === 'running' ? {} : finishedFields(step?.startedAt, step?.completedAt)),
			...(state.projectRoot === undefined ? {} : { projectRoot: state.projectRoot }),
			...(state.projectId === undefined ? {} : { projectId: state.projectId }),
			...(error === undefined ? {} : { error }),
			...(status === 'running' || step === undefined ? {} : this.attemptFields(step)),
		};
	}

	/** What the attempt that just ended cost and did, from the entry the store wrote when it settled. */
	private attemptFields(step: StepState): Partial<FlowEventPayload> {
		const summary = summarizeStepCost(step);
		if (formatStepCost(summary) === undefined) {
			return {};
		}
		const last = step.attemptLog?.at(-1);
		return {
			...(summary.lastAttemptUsd === undefined ? {} : { costUsd: summary.lastAttemptUsd }),
			...(summary.totalUsd === undefined ? {} : { stepTotalCostUsd: summary.totalUsd }),
			stepTotalCostComplete: summary.complete,
			stepTotalCostEstimated: summary.estimated === true,
			...(last?.turns === undefined ? {} : { turns: last.turns }),
			...(last?.toolCalls === undefined ? {} : { toolCalls: last.toolCalls }),
			...(last === undefined ? {} : { endReason: last.endReason }),
		};
	}
}
