const { describe, test, expect, beforeEach, vi } = require('vitest');

describe('Debug reconnection', () => {
	test('simple reconnection flow', async () => {
		let wsCount = 0;

		const WebSocket = vi.fn().mockImplementation(() => {
			wsCount++;
			console.log(`WebSocket created #${wsCount}`);
			return { on: vi.fn() };
		});

		// Simulate first connection
		const ws1 = new WebSocket('url');
		console.log(`After first: count = ${wsCount}, called = ${WebSocket.mock.calls.length}`);

		// Simulate reconnection
		const ws2 = new WebSocket('url');
		console.log(`After second: count = ${wsCount}, called = ${WebSocket.mock.calls.length}`);

		expect(WebSocket).toHaveBeenCalledTimes(2);
	});
});
