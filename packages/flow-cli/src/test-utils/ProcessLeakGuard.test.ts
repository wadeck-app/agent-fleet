import { removeTempDirectory } from 'flow-core/testing';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createIsolatedCliEnv } from './IsolatedCliEnv';
import { type OsProcess, ProcessLeakGuard, descendantsOf, isFlowProcess } from './ProcessLeakGuard';
import { pollUntil, runAfter, settlesWithin } from './WaitHelpers';

const ROOT = 100;
const proc = (pid: number, ppid: number, commandLine: string): OsProcess => ({ pid, ppid, commandLine });

describe('isFlowProcess', () => {
	it.each([
		['node C:\\x\\install\\flow.cjs', true],
		['node /tmp/install/worker.cjs', true],
		['node --import file:///loader.mjs C:\\repo\\dist\\worker\\Worker.js', true],
		['node tsx/dist/cli.mjs C:\\repo\\src\\cli\\FlowIndex.ts run', true],
		['node C:\\repo\\bin\\flow.js run x', true],
		['node vitest.mjs run', false],
		['powershell Get-CimInstance Win32_Process', false],
	])('%s -> %s', (commandLine, expected) => {
		expect(isFlowProcess(commandLine)).toBe(expected);
	});
});

describe('descendantsOf', () => {
	it('walks through any depth, including processes that are not node', () => {
		const table = [
			proc(1, ROOT, 'cmd'),
			proc(2, 1, 'node flow.cjs'),
			proc(3, 2, 'worker.cjs'),
			proc(4, 999, 'other'),
		];

		expect(descendantsOf(ROOT, table).map(p => p.pid)).toEqual([1, 2, 3]);
	});
});

describe('ProcessLeakGuard (injected process table)', () => {
	function guardOver(table: () => OsProcess[], options: { graceMs?: number } = {}) {
		const killed: number[] = [];
		const guard = new ProcessLeakGuard({
			rootPid: ROOT,
			lister: table,
			pollMs: 5,
			graceMs: options.graceMs ?? 50,
			kill: pid => killed.push(pid),
		});
		return { guard, killed };
	}

	it('passes, and scans nothing, when no test armed it', async () => {
		let scans = 0;
		const { guard } = guardOver(() => {
			scans++;
			return [];
		});

		await guard.verify();

		expect(scans).toBe(0);
	});

	it('ignores flow processes that were already running when it was armed', async () => {
		const table = [proc(2, ROOT, 'node flow.cjs')];
		const { guard } = guardOver(() => table);
		guard.arm();

		await guard.verify();
	});

	it('names every flow process that outlives the teardown, then kills them', async () => {
		let table: OsProcess[] = [];
		const { guard, killed } = guardOver(() => table);
		guard.arm();
		table = [
			proc(7, ROOT, 'node C:\\install\\flow.cjs'),
			proc(8, 7, 'node C:\\install\\worker.cjs'),
			proc(9, ROOT, 'vitest'),
		];

		const failure = await guard.verify().then(
			() => undefined,
			(err: Error) => err
		);

		expect(failure?.message).toContain('pid 7');
		expect(failure?.message).toContain('pid 8');
		expect(failure?.message).not.toContain('pid 9');
		expect(killed.sort()).toEqual([7, 8]);
	});

	it('gives a process time to finish exiting before it counts as a leak', async () => {
		let table: OsProcess[] = [];
		const { guard, killed } = guardOver(() => table, { graceMs: 2_000 });
		guard.arm();
		table = [proc(7, ROOT, 'node flow.cjs')];
		runAfter(60, () => (table = []));

		await guard.verify();

		expect(killed).toEqual([]);
	});

	// A daemon started through wscript is detached from its starter: ancestry cannot find it, the marker can.
	it('finds an orphaned process by the watched directory in its command line', async () => {
		let table: OsProcess[] = [];
		const { guard, killed } = guardOver(() => table);
		guard.arm();
		guard.watch('flow-test-install-abc');
		table = [
			proc(7, 1, 'node C:\\tmp\\flow-test-install-abc\\flow.cjs'),
			proc(8, 1, 'node C:\\tmp\\someone-elses\\flow.cjs'),
		];

		await expect(guard.verify()).rejects.toThrow(/pid 7/);

		expect(killed).toEqual([7]);
	});

	it('refuses an empty marker, which would match every process', () => {
		const { guard } = guardOver(() => []);

		expect(() => guard.watch('')).toThrow(/non-empty marker/);
	});
});

describe('ProcessLeakGuard (real processes)', () => {
	let directory: string | undefined;
	let child: ReturnType<typeof spawn> | undefined;
	let isolationRoot: string | undefined;

	afterEach(() => {
		if (child?.pid !== undefined) {
			try {
				process.kill(child.pid, 'SIGKILL');
			} catch {
				/* already killed by the guard */
			}
		}
		if (directory !== undefined) {
			removeTempDirectory(directory);
		}
		if (isolationRoot !== undefined) {
			removeTempDirectory(isolationRoot);
		}
	});

	it('detects, names and kills a real process that survives its test', async () => {
		directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-leak-guard-'));
		const script = path.join(directory, 'flow.cjs');
		fs.writeFileSync(script, 'setInterval(() => {}, 1000);\n');
		const guard = new ProcessLeakGuard({ graceMs: 1_000, pollMs: 200 });
		guard.arm();
		guard.watch(directory);
		// Isolated env like every spawned flow-named script (a stand-in that only loops, but the rule is uniform).
		const isolation = createIsolatedCliEnv();
		isolationRoot = isolation.root;
		child = spawn(process.execPath, [script], { stdio: 'ignore', windowsHide: true, env: isolation.env });
		const pid = child.pid!;
		const exited = new Promise<void>(resolve => child!.once('exit', () => resolve()));
		await pollUntil(() => guard.findLeaks().some(p => p.pid === pid), { timeoutMs: 20_000, intervalMs: 500 });

		await expect(guard.verify()).rejects.toThrow(new RegExp(`pid ${String(pid)}\\b`));

		expect(await settlesWithin(exited, 10_000), 'the leaked process was not killed').toBe(true);
	}, 60_000);
});
