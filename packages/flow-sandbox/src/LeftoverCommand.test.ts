import { beforeEach, describe, expect, it } from 'vitest';

import { FakeClock } from './FakeClock';
import { FakeSandboxRuntime } from './FakeSandboxRuntime';
import { LEFTOVER_EXIT_FAILED, LEFTOVER_EXIT_OK, LEFTOVER_EXIT_USAGE, LeftoverCommand } from './LeftoverCommand';
import { LeftoverSandboxes } from './LeftoverSandboxes';
import { SandboxError } from './SandboxError';
import { RecordingPresence } from './testing/RecordingPresence';
import { RecordingSandboxLog } from './testing/RecordingSandboxLog';

let clock: FakeClock;
let runtime: FakeSandboxRuntime;
let presence: RecordingPresence;
let out: string[];
let err: string[];
let command: LeftoverCommand;

async function seed(name: string): Promise<void> {
	await runtime.create({ name, agent: 'shell', mounts: [{ hostPath: '/w' }], cpus: 1, memory: '1g' });
}

beforeEach(() => {
	clock = new FakeClock(Date.UTC(2026, 9, 27));
	runtime = new FakeSandboxRuntime({ clock });
	presence = new RecordingPresence();
	out = [];
	err = [];
	command = new LeftoverCommand(new LeftoverSandboxes(runtime, clock, new RecordingSandboxLog(), presence), {
		out: line => out.push(line),
		err: line => err.push(line),
	});
});

describe('LeftoverCommand list', () => {
	it('prints a tab-separated table and exits 0', async () => {
		await seed('flow-sbx-w1-run1');
		clock.advance(3 * 60_000);

		expect(await command.run(['list'])).toBe(LEFTOVER_EXIT_OK);

		expect(out).toEqual(['NAME\tWRAPPER\tRUN\tSTATUS\tAGE', 'flow-sbx-w1-run1\tw1\trun1\trunning\t3min']);
		expect(err).toEqual([]);
	});

	it('says there is nothing when empty and exits 0', async () => {
		expect(await command.run(['list'])).toBe(LEFTOVER_EXIT_OK);

		expect(out).toEqual(['No plugin sandboxes.']);
	});

	it('exits 1 with the kind and message when sbx fails', async () => {
		runtime.failNext('list', new SandboxError('command-failed', 'sbx not reachable'));

		expect(await command.run(['list'])).toBe(LEFTOVER_EXIT_FAILED);

		expect(err).toEqual(['command-failed: sbx not reachable']);
		expect(out).toEqual([]);
	});

	it('rejects extra arguments with usage and exit 2', async () => {
		expect(await command.run(['list', 'extra'])).toBe(LEFTOVER_EXIT_USAGE);

		expect(err[0]).toContain('Unknown or incomplete command "list extra"');
		expect(err.join('\n')).toContain('Usage: leftover list');
	});
});

describe('LeftoverCommand remove', () => {
	it('removes the named sandbox, confirms and exits 0', async () => {
		await seed('flow-sbx-w1-run1');

		expect(await command.run(['remove', 'flow-sbx-w1-run1'])).toBe(LEFTOVER_EXIT_OK);

		expect(out).toEqual(['Removed flow-sbx-w1-run1.']);
		expect(runtime.has('flow-sbx-w1-run1')).toBe(false);
	});

	it('exits 1 with an explanation when the run is alive and removes nothing', async () => {
		await seed('flow-sbx-w1-run1');
		presence.aliveRuns.add('run1');

		expect(await command.run(['remove', 'flow-sbx-w1-run1'])).toBe(LEFTOVER_EXIT_FAILED);

		expect(err).toHaveLength(1);
		expect(err[0]).toContain('removal-refused: Refusing to remove "flow-sbx-w1-run1": run run1 is still alive');
		expect(runtime.has('flow-sbx-w1-run1')).toBe(true);
	});

	it('exits 1 for a name without the marker', async () => {
		await seed('personal-box');

		expect(await command.run(['remove', 'personal-box'])).toBe(LEFTOVER_EXIT_FAILED);

		expect(err[0]).toContain('not a plugin sandbox');
		expect(runtime.has('personal-box')).toBe(true);
	});

	it.each([
		['no name', ['remove']],
		['two names', ['remove', 'a', 'b']],
		['an option instead of a name', ['remove', '--all']],
	])('exits 2 with usage for %s', async (_label, args) => {
		expect(await command.run(args)).toBe(LEFTOVER_EXIT_USAGE);

		expect(err.join('\n')).toContain('"remove" takes exactly one exact sandbox name');
		expect(runtime.callsTo('remove')).toHaveLength(0);
	});
});

describe('LeftoverCommand usage', () => {
	it('exits 2 and prints the usage when no command is given', async () => {
		expect(await command.run([])).toBe(LEFTOVER_EXIT_USAGE);

		expect(err[0]).toBe('Missing command.');
		expect(err).toContain('Exit codes: 0 done, 1 refused or failed, 2 usage error.');
	});

	it('exits 2 for an unknown command', async () => {
		expect(await command.run(['purge'])).toBe(LEFTOVER_EXIT_USAGE);

		expect(err[0]).toContain('Unknown or incomplete command "purge"');
	});
});
