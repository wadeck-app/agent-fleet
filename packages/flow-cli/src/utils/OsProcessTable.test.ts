import { spawn } from 'node:child_process';
import * as net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import { type OsProcessReaderOptions, listListeningPorts, listOsProcesses, parseElapsed } from './OsProcessTable';

type SpawnResult = ReturnType<NonNullable<OsProcessReaderOptions['spawn']>>;

describe('parseElapsed', () => {
	it.each([
		['00:05', 5],
		['01:05', 65],
		['02:01:05', 7265],
		['5-13:00:00', 5 * 86400 + 13 * 3600],
	])('%s -> %i s', (etime, seconds) => {
		expect(parseElapsed(etime)).toBe(seconds);
	});

	it('returns undefined for something that is not an elapsed time', () => {
		expect(parseElapsed('soon')).toBeUndefined();
	});
});

// Measured 2026-10-26: with 3 busy processes per core, one Get-CimInstance listing took 5 to 25 s instead of 0.75 s.
// A full parallel run starts several listings at once, so the reader must be testable without the machine's load.
describe('listOsProcesses with an injected reader', () => {
	const started = Date.UTC(2026, 9, 26, 10, 0, 0);
	const win32 = (stdout: string, extra: Partial<SpawnResult> = {}): OsProcessReaderOptions => ({
		platform: 'win32',
		spawn: () => ({ status: 0, stdout, stderr: '', ...extra }) as SpawnResult,
	});

	it('maps the PowerShell rows, tolerating a null command line and start time', () => {
		const json = JSON.stringify([
			{ ProcessId: 10, ParentProcessId: 1, CommandLine: 'node a.js', StartedMs: started },
			{ ProcessId: 11, ParentProcessId: 10, CommandLine: null, StartedMs: null },
		]);

		expect(listOsProcesses(new Date(), win32(json))).toEqual([
			{ pid: 10, ppid: 1, commandLine: 'node a.js', startedAt: new Date(started) },
			{ pid: 11, ppid: 10, commandLine: '' },
		]);
	});

	it('wraps a single row that PowerShell did not put in an array', () => {
		const json = JSON.stringify({ ProcessId: 10, ParentProcessId: 1, CommandLine: 'x', StartedMs: null });

		expect(listOsProcesses(new Date(), win32(json))).toHaveLength(1);
	});

	it('names the tool and the position when the listing is not valid JSON, instead of a bare parse error', () => {
		expect(() => listOsProcesses(new Date(), win32('[{"ProcessId":1,"CommandLine":"ab"}]'))).toThrow(
			/PowerShell.*not valid JSON.*Bad control character/s
		);
	});

	it('passes the requested timeout to the OS tool', () => {
		let seen: number | undefined;
		listOsProcesses(new Date(), {
			platform: 'win32',
			timeoutMs: 123_000,
			spawn: ((_command: string, _args: string[], options: { timeout?: number }) => {
				seen = options.timeout;
				return { status: 0, stdout: '[]', stderr: '' };
			}) as unknown as OsProcessReaderOptions['spawn'],
		});

		expect(seen).toBe(123_000);
	});

	it('says the machine was too busy when the listing timed out', () => {
		const timedOut = win32('', {
			status: null,
			error: Object.assign(new Error('spawnSync powershell ETIMEDOUT'), { code: 'ETIMEDOUT' }),
		});

		expect(() => listOsProcesses(new Date(), { ...timedOut, timeoutMs: 5000 })).toThrow(
			/timed out after 5 s.*busy/s
		);
	});
});

// The listing blocks the thread (spawnSync) so vitest cannot interrupt it: the OS tool must time out BEFORE the
// test does, otherwise a slow machine reports a bare test timeout instead of the reader's own error.
const REAL_TEST_TIMEOUT_MS = 180_000;
const REAL: OsProcessReaderOptions = { timeoutMs: 120_000 };

describe('the real process table', () => {
	let child: ReturnType<typeof spawn> | undefined;
	let server: net.Server | undefined;

	afterEach(() => {
		if (child?.pid !== undefined) {
			try {
				process.kill(child.pid, 'SIGKILL');
			} catch {
				/* already gone */
			}
		}
		server?.close();
	});

	it(
		'lists this process with its parent, command line and a plausible start time',
		() => {
			const table = listOsProcesses(new Date(), REAL);

			const me = table.find(p => p.pid === process.pid);
			expect(me, 'the test process is missing from the process table').toBeDefined();
			expect(me!.ppid).toBeGreaterThan(0);
			expect(me!.commandLine).toContain('node');
			expect(me!.startedAt).toBeInstanceOf(Date);
			expect(me!.startedAt!.getTime()).toBeLessThanOrEqual(Date.now());
		},
		REAL_TEST_TIMEOUT_MS
	);

	it(
		'lists a child process spawned by this one under this pid',
		() => {
			child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
				stdio: 'ignore',
				windowsHide: true,
			});

			const mine = listOsProcesses(new Date(), REAL).find(p => p.pid === child!.pid);

			expect(mine?.ppid).toBe(process.pid);
		},
		REAL_TEST_TIMEOUT_MS
	);

	// Measured 2026-10-31: the Windows console code page is 850, and PowerShell encodes its output with it. In that code page
	// U+2192 is byte 0x1A, U+2022 is 0x07 and U+263A is 0x01: raw control bytes inside the JSON strings, so JSON.parse
	// threw "Bad control character" as soon as ANY process of the machine had such a character in its command line.
	it(
		'lists a process whose command line has characters that a legacy console code page encodes as control bytes',
		() => {
			const odd = 'arrow→ bullet• smile☺ accenté cjk中';
			child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', odd], { stdio: 'ignore', windowsHide: true });

			const mine = listOsProcesses(new Date(), REAL).find(p => p.pid === child!.pid);

			expect(mine?.commandLine).toContain(odd);
		},
		REAL_TEST_TIMEOUT_MS
	);

	it(
		'reports the port this process listens on',
		async () => {
			server = net.createServer();
			await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
			const port = (server.address() as net.AddressInfo).port;

			const ports = listListeningPorts();

			if (ports === undefined) {
				throw new Error(
					'listListeningPorts() returned undefined: neither PowerShell nor lsof could list the listening ports here.'
				);
			}
			expect(ports.get(process.pid)).toContain(port);
		},
		REAL_TEST_TIMEOUT_MS
	);
});
