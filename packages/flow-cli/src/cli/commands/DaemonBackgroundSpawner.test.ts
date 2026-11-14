import { readPortFile, writePortFile } from '@wadeck-app/singleton-daemon-kit';
import { removeTempDirectory } from 'flow-core/testing';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { recordDaemonStartError } from '../../daemon/DaemonStartError';
import { armLauncherScriptLeakGuard } from '../../test-utils/LauncherScriptLeakGuard';
import { spawnDaemonBackground } from './DaemonBackgroundSpawner';

const harness = vi.hoisted(() => ({ spawn: vi.fn(), tmpdirOverride: null as string | null, randomBytes: null as Buffer | null }));
vi.mock('node:child_process', () => ({ spawn: harness.spawn }));
// The launcher script is written to os.tmpdir(); the mocked wscript never runs it, so it would never delete itself.
// Lets one test force the random suffix of the script name, to provoke a name clash.
vi.mock('node:crypto', async importOriginal => {
	const actual = await importOriginal<typeof import('node:crypto')>();
	return { ...actual, randomBytes: (size: number) => harness.randomBytes ?? actual.randomBytes(size) };
});
vi.mock('node:os', async importOriginal => {
	const actual = await importOriginal<typeof import('node:os')>();
	return { ...actual, tmpdir: () => harness.tmpdirOverride ?? actual.tmpdir() };
});

armLauncherScriptLeakGuard();

let dir: string;
const servers: net.Server[] = [];

beforeEach(() => {
	harness.tmpdirOverride = null;
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-spawner-'));
	harness.tmpdirOverride = dir;
});
afterEach(async () => {
	await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => s.close(() => resolve()))));
	removeTempDirectory(dir);
});

/** What spawn() returns: only what the spawner uses (unref, the exit event, a pid). */
function fakeChild(): EventEmitter & { unref: () => void; pid: number } {
	return Object.assign(new EventEmitter(), { unref: () => undefined, pid: 4242 });
}

/** What a starting daemon writes first, under its own lock (see Daemon.ts startDaemon): its pid. */
function writeStartLock(pid: number, token: string): void {
	fs.writeFileSync(
		path.join(dir, 'daemon-start.lock'),
		JSON.stringify({ pid, token, acquiredAt: new Date().toISOString() })
	);
}

/** A clock that only moves when the spawner sleeps; `onTick` lets a test make the daemon do something at a given time. */
function fakeClock(onTick: (nowMs: number) => void = () => undefined) {
	let nowMs = 0;
	return {
		now: () => nowMs,
		sleep: (ms: number) => {
			nowMs += ms;
			onTick(nowMs);
			return Promise.resolve();
		},
	};
}

/** What a daemon does when it comes up: listen, then publish the port. */
async function bringUpDaemon(): Promise<number> {
	const server = net.createServer(socket => socket.destroy());
	servers.push(server);
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	const port = (server.address() as net.AddressInfo).port;
	await writePortFile(dir, port, process.pid);
	return port;
}

describe('spawnDaemonBackground', () => {
	it('does not spawn, nor touch the port file, when a daemon is already live', async () => {
		const port = await bringUpDaemon();

		await spawnDaemonBackground(dir, 2000);

		expect(harness.spawn).not.toHaveBeenCalled();
		expect((await readPortFile(dir))?.port).toBe(port);
	});

	it('starts ONE daemon for concurrent callers on a cold directory', async () => {
		// The spawned process takes a moment to come up, like a real daemon.
		harness.spawn.mockImplementation(() => {
			void delay(150).then(bringUpDaemon);
			return fakeChild();
		});

		await Promise.all([1, 2, 3, 4].map(() => spawnDaemonBackground(dir, 5000)));

		expect(harness.spawn).toHaveBeenCalledTimes(1);
	});

	it('replaces a stale port file (nothing listening) by a fresh daemon', async () => {
		await writePortFile(dir, 1, process.pid);
		harness.spawn.mockImplementation(() => {
			void delay(50).then(bringUpDaemon);
			return fakeChild();
		});

		await spawnDaemonBackground(dir, 5000);

		expect(harness.spawn).toHaveBeenCalledTimes(1);
		expect((await readPortFile(dir))?.port).not.toBe(1);
	});
});

describe('spawnDaemonBackground when the daemon dies while starting', () => {
	it('fails at once with the recorded cause instead of waiting for the timeout', async () => {
		harness.spawn.mockImplementation(() => {
			void delay(100).then(() =>
				recordDaemonStartError(dir, new Error('"/p/.flow/config.yml" is no longer read.\nMove it: mv a b'), {})
			);
			return fakeChild();
		});
		const startedAt = Date.now();

		const failure = await spawnDaemonBackground(dir, 5000).catch((err: unknown) => err as Error);

		expect(failure).toBeInstanceOf(Error);
		expect((failure as Error).message).toContain('is no longer read');
		expect((failure as Error).message).toContain('Move it: mv a b');
		expect((failure as Error).message).not.toContain('did not start within');
		expect(Date.now() - startedAt).toBeLessThan(3000);
	});

	it('ignores an error recorded by an earlier failed start', async () => {
		recordDaemonStartError(dir, new Error('old failure'), {});
		harness.spawn.mockImplementation(() => {
			void delay(50).then(bringUpDaemon);
			return fakeChild();
		});

		await expect(spawnDaemonBackground(dir, 5000)).resolves.toBe(true);
	});

	it('keeps the timeout message, with where to look, when no cause was recorded', async () => {
		harness.spawn.mockImplementation(() => fakeChild());

		const failure = await spawnDaemonBackground(dir, 300).catch((err: unknown) => err as Error);

		expect((failure as Error).message).toContain('did not start within 300ms');
		expect((failure as Error).message).toContain('flow logs');
	});
});

describe('spawnDaemonBackground while the daemon process is alive but slow', () => {
	const alive = () => true;
	const portFile = () => path.join(dir, 'config.port');

	it('keeps waiting past the 10 s grace while the daemon process holds its start lock, then succeeds', async () => {
		const clock = fakeClock(nowMs => {
			if (nowMs >= 25_000 && !fs.existsSync(portFile())) {
				fs.writeFileSync(portFile(), '1');
			}
		});
		harness.spawn.mockImplementation(() => {
			writeStartLock(process.pid, 'daemon-1');
			return fakeChild();
		});

		await expect(spawnDaemonBackground(dir, 10_000, { ...clock, isProcessAlive: alive, env: {} })).resolves.toBe(true);

		expect(clock.now()).toBeGreaterThanOrEqual(25_000);
	});

	it('gives up at the grace when no daemon process ever showed itself, and says so', async () => {
		const clock = fakeClock();
		harness.spawn.mockImplementation(() => fakeChild());

		const failure = await spawnDaemonBackground(dir, 10_000, { ...clock, isProcessAlive: alive, env: {} }).catch(
			(err: unknown) => err as Error
		);

		expect((failure as Error).message).toContain('did not start within 10000ms');
		expect((failure as Error).message).toContain('no daemon process was seen');
		expect(clock.now()).toBeLessThan(10_500);
	});

	it('fails at once, naming the pid, when the process that held the start lock is gone', async () => {
		const clock = fakeClock();
		harness.spawn.mockImplementation(() => {
			writeStartLock(999_999, 'daemon-dead');
			return fakeChild();
		});

		const failure = await spawnDaemonBackground(dir, 10_000, { ...clock, isProcessAlive: () => false, env: {} }).catch(
			(err: unknown) => err as Error
		);

		expect((failure as Error).message).toContain('pid 999999');
		expect((failure as Error).message).toContain('exited');
		expect((failure as Error).message).toContain('flow logs');
		expect(clock.now()).toBeLessThan(1000);
	});

	it('does not take the lock a crashed daemon left earlier for the daemon just spawned', async () => {
		writeStartLock(999_999, 'left-by-a-crash');
		const clock = fakeClock(nowMs => {
			if (nowMs >= 12_000 && !fs.existsSync(portFile())) {
				fs.writeFileSync(portFile(), '1');
			}
		});
		harness.spawn.mockImplementation(() => {
			writeStartLock(process.pid, 'daemon-2');
			return fakeChild();
		});

		await expect(
			spawnDaemonBackground(dir, 10_000, { ...clock, isProcessAlive: pid => pid === process.pid, env: {} })
		).resolves.toBe(true);
	});

	it('does not read a leftover lock as a sign of life when no daemon was spawned', async () => {
		writeStartLock(process.pid, 'left-by-a-crash');
		const clock = fakeClock();
		harness.spawn.mockImplementation(() => fakeChild());

		const failure = await spawnDaemonBackground(dir, 10_000, { ...clock, isProcessAlive: alive, env: {} }).catch(
			(err: unknown) => err as Error
		);

		expect((failure as Error).message).toContain('no daemon process was seen');
		expect(clock.now()).toBeLessThan(10_500);
	});

	it('stops at the hard cap and says: still running (pid), elapsed time, FLOW_DAEMON_START_TIMEOUT_MS, flow logs', async () => {
		const clock = fakeClock();
		harness.spawn.mockImplementation(() => {
			writeStartLock(process.pid, 'daemon-3');
			return fakeChild();
		});

		const failure = await spawnDaemonBackground(dir, 10_000, {
			...clock,
			isProcessAlive: alive,
			env: { FLOW_DAEMON_START_TIMEOUT_MS: '30000' },
		}).catch((err: unknown) => err as Error);

		const message = (failure as Error).message;
		expect(message).toContain(`still running (pid ${String(process.pid)})`);
		expect(message).toContain('did not start within 30000ms');
		expect(message).toMatch(/elapsed 30\d{3}ms/);
		expect(message).toContain('FLOW_DAEMON_START_TIMEOUT_MS');
		expect(message).toContain('flow logs');
		expect(clock.now()).toBeGreaterThanOrEqual(30_000);
		expect(clock.now()).toBeLessThan(31_000);
	});

	it('lets the variable shorten the grace as well (a cap of 4 s is 4 s even without a sign of life)', async () => {
		const clock = fakeClock();
		harness.spawn.mockImplementation(() => fakeChild());

		const failure = await spawnDaemonBackground(dir, 10_000, {
			...clock,
			isProcessAlive: alive,
			env: { FLOW_DAEMON_START_TIMEOUT_MS: '4000' },
		}).catch((err: unknown) => err as Error);

		expect((failure as Error).message).toContain('did not start within 4000ms');
		expect(clock.now()).toBeLessThan(4500);
	});

	it.each(['abc', '0', '-1', '2.5'])('refuses FLOW_DAEMON_START_TIMEOUT_MS=%s before spawning anything', async value => {
		const failure = await spawnDaemonBackground(dir, 10_000, { env: { FLOW_DAEMON_START_TIMEOUT_MS: value } }).catch(
			(err: unknown) => err as Error
		);

		expect((failure as Error).message).toContain('FLOW_DAEMON_START_TIMEOUT_MS');
		expect(harness.spawn).not.toHaveBeenCalled();
	});
});

// Elsewhere than Windows the spawned process IS the daemon (on Windows it is the short-lived wscript wrapper), so its exit is a signal.
describe('spawnDaemonBackground when the spawned process exits before the daemon is up (not Windows)', () => {
	const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
	beforeEach(() => {
		Object.defineProperty(process, 'platform', { ...platform, value: 'linux' });
	});
	afterEach(() => {
		Object.defineProperty(process, 'platform', platform);
	});

	it('fails at once with its pid and exit code instead of waiting', async () => {
		const clock = fakeClock();
		harness.spawn.mockImplementation(() => {
			const child = fakeChild();
			void Promise.resolve().then(() => child.emit('exit', 3, null));
			return child;
		});

		const failure = await spawnDaemonBackground(dir, 10_000, { ...clock, env: {} }).catch((err: unknown) => err as Error);

		expect((failure as Error).message).toContain('pid 4242');
		expect((failure as Error).message).toContain('exit code 3');
		expect((failure as Error).message).toContain('flow logs');
		expect(clock.now()).toBeLessThan(1000);
	});

	it('prefers the recorded start-up error when there is one', async () => {
		const clock = fakeClock();
		harness.spawn.mockImplementation(() => {
			const child = fakeChild();
			recordDaemonStartError(dir, new Error('config is invalid'), {});
			void Promise.resolve().then(() => child.emit('exit', 1, null));
			return child;
		});

		const failure = await spawnDaemonBackground(dir, 10_000, { ...clock, env: {} }).catch((err: unknown) => err as Error);

		expect((failure as Error).message).toContain('config is invalid');
	});

	describe('stderr of the spawned daemon', () => {
		const stderrFile = () => path.join(dir, 'daemon-start.stderr');
		const spawnThatExits = (whileRunning: () => void = () => undefined) =>
			harness.spawn.mockImplementation(() => {
				const child = fakeChild();
				whileRunning();
				void Promise.resolve().then(() => child.emit('exit', 1, null));
				return child;
			});
		const failureOf = (): Promise<Error> =>
			spawnDaemonBackground(dir, 10_000, { ...fakeClock(), env: {} }).then(
				() => new Error('the daemon unexpectedly started'),
				(err: unknown) => err as Error
			);

		it('goes to daemon-start.stderr (stdout stays ignored), truncated for each spawn', async () => {
			fs.writeFileSync(stderrFile(), 'left by an earlier start');
			let stdio: unknown;
			let contentAtSpawn: string | null = null;
			harness.spawn.mockImplementation((_cmd: string, _args: string[], options: { stdio: unknown }) => {
				stdio = options.stdio;
				contentAtSpawn = fs.readFileSync(stderrFile(), 'utf8');
				const child = fakeChild();
				void Promise.resolve().then(() => child.emit('exit', 1, null));
				return child;
			});

			await failureOf();

			expect(stdio).toEqual(['ignore', 'ignore', expect.any(Number)]);
			expect(contentAtSpawn).toBe('');
		});

		it('is created readable by its owner only', async () => {
			spawnThatExits();

			await failureOf();

			// POSIX mode bits do not exist on a real Windows (process.platform is faked to 'linux' here).
			if (platform.value !== 'win32') {
				expect(fs.statSync(stderrFile()).mode & 0o777).toBe(0o600);
			}
		});

		it('appends what the daemon wrote to the exit message', async () => {
			spawnThatExits(() => fs.writeFileSync(stderrFile(), 'Error: listen EADDRINUSE 127.0.0.1:4000'));

			const failure = await failureOf();

			expect(failure.message).toContain('exit code 1');
			expect(failure.message).toContain('its stderr (daemon-start.stderr)');
			expect(failure.message).toContain('Error: listen EADDRINUSE 127.0.0.1:4000');
		});

		it('keeps only the last 1500 characters of a long stderr', async () => {
			spawnThatExits(() => fs.writeFileSync(stderrFile(), `HEAD-MARKER${'x'.repeat(5000)}TAIL-MARKER`));

			const failure = await failureOf();

			expect(failure.message).toContain('TAIL-MARKER');
			expect(failure.message).not.toContain('HEAD-MARKER');
			expect(failure.message.length).toBeLessThan(2500);
		});

		it('says it wrote nothing when stderr is empty', async () => {
			spawnThatExits();

			const failure = await failureOf();

			expect(failure.message).toContain('it wrote nothing to stderr');
		});

		it('spawns with ignore, logs why, and still starts the daemon when the file cannot be opened', async () => {
			// A directory in its place: opening it for writing fails on every platform.
			fs.mkdirSync(stderrFile());
			let stdio: unknown;
			harness.spawn.mockImplementation((_cmd: string, _args: string[], options: { stdio: unknown }) => {
				stdio = options.stdio;
				void delay(30).then(bringUpDaemon);
				return fakeChild();
			});

			await expect(spawnDaemonBackground(dir, 5000)).resolves.toBe(true);

			expect(stdio).toBe('ignore');
			const logFile = fs.readdirSync(path.join(dir, 'logs')).find(name => name.endsWith('.ndjson'))!;
			const log = fs.readFileSync(path.join(dir, 'logs', logFile), 'utf8');
			expect(log).toContain('daemon-start.stderr');
			expect(log).toContain('cannot');
		});

		it('does not append the stderr to a recorded start-up error', async () => {
			spawnThatExits(() => {
				fs.writeFileSync(stderrFile(), 'noise');
				recordDaemonStartError(dir, new Error('config is invalid'), {});
			});

			const failure = await failureOf();

			expect(failure.message).toContain('config is invalid');
			expect(failure.message).not.toContain('noise');
		});
	});
});

// The launcher script only exists on Windows (elsewhere the bundle is spawned directly).
describe.skipIf(process.platform !== 'win32')('spawnDaemonBackground launcher script (Windows)', () => {
	function launchWithMockedWscript(): string {
		harness.spawn.mockImplementation(() => {
			void delay(30).then(bringUpDaemon);
			return fakeChild();
		});
		return '';
	}

	async function launchedScripts(count: number): Promise<string[]> {
		launchWithMockedWscript();
		const scripts: string[] = [];
		for (let i = 0; i < count; i++) {
			fs.rmSync(path.join(dir, 'config.port'), { force: true });
			await spawnDaemonBackground(dir, 5000);
			scripts.push((harness.spawn.mock.calls.at(-1)![1] as string[])[0]!);
		}
		return scripts;
	}

	it('gives every launch its own file: time, pid and random suffix, so two launches never share a script', async () => {
		const scripts = await launchedScripts(3);

		expect(new Set(scripts).size).toBe(3);
		for (const script of scripts) {
			expect(path.dirname(script)).toBe(dir);
			expect(path.basename(script)).toMatch(/^flow-daemon-run-\d+-\d+-[0-9a-f]{6}\.vbs$/);
			expect(path.basename(script)).toContain(`-${String(process.pid)}-`);
			expect(fs.existsSync(script)).toBe(true);
		}
	});

	it('refuses to overwrite an existing script of the same name instead of sharing it', async () => {
		harness.randomBytes = Buffer.from('abcdef', 'hex');
		const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
		const clashing = path.join(dir, `flow-daemon-run-1700000000000-${String(process.pid)}-abcdef.vbs`);
		fs.writeFileSync(clashing, 'previous launch');
		launchWithMockedWscript();

		const failure = await spawnDaemonBackground(dir, 500).catch((err: unknown) => err as Error);
		now.mockRestore();
		harness.randomBytes = null;

		expect((failure as NodeJS.ErrnoException).code).toBe('EEXIST');
		expect(fs.readFileSync(clashing, 'utf8')).toBe('previous launch');
	});

	it('writes one line to the daemon log naming the script, the pid and the bundle it points to', async () => {
		const [script] = await launchedScripts(1);

		const logFile = fs.readdirSync(path.join(dir, 'logs')).find(name => name.endsWith('.ndjson'))!;
		const entries = fs
			.readFileSync(path.join(dir, 'logs', logFile), 'utf8')
			.trim()
			.split('\n')
			.map(line => JSON.parse(line) as { msg: string });
		const launches = entries.filter(entry => entry.msg.includes('launcher script'));
		expect(launches).toHaveLength(1);
		const bundleInScript = /oShell\.Run """[^"]*"" ""([^"]*)"""/.exec(fs.readFileSync(script!, 'utf8'))![1]!;
		expect(launches[0]!.msg).toContain(script);
		expect(launches[0]!.msg).toContain(`pid ${String(process.pid)}`);
		expect(launches[0]!.msg).toContain(bundleInScript);
	});
});
