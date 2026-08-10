import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the daemon kit before importing RunCommand
vi.mock('@wadeck/singleton-daemon-kit', () => ({
	createDaemonClient: vi.fn(),
	DaemonNotRunningError: class DaemonNotRunningError extends Error {
		constructor(message?: string) {
			super(message ?? 'Daemon not running');
			this.name = 'DaemonNotRunningError';
		}
	},
}));

// Mock the daemon startup to avoid actually starting a daemon
vi.mock('../daemon/Daemon.js', () => ({
	startDaemon: vi.fn().mockResolvedValue(undefined),
	DEFAULT_CONFIG: {
		queue: { concurrency: 1 },
		logs: { retainDays: 30 },
		worker: { wsPort: null },
	},
}));

import { createDaemonClient, DaemonNotRunningError } from '@wadeck/singleton-daemon-kit';
import { runRunCommand } from './RunCommand.js';

const mockCreateDaemonClient = vi.mocked(createDaemonClient);

function makeClient(sendFn: (command: string, payload: unknown) => Promise<unknown>) {
	return {
		send: sendFn,
	};
}

describe('runRunCommand', () => {
	let stdoutSpy: ReturnType<typeof vi.spyOn>;
	let stderrSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
		stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
			throw new Error(`process.exit called with ${code ?? 0}`);
		});
	});

	afterEach(() => {
		stdoutSpy.mockRestore();
		stderrSpy.mockRestore();
		exitSpy.mockRestore();
		vi.clearAllMocks();
	});

	it('exits 1 with usage message on stderr when no file arg provided', async () => {
		await expect(runRunCommand([])).rejects.toThrow('process.exit called with 1');
		expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: flow run'));
	});

	it('exits 0 when daemon responds with execution_started', async () => {
		mockCreateDaemonClient.mockReturnValue(
			makeClient(async () => ({ type: 'execution_started', executionId: 'abc12345' })) as ReturnType<
				typeof createDaemonClient
			>
		);

		await expect(runRunCommand(['/flow.yml'])).rejects.toThrow('process.exit called with 0');
		expect(exitSpy).toHaveBeenCalledWith(0);
	});

	it('writes executionId to stdout when not quiet', async () => {
		mockCreateDaemonClient.mockReturnValue(
			makeClient(async () => ({ type: 'execution_started', executionId: 'abc12345' })) as ReturnType<
				typeof createDaemonClient
			>
		);

		await expect(runRunCommand(['/flow.yml'])).rejects.toThrow();
		expect(stdoutSpy).toHaveBeenCalledWith('abc12345\n');
	});

	it('suppresses executionId output when --quiet flag is set', async () => {
		mockCreateDaemonClient.mockReturnValue(
			makeClient(async () => ({ type: 'execution_started', executionId: 'abc12345' })) as ReturnType<
				typeof createDaemonClient
			>
		);

		await expect(runRunCommand(['/flow.yml', '--quiet'])).rejects.toThrow('process.exit called with 0');
		expect(stdoutSpy).not.toHaveBeenCalled();
	});

	it('parses --flow-id argument correctly', async () => {
		let capturedPayload: unknown;
		mockCreateDaemonClient.mockReturnValue(
			makeClient(async (_cmd, payload) => {
				capturedPayload = payload;
				return { type: 'execution_started', executionId: 'abc12345' };
			}) as ReturnType<typeof createDaemonClient>
		);

		await expect(runRunCommand(['/flow.yml', '--flow-id', 'my-flow'])).rejects.toThrow();
		expect((capturedPayload as { flowId: string }).flowId).toBe('my-flow');
	});

	it('parses --input=k=v argument correctly', async () => {
		let capturedPayload: unknown;
		mockCreateDaemonClient.mockReturnValue(
			makeClient(async (_cmd, payload) => {
				capturedPayload = payload;
				return { type: 'execution_started', executionId: 'abc12345' };
			}) as ReturnType<typeof createDaemonClient>
		);

		await expect(runRunCommand(['/flow.yml', '--input=key=value'])).rejects.toThrow();
		expect((capturedPayload as { inputs: Record<string, string> }).inputs).toEqual({ key: 'value' });
	});

	it('parses --input key=value (space form) correctly', async () => {
		let capturedPayload: unknown;
		mockCreateDaemonClient.mockReturnValue(
			makeClient(async (_cmd, payload) => {
				capturedPayload = payload;
				return { type: 'execution_started', executionId: 'abc12345' };
			}) as ReturnType<typeof createDaemonClient>
		);

		await expect(runRunCommand(['/flow.yml', '--input', 'key=value'])).rejects.toThrow();
		expect((capturedPayload as { inputs: Record<string, string> }).inputs).toEqual({ key: 'value' });
	});

	it('exits 1 for --input (space form) without value separator', async () => {
		await expect(runRunCommand(['/flow.yml', '--input', 'keyonly'])).rejects.toThrow('process.exit called with 1');
		expect(exitSpy).toHaveBeenCalledWith(1);
		const stderrOutput = stderrSpy.mock.calls.map(c => String(c[0])).join('');
		expect(stderrOutput).toContain('Invalid --input format');
	});

	it('exits 1 for --input without value separator', async () => {
		await expect(runRunCommand(['/flow.yml', '--input=keyonly'])).rejects.toThrow('process.exit called with 1');
		expect(exitSpy).toHaveBeenCalledWith(1);
		const stderrOutput = stderrSpy.mock.calls.map(c => String(c[0])).join('');
		expect(stderrOutput).toContain('Invalid --input format');
	});

	it('exits 2 when daemon responds with error code VALIDATION_FAILED', async () => {
		mockCreateDaemonClient.mockReturnValue(
			makeClient(async () => ({
				type: 'error',
				code: 'VALIDATION_FAILED',
				message: JSON.stringify([{ message: 'missing field' }]),
			})) as ReturnType<typeof createDaemonClient>
		);

		await expect(runRunCommand(['/flow.yml'])).rejects.toThrow('process.exit called with 2');
		expect(exitSpy).toHaveBeenCalledWith(2);
		const written = String(stderrSpy.mock.calls[0]?.[0] ?? '');
		const parsed = JSON.parse(written);
		expect(parsed.valid).toBe(false);
	});

	it('exits 1 when daemon responds with other error code', async () => {
		mockCreateDaemonClient.mockReturnValue(
			makeClient(async () => ({
				type: 'error',
				code: 'FILE_NOT_FOUND',
				message: 'Flow file not found',
			})) as ReturnType<typeof createDaemonClient>
		);

		await expect(runRunCommand(['/flow.yml'])).rejects.toThrow('process.exit called with 1');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it('exits 1 when daemon throws a generic error', async () => {
		mockCreateDaemonClient.mockReturnValue(
			makeClient(async () => {
				throw new Error('connection refused');
			}) as ReturnType<typeof createDaemonClient>
		);

		await expect(runRunCommand(['/flow.yml'])).rejects.toThrow('process.exit called with 1');
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it('attempts to start daemon when DaemonNotRunningError is thrown and then exits based on response', async () => {
		let callCount = 0;
		mockCreateDaemonClient.mockImplementation(
			() =>
				makeClient(async () => {
					callCount++;
					if (callCount === 1) {
						throw new DaemonNotRunningError('Daemon not running');
					}
					return { type: 'execution_started', executionId: 'abc12345' };
				}) as ReturnType<typeof createDaemonClient>
		);

		await expect(runRunCommand(['/flow.yml'])).rejects.toThrow('process.exit called with 0');
		expect(exitSpy).toHaveBeenCalledWith(0);
	});
});
