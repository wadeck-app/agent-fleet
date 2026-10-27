import { createTempDirectory } from 'flow-core/testing';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import type { DaemonRuntime } from './DaemonRuntime.js';
import { DaemonWorkerMessageHandler } from './DaemonWorkerMessageHandler';
import { WorkerConnectionTracker } from './WorkerConnectionTracker';

function makeHandler(verified: boolean) {
	const commandHandler = {
		verifyAssignment: vi.fn().mockReturnValue(verified),
		noteAssignmentActivity: vi.fn(),
	};
	const handler = new DaemonWorkerMessageHandler(
		'/logs',
		() => ({ commandHandler }) as unknown as DaemonRuntime,
		() => {}
	);
	return { handler, commandHandler };
}

const ws = {} as never;
const base = { assignmentId: 'a1', executionId: 'e1', stepId: 's1' };

describe('DaemonWorkerMessageHandler -- step_progress', () => {
	// The supervisor can only name the call a stalled step was in if the daemon hands it on.
	it('passes the tool call the worker reported to the supervisor', () => {
		const { handler, commandHandler } = makeHandler(true);
		const activity = { tool: 'Bash', summary: 'npm test', startedAt: 5 };

		handler.handleMessage(ws, { type: 'step_progress', ...base, activity, lastCompletedTool: 'Read' });

		expect(commandHandler.noteAssignmentActivity).toHaveBeenCalledWith('a1', {
			activity,
			lastCompletedTool: 'Read',
		});
	});

	it('passes a cleared call as null, distinct from a heartbeat that says nothing', () => {
		const { handler, commandHandler } = makeHandler(true);

		handler.handleMessage(ws, { type: 'step_progress', ...base, activity: null });
		handler.handleMessage(ws, { type: 'step_progress', ...base });

		expect(commandHandler.noteAssignmentActivity).toHaveBeenNthCalledWith(1, 'a1', { activity: null });
		expect(commandHandler.noteAssignmentActivity).toHaveBeenNthCalledWith(2, 'a1', {});
	});

	// Without it the stall message cannot say the model had already produced its final result.
	it('passes finalResultAt to the supervisor, including the null that clears it', () => {
		const { handler, commandHandler } = makeHandler(true);

		handler.handleMessage(ws, { type: 'step_progress', ...base, finalResultAt: 1234 });
		handler.handleMessage(ws, { type: 'step_progress', ...base, finalResultAt: null });
		handler.handleMessage(ws, { type: 'step_progress', ...base });

		expect(commandHandler.noteAssignmentActivity).toHaveBeenNthCalledWith(1, 'a1', { finalResultAt: 1234 });
		expect(commandHandler.noteAssignmentActivity).toHaveBeenNthCalledWith(2, 'a1', { finalResultAt: null });
		expect(commandHandler.noteAssignmentActivity).toHaveBeenNthCalledWith(3, 'a1', {});
	});

	it('ignores a report that cannot be bound to an assignment this worker holds', () => {
		const { handler, commandHandler } = makeHandler(false);

		handler.handleMessage(ws, {
			type: 'step_progress',
			...base,
			activity: { tool: 'Bash', summary: 'x', startedAt: 1 },
		});

		expect(commandHandler.noteAssignmentActivity).not.toHaveBeenCalled();
	});
});

describe('DaemonWorkerMessageHandler -- handleClose diagnostics', () => {
	function makeClosingHandler() {
		const logsDir = createTempDirectory('dwmh-');
		const clock = { now: 1_000 };
		const commandHandler = {
			handleWorkerDisconnect: vi.fn(),
			verifyAssignment: vi.fn().mockReturnValue(true),
			noteAssignmentActivity: vi.fn(),
			tryDispatch: vi.fn(),
			onStepStarted: vi.fn(),
		};
		const workerRegistry = {
			describe: vi.fn().mockReturnValue({ workerId: 'w-9', pid: 321 }),
			remove: vi.fn(),
		};
		const relayRegistry = { remove: vi.fn() };
		const handler = new DaemonWorkerMessageHandler(
			logsDir,
			() => ({ commandHandler, workerRegistry, relayRegistry }) as unknown as DaemonRuntime,
			() => {},
			new WorkerConnectionTracker(() => clock.now)
		);
		const readLog = (): Array<{ level: string; msg: string }> =>
			readdirSync(logsDir).flatMap(f =>
				readFileSync(path.join(logsDir, f), 'utf8')
					.split('\n')
					.filter(Boolean)
					.map(l => JSON.parse(l) as { level: string; msg: string })
			);
		return { handler, commandHandler, workerRegistry, clock, readLog, logsDir };
	}

	it('logs worker id, pid, close code, last message and assignment age at error level when a started step is lost', () => {
		const { handler, clock, readLog } = makeClosingHandler();
		handler.handleMessage(ws, { type: 'step_started', ...base });
		handler.handleMessage(ws, { type: 'step_progress', ...base });
		clock.now = 13_300;

		handler.handleClose(ws, 1006, '');

		const entry = readLog().find(e => e.msg.includes('w-9'));
		expect(entry?.level).toBe('error');
		expect(entry?.msg).toContain('321');
		expect(entry?.msg).toContain('1006');
		expect(entry?.msg).toContain('step_progress');
		expect(entry?.msg).toContain('e1/s1 running for 12.3 s');
	});

	it('hands the lost step a note naming the worker and pointing at the daemon log', () => {
		const { handler, commandHandler } = makeClosingHandler();
		handler.handleMessage(ws, { type: 'step_started', ...base });

		handler.handleClose(ws, 1006, '');

		const describeLostStep = commandHandler.handleWorkerDisconnect.mock.calls[0]?.[1] as (
			e: string,
			s: string
		) => string | undefined;
		expect(describeLostStep('e1', 's1')).toMatch(/w-9.*daemon log/s);
		expect(describeLostStep('e1', 'other')).toBeUndefined();
	});

	it('logs an idle worker leaving at info level', () => {
		const { handler, readLog } = makeClosingHandler();
		handler.handleMessage(ws, { type: 'step_progress', ...base });

		handler.handleClose(ws, 1000, '');

		expect(readLog().find(e => e.msg.includes('w-9'))?.level).toBe('info');
	});

	it('reads the worker id before removing it from the registry', () => {
		const { handler, workerRegistry } = makeClosingHandler();

		handler.handleClose(ws, 1000, '');

		expect(workerRegistry.describe.mock.invocationCallOrder[0]).toBeLessThan(
			workerRegistry.remove.mock.invocationCallOrder[0]!
		);
	});
});

describe('DaemonWorkerMessageHandler -- step_failed metrics', () => {
	function makeFailingHandler() {
		const commandHandler = {
			verifyAssignment: vi.fn().mockReturnValue(true),
			settleAssignment: vi.fn(),
			onStepFailed: vi.fn(),
			dispatchHook: vi.fn(),
		};
		const executionStore = { markStepFailed: vi.fn() };
		const logWriter = { writeExecution: vi.fn() };
		const daemonSecrets = { masks: { mask: (_executionId: string, text: string) => text } };
		const workerRegistry = { describe: vi.fn().mockReturnValue({ workerId: 'w-old', version: '1.2.3' }) };
		const handler = new DaemonWorkerMessageHandler(
			'/logs',
			() =>
				({
					commandHandler,
					executionStore,
					logWriter,
					daemonSecrets,
					workerRegistry,
				}) as unknown as DaemonRuntime,
			() => {}
		);
		return { handler, executionStore, logWriter };
	}

	it('records the meta the failing worker reported with the failure', () => {
		const { handler, executionStore } = makeFailingHandler();
		const meta = { duration_ms: 9, exit_code: 1, end_reason: 'exit_nonzero' };

		handler.handleMessage(ws, { type: 'step_failed', ...base, error: 'boom', meta } as never);

		expect(executionStore.markStepFailed).toHaveBeenCalledTimes(1);
		expect(executionStore.markStepFailed.mock.calls[0]![6]).toEqual({ meta });
	});

	// An older worker cannot send it: the attempt is recorded without metrics, and the operator is told why.
	it('accepts a failure without meta, records no metrics, and warns once per worker naming its version', () => {
		const { handler, executionStore, logWriter } = makeFailingHandler();

		handler.handleMessage(ws, { type: 'step_failed', ...base, error: 'boom' } as never);
		handler.handleMessage(ws, { type: 'step_failed', ...base, error: 'boom again' } as never);

		expect(executionStore.markStepFailed).toHaveBeenCalledTimes(2);
		expect(executionStore.markStepFailed.mock.calls[0]![6]).toEqual({ meta: undefined });
		const warnings = logWriter.writeExecution.mock.calls.filter(call => call[2] === 'warning');
		expect(warnings).toHaveLength(1);
		expect(warnings[0]![1]).toContain('w-old');
		expect(warnings[0]![1]).toContain('1.2.3');
		expect(warnings[0]![1]).toMatch(/flow cli update/);
	});

	it('does not warn when the failure carried a meta', () => {
		const { handler, logWriter } = makeFailingHandler();

		handler.handleMessage(ws, { type: 'step_failed', ...base, error: 'x', meta: { duration_ms: 1 } } as never);

		expect(logWriter.writeExecution.mock.calls.filter(call => call[2] === 'warning')).toHaveLength(0);
	});
});

describe('DaemonWorkerMessageHandler -- run_end_ack', () => {
	it('hands the acknowledgement to the command handler with the connection it came from', () => {
		const commandHandler = { onRunEndAck: vi.fn(), verifyAssignment: vi.fn() };
		const handler = new DaemonWorkerMessageHandler(
			'/logs',
			() => ({ commandHandler }) as unknown as DaemonRuntime,
			() => {}
		);

		handler.handleMessage(ws, { type: 'run_end_ack', executionId: 'e1' });

		expect(commandHandler.onRunEndAck).toHaveBeenCalledWith(ws, 'e1');
		// It concerns the whole run, not an assignment: nothing to bind it to.
		expect(commandHandler.verifyAssignment).not.toHaveBeenCalled();
	});
});
