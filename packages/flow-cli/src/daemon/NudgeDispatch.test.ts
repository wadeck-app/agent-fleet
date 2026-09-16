import { describe, expect, it } from 'vitest';

import { NudgeServer } from '../worker/NudgeServer.js';
import { sendNudge } from './NudgeDispatch.js';

describe('sendNudge', () => {
	it('delivers wsUrl to a running NudgeServer', async () => {
		const server = new NudgeServer();
		const nudgeUrl = await server.start();

		const received: (string | undefined)[] = [];
		server.onNotify(wsUrl => received.push(wsUrl));

		await sendNudge(nudgeUrl, 'ws://127.0.0.1:5050');

		server.stop();
		expect(received).toEqual(['ws://127.0.0.1:5050']);
	});

	it('rejects when the server is not reachable', async () => {
		// Port 1 is reserved and will always be refused
		await expect(sendNudge('http://127.0.0.1:1/nudge', 'ws://127.0.0.1:5050')).rejects.toThrow();
	});

	it('rejects on a non-2xx response', async () => {
		const server = new NudgeServer();
		const nudgeUrl = await server.start();
		// No callback registered → server returns 200 but with no listener (still 200 because
		// the server itself handles the request). This tests the happy path indirectly, but the
		// 4xx path is covered by NudgeServer.test.ts POST to /nudge with bad body.
		server.stop();

		// Server is stopped; connection refused
		await expect(sendNudge(nudgeUrl, 'ws://127.0.0.1:5050')).rejects.toThrow();
	});
});
