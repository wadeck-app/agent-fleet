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

/** A requirement-only sandbox source and a host worker. */
function build(options: { requirementOnlyLookup?: () => (sourceId: string | undefined) => boolean } = {}) {
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
				requirementOnlyLookup: options.requirementOnlyLookup ?? (() => sourceId => sourceId === 'sbx-1'),
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

describe('StepDispatcher - requirement-only sources', () => {
	it('runs a step that requires nothing on the host worker, not on the requirement-only worker listed first', () => {
		const { dispatcher, idle, sandbox, host, enqueue, markBusy } = build();
		idle.push(sandbox, host);
		enqueue('s1');

		dispatcher.tryDispatch();

		expect(markBusy).toHaveBeenCalledWith(host.ws);
	});

	it('leaves a step that requires nothing unplaced when only the requirement-only worker is idle, and counts it as demand for a host worker', () => {
		const { dispatcher, idle, sandbox, enqueue, send, cover } = build();
		idle.push(sandbox);
		enqueue('s1');

		dispatcher.tryDispatch();

		expect(send).not.toHaveBeenCalled();
		// One step a host worker could run, no source waited for.
		expect(cover).toHaveBeenCalledWith(1, new Set());
	});

	it('tells the execution log once per step to add requires:, naming the worker and the reason', () => {
		const { dispatcher, idle, sandbox, enqueue, logWriter } = build();
		idle.push(sandbox);
		enqueue('s1');

		dispatcher.tryDispatch();
		dispatcher.tryDispatch();

		const messages = warnings(logWriter);
		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain('sandbox');
		expect(messages[0]).toContain('declare guarantees');
		expect(messages[0]).toContain('requires: [<guarantee>]');
		expect(messages[0]).toContain('flow worker source list');
		expect(messages[0]).not.toContain('workerType');
	});

	it('says nothing when no connected requirement-only worker would have taken the step', () => {
		const { dispatcher, enqueue, logWriter } = build({ requirementOnlyLookup: () => () => false });
		enqueue('s1');

		dispatcher.tryDispatch();

		expect(warnings(logWriter)).toEqual([]);
	});

	// Fail-closed: a registry that cannot be read must not turn the sandbox into a host worker.
	const unreadable = {
		requirementOnlyLookup: () => {
			throw new Error('registry file is corrupt');
		},
	};

	it('keeps a step that requires nothing off a worker that names a source when the sources cannot be read, but not off a host worker', () => {
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
