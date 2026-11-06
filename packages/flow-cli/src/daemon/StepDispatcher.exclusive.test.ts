import type { FlowScheduler } from 'flow-engine';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import type { AssignableStep, ExecutionContext } from '../ipc/Protocol';
import { BoundStepWait } from './BoundStepWait.js';
import { ExecutionRegistry } from './ExecutionRegistry.js';
import { ReadyStepQueue } from './ReadyStepQueue.js';
import { StepDispatcher } from './StepDispatcher.js';

const worker = (workerId: string, sourceId?: string) => ({
	ws: { name: workerId } as unknown as WebSocket,
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
		features: [],
		...(sourceId === undefined ? {} : { sourceId }),
	},
});

/** An exclusive sandbox source and, optionally, a worker of another plugin type. */
function build(options: { bound?: string; exclusiveLookup?: () => (sourceId: string | undefined) => boolean } = {}) {
	const sandbox = worker('sandbox', 'sbx-1');
	const host = worker('host');
	const idle: ReturnType<typeof worker>[] = [];
	const send = vi.fn(() => true);
	const markBusy = vi.fn();
	const cover = vi.fn();
	const logWriter = { writeExecution: vi.fn() };
	const registry = {
		listIdle: () => idle,
		summarize: () => [],
		listConnected: () => [sandbox, host, ...idle].map(candidate => candidate.worker),
		describe: () => ({ workerId: 'x', features: [] as string[] }),
		markBusy,
		send,
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
	if (options.bound !== undefined) {
		executions.bindWorkerType('e1', options.bound);
	}
	const dispatcher = new StepDispatcher(
		registry as never,
		queue,
		executions,
		{ issue: () => 'a1', watchHandedOver: vi.fn() } as never,
		{ cover } as never,
		{ valuesForStep: () => undefined } as never,
		{ markStepRunning: vi.fn() } as never,
		{ dispatch: vi.fn() } as never,
		logWriter as never,
		{ decide: () => ({ action: 'wait' }) },
		() => undefined,
		{
			workerTypes: {
				typeLookup: () => sourceId => (sourceId === 'sbx-1' ? 'sandbox' : undefined),
				exclusiveLookup: options.exclusiveLookup ?? (() => sourceId => sourceId === 'sbx-1'),
				knownTypes: () => ['sandbox'],
			},
			wait: new BoundStepWait(1_000, () => 0),
			contactErrors: { sinceFor: () => () => [] },
		}
	);
	const enqueue = (stepId: string) =>
		queue.unshift({
			stepId,
			stepConfig: { id: stepId, type: 'script' } as unknown as AssignableStep,
			executionContext: context,
		});
	return { dispatcher, idle, sandbox, host, enqueue, send, cover, logWriter, markBusy };
}

const warnings = (logWriter: { writeExecution: ReturnType<typeof vi.fn> }): string[] =>
	logWriter.writeExecution.mock.calls.filter(call => call[2] === 'warning').map(call => String(call[1]));

describe('StepDispatcher - exclusive worker types', () => {
	it('runs a step of an unbound run on the host worker, not on the exclusive worker listed first', () => {
		const { dispatcher, idle, sandbox, host, enqueue, markBusy } = build();
		idle.push(sandbox, host);
		enqueue('s1');

		dispatcher.tryDispatch();

		expect(markBusy).toHaveBeenCalledWith(host.ws);
	});

	it('leaves a step of an unbound run unplaced when only the exclusive worker is idle, and counts it as demand for a host worker', () => {
		const { dispatcher, idle, sandbox, enqueue, send, cover } = build();
		idle.push(sandbox);
		enqueue('s1');

		dispatcher.tryDispatch();

		expect(send).not.toHaveBeenCalled();
		// One step a host worker could run, no bound type waited for: the sources asked are the ones of no type bound.
		expect(cover).toHaveBeenCalledWith(1, new Set());
	});

	it('tells the execution log once per step to bind the flow, naming the exclusive type and worker', () => {
		const { dispatcher, idle, sandbox, enqueue, logWriter } = build();
		idle.push(sandbox);
		enqueue('s1');

		dispatcher.tryDispatch();
		dispatcher.tryDispatch();

		const messages = warnings(logWriter);
		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain('exclusive worker type (sandbox)');
		expect(messages[0]).toContain('sandbox');
		expect(messages[0]).toContain('workerType: sandbox');
	});

	it('says nothing when no connected exclusive worker would have taken the step', () => {
		const { dispatcher, enqueue, logWriter } = build({ exclusiveLookup: () => () => false });
		enqueue('s1');

		dispatcher.tryDispatch();

		expect(warnings(logWriter)).toEqual([]);
	});

	it('still runs a step of a run bound to the exclusive type on its worker', () => {
		const { dispatcher, idle, sandbox, host, enqueue, markBusy, logWriter } = build({ bound: 'sandbox' });
		idle.push(host, sandbox);
		enqueue('s1');

		dispatcher.tryDispatch();

		expect(markBusy).toHaveBeenCalledWith(sandbox.ws);
		expect(warnings(logWriter)).toEqual([]);
	});

	it('does not run a step of a run bound to another type on the exclusive worker', () => {
		const { dispatcher, idle, sandbox, enqueue, markBusy } = build({ bound: 'gpu' });
		idle.push(sandbox);
		enqueue('s1');

		dispatcher.tryDispatch();

		expect(markBusy).not.toHaveBeenCalled();
	});

	// Fail-closed: a registry that cannot be read must not turn the sandbox into a host worker.
	const unreadable = {
		exclusiveLookup: () => {
			throw new Error('registry file is corrupt');
		},
	};

	it('keeps an unbound step off a worker that names a source when the sources cannot be read, but not off a host worker', () => {
		const { dispatcher, idle, sandbox, host, enqueue, markBusy } = build(unreadable);
		idle.push(sandbox, host);
		enqueue('s1');

		dispatcher.tryDispatch();

		expect(markBusy).toHaveBeenCalledTimes(1);
		expect(markBusy).toHaveBeenCalledWith(host.ws);
	});

	it('places nothing on the worker that names a source and logs the cause once for the execution', () => {
		const { dispatcher, idle, sandbox, enqueue, markBusy, logWriter } = build(unreadable);
		idle.push(sandbox);
		enqueue('s1');
		enqueue('s2');

		dispatcher.tryDispatch();

		expect(markBusy).not.toHaveBeenCalled();
		expect(warnings(logWriter).filter(message => message.includes('registry file is corrupt'))).toHaveLength(1);
	});
});
