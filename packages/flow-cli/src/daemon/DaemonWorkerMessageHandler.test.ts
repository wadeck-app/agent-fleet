import { describe, expect, it, vi } from 'vitest';

import type { DaemonRuntime } from './DaemonRuntime.js';
import { DaemonWorkerMessageHandler } from './DaemonWorkerMessageHandler';

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
