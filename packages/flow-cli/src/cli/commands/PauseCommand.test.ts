import { DaemonNotRunningError } from '@wadeck-app/singleton-daemon-kit';
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerPauseCommand, registerUnpauseCommand } from './PauseCommand';

// vi.hoisted: the mock factory runs before module-level consts exist.
const daemon = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('flow-core', async importOriginal => ({
	...(await importOriginal<typeof import('flow-core')>()),
	createRemoteDaemonClient: () => ({ send: daemon.send }),
}));

const EXECUTION_ID = 'abc12345';

describe('flow pause / flow unpause commands', () => {
	let configDir: string;
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let logSpy: ReturnType<typeof vi.spyOn>;
	let stdoutSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pause-cmd-'));
		logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		vi.spyOn(process, 'exit').mockImplementation(code => {
			throw new Error(`exit ${String(code)}`);
		});
		vi.stubEnv('FLOW_PROJECT', '');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		daemon.send.mockReset();
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	const run = (...args: string[]): Promise<Command> => {
		const program = new Command();
		program.exitOverride();
		registerPauseCommand(program, () => configDir);
		registerUnpauseCommand(program, () => configDir);
		return program.parseAsync(['node', 'test', ...args]);
	};

	const printedErrors = (): string => errorSpy.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');

	it('sends pause with the reason to the daemon and says how to resume', async () => {
		daemon.send.mockResolvedValue({
			type: 'execution_paused',
			executionId: EXECUTION_ID,
			since: 'now',
			reason: 'budget',
		});

		await run('pause', EXECUTION_ID, '--reason', 'budget');

		expect(daemon.send).toHaveBeenCalledWith('pause', {
			type: 'pause',
			executionId: EXECUTION_ID,
			reason: 'budget',
		});
		expect(String(logSpy.mock.calls[0]?.[0])).toContain(`flow unpause ${EXECUTION_ID}`);
	});

	it('prints machine-readable output with --json', async () => {
		daemon.send.mockResolvedValue({ type: 'execution_paused', executionId: EXECUTION_ID, since: 'now' });

		await run('pause', EXECUTION_ID, '--json');

		expect(JSON.parse(String(stdoutSpy.mock.calls[0]?.[0]))).toEqual({
			executionId: EXECUTION_ID,
			paused: true,
			since: 'now',
		});
	});

	it('sends unpause and reports the release', async () => {
		daemon.send.mockResolvedValue({ type: 'execution_unpaused', executionId: EXECUTION_ID, pausedMs: 1200 });

		await run('unpause', EXECUTION_ID);

		expect(daemon.send).toHaveBeenCalledWith('unpause', { type: 'unpause', executionId: EXECUTION_ID });
		expect(String(logSpy.mock.calls[0]?.[0])).toContain('dispatched again');
	});

	it('exits 1 with the daemon refusal text when the run cannot be paused', async () => {
		daemon.send.mockResolvedValue({
			type: 'error',
			code: 'EXECUTION_ALREADY_PAUSED',
			message: 'Execution "abc12345" is already paused. Resume it with: flow unpause abc12345',
		});

		await expect(run('pause', EXECUTION_ID)).rejects.toThrow('exit 1');

		expect(printedErrors()).toContain('already paused');
	});

	it.each(['pause', 'unpause'])('says there is nothing to %s when no daemon is running', async verb => {
		daemon.send.mockRejectedValue(new DaemonNotRunningError('flow'));

		await expect(run(verb, EXECUTION_ID)).rejects.toThrow('exit 1');

		expect(printedErrors()).toContain(`nothing to ${verb}`);
	});

	it('tells to update the daemon when it does not know the command answer', async () => {
		daemon.send.mockResolvedValue({ type: 'execution_started', executionId: EXECUTION_ID });

		await expect(run('pause', EXECUTION_ID)).rejects.toThrow('exit 1');

		expect(printedErrors()).toContain('flow cli update');
	});
});
