import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleWorkerMessage } from './handleWorkerMessage';

describe('handleWorkerMessage -- run_end', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	// This worker never declares run-events, so the daemon must not send it; if one arrives anyway it is said, not acted on.
	it('names the unexpected run_end, sends nothing back and does not throw', async () => {
		const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const send = vi.fn();

		await handleWorkerMessage(
			{ type: 'run_end', executionId: 'e1', reason: 'completed' },
			{} as never,
			send,
			{ pid: 1 },
			{} as never,
			{} as never
		);

		expect(send).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('run-events'));
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('e1'));
	});
});
