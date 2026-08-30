import { Command } from 'commander';
import * as fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCliCommand } from './CliCommand.js';

vi.mock('node:fs', async () => {
	const real = await vi.importActual<typeof import('node:fs')>('node:fs');
	return {
		...real,
		existsSync: vi.fn().mockImplementation(real.existsSync),
		readFileSync: vi.fn().mockImplementation(real.readFileSync),
		unlinkSync: vi.fn().mockImplementation(real.unlinkSync),
	};
});

vi.mock('@wadeck-app/shared-cli/CliMetaCommands', () => ({
	cliVersionCommand: vi.fn().mockResolvedValue(undefined),
	cliUpdateCommand: vi.fn().mockResolvedValue(undefined),
	cliRollbackCommand: vi.fn().mockResolvedValue(undefined),
	cliLogsCommand: vi.fn().mockResolvedValue(undefined),
	warnUnknownArgs: vi.fn(),
}));

vi.mock('@wadeck-app/shared-cli/ChannelConfig', () => ({
	readChannelFromConfig: vi.fn().mockReturnValue('latest'),
}));

async function runCliArgs(args: string[]): Promise<void> {
	const program = new Command();
	program.exitOverride();
	program.addCommand(buildCliCommand());
	try {
		await program.parseAsync(['node', 'flow', 'cli', ...args]);
	} catch {
		// Expected: process.exit mock throws, or Commander exitOverride throws
	}
}

describe('cli version', () => {
	afterEach(() => { vi.restoreAllMocks(); });

	it('calls cliVersionCommand with pkgName and channel', async () => {
		const { cliVersionCommand } = await import('@wadeck-app/shared-cli/CliMetaCommands');
		const { readChannelFromConfig } = await import('@wadeck-app/shared-cli/ChannelConfig');
		vi.mocked(readChannelFromConfig).mockReturnValue('edge');

		await runCliArgs(['version']);

		expect(cliVersionCommand).toHaveBeenCalledWith('@wadeck-app/flow-cli', expect.any(String), 'edge');
	});
});

describe('cli update --check', () => {
	afterEach(() => { vi.restoreAllMocks(); });

	it('calls cliVersionCommand when --check is passed', async () => {
		const { cliVersionCommand } = await import('@wadeck-app/shared-cli/CliMetaCommands');
		await runCliArgs(['update', '--check']);
		expect(cliVersionCommand).toHaveBeenCalled();
	});

	it('reads update-log.txt when --log is passed', async () => {
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.readFileSync).mockReturnValue('log content\n');
		const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

		await runCliArgs(['update', '--log']);

		expect(stdoutSpy).toHaveBeenCalledWith('log content\n');
	});

	it('shows "No update log found" when log file is missing', async () => {
		vi.mocked(fs.existsSync).mockReturnValue(false);
		const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

		await runCliArgs(['update', '--log']);

		expect(stdoutSpy).toHaveBeenCalledWith('No update log found.\n');
	});
});

describe('cli rollback', () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let stderrSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: string | number | null) => {
			throw new Error(`process.exit(${_code})`);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		}) as any;
		stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	});

	afterEach(() => { vi.restoreAllMocks(); });

	it('delegates to cliRollbackCommand', async () => {
		const { cliRollbackCommand } = await import('@wadeck-app/shared-cli/CliMetaCommands');
		await runCliArgs(['rollback']);
		expect(cliRollbackCommand).toHaveBeenCalledWith('@wadeck-app/flow-cli', expect.any(String));
		expect(exitSpy).not.toHaveBeenCalled();
		expect(stderrSpy).not.toHaveBeenCalled();
	});
});

describe('cli self-check', () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
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
		expect(stdoutHasOk).toBe(true);
		const stderrHasOk = stderrLines.some(l => l.includes('[ok]'));
		expect(stderrHasOk).toBe(false);
		expect(exitSpy).not.toHaveBeenCalled();
	});
});
