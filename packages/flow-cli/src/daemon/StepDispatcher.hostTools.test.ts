import type { FlowScheduler } from 'flow-engine';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import { WORKER_FEATURE_HOST_TOOLS } from '../ipc/Protocol';
import type { AssignableStep, ExecutionContext } from '../ipc/Protocol';
import { BoundStepWait } from './BoundStepWait.js';
import { ExecutionRegistry } from './ExecutionRegistry.js';
import { ReadyStepQueue } from './ReadyStepQueue.js';
import { StepDispatcher } from './StepDispatcher.js';

interface FakeWorker {
	ws: WebSocket;
	worker: {
		state: 'idle' | 'busy';
		workerId: string;
		pid: number;
		version: string;
		labels: string[];
		attachedProjects: string[];
		attachedProjectIds: string[];
		hasUserInterface: boolean;
		ephemeral: boolean;
		shellCapabilities: string[];
		features: string[];
		sourceId?: string;
	};
}

const workerOf = (
	workerId: string,
	options: { features?: string[]; sourceId?: string; state?: 'idle' | 'busy' } = {}
): FakeWorker => ({
	ws: { workerId } as unknown as WebSocket,
	worker: {
		state: options.state ?? 'idle',
		workerId,
		pid: 1,
		version: '1.0.0',
		labels: [],
		attachedProjects: [],
		attachedProjectIds: [],
		hasUserInterface: false,
		ephemeral: true,
		shellCapabilities: [],
		features: options.features ?? [],
		...(options.sourceId === undefined ? {} : { sourceId: options.sourceId }),
	},
});

const HOST_TOOLS = [
	{
		id: 'queue-task-show',
		description: 'Show a task.',
		sideEffect: 'read',
		command: ['task', 'show', '{id}'],
		args: { id: { type: 'string', pattern: '^[a-z]+$', required: true } },
		timeoutSeconds: 12,
	},
];

function build() {
	const workers: FakeWorker[] = [];
	const sent: { workerId: string; message: Record<string, unknown> }[] = [];
	const registry = {
		listIdle: () => workers.filter(entry => entry.worker.state === 'idle'),
		listConnected: () => workers.map(entry => entry.worker),
		listConnections: () => workers,
		summarize: () => [],
		describe: (ws: WebSocket) => workers.find(entry => entry.ws === ws)?.worker,
		markBusy: vi.fn(),
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
	};
	const context = { executionId: 'e1' } as ExecutionContext;
	executions.start('e1', scheduler as unknown as FlowScheduler, context, []);
	const failed: { stepId: string; reason: string }[] = [];
	const dispatcher = new StepDispatcher(
		registry as never,
		queue,
		executions,
		{ issue: () => 'a1', watchHandedOver: vi.fn() } as never,
		{ cover: vi.fn() } as never,
		{ valuesForStep: () => undefined } as never,
		{ markStepRunning: vi.fn() } as never,
		{ dispatch: vi.fn() } as never,
		{ writeExecution: vi.fn() } as never,
		{ decide: () => ({ action: 'wait' }) },
		(_executionId, stepId, reason) => failed.push({ stepId, reason }),
		{
			workerTypes: {
				requirementOnlyLookup: () => () => false,
				guaranteeLookup: () => () => [],
			},
			wait: new BoundStepWait(1_000, () => 0),
			contactErrors: { sinceFor: () => () => [] },
		}
	);
	const enqueue = (stepId: string, stepConfig: Record<string, unknown>) =>
		queue.unshift({
			stepId,
			stepConfig: { id: stepId, ...stepConfig } as unknown as AssignableStep,
			executionContext: context,
		});
	return { dispatcher, enqueue, workers, sent, failed, queue };
}

const MODEL_WITH_TOOLS = { type: 'model', prompt: 'p', hostTools: HOST_TOOLS };

describe('StepDispatcher - hostTools routing', () => {
	it('carries hostTools in stepConfig of the assign exactly as written, with no top-level copy', () => {
		const { dispatcher, enqueue, workers, sent } = build();
		workers.push(workerOf('w-new', { features: [WORKER_FEATURE_HOST_TOOLS] }));
		enqueue('s1', MODEL_WITH_TOOLS);

		dispatcher.tryDispatch();

		expect(sent).toHaveLength(1);
		const message = sent[0]?.message as { stepConfig: { hostTools: unknown } };
		expect(message.stepConfig.hostTools).toEqual(HOST_TOOLS);
		expect(Object.keys(message)).not.toContain('hostTools');
	});

	// [name, workers, step, expected worker that receives it ('' = none)]
	it.each([
		{
			name: 'only the worker declaring host-tools gets a hostTools step',
			workers: () => [workerOf('w-old'), workerOf('w-new', { features: [WORKER_FEATURE_HOST_TOOLS] })],
			step: MODEL_WITH_TOOLS,
			receiver: 'w-new',
		},
		{
			name: 'a step without hostTools still goes to a worker that lacks the feature',
			workers: () => [workerOf('w-old')],
			step: { type: 'model', prompt: 'p' },
			receiver: 'w-old',
		},
		{
			name: 'an empty hostTools list is not a demand for the feature',
			workers: () => [workerOf('w-old')],
			step: { type: 'model', prompt: 'p', hostTools: [] },
			receiver: 'w-old',
		},
	])('$name', ({ workers: makeWorkers, step, receiver }) => {
		const { dispatcher, enqueue, workers, sent, failed } = build();
		workers.push(...makeWorkers());
		enqueue('s1', step);

		dispatcher.tryDispatch();

		expect(sent.map(entry => entry.workerId)).toEqual([receiver]);
		expect(failed).toEqual([]);
	});

	it.each([
		{
			name: 'a connected worker without the feature',
			workers: () => [workerOf('w-old')],
			expected: [
				"Step 's1' declares hostTools but worker 'w-old' does not support hostTools",
				'run the step on a local worker',
				'remove hostTools',
			],
		},
		{
			name: 'several connected workers without the feature, all named',
			workers: () => [workerOf('w-a'), workerOf('w-b')],
			expected: ["Step 's1' declares hostTools but workers 'w-a', 'w-b' do not support hostTools"],
		},
		{
			name: 'a worker of a declared source (sandbox), with the slice 1 note',
			workers: () => [workerOf('w-sbx', { sourceId: 'sbx' })],
			expected: [
				"worker 'w-sbx' does not support hostTools",
				'do not offer host tools in the sandbox in this version',
			],
		},
		{
			name: 'a busy worker without the feature and no capable worker at all',
			workers: () => [workerOf('w-old', { state: 'busy' })],
			expected: ["worker 'w-old' does not support hostTools"],
		},
	])('fails the step early when no capable worker exists: $name', ({ workers: makeWorkers, expected }) => {
		const { dispatcher, enqueue, workers, sent, failed, queue } = build();
		workers.push(...makeWorkers());
		enqueue('s1', MODEL_WITH_TOOLS);

		dispatcher.tryDispatch();

		expect(sent).toEqual([]);
		expect(failed).toHaveLength(1);
		expect(failed[0]?.stepId).toBe('s1');
		for (const fragment of expected) expect(failed[0]?.reason).toContain(fragment);
		expect(queue.length).toBe(0);
	});

	it.each([
		{ name: 'no worker is connected (a host worker will be forked)', workers: () => [] as FakeWorker[] },
		{
			name: 'a capable worker is busy (it will become idle), even with an idle one lacking the feature',
			workers: () => [
				workerOf('w-old'),
				workerOf('w-new', { features: [WORKER_FEATURE_HOST_TOOLS], state: 'busy' }),
			],
		},
	])('keeps the step queued, without failing it, when $name', ({ workers: makeWorkers }) => {
		const { dispatcher, enqueue, workers, sent, failed, queue } = build();
		workers.push(...makeWorkers());
		enqueue('s1', MODEL_WITH_TOOLS);

		dispatcher.tryDispatch();

		expect(sent).toEqual([]);
		expect(failed).toEqual([]);
		expect(queue.length).toBe(1);
	});
});
