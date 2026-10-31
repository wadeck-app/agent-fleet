import { DaemonNotRunningError } from '@wadeck-app/singleton-daemon-kit';
import { Command } from 'commander';
import { executionsDirOf } from 'flow-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExecutionStore } from '../../storage/ExecutionStore';
import { RegisteredProjectFixture } from '../../test-utils/RegisteredProjectFixture';
import { registerCancelCommand } from './CancelCommand';
import { DAEMON_TIMEOUT_TEXT } from './DaemonContactFailure';

// vi.hoisted: the mock factory runs before module-level consts exist.
const daemon = vi.hoisted(() => ({ send: vi.fn(), createdFor: vi.fn() }));

vi.mock('flow-core', async importOriginal => ({
	...(await importOriginal<typeof import('flow-core')>()),
	createRemoteDaemonClient: (dir: string) => {
		daemon.createdFor(dir);
		return { send: daemon.send };
	},
}));

const EXECUTION_ID = 'abc12345';

describe('flow cancel command', () => {
	let configDir: string;
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let logSpy: ReturnType<typeof vi.spyOn>;
	let stdoutSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cancel-cmd-'));
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
		daemon.createdFor.mockReset();
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	const run = (...args: string[]): Promise<Command> => {
		const program = new Command();
		program.exitOverride();
		registerCancelCommand(program, () => configDir);
		return program.parseAsync(['node', 'test', 'cancel', ...args]);
	};

	/** What the failing command printed on stderr (console.error calls joined). */
	const printedErrors = (): string => errorSpy.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');

	/** An execution record on disk as a stopped daemon left it. */
	function recordOnDisk(status: 'running' | 'queued' | 'completed' | 'failed', cancelled = false): void {
		const store = new ExecutionStore(executionsDirOf(configDir));
		fs.mkdirSync(executionsDirOf(configDir), { recursive: true });
		store.create({ executionId: EXECUTION_ID, flowFile: 'f.yml', flowId: 'f', stepIds: ['s1'] });
		if (status === 'running') store.markStepRunning(EXECUTION_ID, 's1');
		if (status === 'completed') store.markExecutionCompleted(EXECUTION_ID);
		if (status === 'failed') {
			store.update(EXECUTION_ID, { lastError: cancelled ? 'cancelled by user' : 'boom', ...(cancelled ? { endReason: 'cancelled' as const } : {}) });
			store.markExecutionFailed(EXECUTION_ID);
		}
	}

	it('sends the cancel command to the daemon of the flow config directory and reports success', async () => {
		daemon.send.mockResolvedValue({ type: 'execution_cancelled', executionId: EXECUTION_ID, alreadyCancelled: false });

		await run(EXECUTION_ID);

		expect(daemon.send).toHaveBeenCalledWith('cancel', { type: 'cancel', executionId: EXECUTION_ID });
		expect(daemon.createdFor).toHaveBeenCalledWith(configDir);
		expect(logSpy).toHaveBeenCalledWith(`Cancelled execution ${EXECUTION_ID}. The daemon and the other executions keep running.`);
	});

	it('says so, and succeeds, when the execution was already cancelled', async () => {
		daemon.send.mockResolvedValue({ type: 'execution_cancelled', executionId: EXECUTION_ID, alreadyCancelled: true });

		await run(EXECUTION_ID);

		expect(logSpy).toHaveBeenCalledWith(`Execution ${EXECUTION_ID} was already cancelled; nothing changed.`);
	});

	it('--json prints one JSON line on stdout', async () => {
		daemon.send.mockResolvedValue({ type: 'execution_cancelled', executionId: EXECUTION_ID, alreadyCancelled: true });

		await run(EXECUTION_ID, '--json');

		expect(JSON.parse(String(stdoutSpy.mock.calls[0]![0]))).toEqual({
			executionId: EXECUTION_ID,
			cancelled: true,
			alreadyCancelled: true,
		});
		expect(logSpy).not.toHaveBeenCalled();
	});

	it('sends the project the user selected with -p', async () => {
		const fixture = new RegisteredProjectFixture().useAsProcessEnv();
		try {
			const project = await fixture.register('cancel-project', { folder: configDir });
			daemon.send.mockResolvedValue({ type: 'execution_cancelled', executionId: EXECUTION_ID, alreadyCancelled: false });

			await run(EXECUTION_ID, '-p', 'cancel-project');

			expect(daemon.send).toHaveBeenCalledWith('cancel', { type: 'cancel', executionId: EXECUTION_ID, projectId: project.id });
		} finally {
			fixture.dispose();
		}
	});

	it('exits 1 with the daemon message when it refuses (unknown id, already ended, other project)', async () => {
		daemon.send.mockResolvedValue({ type: 'error', code: 'EXECUTION_ALREADY_ENDED', message: 'Execution "abc12345" already ended as completed; there is nothing to cancel.' });

		await expect(run(EXECUTION_ID)).rejects.toThrow('exit 1');

		expect(printedErrors()).toContain('already ended as completed');
	});

	it('prefixes every refusal with "Error: " (a space after the colon)', async () => {
		daemon.send.mockResolvedValue({ type: 'error', code: 'EXECUTION_NOT_FOUND', message: 'No execution found with id "x".' });

		await expect(run(EXECUTION_ID)).rejects.toThrow('exit 1');

		expect(printedErrors()).toBe('Error: No execution found with id "x".');
	});

	it('--json puts the refusal on stderr as JSON and exits 1', async () => {
		daemon.send.mockResolvedValue({ type: 'error', code: 'EXECUTION_NOT_FOUND', message: 'No execution found' });

		await expect(run(EXECUTION_ID, '--json')).rejects.toThrow('exit 1');

		expect(stdoutSpy).not.toHaveBeenCalled();
	});

	it('does not claim "not running" on a timeout: the request may have been applied', async () => {
		daemon.send.mockRejectedValue(new DaemonNotRunningError('HTTP timeout after 5s'));

		await expect(run(EXECUTION_ID)).rejects.toThrow('exit 1');

		expect(printedErrors()).toContain(DAEMON_TIMEOUT_TEXT);
	});

	describe('when no daemon is running', () => {
		beforeEach(() => {
			daemon.send.mockRejectedValue(new DaemonNotRunningError('ECONNREFUSED'));
		});

		it('tells that a record left running on disk is held by nobody, and what to do', async () => {
			recordOnDisk('running');

			await expect(run(EXECUTION_ID)).rejects.toThrow('exit 1');

			expect(printedErrors()).toContain('recorded as running');
			expect(printedErrors()).toContain('no daemon is running');
			expect(printedErrors()).toContain('flow start');
		});

		it('tells the same for a queued record', async () => {
			recordOnDisk('queued');

			await expect(run(EXECUTION_ID)).rejects.toThrow('exit 1');

			expect(printedErrors()).toContain('recorded as queued');
		});

		it('names the final status of an execution that already ended', async () => {
			recordOnDisk('completed');

			await expect(run(EXECUTION_ID)).rejects.toThrow('exit 1');

			expect(printedErrors()).toContain('already ended as completed');
		});

		it('succeeds when the record shows it was already cancelled', async () => {
			recordOnDisk('failed', true);

			await run(EXECUTION_ID);

			expect(logSpy).toHaveBeenCalledWith(`Execution ${EXECUTION_ID} was already cancelled; nothing changed.`);
		});

		it('reports an unknown id as such, not as a daemon problem only', async () => {
			await expect(run(EXECUTION_ID)).rejects.toThrow('exit 1');

			expect(printedErrors()).toContain(`No execution found with id "${EXECUTION_ID}"`);
			expect(printedErrors()).toContain('flow history');
		});
	});
});
