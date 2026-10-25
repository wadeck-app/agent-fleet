import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssignableStep, ExecutionContext } from '../ipc/Protocol';
import type { SendMessageFn, StepRunnerFactory } from './WorkerAdapter';
import { WorkerAdapter } from './WorkerAdapter';

const step = { id: 's1', name: 'S', type: 'script', script: 'npm test', shell: 'bash' } as unknown as AssignableStep;

const context: ExecutionContext = {
	executionId: 'testexec',
	inputs: {},
	stepOutputs: {},
	stepMeta: {},
	workspaceDir: '/tmp/ws',
	outputsDir: '/tmp/ws.meta/outputs',
	cwd: '/tmp/ws',
};

// A running script that prints is alive: the daemon's silence watchdog must hear about it, throttled.
describe('WorkerAdapter -- step_progress heartbeat for script steps', () => {
	let sent: Array<Record<string, unknown>>;
	let now: number;
	let adapter: WorkerAdapter;
	let printAt: number[];

	beforeEach(() => {
		now = 1_000_000;
		vi.spyOn(Date, 'now').mockImplementation(() => now);
		sent = [];
		printAt = [];
		const executeStep = vi.fn(
			async (
				_step: unknown,
				_workspace: unknown,
				_context: unknown,
				_onTrace: unknown,
				_onLog: unknown,
				onActivity: ((progress: unknown) => void) | undefined
			) => {
				for (const offsetMs of printAt) {
					now = 1_000_000 + offsetMs;
					onActivity?.({ activity: null, changed: false });
				}
				return { stdout: '', outputs: {} };
			}
		);
		adapter = new WorkerAdapter((() => ({ executeStep }) as never) as StepRunnerFactory);
	});

	const send: SendMessageFn = message => {
		sent.push(message as unknown as Record<string, unknown>);
	};
	const progress = (): Array<Record<string, unknown>> => sent.filter(m => m['type'] === 'step_progress');

	it('forwards output as a heartbeat, at most one every 5 seconds', async () => {
		printAt = [0, 1000, 4000, 6000, 7000, 12000];

		await adapter.execute(step, context, send);

		expect(progress()).toHaveLength(3);
		expect(progress()[0]).toMatchObject({ executionId: 'testexec', stepId: 's1' });
		expect(progress()[0]).not.toHaveProperty('activity');
	});

	it('sends nothing for a silent script', async () => {
		printAt = [];

		await adapter.execute(step, context, send);

		expect(progress()).toHaveLength(0);
	});
});
