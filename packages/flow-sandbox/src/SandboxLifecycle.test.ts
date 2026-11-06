import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeClock } from './FakeClock';
import { FakeSandboxRuntime } from './FakeSandboxRuntime';
import { FakeScheduler } from './FakeScheduler';
import { RunMounts } from './RunMounts';
import { SandboxCapacity } from './SandboxCapacity';
import { SandboxError } from './SandboxError';
import { SandboxLifecycle, type SandboxLifecycleOptions } from './SandboxLifecycle';
import { rejection } from './testing/ExpectedFailures';
import { RecordingPresence } from './testing/RecordingPresence';
import { RecordingSandboxLog } from './testing/RecordingSandboxLog';

const MINUTE = 60_000;
const NAME = 'flow-sbx-w1-run1';

let root: string;
let mounts: RunMounts;
let clock: FakeClock;
let runtime: FakeSandboxRuntime;
let scheduler: FakeScheduler;
let log: RecordingSandboxLog;
let presence: RecordingPresence;

const baseOptions: SandboxLifecycleOptions = {
	wrapperId: 'w1',
	agent: 'shell',
	cpus: 2,
	memory: '2g',
	idleStopMinutes: 5,
};

function lifecycle(
	overrides: Partial<SandboxLifecycleOptions> = {},
	capacity = new SandboxCapacity(runtime, 4)
): SandboxLifecycle {
	const instance = new SandboxLifecycle(
		{ ...baseOptions, ...overrides },
		{ runtime, scheduler, log, capacity, presence }
	);
	instance.start();
	return instance;
}

function count(method: Parameters<FakeSandboxRuntime['callsTo']>[0]): number {
	return runtime.callsTo(method).length;
}

/** The mutating calls the runtime saw, in order (reads are noise for an ordering check). */
function mutations(): string[] {
	return runtime.calls.map(call => call.method).filter(method => method !== 'list');
}

/** Lets every promise that can make progress without a timer run to its next wait. Not a delay. */
function flush(): Promise<void> {
	return new Promise(resolve => setImmediate(resolve));
}

/** Fires the timers up to `milliseconds` ahead and waits for the work they started. */
async function advance(life: SandboxLifecycle, milliseconds: number): Promise<void> {
	scheduler.advance(milliseconds);
	await life.whenSettled();
}

/** A fresh fake world (runtime, clock, scheduler, log, presence) over the same mount directories. */
function resetWorld(): void {
	log = new RecordingSandboxLog();
	clock = new FakeClock(Date.UTC(2026, 9, 27));
	runtime = new FakeSandboxRuntime({ clock });
	scheduler = new FakeScheduler(clock);
	presence = new RecordingPresence();
}

beforeEach(() => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-lifecycle-')));
	fs.mkdirSync(path.join(root, 'ws'));
	fs.mkdirSync(path.join(root, 'ws.meta'));
	resetWorld();
	mounts = new RunMounts({
		workspaceDir: path.join(root, 'ws'),
		workspaceMetaDir: path.join(root, 'ws.meta'),
		platform: process.platform,
		log,
	});
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

describe('SandboxLifecycle creation', () => {
	it('creates nothing until the first assignment, then one sandbox named from wrapper and execution id, reused for the next step', async () => {
		const life = lifecycle();
		expect(count('create')).toBe(0);
		expect(life.current()).toBeUndefined();

		const name = await life.beginStep('run1', mounts);

		expect(name).toBe(NAME);
		expect(count('create')).toBe(1);
		expect(life.current()).toEqual({ executionId: 'run1', name: NAME, status: 'running', stepActive: true });
		expect(presence.events).toEqual(['publish:w1:-', 'publish:w1:run1']);
		// Image and pull are omitted when not configured.
		expect(runtime.callsTo('create')[0]?.request).toEqual({
			name: NAME,
			agent: 'shell',
			mounts: mounts.sandboxMounts(),
			cpus: 2,
			memory: '2g',
		});

		await life.endStep('run1');
		await life.beginStep('run1', mounts);

		expect(count('create')).toBe(1);
		expect(count('start')).toBe(0);
	});

	it('passes explicit cpus, memory, image, pull, agent and exactly the two mounts', async () => {
		const life = lifecycle({ cpus: 4, memory: '4g', image: 'flow-sandbox:m2', pull: 'never', agent: 'claude' });

		await life.beginStep('run1', mounts);

		expect(runtime.callsTo('create')[0]?.request).toEqual({
			name: NAME,
			agent: 'claude',
			mounts: mounts.sandboxMounts(),
			cpus: 4,
			memory: '4g',
			image: 'flow-sandbox:m2',
			pull: 'never',
		});
		expect(runtime.state(NAME).cpus).toBe(4);
		expect(runtime.state(NAME).memory).toBe('4g');
	});

	it('refuses a hostile execution id without touching sbx, and a step before start()', async () => {
		for (const executionId of ['Run/1', '..', 'RUN1', 'a'.repeat(60), 'run.1']) {
			const error = await rejection(lifecycle().beginStep(executionId, mounts), executionId);

			expect(error.kind, executionId).toBe('invalid-argument');
			expect(runtime.calls, executionId).toEqual([]);
		}

		const notStarted = new SandboxLifecycle(baseOptions, {
			runtime,
			scheduler,
			log,
			capacity: new SandboxCapacity(runtime, 4),
			presence,
		});
		const error = await rejection(notStarted.beginStep('run1', mounts));

		expect(error.message).toContain('start() must be called');
		expect(count('create')).toBe(0);
	});

	it('releases the capacity slot when sbx create fails so a retry works, and explains a leftover with the same name', async () => {
		const capacity = new SandboxCapacity(runtime, 1);
		const life = lifecycle({}, capacity);
		runtime.failNext('create', new SandboxError('command-failed', 'image pull failed'));

		await expect(life.beginStep('run1', mounts)).rejects.toThrow('image pull failed');
		expect(life.current()).toBeUndefined();

		await life.beginStep('run1', mounts);
		expect(life.current()?.status).toBe('running');
		expect(count('create')).toBe(2);

		// A second wrapper with the same id finds the sandbox of the first one.
		const second = lifecycle({}, new SandboxCapacity(runtime, 4));
		const error = await rejection(second.beginStep('run1', mounts));

		expect(error.kind).toBe('already-exists');
		expect(error.message).toContain('left over from an earlier wrapper');
		expect(error.message).toContain(`leftover remove ${NAME}`);
		expect(count('remove')).toBe(0);
	});
});

describe('SandboxLifecycle options', () => {
	it('refuses an invalid wrapper id and idle delay', () => {
		const cases: [string, Partial<SandboxLifecycleOptions>, string][] = [
			['wrapper id with uppercase', { wrapperId: 'W1' }, 'Wrapper id'],
			['zero idle minutes', { idleStopMinutes: 0 }, 'idleStopMinutes'],
			['NaN idle minutes', { idleStopMinutes: Number.NaN }, 'idleStopMinutes'],
			['idle longer than a timer can hold', { idleStopMinutes: 1441 }, 'at most 1440'],
		];
		for (const [label, override, message] of cases) {
			expect(
				() =>
					new SandboxLifecycle(
						{ ...baseOptions, ...override },
						{ runtime, scheduler, log, capacity: new SandboxCapacity(runtime, 1), presence }
					),
				label
			).toThrow(message);
		}
	});
});

describe('SandboxLifecycle idle stop and restart', () => {
	it('stops (never removes) the sandbox after idleStopMinutes without a step, not a millisecond earlier', async () => {
		const life = lifecycle();
		await life.beginStep('run1', mounts);
		await life.endStep('run1');

		await advance(life, 5 * MINUTE - 1);
		expect(count('stop')).toBe(0);
		expect(life.current()?.status).toBe('running');

		await advance(life, 1);
		expect(count('stop')).toBe(1);
		expect(runtime.callsTo('stop')[0]?.request).toBe(NAME);
		expect(runtime.state(NAME).status).toBe('stopped');
		expect(life.current()?.status).toBe('stopped');
		expect(count('remove')).toBe(0);
		expect(runtime.has(NAME)).toBe(true);
	});

	it('honours a short idleStopMinutes such as 0.2', async () => {
		const life = lifecycle({ idleStopMinutes: 0.2 });
		await life.beginStep('run1', mounts);
		await life.endStep('run1');

		await advance(life, 12_000 - 1);
		expect(count('stop')).toBe(0);
		await advance(life, 1);
		expect(count('stop')).toBe(1);
	});

	it('arms no timer during a step, re-arms it at each step end, and a long step is never stopped from under itself', async () => {
		const life = lifecycle();
		await life.beginStep('run1', mounts);
		expect(scheduler.pendingCount).toBe(0);
		await life.endStep('run1');
		await advance(life, 4 * MINUTE);

		await life.beginStep('run1', mounts);
		expect(scheduler.pendingCount).toBe(0);
		await advance(life, 60 * MINUTE);
		expect(count('stop')).toBe(0);
		expect(life.current()?.stepActive).toBe(true);

		await life.endStep('run1');
		await advance(life, 4 * MINUTE);
		expect(count('stop')).toBe(0);

		await advance(life, MINUTE);
		expect(count('stop')).toBe(1);
	});

	it('restarts the stopped sandbox at the next assignment, keeps it for the run, and survives two idle/restart cycles with one create and no removal', async () => {
		const life = lifecycle();
		await life.beginStep('run1', mounts);
		await life.endStep('run1');
		await advance(life, 5 * MINUTE);
		expect(runtime.state(NAME).status).toBe('stopped');

		const name = await life.beginStep('run1', mounts);

		expect(name).toBe(NAME);
		expect(count('start')).toBe(1);
		expect(runtime.callsTo('start')[0]?.request).toBe(NAME);
		expect(count('create')).toBe(1);
		expect(runtime.state(NAME).status).toBe('running');
		expect(life.current()).toEqual({ executionId: 'run1', name: NAME, status: 'running', stepActive: true });

		await life.endStep('run1');
		await advance(life, 5 * MINUTE);
		await life.beginStep('run1', mounts);

		expect(count('create')).toBe(1);
		expect(count('start')).toBe(2);
		expect(count('stop')).toBe(2);
		expect(count('remove')).toBe(0);
	});

	it('keeps the sandbox running and retries after another idle period when the idle stop fails', async () => {
		const life = lifecycle();
		await life.beginStep('run1', mounts);
		await life.endStep('run1');
		runtime.failNext('stop', new SandboxError('command-failed', 'sbx stop exploded'));

		await advance(life, 5 * MINUTE);

		expect(life.current()?.status).toBe('running');
		expect(scheduler.pendingCount).toBe(1);
		expect(log.text()).toContain(`warn: Could not stop sandbox "${NAME}" (idle for 5 min): sbx stop exploded`);
		expect(log.text()).toContain(`sbx stop ${NAME}`);

		await advance(life, 5 * MINUTE);

		expect(life.current()?.status).toBe('stopped');
		expect(count('stop')).toBe(2);
		expect(count('remove')).toBe(0);
	});

	it('does not restart when the restart is refused by the capacity cap, and says why', async () => {
		const capacity = new SandboxCapacity(runtime, 1);
		const first = lifecycle({ wrapperId: 'w1' }, capacity);
		const second = lifecycle({ wrapperId: 'w2' }, capacity);
		await first.beginStep('run1', mounts);
		await first.endStep('run1');
		await advance(first, 5 * MINUTE);
		await second.beginStep('run2', mounts);

		const error = await rejection(first.beginStep('run1', mounts));

		expect(error.kind).toBe('capacity-exceeded');
		expect(count('start')).toBe(0);
		expect(first.current()?.status).toBe('stopped');
		expect(first.current()?.stepActive).toBe(false);
	});

	it('releases the slot when the restart itself fails', async () => {
		const life = lifecycle();
		await life.beginStep('run1', mounts);
		await life.endStep('run1');
		await advance(life, 5 * MINUTE);
		runtime.failNext('start', new SandboxError('command-failed', 'vm did not boot'));

		await expect(life.beginStep('run1', mounts)).rejects.toThrow('vm did not boot');
		expect(life.current()?.status).toBe('stopped');

		await life.beginStep('run1', mounts);
		expect(life.current()?.status).toBe('running');
	});
});

describe('SandboxLifecycle end of run and cancel', () => {
	it('removes the sandbox on end-of-run and forgets it, then lets the next run take the worker, for every removing reason', async () => {
		const life = lifecycle();
		await life.beginStep('run1', mounts);
		await life.endStep('run1');

		await life.endRun('run1', 'completed');

		expect(count('remove')).toBe(1);
		expect(runtime.callsTo('remove')[0]?.request).toBe(NAME);
		expect(runtime.has(NAME)).toBe(false);
		expect(life.current()).toBeUndefined();
		expect(scheduler.pendingCount).toBe(0);
		expect(presence.events.at(-1)).toBe('publish:w1:-');
		expect(log.text()).toContain(`Sandbox "${NAME}" removed: run "run1" ended (completed).`);

		const name = await life.beginStep('run2', mounts);
		expect(name).toBe('flow-sbx-w1-run2');
		await life.endRun('run2', 'failed');
		await life.beginStep('run3', mounts);
		await life.endRun('run3', 'cancelled');

		expect(count('create')).toBe(3);
		expect(count('remove')).toBe(3);
		expect(log.text()).toContain('(failed)');
		expect(log.text()).toContain('(cancelled)');
	});

	it('daemon_stopping stops the sandbox and keeps it: never removed, run still known, capacity freed, and a resumed run restarts the same sandbox', async () => {
		const life = lifecycle();
		await life.beginStep('run1', mounts);
		await life.endStep('run1');

		await life.endRun('run1', 'daemon_stopping');

		expect(count('remove')).toBe(0);
		expect(count('stop')).toBe(1);
		expect(runtime.has(NAME)).toBe(true);
		expect(life.current()).toMatchObject({ executionId: 'run1', name: NAME, status: 'stopped' });
		expect(scheduler.pendingCount).toBe(0);
		expect(presence.events.at(-1)).not.toBe('publish:w1:-');
		expect(log.text()).toContain('daemon_stopping');
		expect(log.text()).toContain('leftover');

		await life.beginStep('run1', mounts);

		expect(count('create')).toBe(1);
		expect(life.current()).toMatchObject({ status: 'running', stepActive: true });
	});

	it('daemon_stopping is idempotent on an already stopped sandbox, and ignores a run this worker does not hold', async () => {
		const life = lifecycle();
		await life.beginStep('run1', mounts);
		await life.endStep('run1');
		await advance(life, 5 * MINUTE);

		await life.endRun('run1', 'daemon_stopping');
		await life.endRun('run1', 'daemon_stopping');

		expect(count('stop')).toBe(1);
		expect(count('remove')).toBe(0);

		const other = lifecycle({ wrapperId: 'w2' });
		await other.endRun('run7', 'daemon_stopping');
		await other.beginStep('run7', mounts);

		expect(count('remove')).toBe(0);
		expect(count('create')).toBe(2);
	});

	it('daemon_stopping reports a failing stop and keeps the sandbox held', async () => {
		const life = lifecycle();
		await life.beginStep('run1', mounts);
		await life.endStep('run1');
		runtime.failNext('stop', new SandboxError('command-failed', 'busy'));

		await expect(life.endRun('run1', 'daemon_stopping')).rejects.toThrow('busy');

		expect(count('remove')).toBe(0);
		expect(life.current()).toMatchObject({ status: 'running' });
	});

	it('removes a sandbox that idle-stopped earlier (the stopped VM is not leaked)', async () => {
		const life = lifecycle();
		await life.beginStep('run1', mounts);
		await life.endStep('run1');
		await advance(life, 5 * MINUTE);

		await life.endRun('run1', 'completed');

		expect(count('remove')).toBe(1);
		expect(runtime.has(NAME)).toBe(false);
	});

	it('is idempotent (a second event removes nothing and does not throw) and refuses a late step of the ended run', async () => {
		const life = lifecycle();
		await life.beginStep('run1', mounts);

		await life.endRun('run1', 'completed');
		await life.endRun('run1', 'completed');

		expect(count('remove')).toBe(1);
		expect(log.text()).toContain('this worker holds no sandbox for it, nothing to remove');

		const error = await rejection(life.beginStep('run1', mounts));
		expect(error.kind).toBe('run-ended');
		expect(count('create')).toBe(1);
	});

	it('is idempotent when both events arrive at the same time', async () => {
		const life = lifecycle();
		await life.beginStep('run1', mounts);

		await Promise.all([life.endRun('run1', 'completed'), life.endRun('run1', 'cancelled')]);

		expect(count('remove')).toBe(1);
	});

	it('refuses a step of a run whose end arrived before any step, and does not remove the sandbox of another run', async () => {
		const life = lifecycle();
		await life.endRun('run9', 'cancelled');

		const error = await rejection(life.beginStep('run9', mounts));

		expect(error.kind).toBe('run-ended');
		expect(count('create')).toBe(0);
		expect(count('remove')).toBe(0);

		await life.beginStep('run1', mounts);
		await life.endRun('run2', 'completed');

		expect(count('remove')).toBe(0);
		expect(life.current()?.executionId).toBe('run1');
	});

	it('treats a sandbox that no longer exists as removed', async () => {
		const life = lifecycle();
		await life.beginStep('run1', mounts);
		await runtime.remove(NAME);

		await life.endRun('run1', 'completed');

		expect(life.current()).toBeUndefined();
	});

	it('keeps the run known when removal fails, so a second event retries', async () => {
		const life = lifecycle();
		await life.beginStep('run1', mounts);
		runtime.failNext('remove', new SandboxError('command-failed', 'file locked'));

		await expect(life.endRun('run1', 'completed')).rejects.toThrow('file locked');
		expect(life.current()?.name).toBe(NAME);
		expect(log.text()).toContain(`leftover remove ${NAME}`);

		await life.endRun('run1', 'completed');

		expect(runtime.has(NAME)).toBe(false);
		expect(count('remove')).toBe(2);
	});

	it('remembers only a bounded number of ended runs', async () => {
		const life = lifecycle();
		for (let index = 0; index < 300; index += 1) await life.endRun(`r${index}`, 'completed');

		expect((await rejection(life.beginStep('r299', mounts))).kind).toBe('run-ended');
		await life.beginStep('r0', mounts);
		expect(life.current()?.executionId).toBe('r0');
	});
});

describe('SandboxLifecycle one run per worker', () => {
	it('refuses a second run while one is live or idle-stopped, and a step while the previous one is active; creates nothing for them', async () => {
		const life = lifecycle();
		await life.beginStep('run1', mounts);

		const sameRun = await rejection(life.beginStep('run1', mounts));
		expect(sameRun.kind).toBe('worker-busy');
		expect(sameRun.message).toContain('one step at a time');

		await life.endStep('run1');
		const error = await rejection(life.beginStep('run2', mounts));
		expect(error.kind).toBe('worker-busy');
		expect(error.message).toContain('run "run1"');
		expect(error.message).toContain('run "run2"');
		expect(error.message).toContain(NAME);

		await advance(life, 5 * MINUTE);
		expect((await rejection(life.beginStep('run2', mounts))).kind).toBe('worker-busy');

		expect(count('create')).toBe(1);
		expect(count('remove')).toBe(0);
	});

	it('creates only once when two runs are assigned at the same instant', async () => {
		const life = lifecycle();

		const results = await Promise.allSettled([life.beginStep('run1', mounts), life.beginStep('run2', mounts)]);

		expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
		expect(count('create')).toBe(1);
		expect(life.current()?.executionId).toBe('run1');
	});
});

describe('SandboxLifecycle capacity', () => {
	it('refuses a sandbox beyond maxConcurrentSandboxes with an actionable error and creates nothing', async () => {
		const capacity = new SandboxCapacity(runtime, 2);
		await lifecycle({ wrapperId: 'w1' }, capacity).beginStep('run1', mounts);
		await lifecycle({ wrapperId: 'w2' }, capacity).beginStep('run2', mounts);
		const third = lifecycle({ wrapperId: 'w3' }, capacity);

		const error = await rejection(third.beginStep('run3', mounts));

		expect(error.kind).toBe('capacity-exceeded');
		expect(error.message).toContain('maxConcurrentSandboxes is 2');
		expect(count('create')).toBe(2);
		expect(third.current()).toBeUndefined();
	});

	it('frees the slot when a sandbox is idle-stopped and at end-of-run, so another worker can create', async () => {
		const capacity = new SandboxCapacity(runtime, 1);
		const first = lifecycle({ wrapperId: 'w1' }, capacity);
		const second = lifecycle({ wrapperId: 'w2' }, capacity);
		await first.beginStep('run1', mounts);
		await first.endStep('run1');
		await advance(first, 5 * MINUTE);

		await second.beginStep('run2', mounts);

		expect(count('create')).toBe(2);
		expect(count('remove')).toBe(0);

		await second.endRun('run2', 'completed');
		await lifecycle({ wrapperId: 'w3' }, capacity).beginStep('run3', mounts);

		expect(count('create')).toBe(3);
	});
});

describe('SandboxLifecycle wrapper exit and restart', () => {
	it('stops a running sandbox and never removes it; later steps are refused and an end-of-run does not publish', async () => {
		const life = lifecycle();
		await life.beginStep('run1', mounts);

		await life.shutdown();

		expect(count('stop')).toBe(1);
		expect(count('remove')).toBe(0);
		expect(runtime.state(NAME).status).toBe('stopped');
		expect(presence.events.at(-1)).toBe('withdraw:w1');
		expect(scheduler.pendingCount).toBe(0);

		expect((await rejection(life.beginStep('run1', mounts))).message).toContain('was shut down');
		await life.endRun('run1', 'completed');
		expect(presence.events.at(-1)).not.toBe('publish:w1:-');
	});

	it('cancels the pending idle timer and does not stop again a sandbox that is already stopped', async () => {
		const pending = lifecycle();
		await pending.beginStep('run1', mounts);
		await pending.endStep('run1');

		await pending.shutdown();
		scheduler.advance(60 * MINUTE);
		await pending.whenSettled();

		expect(count('stop')).toBe(1);

		const idle = lifecycle({ wrapperId: 'w2' });
		await idle.beginStep('run2', mounts);
		await idle.endStep('run2');
		await advance(idle, 5 * MINUTE);
		expect(count('stop')).toBe(2);

		await idle.shutdown();

		expect(count('stop')).toBe(2);
		expect(count('remove')).toBe(0);
	});

	it('is harmless with nothing held and withdraws the presence', async () => {
		const life = lifecycle();

		await life.shutdown();

		expect(runtime.calls).toEqual([]);
		expect(presence.events.at(-1)).toBe('withdraw:w1');
	});

	it('reports a failing stop with the manual command, still withdraws, and does not remove', async () => {
		const life = lifecycle();
		await life.beginStep('run1', mounts);
		runtime.failNext('stop', new SandboxError('command-failed', 'daemon unreachable'));

		await expect(life.shutdown()).rejects.toThrow('daemon unreachable');

		expect(presence.events.at(-1)).toBe('withdraw:w1');
		expect(log.text()).toContain(`sbx stop ${NAME}`);
		expect(count('remove')).toBe(0);
	});

	it('leaves the sandbox for the next wrapper to find: nothing is removed across a restart', async () => {
		const first = lifecycle();
		await first.beginStep('run1', mounts);
		await first.shutdown();

		const restarted = lifecycle();
		const error = await rejection(restarted.beginStep('run1', mounts));

		expect(error.kind).toBe('already-exists');
		expect(count('remove')).toBe(0);
		expect(runtime.has(NAME)).toBe(true);
	});
});

describe('SandboxLifecycle step timeout', () => {
	it('fails the step with a timeout error, aborts its signal, stops (not removes) the sandbox, and the next step restarts it', async () => {
		const life = lifecycle();
		let observed: AbortSignal | undefined;
		const pending = life.runStep({ executionId: 'run1', mounts, timeoutMs: 30_000 }, ({ signal }) => {
			observed = signal;
			return new Promise<string>(() => undefined);
		});
		const outcome = rejection(pending);
		await flush();
		expect(scheduler.pendingCount).toBe(1);

		scheduler.advance(30_000);
		const error = await outcome;

		expect(error.kind).toBe('timeout');
		expect(error.sandbox).toBe(NAME);
		expect(error.message).toContain('30000 ms');
		expect(error.message).toContain('the next step restarts it');
		expect(observed?.aborted).toBe(true);
		expect(count('stop')).toBe(1);
		expect(count('remove')).toBe(0);
		expect(runtime.state(NAME).status).toBe('stopped');
		expect(life.current()).toEqual({ executionId: 'run1', name: NAME, status: 'stopped', stepActive: false });
		expect(scheduler.pendingCount).toBe(0);

		const result = await life.runStep({ executionId: 'run1', mounts }, ({ sandbox }) =>
			Promise.resolve(`ran in ${sandbox}`)
		);

		expect(result).toBe(`ran in ${NAME}`);
		expect(count('start')).toBe(1);
		expect(count('create')).toBe(1);
		expect(count('remove')).toBe(0);
		expect(runtime.state(NAME).status).toBe('running');
	});

	it('reports the stop failure (the process may still run) and re-arms the idle timer to retry', async () => {
		const life = lifecycle();
		runtime.failNext('stop', new SandboxError('command-failed', 'stop failed'));
		const outcome = rejection(
			life.runStep({ executionId: 'run1', mounts, timeoutMs: 1000 }, () => new Promise<string>(() => undefined))
		);
		await flush();
		expect(scheduler.pendingCount).toBe(1);

		scheduler.advance(1000);
		const error = await outcome;

		expect(error.message).toBe('stop failed');
		expect(scheduler.pendingCount).toBe(1);
		expect(life.current()?.status).toBe('running');
		await advance(life, 5 * MINUTE);
		expect(runtime.state(NAME).status).toBe('stopped');
		expect(count('remove')).toBe(0);
	});

	it('does not fire the timeout once the step finished, and re-arms the idle timer', async () => {
		const life = lifecycle();

		const result = await life.runStep({ executionId: 'run1', mounts, timeoutMs: 1000 }, () => Promise.resolve(42));

		expect(result).toBe(42);
		expect(scheduler.pendingCount).toBe(1);
		await advance(life, 1000);
		expect(count('stop')).toBe(0);
		expect(life.current()?.stepActive).toBe(false);
	});

	it('rethrows a step failure unchanged, ends the step and keeps the sandbox', async () => {
		const life = lifecycle();
		const failure = new Error('script exited 3');

		await expect(life.runStep({ executionId: 'run1', mounts }, () => Promise.reject(failure))).rejects.toBe(
			failure
		);

		expect(life.current()?.stepActive).toBe(false);
		expect(count('stop')).toBe(0);
		expect(count('remove')).toBe(0);
		expect(scheduler.pendingCount).toBe(1);
	});

	it('ignores a timeout stop and a step end for a run this worker does not hold, logging the step end', async () => {
		const life = lifecycle();
		await life.beginStep('run1', mounts);

		await life.stopAfterStepTimeout('run2');
		expect(count('stop')).toBe(0);

		await life.endStep('run2');
		await life.endStep('run1');
		await life.endStep('run1');

		expect(log.lines.filter(line => line.includes('Step end for run'))).toHaveLength(2);
		expect(scheduler.pendingCount).toBe(1);
	});
});

describe('SandboxLifecycle interleavings', () => {
	it('an idle timer racing an assignment or an end-of-run: whichever the queue runs first wins, and a stale timer does nothing', async () => {
		const cases: {
			label: string;
			act: (life: SandboxLifecycle, timerFirst: boolean) => Promise<void>;
			timerFirst: boolean;
			calls: string[];
			status: string | undefined;
		}[] = [
			{
				label: 'timer fires, then an assignment: stop, then restart, final state running',
				timerFirst: true,
				act: async life => {
					scheduler.advance(5 * MINUTE);
					await life.beginStep('run1', mounts);
				},
				calls: ['create', 'stop', 'start'],
				status: 'running',
			},
			{
				label: 'an assignment queued before the timer callback runs: the stale timer does not stop the new step',
				timerFirst: false,
				act: async life => {
					const begin = life.beginStep('run1', mounts);
					scheduler.advance(5 * MINUTE);
					await begin;
					await life.whenSettled();
				},
				calls: ['create'],
				status: 'running',
			},
			{
				label: 'timer fires, then end-of-run: stop then remove, no error, nothing left',
				timerFirst: true,
				act: async life => {
					scheduler.advance(5 * MINUTE);
					await life.endRun('run1', 'completed');
				},
				calls: ['create', 'stop', 'remove'],
				status: undefined,
			},
			{
				label: 'end-of-run queued before the idle callback: the stale timer finds nothing to stop',
				timerFirst: false,
				act: async life => {
					const end = life.endRun('run1', 'completed');
					scheduler.advance(5 * MINUTE);
					await end;
					await life.whenSettled();
				},
				calls: ['create', 'remove'],
				status: undefined,
			},
		];
		for (const scenario of cases) {
			resetWorld();
			const life = lifecycle();
			await life.beginStep('run1', mounts);
			await life.endStep('run1');

			await scenario.act(life, scenario.timerFirst);

			expect(mutations(), scenario.label).toEqual(scenario.calls);
			expect(life.current()?.status, scenario.label).toBe(scenario.status);
			if (scenario.status === undefined) expect(runtime.has(NAME), scenario.label).toBe(false);
		}
	});

	it('an end-of-run or a shutdown racing the creation: the create completes first, then the sandbox is removed or stopped (never removed by the shutdown)', async () => {
		const cancelled = lifecycle();

		await Promise.all([cancelled.beginStep('run1', mounts), cancelled.endRun('run1', 'cancelled')]);

		expect(mutations()).toEqual(['create', 'remove']);
		expect(cancelled.current()).toBeUndefined();
		expect(runtime.has(NAME)).toBe(false);

		resetWorld();
		const shuttingDown = lifecycle();

		await Promise.all([shuttingDown.beginStep('run1', mounts), shuttingDown.shutdown()]);

		expect(mutations()).toEqual(['create', 'stop']);
		expect(count('remove')).toBe(0);
	});

	it('a slow stop delays a following assignment: start never runs before the stop finished', async () => {
		const life = lifecycle();
		await life.beginStep('run1', mounts);
		await life.endStep('run1');
		const events: string[] = [];
		let releaseStop: () => void = () => undefined;
		const gate = new Promise<void>(resolve => {
			releaseStop = resolve;
		});
		const realStop = runtime.stop.bind(runtime);
		vi.spyOn(runtime, 'stop').mockImplementation(async name => {
			events.push('stop:begin');
			await gate;
			await realStop(name);
			events.push('stop:end');
		});
		const realStart = runtime.start.bind(runtime);
		vi.spyOn(runtime, 'start').mockImplementation(async name => {
			events.push('start');
			await realStart(name);
		});

		scheduler.advance(5 * MINUTE);
		const begin = life.beginStep('run1', mounts);
		await flush();
		expect(events).toEqual(['stop:begin']);
		releaseStop();
		await begin;

		expect(events).toEqual(['stop:begin', 'stop:end', 'start']);
		expect(life.current()?.status).toBe('running');
	});
});
