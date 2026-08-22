import { HookDispatcher } from '@wadeck/shared-cli/HookDispatcher';
import { execFile } from 'node:child_process';
import * as http from 'node:http';

vi.mock('node:child_process', () => ({ execFile: vi.fn() }));
vi.mock('node:http', () => ({
	request: vi.fn(),
}));

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('HookDispatcher', () => {
	describe('CLI hooks', () => {
		it('calls execFile with the configured command and args', async () => {
			vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb) => {
				(cb as (err: null, stdout: string, stderr: string) => void)(null, '', '');
				return {} as ReturnType<typeof execFile>;
			});

			const dispatcher = new HookDispatcher({
				onFlowStart: [{ type: 'cli', command: 'echo', args: ['hello'] }],
			});

			await dispatcher.dispatch('onFlowStart', { executionId: 'abc123' });

			expect(vi.mocked(execFile)).toHaveBeenCalledTimes(1);
			const [cmd, args] = vi.mocked(execFile).mock.calls[0];
			expect(cmd).toBe('echo');
			expect(args).toEqual(['hello']);
		});

		it('converts camelCase payload keys to SCREAMING_SNAKE_CASE env vars', async () => {
			let capturedEnv: Record<string, string | undefined> = {};

			vi.mocked(execFile).mockImplementation((_cmd, _args, opts, cb) => {
				capturedEnv = (opts as { env?: Record<string, string | undefined> }).env ?? {};
				(cb as (err: null, stdout: string, stderr: string) => void)(null, '', '');
				return {} as ReturnType<typeof execFile>;
			});

			const dispatcher = new HookDispatcher({
				onFlowStart: [{ type: 'cli', command: 'printenv', args: [] }],
			});

			await dispatcher.dispatch('onFlowStart', { executionId: 'abc123', flowId: 'my-flow' });

			expect(capturedEnv['EXECUTION_ID']).toBe('abc123');
			expect(capturedEnv['FLOW_ID']).toBe('my-flow');
		});

		it('resolves without throwing when the CLI hook command fails', async () => {
			vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb) => {
				(cb as (err: Error) => void)(new Error('command not found'));
				return {} as ReturnType<typeof execFile>;
			});

			const dispatcher = new HookDispatcher({
				onFlowStart: [{ type: 'cli', command: 'no-such-command', args: [] }],
			});

			// dispatch() silently ignores all hook failures (D32: on-failure default is 'ignore')
			await expect(dispatcher.dispatch('onFlowStart', {})).resolves.toBeUndefined();
		});

		it('does not forward daemon credentials to CLI hooks', async () => {
			const originalKey = process.env['ANTHROPIC_API_KEY'];
			process.env['ANTHROPIC_API_KEY'] = 'secret-key-should-not-leak';

			let capturedEnv: Record<string, string> | undefined;
			vi.mocked(execFile).mockImplementation((_cmd, _args, options, callback) => {
				capturedEnv = (options as { env: Record<string, string> }).env;
				(callback as (err: null, stdout: string, stderr: string) => void)(null, '', '');
				return {} as ReturnType<typeof execFile>;
			});

			const dispatcher = new HookDispatcher({
				onFlowStart: [{ type: 'cli', command: 'echo', args: ['test'] }],
			});
			await dispatcher.dispatch('onFlowStart', { executionId: 'abc123' });

			expect(capturedEnv?.['ANTHROPIC_API_KEY']).toBeUndefined();
			expect(capturedEnv?.['EXECUTION_ID']).toBe('abc123'); // payload still forwarded

			// cleanup
			if (originalKey === undefined) delete process.env['ANTHROPIC_API_KEY'];
			else process.env['ANTHROPIC_API_KEY'] = originalKey;
		});
	});

	describe('HTTP hooks', () => {
		it('sends an HTTP POST request to the configured URL', async () => {
			const mockRes = {
				on: vi.fn((event: string, cb: () => void) => {
					if (event === 'end') cb();
					return mockRes;
				}),
			};
			const mockReq = {
				on: vi.fn(),
				write: vi.fn(),
				end: vi.fn(),
				setTimeout: vi.fn(),
			};

			(vi.mocked(http.request) as ReturnType<typeof vi.fn>).mockImplementation((_opts, cb) => {
				cb?.(mockRes as never);
				return mockReq as never;
			});

			const dispatcher = new HookDispatcher({
				onFlowEnd: [{ type: 'http', url: 'http://localhost:9999/hook', method: 'POST' }],
			});

			await dispatcher.dispatch('onFlowEnd', { executionId: 'xyz' });

			expect(vi.mocked(http.request)).toHaveBeenCalledTimes(1);
			expect(mockReq.write).toHaveBeenCalledTimes(1);
			expect(mockReq.end).toHaveBeenCalledTimes(1);
		});

		it('resolves without throwing when the HTTP hook request errors', async () => {
			const mockReq = {
				on: vi.fn((event: string, cb: (err: Error) => void) => {
					if (event === 'error') cb(new Error('ECONNREFUSED'));
					return mockReq;
				}),
				write: vi.fn(),
				end: vi.fn(),
				setTimeout: vi.fn(),
			};

			vi.mocked(http.request).mockReturnValue(mockReq as never);

			const dispatcher = new HookDispatcher({
				onFlowEnd: [{ type: 'http', url: 'http://localhost:0/hook' }],
			});

			// dispatch() silently ignores all hook failures (D32: on-failure default is 'ignore')
			await expect(dispatcher.dispatch('onFlowEnd', {})).resolves.toBeUndefined();
		});
	});

	describe('dispatch with no hooks', () => {
		it('resolves without error when no hooks are registered for the event', async () => {
			const dispatcher = new HookDispatcher({});
			await expect(dispatcher.dispatch('onFlowStart', { executionId: 'test' })).resolves.toBeUndefined();
		});

		it('resolves without error when hooks are registered for a different event', async () => {
			vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb) => {
				(cb as (err: null, stdout: string, stderr: string) => void)(null, '', '');
				return {} as ReturnType<typeof execFile>;
			});

			const dispatcher = new HookDispatcher({
				onFlowEnd: [{ type: 'cli', command: 'echo', args: [] }],
			});

			await expect(dispatcher.dispatch('onFlowStart', {})).resolves.toBeUndefined();
			expect(vi.mocked(execFile)).not.toHaveBeenCalled();
		});
	});
});
