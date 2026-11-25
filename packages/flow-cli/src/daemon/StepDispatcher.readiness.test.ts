import type { FlowScheduler } from 'flow-engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import { WORKER_FEATURE_READINESS } from '../ipc/Protocol';
import type { AssignableStep, ExecutionContext } from '../ipc/Protocol';
import { BoundStepWait } from './BoundStepWait.js';
import { ExecutionRegistry } from './ExecutionRegistry.js';
import { ReadyStepQueue } from './ReadyStepQueue.js';
import { StepDispatcher } from './StepDispatcher.js';
import type { ReadinessSettings } from './WorkerReadiness.js';
import type { RegisteredWorker } from './WorkerRegistry.js';

const SETTINGS: ReadinessSettings = { ackMs: 3_000, answerMs: 60_000, notReadyMaxWaitMs: 900_000 };

interface TestWorker {
	ws: WebSocket;
	worker: RegisteredWorker;
}

function workerOf(workerId: string, features: string[]): TestWorker {
	return {
		ws: { workerId } as unknown as WebSocket,
		worker: {
			state: 'idle',
			workerId,
			pid: 1,
			labels: [],
			attachedProjects: [],
			attachedProjectIds: [],
			hasUserInterface: false,
			ephemeral: true,
			shellCapabilities: [],
			features,
			sourceId: `source-${workerId}`,
		} as RegisteredWorker,
	};
}

const askable = (workerId: string): TestWorker => workerOf(workerId, [WORKER_FEATURE_READINESS]);

function build(settings: ReadinessSettings = SETTINGS) {
	const workers: TestWorker[] = [];
	const sent: { workerId: string; message: Record<string, unknown> }[] = [];
	const registry = {
		listIdle: () => workers.filter(entry => entry.worker.state === 'idle'),
		listConnected: () => workers.map(entry => entry.worker),
		listConnections: () => workers,
		summarize: () => [],
		describe: (ws: WebSocket) => workers.find(entry => entry.ws === ws)?.worker,
		markBusy: (ws: WebSocket) => {
			workers.find(entry => entry.ws === ws)!.worker.state = 'busy';
		},
		remove: vi.fn(),
		send: vi.fn((ws: WebSocket, message: Record<string, unknown>) => {
			sent.push({ workerId: (ws as unknown as { workerId: string }).workerId, message });
			return true;
		}),
	};
	const queue = new ReadyStepQueue();
	const executions = new ExecutionRegistry();
	const scheduler = {
		getSubStepErrors: () => [],
		getSubSteps: () => undefined,
		getSubStepRelaunchFeedback: () => undefined,
		acknowledge: vi.fn(),
		getRetryCount: () => 0,
	} as unknown as FlowScheduler;
	const contexts = new Map<string, ExecutionContext>();
	for (const id of ['run-1', 'run-2']) {
		const context = { executionId: id } as ExecutionContext;
		contexts.set(id, context);
		executions.start(id, scheduler, context, []);
	}
	const failed: { stepId: string; reason: string }[] = [];
	const deferred = vi.fn();
	const logged: string[] = [];
	const dispatcher = new StepDispatcher(
		registry as never,
		queue,
		executions,
		{ issue: () => 'a1', watchHandedOver: vi.fn() } as never,
		{ cover: vi.fn() } as never,
		{ valuesForStep: () => undefined, masks: { mask: (_id: string, text: string) => text } } as never,
		{ markStepRunning: vi.fn(), notifyStepDeferred: deferred } as never,
		{ dispatch: vi.fn() } as never,
		{ writeExecution: (_id: string, line: string) => logged.push(line) } as never,
		{ decide: () => ({ action: 'wait' }) },
		(_executionId, stepId, reason) => failed.push({ stepId, reason }),
		{
			workerTypes: { requirementOnlyLookup: () => () => false },
			wait: new BoundStepWait(),
			contactErrors: { sinceFor: () => () => [] },
			readiness: settings,
		}
	);
	const enqueue = (executionId: string, stepId: string, config: Record<string, unknown> = { type: 'script' }) =>
		queue.unshift({
			stepId,
			stepConfig: { id: stepId, ...config } as unknown as AssignableStep,
			executionContext: contexts.get(executionId)!,
		});
	const requestsTo = (w: TestWorker) =>
		sent.filter(entry => entry.workerId === w.worker.workerId && entry.message['type'] === 'readiness_request');
	const assignsTo = (w: TestWorker) =>
		sent.filter(entry => entry.workerId === w.worker.workerId && entry.message['type'] === 'assign');
	const lastRequestId = (w: TestWorker) => String(requestsTo(w).at(-1)!.message['requestId']);
	return {
		dispatcher,
		enqueue,
		workers,
		sent,
		failed,
		deferred,
		logged,
		queue,
		requestsTo,
		assignsTo,
		lastRequestId,
	};
}

const notReady = (reason: string, retryAfter: number) => ({
	result: 'not_ready',
	reason,
	message: `${reason} message`,
	retryAfter,
});

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('StepDispatcher - worker readiness', () => {
	it('never asks a worker that does not declare readiness: assigned at once', () => {
		const { dispatcher, enqueue, workers, sent } = build();
		const plain = workerOf('plain', []);
		workers.push(plain);
		enqueue('run-1', 's1');

		dispatcher.tryDispatch();

		expect(sent.map(entry => entry.message['type'])).toEqual(['assign']);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('asks a worker that declares it, with correlation id, execution, step and the model tool; assigns once after ack + ready', () => {
		const { dispatcher, enqueue, workers, requestsTo, assignsTo, lastRequestId, queue } = build();
		const w1 = askable('w1');
		workers.push(w1);
		enqueue('run-1', 's1', { type: 'model', provider: 'codex' });

		dispatcher.tryDispatch();

		expect(requestsTo(w1)).toHaveLength(1);
		expect(requestsTo(w1)[0]!.message).toMatchObject({
			type: 'readiness_request',
			executionId: 'run-1',
			stepId: 's1',
			tool: 'codex',
		});
		expect(typeof requestsTo(w1)[0]!.message['requestId']).toBe('string');
		expect(assignsTo(w1)).toHaveLength(0);
		expect(queue.length).toBe(1);

		expect(dispatcher.onReadinessAlive(w1.ws, lastRequestId(w1))).toBe('accepted');
		expect(dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), { result: 'ready' })).toBe('accepted');

		expect(assignsTo(w1)).toHaveLength(1);
		expect(queue.length).toBe(0);
		// The ask is over and nothing is left armed.
		expect(vi.getTimerCount()).toBe(0);
		dispatcher.tryDispatch();
		expect(assignsTo(w1)).toHaveLength(1);
	});

	it('omits the tool for a script step and defaults a model step without provider to claude', () => {
		const { dispatcher, enqueue, workers, requestsTo, lastRequestId } = build();
		const w1 = askable('w1');
		workers.push(w1);
		enqueue('run-1', 'script-step');
		dispatcher.tryDispatch();
		expect(requestsTo(w1)[0]!.message).not.toHaveProperty('tool');
		dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), { result: 'ready' });

		w1.worker.state = 'idle';
		enqueue('run-1', 'model-step', { type: 'model' });
		dispatcher.tryDispatch();
		expect(requestsTo(w1)[1]!.message).toMatchObject({ stepId: 'model-step', tool: 'claude' });
	});

	it('accepts a result without ack while the ack deadline runs', () => {
		const { dispatcher, enqueue, workers, assignsTo, lastRequestId } = build();
		const w1 = askable('w1');
		workers.push(w1);
		enqueue('run-1', 's1');
		dispatcher.tryDispatch();

		vi.advanceTimersByTime(2_999);
		dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), { result: 'ready' });

		expect(assignsTo(w1)).toHaveLength(1);
	});

	describe('not_ready from the worker (phase worker)', () => {
		it('keeps the step queued, publishes one event, logs once, asks again after retryAfter, then assigns', () => {
			const { dispatcher, enqueue, workers, requestsTo, assignsTo, lastRequestId, deferred, logged, queue } =
				build();
			const w1 = askable('w1');
			workers.push(w1);
			enqueue('run-1', 's1');
			dispatcher.tryDispatch();

			dispatcher.onReadinessAlive(w1.ws, lastRequestId(w1));
			dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), notReady('sso-expired', 30));

			expect(queue.length).toBe(1);
			expect(assignsTo(w1)).toHaveLength(0);
			expect(deferred).toHaveBeenCalledTimes(1);
			expect(deferred).toHaveBeenCalledWith('run-1', 's1', {
				reason: 'sso-expired',
				message: 'sso-expired message',
				phase: 'worker',
				retryAfterSeconds: 30,
				workerSource: 'source-w1',
			});
			expect(logged.filter(line => line.includes('stays queued'))).toHaveLength(1);
			expect(logged[0]).toContain('worker.notReadyMaxWaitSeconds');

			// Before the retry time: passes do not ask again.
			dispatcher.tryDispatch();
			vi.advanceTimersByTime(29_000);
			dispatcher.tryDispatch();
			expect(requestsTo(w1)).toHaveLength(1);

			// At the retry time the timer itself runs the pass and the worker is asked again.
			vi.advanceTimersByTime(1_000);
			expect(requestsTo(w1)).toHaveLength(2);
			dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), { result: 'ready' });

			expect(assignsTo(w1)).toHaveLength(1);
			expect(queue.length).toBe(0);
			// Still one single event: the step was deferred once, with one reason.
			expect(deferred).toHaveBeenCalledTimes(1);
			expect(vi.getTimerCount()).toBe(0);
		});

		it('publishes again only when the reason changes', () => {
			const { dispatcher, enqueue, workers, lastRequestId, deferred } = build();
			const w1 = askable('w1');
			workers.push(w1);
			enqueue('run-1', 's1');
			dispatcher.tryDispatch();
			dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), notReady('sso-expired', 10));

			vi.advanceTimersByTime(10_000);
			dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), notReady('sso-expired', 10));
			expect(deferred).toHaveBeenCalledTimes(1);

			vi.advanceTimersByTime(10_000);
			dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), notReady('disk-full', 10));
			expect(deferred).toHaveBeenCalledTimes(2);
			expect(deferred.mock.calls[1]![2]).toMatchObject({ reason: 'disk-full' });
		});

		it('raises a retryAfter under 5 s to 5 s and caps a huge one at the bounded wait', () => {
			const { dispatcher, enqueue, workers, requestsTo, lastRequestId, deferred } = build({
				...SETTINGS,
				notReadyMaxWaitMs: 60_000,
			});
			const w1 = askable('w1');
			workers.push(w1);
			enqueue('run-1', 's1');
			dispatcher.tryDispatch();
			dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), notReady('a', 1));
			expect(deferred.mock.calls[0]![2]).toMatchObject({ retryAfterSeconds: 5 });
			vi.advanceTimersByTime(4_999);
			expect(requestsTo(w1)).toHaveLength(1);
			vi.advanceTimersByTime(1);
			expect(requestsTo(w1)).toHaveLength(2);

			dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), notReady('b', 100_000));
			expect(deferred.mock.calls[1]![2]).toMatchObject({ retryAfterSeconds: 60 });
		});

		it('treats a malformed answer as not ready, never as ready', () => {
			const { dispatcher, enqueue, workers, assignsTo, lastRequestId, deferred } = build();
			const w1 = askable('w1');
			workers.push(w1);
			enqueue('run-1', 's1');
			dispatcher.tryDispatch();

			dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), { result: 'maybe' });

			expect(assignsTo(w1)).toHaveLength(0);
			expect(deferred.mock.calls[0]![2]).toMatchObject({ reason: 'invalid-readiness-answer', phase: 'worker' });
		});
	});

	describe('deadlines of the question', () => {
		it('no ack within worker.readinessAckSeconds: not ready, reason worker-unresponsive, phase ack', () => {
			const { dispatcher, enqueue, workers, assignsTo, deferred, queue } = build();
			const w1 = askable('w1');
			workers.push(w1);
			enqueue('run-1', 's1');
			dispatcher.tryDispatch();

			vi.advanceTimersByTime(3_000);

			expect(assignsTo(w1)).toHaveLength(0);
			expect(queue.length).toBe(1);
			expect(deferred).toHaveBeenCalledWith(
				'run-1',
				's1',
				expect.objectContaining({
					reason: 'worker-unresponsive',
					phase: 'ack',
					message: 'the worker did not acknowledge the readiness question within 3s',
				})
			);
		});

		it('ack then no answer within worker.readinessAnswerSeconds: not ready, reason no-readiness-answer-in-time, phase answer', () => {
			const { dispatcher, enqueue, workers, assignsTo, deferred, lastRequestId } = build();
			const w1 = askable('w1');
			workers.push(w1);
			enqueue('run-1', 's1');
			dispatcher.tryDispatch();
			dispatcher.onReadinessAlive(w1.ws, lastRequestId(w1));

			// The ack deadline no longer applies once acknowledged.
			vi.advanceTimersByTime(59_999);
			expect(deferred).not.toHaveBeenCalled();
			vi.advanceTimersByTime(1);

			expect(assignsTo(w1)).toHaveLength(0);
			expect(deferred).toHaveBeenCalledWith(
				'run-1',
				's1',
				expect.objectContaining({
					reason: 'no-readiness-answer-in-time',
					phase: 'answer',
					message: 'the worker acknowledged but gave no readiness answer within 60s',
				})
			);
		});

		it('ignores a late result (after the ack deadline, after the answer deadline) and never assigns on it', () => {
			const { dispatcher, enqueue, workers, assignsTo, lastRequestId } = build();
			const w1 = askable('w1');
			workers.push(w1);
			enqueue('run-1', 's1');
			dispatcher.tryDispatch();
			const firstRequest = lastRequestId(w1);

			vi.advanceTimersByTime(3_000);
			expect(dispatcher.onReadinessAnswer(w1.ws, firstRequest, { result: 'ready' })).toBe('ignored');
			expect(dispatcher.onReadinessAlive(w1.ws, firstRequest)).toBe('ignored');
			expect(assignsTo(w1)).toHaveLength(0);

			// After the retry time it is asked again, acknowledges, and lets the answer deadline pass.
			vi.advanceTimersByTime(30_000);
			const secondRequest = lastRequestId(w1);
			expect(secondRequest).not.toBe(firstRequest);
			dispatcher.onReadinessAlive(w1.ws, secondRequest);
			vi.advanceTimersByTime(60_000);
			expect(dispatcher.onReadinessAnswer(w1.ws, secondRequest, { result: 'ready' })).toBe('ignored');
			expect(assignsTo(w1)).toHaveLength(0);
		});

		it('refuses an answer for another worker question', () => {
			const { dispatcher, enqueue, workers, assignsTo, lastRequestId } = build();
			const w1 = askable('w1');
			const w2 = askable('w2');
			workers.push(w1, w2);
			enqueue('run-1', 's1');
			dispatcher.tryDispatch();
			const request = lastRequestId(w1);

			expect(dispatcher.onReadinessAnswer(w2.ws, request, { result: 'ready' })).toBe('ignored');

			expect(assignsTo(w1)).toHaveLength(0);
			expect(assignsTo(w2)).toHaveLength(0);
		});
	});

	describe('bounded wait of a step kept queued (worker.notReadyMaxWaitSeconds)', () => {
		it('fails the step with the last reason, the worker and the config key', () => {
			const { dispatcher, enqueue, workers, failed, lastRequestId, queue } = build({
				...SETTINGS,
				notReadyMaxWaitMs: 60_000,
			});
			const w1 = askable('w1');
			workers.push(w1);
			enqueue('run-1', 's1');
			dispatcher.tryDispatch();
			dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), notReady('sso-expired', 20));

			vi.advanceTimersByTime(20_000);
			dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), notReady('sso-expired', 20));
			vi.advanceTimersByTime(20_000);
			dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), notReady('sso-expired', 20));
			expect(failed).toEqual([]);

			// The timer of the bound runs the pass that fails the step: nobody has to call tryDispatch.
			vi.advanceTimersByTime(20_000);

			expect(failed).toHaveLength(1);
			expect(failed[0]!.stepId).toBe('s1');
			expect(failed[0]!.reason).toContain('worker w1');
			expect(failed[0]!.reason).toContain('sso-expired -- sso-expired message');
			expect(failed[0]!.reason).toContain('worker.notReadyMaxWaitSeconds = 60s');
			expect(failed[0]!.reason).toContain('the worker said not ready');
			expect(queue.length).toBe(0);
			expect(vi.getTimerCount()).toBe(0);
		});

		it('names the alive-ack timer when the last reason is an unresponsive worker', () => {
			const { dispatcher, enqueue, workers, failed } = build({ ...SETTINGS, notReadyMaxWaitMs: 40_000 });
			workers.push(askable('w1'));
			enqueue('run-1', 's1');
			dispatcher.tryDispatch();

			// Ack deadline (3 s, the bound starts here), retry after 30 s, ack deadline again, then the bound (40 s after the first deferral) is over.
			vi.advanceTimersByTime(3_000);
			vi.advanceTimersByTime(30_000);
			vi.advanceTimersByTime(10_000);

			expect(failed).toHaveLength(1);
			expect(failed[0]!.reason).toContain('worker-unresponsive');
			expect(failed[0]!.reason).toContain('worker.readinessAckSeconds = 3s');
			expect(failed[0]!.reason).toContain('worker.notReadyMaxWaitSeconds = 40s');
		});
	});

	describe('several workers and steps', () => {
		it('skips a not-ready worker for the step: another ready worker takes it at once', () => {
			const { dispatcher, enqueue, workers, assignsTo, lastRequestId } = build();
			const w1 = askable('w1');
			workers.push(w1);
			enqueue('run-1', 's1');
			dispatcher.tryDispatch();
			dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), notReady('sso-expired', 30));

			const w2 = workerOf('w2', []);
			workers.push(w2);
			dispatcher.tryDispatch();

			expect(assignsTo(w2)).toHaveLength(1);
			expect(assignsTo(w1)).toHaveLength(0);
			expect(vi.getTimerCount()).toBe(0);
		});

		it('does not block a second step behind a worker being asked: the other idle worker takes it', () => {
			const { dispatcher, enqueue, workers, assignsTo, requestsTo } = build();
			const w1 = askable('w1');
			const w2 = workerOf('w2', []);
			workers.push(w1, w2);
			enqueue('run-1', 'second');
			enqueue('run-1', 'first');

			dispatcher.tryDispatch();

			// first -> w1 (asked, reserved); second -> w2 (plain, assigned).
			expect(requestsTo(w1)).toHaveLength(1);
			expect(requestsTo(w1)[0]!.message['stepId']).toBe('first');
			expect(assignsTo(w2).map(entry => entry.message['stepId'])).toEqual(['second']);
		});

		it('reserves the asked worker: a second step is not handed to it nor asked on it', () => {
			const { dispatcher, enqueue, workers, requestsTo, assignsTo, queue } = build();
			const w1 = askable('w1');
			workers.push(w1);
			enqueue('run-1', 'second');
			enqueue('run-1', 'first');

			dispatcher.tryDispatch();
			dispatcher.tryDispatch();

			expect(requestsTo(w1)).toHaveLength(1);
			expect(assignsTo(w1)).toHaveLength(0);
			expect(queue.length).toBe(2);
		});

		it('hands the worker that said ready only to the step it was asked about', () => {
			const { dispatcher, enqueue, workers, requestsTo, assignsTo, lastRequestId } = build();
			const w1 = askable('w1');
			workers.push(w1);
			enqueue('run-1', 'second');
			enqueue('run-1', 'first');
			dispatcher.tryDispatch();

			dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), { result: 'ready' });

			expect(assignsTo(w1).map(entry => entry.message['stepId'])).toEqual(['first']);
			// 'second' was not asked on the same worker while it was reserved.
			expect(requestsTo(w1)).toHaveLength(1);
		});

		it('a step handed to a plain worker cancels its open question; the late answer is ignored', () => {
			const { dispatcher, enqueue, workers, assignsTo, lastRequestId } = build();
			const w1 = askable('w1');
			workers.push(w1);
			enqueue('run-1', 's1');
			dispatcher.tryDispatch();
			const request = lastRequestId(w1);
			dispatcher.onReadinessAlive(w1.ws, request);

			const w2 = workerOf('w2', []);
			workers.push(w2);
			dispatcher.tryDispatch();
			expect(assignsTo(w2)).toHaveLength(1);
			expect(vi.getTimerCount()).toBe(0);

			expect(dispatcher.onReadinessAnswer(w1.ws, request, { result: 'ready' })).toBe('ignored');
			expect(assignsTo(w1)).toHaveLength(0);
		});

		it('no double dispatch under repeated tryDispatch calls (asked once, assigned once)', () => {
			const { dispatcher, enqueue, workers, requestsTo, assignsTo, lastRequestId, sent } = build();
			const w1 = askable('w1');
			workers.push(w1);
			enqueue('run-1', 's1');

			dispatcher.tryDispatch();
			dispatcher.tryDispatch();
			dispatcher.tryDispatch();
			expect(requestsTo(w1)).toHaveLength(1);

			dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), { result: 'ready' });
			dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), { result: 'ready' });
			dispatcher.tryDispatch();

			expect(assignsTo(w1)).toHaveLength(1);
			expect(sent.filter(entry => entry.message['type'] === 'assign')).toHaveLength(1);
		});

		it('does not count a step waiting for an answer as unmet demand', () => {
			const { dispatcher, enqueue, workers } = build();
			workers.push(askable('w1'));
			enqueue('run-1', 's1');

			dispatcher.tryDispatch();

			const registryCover = (dispatcher as unknown as { demand: { cover: ReturnType<typeof vi.fn> } }).demand
				.cover;
			expect(registryCover).toHaveBeenLastCalledWith(0, expect.anything());
		});
	});

	describe('worker disconnect and daemon stop', () => {
		it.each([
			['before any ack (phase ack)', false],
			['after the ack (phase answer)', true],
		])('a disconnect %s leaves no timer and the step is placed on another worker', (_label, acknowledged) => {
			const { dispatcher, enqueue, workers, assignsTo, lastRequestId, queue, deferred } = build();
			const w1 = askable('w1');
			workers.push(w1);
			enqueue('run-1', 's1');
			dispatcher.tryDispatch();
			if (acknowledged) {
				dispatcher.onReadinessAlive(w1.ws, lastRequestId(w1));
			}
			const request = lastRequestId(w1);

			workers.splice(workers.indexOf(w1), 1);
			dispatcher.workerGone(w1.ws);

			expect(vi.getTimerCount()).toBe(0);
			expect(queue.length).toBe(1);
			expect(dispatcher.onReadinessAnswer(w1.ws, request, { result: 'ready' })).toBe('ignored');

			const w2 = workerOf('w2', []);
			workers.push(w2);
			dispatcher.tryDispatch();
			expect(assignsTo(w2)).toHaveLength(1);
			// A disconnect is not a not-ready: no event.
			expect(deferred).not.toHaveBeenCalled();
		});

		it('a disconnect while the step is deferred drops its retry time and timer; the step is not lost', () => {
			const { dispatcher, enqueue, workers, lastRequestId, queue } = build();
			const w1 = askable('w1');
			workers.push(w1);
			enqueue('run-1', 's1');
			dispatcher.tryDispatch();
			dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), notReady('sso-expired', 30));
			expect(vi.getTimerCount()).toBe(1);

			workers.splice(workers.indexOf(w1), 1);
			dispatcher.workerGone(w1.ws);

			expect(vi.getTimerCount()).toBe(0);
			expect(queue.length).toBe(1);
		});

		it('a disconnect after a ready verdict releases the reservation', () => {
			const { dispatcher, enqueue, workers, assignsTo, lastRequestId } = build();
			const w1 = askable('w1');
			workers.push(w1);
			enqueue('run-1', 's1');
			dispatcher.tryDispatch();
			workers.splice(workers.indexOf(w1), 1);
			dispatcher.workerGone(w1.ws);
			expect(dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), { result: 'ready' })).toBe('ignored');

			const w2 = workerOf('w2', []);
			workers.push(w2);
			dispatcher.tryDispatch();
			expect(assignsTo(w2)).toHaveLength(1);
		});

		it('stop() clears the open questions and the deferral timers', () => {
			const { dispatcher, enqueue, workers, lastRequestId } = build();
			const w1 = askable('w1');
			const w2 = askable('w2');
			workers.push(w1, w2);
			enqueue('run-1', 's1');
			enqueue('run-1', 's2');
			dispatcher.tryDispatch();
			dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), notReady('sso-expired', 30));
			expect(vi.getTimerCount()).toBeGreaterThan(0);

			dispatcher.stop();

			expect(vi.getTimerCount()).toBe(0);
		});

		it('forgetting an execution drops its open questions and deferrals', () => {
			const { dispatcher, enqueue, workers, lastRequestId } = build();
			const w1 = askable('w1');
			workers.push(w1);
			enqueue('run-1', 's1');
			dispatcher.tryDispatch();
			dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), notReady('sso-expired', 30));

			dispatcher.forgetExecution('run-1');

			expect(vi.getTimerCount()).toBe(0);
		});

		it('a paused execution drops its readiness state (the pause does not count in the bounded wait)', () => {
			const { dispatcher, enqueue, workers, lastRequestId } = build();
			const w1 = askable('w1');
			workers.push(w1);
			enqueue('run-1', 's1');
			dispatcher.tryDispatch();
			dispatcher.onReadinessAnswer(w1.ws, lastRequestId(w1), notReady('sso-expired', 30));
			const executions = (dispatcher as unknown as { executions: { isPaused: (id: string) => boolean } })
				.executions;
			vi.spyOn(executions, 'isPaused').mockReturnValue(true);

			dispatcher.tryDispatch();

			expect(vi.getTimerCount()).toBe(0);
		});
	});
});
