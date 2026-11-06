import { describe, expect, it } from 'vitest';

import { FakeClock } from './FakeClock';
import { FakeSandboxRuntime } from './FakeSandboxRuntime';
import { SandboxCapacity } from './SandboxCapacity';
import { SandboxError } from './SandboxError';
import { eachRow } from './testing/EachRow';
import { rejection } from './testing/ExpectedFailures';

async function createRunning(runtime: FakeSandboxRuntime, name: string): Promise<void> {
	await runtime.create({ name, agent: 'shell', mounts: [{ hostPath: '/w' }], cpus: 1, memory: '1g' });
}

describe('SandboxCapacity', () => {
	it('lets sandboxes in up to the cap, then refuses with an actionable error naming the running ones', async () => {
		const runtime = new FakeSandboxRuntime({ clock: new FakeClock() });
		const capacity = new SandboxCapacity(runtime, 2);
		await capacity.acquire('flow-sbx-a-r1');
		await capacity.acquire('flow-sbx-b-r2');

		const error = await rejection(capacity.acquire('flow-sbx-c-r3'));

		expect(error.kind).toBe('capacity-exceeded');
		expect(error.message).toContain('maxConcurrentSandboxes is 2');
		expect(error.message).toContain('flow-sbx-a-r1, flow-sbx-b-r2');
		expect(error.message).toContain('raise the maxConcurrentSandboxes option');
	});

	it('is idempotent for a name that already holds a slot', async () => {
		const capacity = new SandboxCapacity(new FakeSandboxRuntime({ clock: new FakeClock() }), 1);
		await capacity.acquire('flow-sbx-a-r1');

		await capacity.acquire('flow-sbx-a-r1');
	});

	it('gives the slot back on release', async () => {
		const capacity = new SandboxCapacity(new FakeSandboxRuntime({ clock: new FakeClock() }), 1);
		await capacity.acquire('flow-sbx-a-r1');
		capacity.release('flow-sbx-a-r1');

		await capacity.acquire('flow-sbx-b-r2');
	});

	it('counts running plugin sandboxes started by another process, not stopped ones nor foreign ones', async () => {
		const runtime = new FakeSandboxRuntime({ clock: new FakeClock() });
		await createRunning(runtime, 'flow-sbx-x-other1');
		await createRunning(runtime, 'flow-sbx-x-other2');
		await createRunning(runtime, 'personal-box');
		await runtime.stop('flow-sbx-x-other2');
		const capacity = new SandboxCapacity(runtime, 2);

		await capacity.acquire('flow-sbx-a-r1');
		const error = await rejection(capacity.acquire('flow-sbx-b-r2'));

		expect(error.kind).toBe('capacity-exceeded');
		expect(error.message).toContain('2 plugin sandboxes are already running');
		expect(error.message).toContain('flow-sbx-a-r1, flow-sbx-x-other1');
	});

	it('does not count the requesting sandbox itself when it is already listed as running', async () => {
		const runtime = new FakeSandboxRuntime({ clock: new FakeClock() });
		await createRunning(runtime, 'flow-sbx-a-r1');
		const capacity = new SandboxCapacity(runtime, 1);

		await capacity.acquire('flow-sbx-a-r1');
	});

	it('serialises concurrent requests so two callers cannot both take the last slot', async () => {
		const capacity = new SandboxCapacity(new FakeSandboxRuntime({ clock: new FakeClock() }), 1);

		const results = await Promise.allSettled([
			capacity.acquire('flow-sbx-a-r1'),
			capacity.acquire('flow-sbx-b-r2'),
		]);

		expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
	});

	it('refuses a cap of (each case)', () =>
		eachRow([[0], [-1], [1.5], [Number.NaN]], cap => {
			expect(() => new SandboxCapacity(new FakeSandboxRuntime({ clock: new FakeClock() }), cap)).toThrow(
				'maxConcurrentSandboxes must be a whole number of at least 1'
			);
		}));

	it('propagates a failure of the listing instead of guessing', async () => {
		const runtime = new FakeSandboxRuntime({ clock: new FakeClock() });
		runtime.failNext('list', new SandboxError('command-failed', 'sbx ls failed'));
		const capacity = new SandboxCapacity(runtime, 1);

		await expect(capacity.acquire('flow-sbx-a-r1')).rejects.toThrow('sbx ls failed');
	});
});
