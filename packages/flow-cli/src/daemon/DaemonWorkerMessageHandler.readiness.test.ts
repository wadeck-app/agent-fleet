import { createTempDirectory } from 'flow-core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import type { DaemonRuntime } from './DaemonRuntime.js';
import { DaemonWorkerMessageHandler } from './DaemonWorkerMessageHandler.js';
import { WorkerRegistry } from './WorkerRegistry.js';

function setup(outcome: 'accepted' | 'ignored') {
	const ws = { readyState: 1, OPEN: 1, send: vi.fn(), terminate: vi.fn(), close: vi.fn() } as unknown as WebSocket;
	const commandHandler = {
		onReadinessAlive: vi.fn().mockReturnValue(outcome),
		onReadinessAnswer: vi.fn().mockReturnValue(outcome),
	};
	const handler = new DaemonWorkerMessageHandler(
		createTempDirectory('dwmh-readiness-'),
		() => ({ commandHandler, workerRegistry: new WorkerRegistry() }) as unknown as DaemonRuntime,
		() => {}
	);
	return { handler, ws, commandHandler };
}

describe('DaemonWorkerMessageHandler -- readiness messages', () => {
	it('hands readiness_alive and the verdict (without type and requestId) to the command handler', () => {
		const { handler, ws, commandHandler } = setup('accepted');

		handler.handleMessage(ws, { type: 'readiness_alive', requestId: 'r1' });
		handler.handleMessage(ws, {
			type: 'readiness_answer',
			requestId: 'r1',
			result: 'not_ready',
			reason: 'sso-expired',
			message: 'm',
			retryAfter: 30,
		});

		expect(commandHandler.onReadinessAlive).toHaveBeenCalledWith(ws, 'r1');
		expect(commandHandler.onReadinessAnswer).toHaveBeenCalledWith(ws, 'r1', {
			result: 'not_ready',
			reason: 'sso-expired',
			message: 'm',
			retryAfter: 30,
		});
	});

	it('says once per connection that a late or unknown readiness message was ignored, naming the deadlines', () => {
		const { handler, ws } = setup('ignored');
		const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		try {
			handler.handleMessage(ws, { type: 'readiness_alive', requestId: 'r1' });
			handler.handleMessage(ws, { type: 'readiness_answer', requestId: 'r1', result: 'ready' });
			handler.handleMessage(ws, { type: 'readiness_answer', requestId: 'r2', result: 'ready' });

			expect(stderr).toHaveBeenCalledTimes(1);
			expect(stderr).toHaveBeenCalledWith(expect.stringContaining('worker.readinessAckSeconds'));
			expect(stderr).toHaveBeenCalledWith(expect.stringContaining('worker.readinessAnswerSeconds'));
		} finally {
			stderr.mockRestore();
		}
	});
});
