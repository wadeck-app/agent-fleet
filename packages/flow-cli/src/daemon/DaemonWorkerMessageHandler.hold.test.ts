import { createTempDirectory } from 'flow-core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import { WORKER_FEATURE_RUN_HOLD } from '../ipc/Protocol';
import type { DaemonRuntime } from './DaemonRuntime.js';
import { DaemonWorkerMessageHandler } from './DaemonWorkerMessageHandler.js';
import { WorkerRegistry } from './WorkerRegistry.js';

function makeWs(): WebSocket {
	return { readyState: 1, OPEN: 1, send: vi.fn(), terminate: vi.fn(), close: vi.fn() } as unknown as WebSocket;
}

function setup(features: string[]) {
	const workerRegistry = new WorkerRegistry();
	const ws = makeWs();
	const commandHandler = { tryDispatch: vi.fn(), onRunEndAck: vi.fn() };
	const handler = new DaemonWorkerMessageHandler(
		createTempDirectory('dwmh-hold-'),
		() =>
			({
				commandHandler,
				workerRegistry,
				workerProvisioner: {
					registerWorker: (socket: WebSocket) => {
						workerRegistry.register(socket, { pid: 1, features });
						return true;
					},
				},
			}) as unknown as DaemonRuntime,
		() => {}
	);
	const sentTypes = (): string[] =>
		vi
			.mocked(ws.send as (data: string) => void)
			.mock.calls.map(call => (JSON.parse(String(call[0])) as { type: string }).type);
	return { handler, workerRegistry, ws, commandHandler, sentTypes };
}

describe('DaemonWorkerMessageHandler -- worker_hold', () => {
	it('answers worker_hold_enabled once, on the first ready of a worker declaring run-hold', () => {
		const { handler, ws, sentTypes } = setup([WORKER_FEATURE_RUN_HOLD]);

		handler.handleMessage(ws, { type: 'ready', pid: 1 });
		handler.handleMessage(ws, { type: 'ready', pid: 1 });

		expect(sentTypes()).toEqual(['worker_hold_enabled']);
	});

	it('never answers a worker that did not declare the feature, and ignores its worker_hold', () => {
		const { handler, workerRegistry, ws, sentTypes } = setup([]);

		handler.handleMessage(ws, { type: 'ready', pid: 1 });
		handler.handleMessage(ws, { type: 'worker_hold', executionId: 'run-1' });

		expect(sentTypes()).toEqual([]);
		expect(workerRegistry.describe(ws)?.heldBy).toBeUndefined();
	});

	it('ignores a worker_hold sent before the answer, without throwing', () => {
		const { handler, workerRegistry, ws } = setup([WORKER_FEATURE_RUN_HOLD]);
		const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		try {
			// Not registered yet: no `ready`, so no answer.
			expect(() => handler.handleMessage(ws, { type: 'worker_hold', executionId: 'run-1' })).not.toThrow();
			expect(stderr).toHaveBeenCalledWith(expect.stringContaining('without having been enabled'));
			expect(workerRegistry.describe(ws)).toBeUndefined();
		} finally {
			stderr.mockRestore();
		}
	});

	it('applies the hold after the answer, keeps it across ready, and re-dispatches only when it is released', () => {
		const { handler, workerRegistry, ws, commandHandler } = setup([WORKER_FEATURE_RUN_HOLD]);
		handler.handleMessage(ws, { type: 'ready', pid: 1 });
		commandHandler.tryDispatch.mockClear();

		handler.handleMessage(ws, { type: 'worker_hold', executionId: 'run-1' });
		expect(workerRegistry.describe(ws)?.heldBy).toBe('run-1');
		expect(commandHandler.tryDispatch).not.toHaveBeenCalled();

		handler.handleMessage(ws, { type: 'ready', pid: 1 });
		expect(workerRegistry.describe(ws)?.heldBy).toBe('run-1');

		commandHandler.tryDispatch.mockClear();
		handler.handleMessage(ws, { type: 'worker_hold', executionId: null });
		expect(workerRegistry.describe(ws)?.heldBy).toBeUndefined();
		expect(commandHandler.tryDispatch).toHaveBeenCalledTimes(1);
	});

	it('ignores a malformed executionId', () => {
		const { handler, workerRegistry, ws } = setup([WORKER_FEATURE_RUN_HOLD]);
		const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		try {
			handler.handleMessage(ws, { type: 'ready', pid: 1 });
			handler.handleMessage(ws, { type: 'worker_hold', executionId: 42 as unknown as string });
			expect(workerRegistry.describe(ws)?.heldBy).toBeUndefined();
		} finally {
			stderr.mockRestore();
		}
	});
});

describe('DaemonWorkerMessageHandler -- run_end_ack and holds', () => {
	it('clears the hold of the acknowledged run and re-dispatches', () => {
		const { handler, workerRegistry, ws, commandHandler } = setup([WORKER_FEATURE_RUN_HOLD]);
		handler.handleMessage(ws, { type: 'ready', pid: 1 });
		handler.handleMessage(ws, { type: 'worker_hold', executionId: 'run-1' });
		commandHandler.tryDispatch.mockClear();

		handler.handleMessage(ws, { type: 'run_end_ack', executionId: 'run-1' });

		expect(workerRegistry.describe(ws)?.heldBy).toBeUndefined();
		expect(commandHandler.onRunEndAck).toHaveBeenCalledWith(ws, 'run-1');
		expect(commandHandler.tryDispatch).toHaveBeenCalledTimes(1);
	});

	it('keeps the hold of another run on the ack of a different run, but still re-dispatches', () => {
		const { handler, workerRegistry, ws, commandHandler } = setup([WORKER_FEATURE_RUN_HOLD]);
		handler.handleMessage(ws, { type: 'ready', pid: 1 });
		handler.handleMessage(ws, { type: 'worker_hold', executionId: 'run-2' });
		commandHandler.tryDispatch.mockClear();

		handler.handleMessage(ws, { type: 'run_end_ack', executionId: 'run-1' });

		expect(workerRegistry.describe(ws)?.heldBy).toBe('run-2');
		expect(commandHandler.tryDispatch).toHaveBeenCalledTimes(1);
	});
});
