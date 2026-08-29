import { Command } from 'commander';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCliCommand } from './CliCommand.js';

vi.mock('node:fs', async () => {
	const real = await vi.importActual<typeof import('node:fs')>('node:fs');
	return {
		...real,
		// Wrap as vi.fn() so tests can override with mockReturnValue; default to real behavior.
		existsSync: vi.fn().mockImplementation(real.existsSync),
		readFileSync: vi.fn().mockImplementation(real.readFileSync),
		unlinkSync: vi.fn().mockImplementation(real.unlinkSync),
	};
});
vi.mock('node:child_process', () => ({
	execFile: vi.fn(),
	execFileSync: vi.fn(),
}));
// Helper: mount the cli sub-command under a root program and parse asynchronously.
// Any process.exit() mock throws are caught here so individual tests can assert on exitSpy.
async function runCliArgs(args: string[]): Promise<void> {
	const program = new Command();
	// Prevent Commander from calling process.exit on --help / unknown options
	program.exitOverride();
	program.addCommand(buildCliCommand());
	try {
		await program.parseAsync(['node', 'flow', 'cli', ...args]);
	} catch {
		// Expected: process.exit mock throws, or Commander exitOverride throws
	}
}

// Simulate a successful npm view response so execFileAsync resolves.
// util.promisify expects cb(err, value) -- pass {stdout,stderr} as the single value
// so `const { stdout } = await execFileAsync(...)` destructures correctly.
function mockExecFileSuccess(stdout = '1.2.3\n'): void {
	vi.mocked(cp.execFile).mockImplementation((...args: unknown[]) => {
		const cb = args[args.length - 1] as (err: null, result: { stdout: string; stderr: string }) => void;
		cb(null, { stdout, stderr: '' });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return {} as any;
	});
}

describe('readChannelFromConfig (via cli update --check)', () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let stdoutSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: string | number | null) => {
			throw new Error(`process.exit(${_code})`);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		}) as any;
		stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns edge when config file does not exist', async () => {
		vi.mocked(fs.existsSync).mockReturnValue(false);
		mockExecFileSuccess('9.9.9\n');

		await runCliArgs(['update', '--check']);

		expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Available (edge):'));
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it('returns channel value from config.yml when channel: stable is set', async () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue('channel: stable\n');
		mockExecFileSuccess('2.0.0\n');

		await runCliArgs(['update', '--check']);

		expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Available (stable):'));
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it('returns edge on readFileSync error', async () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockImplementation(() => {
			throw new Error('permission denied');
		});
		mockExecFileSuccess('3.0.0\n');

		await runCliArgs(['update', '--check']);

		expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Available (edge):'));
		expect(exitSpy).not.toHaveBeenCalled();
	});
});

describe('cli rollback', () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let stderrSpy: ReturnType<typeof vi.spyOn>;
	let stdoutSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: string | number | null) => {
			throw new Error(`process.exit(${_code})`);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		}) as any;
		stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('calls npm install with the previous version when state file is valid', async () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ previousVersion: '1.2.3' }));
		vi.mocked(fs.unlinkSync).mockImplementation(() => {});

		await runCliArgs(['rollback']);

		expect(vi.mocked(cp.execFileSync)).toHaveBeenCalledWith(
			'npm',
			['install', '-g', '@wadeck-app/flow-cli@1.2.3'],
			{
				stdio: 'inherit',
			}
		);
		expect(stdoutSpy).toHaveBeenCalledWith('Rolled back to v1.2.3\n');
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it('exits with error when previousVersion is not a valid semver string', async () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ previousVersion: 'not-a-version' }));

		await runCliArgs(['rollback']);

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(vi.mocked(cp.execFileSync)).not.toHaveBeenCalled();
		expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid or missing previousVersion'));
	});

	it('exits with error when state file is missing', async () => {
		vi.mocked(fs.existsSync).mockReturnValue(false);

		await runCliArgs(['rollback']);

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(vi.mocked(cp.execFileSync)).not.toHaveBeenCalled();
		expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('No update state found'));
	});
});

describe('cli self-check', () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		// Restore real fs behavior -- previous tests may have called vi.restoreAllMocks()
		// which strips the mockImplementation from the module-level vi.fn() wrappers.
		const realFs = await vi.importActual<typeof import('node:fs')>('node:fs');
		vi.mocked(fs.existsSync).mockImplementation(realFs.existsSync);
		vi.mocked(fs.readFileSync).mockImplementation(realFs.readFileSync);
		vi.mocked(fs.unlinkSync).mockImplementation(realFs.unlinkSync);

		exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: string | number | null) => {
			throw new Error(`process.exit(${_code})`);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		}) as any;
	});

	afterEach(() => {
		delete process.env['CLI_SELF_CHECK_QUIET'];
		vi.restoreAllMocks();
	});

	it('runs all checks and does not call process.exit when all pass', async () => {
		await runCliArgs(['self-check']);

		expect(exitSpy).not.toHaveBeenCalled();
	});

	it('suppresses stdout output when CLI_SELF_CHECK_QUIET=1', async () => {
		process.env['CLI_SELF_CHECK_QUIET'] = '1';
		const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

		await runCliArgs(['self-check']);

		expect(stdoutSpy).not.toHaveBeenCalled();
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it('writes [ok] lines to stdout only (no duplicate output on stderr)', async () => {
		const stdoutLines: string[] = [];
		const stderrLines: string[] = [];
		vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
			stdoutLines.push(String(chunk));
			return true;
		});
		vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
			stderrLines.push(String(chunk));
			return true;
		});

		await runCliArgs(['self-check']);

		const stdoutHasOk = stdoutLines.some(l => l.includes('[ok]'));
		// [ok] lines must appear on stdout
		expect(stdoutHasOk).toBe(true);
		// [ok] lines must NOT appear on stderr (no duplicate output)
		const stderrHasOk = stderrLines.some(l => l.includes('[ok]'));
		expect(stderrHasOk).toBe(false);
		expect(exitSpy).not.toHaveBeenCalled();
	});
});
