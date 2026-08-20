// UpdaterMain.test.ts
// vi.mock calls are hoisted before imports by vitest — mocks are in place when the module loads.
import { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Imported AFTER vi.mock declarations so the module sees the mocked dependencies.
import { main, parseCheckInterval, semverLte, tryAcquireLock } from './UpdaterMain.js';

vi.mock('node:fs', () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
	writeFileSync: vi.fn(),
	appendFileSync: vi.fn(),
	mkdirSync: vi.fn(),
	openSync: vi.fn(),
	writeSync: vi.fn(),
	closeSync: vi.fn(),
	unlinkSync: vi.fn(),
	constants: {
		// Use the standard POSIX values so bit-OR in tryAcquireLock works as written.
		O_CREAT: 64,
		O_EXCL: 128,
		O_WRONLY: 1,
	},
}));

vi.mock('node:child_process', () => ({
	execFile: vi.fn(),
	execFileSync: vi.fn(),
}));

vi.mock('./configDir.js', () => ({
	getConfigDir: vi.fn(() => '/test/config/dir'),
}));

// ---------------------------------------------------------------------------
// Helper: make execFile call its last argument (the promisify callback)
// ---------------------------------------------------------------------------
type ExecFileCb = (err: Error | null, result?: { stdout: string; stderr: string }) => void;

function mockExecFileSuccess(stdoutByKey: Record<string, string>): void {
	vi.mocked(execFile).mockImplementation(((...args: unknown[]) => {
		const cb = args.at(-1) as ExecFileCb;
		const cmd = args[0] as string;
		const argv = (args[1] as string[] | undefined) ?? [];
		const key = [cmd, ...argv].join(' ');
		const stdout = stdoutByKey[key] ?? stdoutByKey['*'] ?? '';
		cb(null, { stdout: stdout + '\n', stderr: '' });
	}) as typeof execFile);
}

function mockExecFileError(err: Error): void {
	vi.mocked(execFile).mockImplementation(((...args: unknown[]) => {
		const cb = args.at(-1) as ExecFileCb;
		cb(err);
	}) as typeof execFile);
}

// ---------------------------------------------------------------------------
// semverLte — pure function, no mocks needed
// ---------------------------------------------------------------------------
describe('semverLte', () => {
	it('equal versions → true', () => {
		expect(semverLte('1.0.0', '1.0.0')).toBe(true);
	});

	it('a < b → true', () => {
		expect(semverLte('1.0.0', '1.0.1')).toBe(true);
	});

	it('a > b → false', () => {
		expect(semverLte('1.0.1', '1.0.0')).toBe(false);
	});

	it('CalVer build number increment → true', () => {
		expect(semverLte('2026.08.20', '2026.08.20')).toBe(true);
	});

	it('major version lower → true', () => {
		expect(semverLte('1.9.9', '2.0.0')).toBe(true);
	});

	it('major version higher → false', () => {
		expect(semverLte('2.0.0', '1.9.9')).toBe(false);
	});

	it('pre-release suffix is stripped before comparison', () => {
		// '2026.08.20-319-abc' vs '2026.08.20-320-xyz' → only major.minor.patch compared → equal → true
		expect(semverLte('2026.08.20-319-abc', '2026.08.20-320-xyz')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// parseCheckInterval — pure function, no mocks needed
// ---------------------------------------------------------------------------
describe('parseCheckInterval', () => {
	it("'30m' → 1 800 000 ms", () => {
		expect(parseCheckInterval('30m')).toBe(30 * 60 * 1000);
	});

	it("'2h' → 7 200 000 ms", () => {
		expect(parseCheckInterval('2h')).toBe(2 * 60 * 60 * 1000);
	});

	it("'1d' → 86 400 000 ms", () => {
		expect(parseCheckInterval('1d')).toBe(24 * 60 * 60 * 1000);
	});

	it('invalid value → default 1 800 000 ms', () => {
		expect(parseCheckInterval('invalid')).toBe(30 * 60 * 1000);
	});

	it('empty string → default', () => {
		expect(parseCheckInterval('')).toBe(30 * 60 * 1000);
	});
});

// ---------------------------------------------------------------------------
// tryAcquireLock — mocked fs
// ---------------------------------------------------------------------------
describe('tryAcquireLock', () => {
	beforeEach(() => {
		vi.mocked(fs.writeSync).mockReturnValue(5);
		vi.mocked(fs.closeSync).mockReturnValue(undefined);
		vi.mocked(fs.unlinkSync).mockReturnValue(undefined);
	});

	it('succeeds when lock file does not exist', () => {
		vi.mocked(fs.openSync).mockReturnValue(3);

		const result = tryAcquireLock('/tmp/test.lock');

		expect(result).toBe(true);
		expect(vi.mocked(fs.openSync)).toHaveBeenCalledOnce();
	});

	it('returns false when lock exists and PID is alive', () => {
		const eexistErr = Object.assign(new Error('EEXIST'), { code: 'EEXIST' }) as NodeJS.ErrnoException;
		vi.mocked(fs.openSync).mockImplementation(() => {
			throw eexistErr;
		});
		// readFileSync returns a living PID (use current process PID to guarantee it exists)
		vi.mocked(fs.readFileSync).mockReturnValue(String(process.pid) as unknown as string);
		// process.kill(pid, 0) should NOT throw → process is alive
		const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true);

		const result = tryAcquireLock('/tmp/test.lock');

		expect(result).toBe(false);
		expect(killSpy).toHaveBeenCalledWith(process.pid, 0);
	});

	it('acquires lock when lock exists but PID is dead', () => {
		const eexistErr = Object.assign(new Error('EEXIST'), { code: 'EEXIST' }) as NodeJS.ErrnoException;
		// First openSync throws EEXIST; retry after stale-lock removal succeeds
		vi.mocked(fs.openSync).mockImplementationOnce(() => {
			throw eexistErr;
		});
		vi.mocked(fs.openSync).mockReturnValue(7);
		vi.mocked(fs.readFileSync).mockReturnValue('99999' as unknown as string);
		// process.kill throws → process is dead
		vi.spyOn(process, 'kill').mockImplementation(() => {
			throw new Error('ESRCH');
		});

		const result = tryAcquireLock('/tmp/test.lock');

		expect(result).toBe(true);
		expect(vi.mocked(fs.unlinkSync)).toHaveBeenCalledWith('/tmp/test.lock');
		// Second openSync for the retry
		expect(vi.mocked(fs.openSync)).toHaveBeenCalledTimes(2);
	});
});

// ---------------------------------------------------------------------------
// main() — full mocked I/O
// ---------------------------------------------------------------------------
describe('main', () => {
	beforeEach(() => {
		// Default: all fs operations succeed silently
		vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
		vi.mocked(fs.openSync).mockReturnValue(3);
		vi.mocked(fs.writeSync).mockReturnValue(5);
		vi.mocked(fs.closeSync).mockReturnValue(undefined);
		vi.mocked(fs.unlinkSync).mockReturnValue(undefined);
		vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
		vi.mocked(fs.appendFileSync).mockReturnValue(undefined);
		// Default: no config file and no cache → proceed normally
		vi.mocked(fs.existsSync).mockReturnValue(false);
		// Ensure UPDATER_FORCE is unset so tests control cache behaviour themselves
		delete process.env['UPDATER_FORCE'];
	});

	it('disabled=true in config exits early without calling npm', async () => {
		// Config file exists and contains 'disabled: true'
		vi.mocked(fs.existsSync).mockImplementation(p => String(p).endsWith('config.yml'));
		vi.mocked(fs.readFileSync).mockReturnValue('disabled: true\n' as unknown as string);

		await main();

		expect(vi.mocked(execFile)).not.toHaveBeenCalled();
	});

	it('cache still valid exits early without calling npm', async () => {
		// Cache file exists with a very recent checkedAt timestamp (1 second ago)
		vi.mocked(fs.existsSync).mockImplementation(p => String(p).endsWith('.update-cache.json'));
		vi.mocked(fs.readFileSync).mockReturnValue(
			JSON.stringify({ checkedAt: Date.now() - 1_000 }) as unknown as string
		);

		await main();

		expect(vi.mocked(execFile)).not.toHaveBeenCalled();
	});

	it('already up to date exits without installing', async () => {
		// npm view returns '1.0.0' which equals __FLOW_CLI_VERSION__ ('1.0.0' from vitest define)
		mockExecFileSuccess({
			'npm view @wadeck/flow-cli dist-tags.edge': '1.0.0',
		});

		await main();

		// npm install should NOT have been called
		const installCalls = vi
			.mocked(execFile)
			.mock.calls.filter(c => (c[1] as string[] | undefined)?.includes('install'));
		expect(installCalls).toHaveLength(0);
	});

	it('new version found → installs and writes success state', async () => {
		mockExecFileSuccess({
			'npm view @wadeck/flow-cli dist-tags.edge': '9.9.9',
			'npm install -g @wadeck/flow-cli@9.9.9': '',
			'npm root -g': '/usr/local/lib/node_modules',
		});
		// Health check (execFileSync) succeeds
		vi.mocked(execFileSync).mockReturnValue(Buffer.from(''));

		await main();

		// Locate the writeFileSync call for update-state.json
		const calls = vi.mocked(fs.writeFileSync).mock.calls;
		const stateCalls = calls.filter(c => String(c[0]).endsWith('update-state.json'));
		const stateCall = stateCalls[stateCalls.length - 1];
		expect(stateCall).toBeDefined();
		const state = JSON.parse(stateCall![1] as string) as { status: string; newVersion: string };
		expect(state.status).toBe('success');
		expect(state.newVersion).toBe('9.9.9');
	});

	it('health check fails → rolls back and writes rolled-back state', async () => {
		mockExecFileSuccess({
			'npm view @wadeck/flow-cli dist-tags.edge': '9.9.9',
			'npm install -g @wadeck/flow-cli@9.9.9': '',
			// Rollback install also succeeds
			'npm install -g @wadeck/flow-cli@1.0.0': '',
			'npm root -g': '/usr/local/lib/node_modules',
		});
		// Health check throws → self-check failed
		vi.mocked(execFileSync).mockImplementation(() => {
			throw new Error('self-check failed: exit 1');
		});

		await main();

		const calls = vi.mocked(fs.writeFileSync).mock.calls;
		const stateCalls = calls.filter(c => String(c[0]).endsWith('update-state.json'));
		const stateCall = stateCalls[stateCalls.length - 1];
		expect(stateCall).toBeDefined();
		const state = JSON.parse(stateCall![1] as string) as { status: string };
		expect(state.status).toBe('rolled-back');
	});

	it('EUNAUTHORIZED from npm view → writes auth failure state', async () => {
		const authErr = new Error('npm ERR! code EUNAUTHORIZED');
		mockExecFileError(authErr);

		await main();

		const calls = vi.mocked(fs.writeFileSync).mock.calls;
		const stateCalls = calls.filter(c => String(c[0]).endsWith('update-state.json'));
		const stateCall = stateCalls[stateCalls.length - 1];
		expect(stateCall).toBeDefined();
		const state = JSON.parse(stateCall![1] as string) as { status: string; reason: string };
		expect(state.status).toBe('update-failed');
		expect(state.reason).toBe('auth');
	});
});
