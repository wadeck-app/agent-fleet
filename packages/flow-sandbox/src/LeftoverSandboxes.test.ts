import { beforeEach, describe, expect, it } from 'vitest';

import { FakeClock } from './FakeClock';
import { FakeSandboxRuntime } from './FakeSandboxRuntime';
import { LeftoverSandboxes, formatAge } from './LeftoverSandboxes';
import { SandboxError } from './SandboxError';
import { rejection } from './testing/ExpectedFailures';
import { RecordingPresence } from './testing/RecordingPresence';
import { RecordingSandboxLog } from './testing/RecordingSandboxLog';

const MINUTE = 60_000;

let clock: FakeClock;
let runtime: FakeSandboxRuntime;
let log: RecordingSandboxLog;
let presence: RecordingPresence;
let leftovers: LeftoverSandboxes;
let stopsWhileSeeding = 0;

async function seed(name: string, status: 'running' | 'stopped' = 'running'): Promise<void> {
	await runtime.create({ name, agent: 'shell', mounts: [{ hostPath: '/w' }], cpus: 1, memory: '1g' });
	if (status === 'stopped') await runtime.stop(name);
}

function count(method: Parameters<FakeSandboxRuntime['callsTo']>[0]): number {
	return runtime.callsTo(method).length;
}

beforeEach(() => {
	clock = new FakeClock(Date.UTC(2026, 9, 27, 12));
	runtime = new FakeSandboxRuntime({ clock });
	log = new RecordingSandboxLog();
	presence = new RecordingPresence();
	leftovers = new LeftoverSandboxes(runtime, clock, log, presence);
});

describe('LeftoverSandboxes.list', () => {
	it('lists only sandboxes carrying the marker, with wrapper, run, status and age, oldest first', async () => {
		await seed('flow-sbx-w1-run1');
		clock.advance(90 * MINUTE);
		await seed('flow-sbx-w2-run2', 'stopped');
		await seed('personal-box');
		await seed('flow-sbx-w3');
		clock.advance(10 * MINUTE);

		expect(await leftovers.list()).toEqual([
			{ name: 'flow-sbx-w1-run1', wrapperId: 'w1', executionId: 'run1', status: 'running', ageMs: 100 * MINUTE },
			{ name: 'flow-sbx-w2-run2', wrapperId: 'w2', executionId: 'run2', status: 'stopped', ageMs: 10 * MINUTE },
		]);
	});

	it('is empty when nothing matches, and propagates a listing failure', async () => {
		await seed('personal-box');
		expect(await leftovers.list()).toEqual([]);

		runtime.failNext('list', new SandboxError('command-failed', 'sbx not reachable'));
		await expect(leftovers.list()).rejects.toThrow('sbx not reachable');
	});

	it('reports an unknown age when sbx gives no creation time or an unreadable one', async () => {
		await seed('flow-sbx-w1-run1');
		const original = runtime.list.bind(runtime);

		for (const createdAt of [undefined, 'yesterday-ish']) {
			runtime.list = async () => (await original()).map(info => ({ ...info, createdAt }));

			expect((await leftovers.list())[0]?.ageMs, String(createdAt)).toBeUndefined();
		}
	});
});

describe('LeftoverSandboxes.reportAtStart', () => {
	it('logs a warning with one line per sandbox and the way to remove, and returns the list, and stops nothing', async () => {
		await seed('flow-sbx-w1-run1');
		clock.advance(5 * MINUTE);

		const found = await leftovers.reportAtStart();

		expect(found).toHaveLength(1);
		expect(log.lines).toEqual([
			'warn: 1 plugin sandbox(es) exist from earlier runs. They are never removed automatically; remove one whose run is over with `leftover remove <name>`.',
			'warn:   flow-sbx-w1-run1: wrapper w1, run run1, running, age 5min',
		]);
		expect(count('stop')).toBe(0);
		expect(count('remove')).toBe(0);
	});

	it('says so when there is nothing left', async () => {
		expect(await leftovers.reportAtStart()).toEqual([]);
		expect(log.lines).toEqual(['info: No leftover plugin sandboxes.']);
	});
});

describe('LeftoverSandboxes.reapOwn', () => {
	beforeEach(async () => {
		await seed('flow-sbx-w1-stale1');
		await seed('flow-sbx-w1-stale2');
		await seed('flow-sbx-w1-live1');
		await seed('flow-sbx-w1-asleep', 'stopped');
		await seed('flow-sbx-w2-theirs');
		await seed('personal-box');
		stopsWhileSeeding = count('stop');
	});

	it('stops this wrapper own running sandboxes whose run is not alive, and nothing else; never removes', async () => {
		const result = await leftovers.reapOwn('w1', new Set(['live1']));

		expect(result.stopped.map(entry => entry.name)).toEqual(['flow-sbx-w1-stale1', 'flow-sbx-w1-stale2']);
		expect(result.failed).toEqual([]);
		expect(
			runtime
				.callsTo('stop')
				.slice(stopsWhileSeeding)
				.map(call => call.request)
		).toEqual(['flow-sbx-w1-stale1', 'flow-sbx-w1-stale2']);
		expect(runtime.state('flow-sbx-w1-stale1').status).toBe('stopped');
		expect(runtime.state('flow-sbx-w1-live1').status).toBe('running');
		expect(runtime.state('flow-sbx-w2-theirs').status).toBe('running');
		expect(runtime.state('personal-box').status).toBe('running');
		expect(count('remove')).toBe(0);
		expect(runtime.has('flow-sbx-w1-stale1')).toBe(true);
	});

	it('reports a sandbox it could not stop, with the manual command, and keeps going', async () => {
		runtime.failNext('stop', new SandboxError('command-failed', 'busy'), {
			when: request => request === 'flow-sbx-w1-stale1',
		});

		const result = await leftovers.reapOwn('w1', new Set(['live1']));

		expect(result.stopped.map(entry => entry.name)).toEqual(['flow-sbx-w1-stale2']);
		expect(result.failed.map(entry => [entry.sandbox.name, entry.reason])).toEqual([
			['flow-sbx-w1-stale1', 'busy'],
		]);
		expect(log.text()).toContain(
			'Could not stop stale sandbox "flow-sbx-w1-stale1": busy. Stop it with `sbx stop flow-sbx-w1-stale1`.'
		);
	});

	it('does nothing for a wrapper without sandboxes, and refuses an invalid wrapper id before listing anything', async () => {
		const result = await leftovers.reapOwn('w9', new Set());
		expect(result).toEqual({ stopped: [], failed: [] });
		expect(count('stop')).toBe(stopsWhileSeeding);

		const listsBefore = count('list');
		const error = await rejection(leftovers.reapOwn('W1', new Set()));
		expect(error.kind).toBe('invalid-argument');
		expect(count('list')).toBe(listsBefore);
	});
});

describe('LeftoverSandboxes.remove', () => {
	beforeEach(async () => {
		await seed('flow-sbx-w1-run1', 'stopped');
		await seed('flow-sbx-w1-run2', 'stopped');
		await seed('personal-box');
	});

	it('removes exactly the named sandbox when neither its run nor its wrapper is alive, also a running one of a crashed wrapper', async () => {
		await leftovers.remove('flow-sbx-w1-run1');

		expect(runtime.callsTo('remove').map(call => call.request)).toEqual(['flow-sbx-w1-run1']);
		expect(runtime.has('flow-sbx-w1-run1')).toBe(false);
		expect(runtime.has('flow-sbx-w1-run2')).toBe(true);
		expect(runtime.has('personal-box')).toBe(true);
		expect(log.text()).toContain('Removed leftover sandbox "flow-sbx-w1-run1" on explicit request.');

		await seed('flow-sbx-w3-crashed');
		await leftovers.remove('flow-sbx-w3-crashed');
		expect(runtime.has('flow-sbx-w3-crashed')).toBe(false);
	});

	it('refuses while the run or the wrapper is alive, naming which, and removes nothing', async () => {
		presence.aliveRuns.add('run1');
		const runAlive = await rejection(leftovers.remove('flow-sbx-w1-run1'));
		expect(runAlive.kind).toBe('removal-refused');
		expect(runAlive.message).toContain('run run1 is still alive');
		presence.aliveRuns.clear();

		presence.aliveWrappers.add('w1');
		const wrapperAlive = await rejection(leftovers.remove('flow-sbx-w1-run1'));
		expect(wrapperAlive.kind).toBe('removal-refused');
		expect(wrapperAlive.message).toContain('wrapper w1 is still alive');

		expect(count('remove')).toBe(0);
		expect(runtime.has('flow-sbx-w1-run1')).toBe(true);
	});

	it('refuses a name that is not a plugin sandbox without touching anything', async () => {
		const cases: [string, string][] = [
			['a sandbox without the marker', 'personal-box'],
			['a wildcard', 'flow-sbx-*'],
			['a prefix of the marker', 'flow-sbx-'],
			['only a wrapper id', 'flow-sbx-w1'],
			['an uppercase variant', 'FLOW-SBX-w1-run1'],
			['a path', 'flow-sbx-w1-../x'],
			['the empty string', ''],
		];
		for (const [label, name] of cases) {
			const error = await rejection(leftovers.remove(name), label);

			expect(error.kind, label).toBe('removal-refused');
			expect(error.message, label).toContain('not a plugin sandbox');
		}
		expect(count('remove')).toBe(0);
		expect(count('list')).toBe(0);
		expect(runtime.has('personal-box')).toBe(true);
	});

	it('requires the exact name (not-found, not a fuzzy match) and propagates a failure of sbx rm', async () => {
		const error = await rejection(leftovers.remove('flow-sbx-w1-run'));
		expect(error.kind).toBe('not-found');
		expect(error.message).toContain('Check the exact name');
		expect(count('remove')).toBe(0);
		expect(runtime.has('flow-sbx-w1-run1')).toBe(true);

		runtime.failNext('remove', new SandboxError('command-failed', 'rm failed'));
		await expect(leftovers.remove('flow-sbx-w1-run1')).rejects.toThrow('rm failed');
	});
});

describe('formatAge', () => {
	it('formats unknown, seconds, minutes, hours and days', () => {
		const cases: [number | undefined, string][] = [
			[undefined, 'unknown'],
			[0, '0s'],
			[59_999, '59s'],
			[60_000, '1min'],
			[119 * 60_000, '119min'],
			[120 * 60_000, '2h'],
			[47 * 3_600_000, '47h'],
			[48 * 3_600_000, '2d'],
		];
		for (const [ageMs, expected] of cases) expect(formatAge(ageMs), String(ageMs)).toBe(expected);
	});
});
