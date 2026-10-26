import { DaemonNotRunningError } from '@wadeck-app/singleton-daemon-kit';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerResumeCommand } from './ResumeCommand';

// vi.hoisted: the mock factory runs before module-level consts exist.
const daemon = vi.hoisted(() => ({ send: vi.fn(), createdFor: vi.fn() }));

vi.mock('flow-core', async importOriginal => ({
	...(await importOriginal<typeof import('flow-core')>()),
	createRemoteDaemonClient: (dir: string) => {
		daemon.createdFor(dir);
		return { send: daemon.send };
	},
}));

describe('flow resume command', () => {
	let logSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let stdoutSpy: ReturnType<typeof vi.spyOn>;
	let stderrSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		vi.spyOn(process, 'exit').mockImplementation(code => {
			throw new Error(`exit ${String(code)}`);
		});
		vi.stubEnv('XDG_CONFIG_HOME', process.cwd());
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		daemon.send.mockReset();
		daemon.createdFor.mockReset();
	});

	const run = (...args: string[]): Promise<Command> => {
		const program = new Command();
		program.exitOverride();
		registerResumeCommand(program);
		return program.parseAsync(['node', 'test', 'resume', ...args]);
	};

	it('sends the resume command for the execution id to the daemon of the flow config directory', async () => {
		daemon.send.mockResolvedValue({ type: 'execution_resumed', executionId: 'abc12345', stepId: 'approve' });
		await run('abc12345');
		expect(daemon.send).toHaveBeenCalledWith('resume', { type: 'resume', executionId: 'abc12345' });
		expect(String(daemon.createdFor.mock.calls[0]![0])).toMatch(/flow$/);
		expect(logSpy).toHaveBeenCalledWith('Resumed execution abc12345 at step approve');
	});

	it('--json prints the execution and the step as one JSON line on stdout', async () => {
		daemon.send.mockResolvedValue({ type: 'execution_resumed', executionId: 'abc12345', stepId: 'approve' });
		await run('abc12345', '--json');
		expect(JSON.parse(String(stdoutSpy.mock.calls[0]![0]))).toEqual({ executionId: 'abc12345', stepId: 'approve' });
		expect(logSpy).not.toHaveBeenCalled();
	});

	it('says there is nothing to resume when no daemon runs, and exits 1', async () => {
		daemon.send.mockRejectedValue(new DaemonNotRunningError('Daemon is not running'));
		await expect(run('abc12345')).rejects.toThrow('exit 1');
		expect(errorSpy.mock.calls.flat().join(' ')).toContain('The daemon is not running');
	});

	it('prints the real cause and a hint, exit 1, when the daemon fails for another reason', async () => {
		daemon.send.mockRejectedValue(new Error('Unknown command: resume'));
		await expect(run('abc12345')).rejects.toThrow('exit 1');
		const printed = errorSpy.mock.calls.flat().join(' ');
		expect(printed).toContain('Unknown command: resume');
		expect(printed).toContain('flow logs');
		expect(printed).not.toMatch(/\bat .*:\d+:\d+/);
	});

	it.each(['ECONNRESET', 'ECONNREFUSED', 'EPIPE'])(
		'treats a daemon that is closing (%s) as not running',
		async code => {
			daemon.send.mockRejectedValue(Object.assign(new Error('socket hang up'), { code }));
			await expect(run('abc12345')).rejects.toThrow('exit 1');
			const printed = errorSpy.mock.calls.flat().join(' ');
			expect(printed).toContain('The daemon is not running');
			expect(printed).toContain('nothing to resume');
		}
	);

	it('treats a daemon that answers that it is stopping as not running', async () => {
		daemon.send.mockResolvedValue({ type: 'error', code: 'DAEMON_STOPPING', message: 'The daemon is stopping' });
		await expect(run('abc12345')).rejects.toThrow('exit 1');
		expect(errorSpy.mock.calls.flat().join(' ')).toContain('nothing to resume');
	});

	it('exits 2 for an unknown execution so a script can tell it from other failures', async () => {
		daemon.send.mockResolvedValue({ type: 'error', code: 'EXECUTION_NOT_FOUND', message: 'No execution abc12345' });
		await expect(run('abc12345')).rejects.toThrow('exit 2');
		expect(errorSpy.mock.calls.flat().join(' ')).toContain('No execution abc12345');
	});

	it('exits 1 for any other daemon refusal, with the daemon message', async () => {
		daemon.send.mockResolvedValue({ type: 'error', code: 'NOT_RESUMABLE', message: 'Step already answered' });
		await expect(run('abc12345')).rejects.toThrow('exit 1');
		expect(errorSpy.mock.calls.flat().join(' ')).toContain('Step already answered');
	});

	it('--json reports a refusal as {code, message} on stderr', async () => {
		daemon.send.mockResolvedValue({ type: 'error', code: 'NOT_RESUMABLE', message: 'Step already answered' });
		await expect(run('abc12345', '--json')).rejects.toThrow('exit 1');
		expect(JSON.parse(String(stderrSpy.mock.calls[0]![0]))).toEqual({
			code: 'NOT_RESUMABLE',
			message: 'Step already answered',
		});
	});
});
