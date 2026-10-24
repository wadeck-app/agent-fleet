import type { ExecutionState } from '../ipc/Protocol';
import type { ExecutionTransition, ExecutionTransitionListener } from '../storage/ExecutionTransition';
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
			default: {
				const unreachable: never = transition;
				throw new Error(`Unknown execution transition: ${JSON.stringify(unreachable)}`);
			}
		}
	}

	private executionPayload(state: ExecutionState, status: EventStatus): FlowEventPayload {
		const error = status === 'failed' ? firstLineOf(state.lastError, MAX_ERROR_CHARS) : undefined;
		return {
			executionId: state.executionId,
			flowId: state.flowId,
			status,
			startedAt: state.startedAt,
			...(status === 'running' ? {} : finishedFields(state.startedAt, state.completedAt)),
			...(state.projectRoot === undefined ? {} : { projectRoot: state.projectRoot }),
			...(error === undefined ? {} : { error }),
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
			...(error === undefined ? {} : { error }),
		};
	}
}
