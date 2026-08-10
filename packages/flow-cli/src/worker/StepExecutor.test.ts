import { describe, expect, it, vi } from 'vitest';

import type { InjectedStep, WorkerToDaemon } from '../ipc/Protocol.js';
import type { McpServer } from './McpServer.js';
import { StepExecutor, UnsupportedStepTypeError } from './StepExecutor.js';

const makeContext = () => ({
	executionId: 'exec-001',
	inputs: {},
	stepOutputs: {},
	workspaceDir: process.cwd(),
});

describe('StepExecutor', () => {
	describe('script steps', () => {
		it('executes a script and returns stdout', async () => {
			const messages: WorkerToDaemon[] = [];
			const executor = new StepExecutor(msg => messages.push(msg));

			const step = {
				id: 'greet',
				name: 'Greet',
				type: 'script' as const,
				script: 'echo hello',
			};

			const result = await executor.execute(step, makeContext());
			expect(result['stdout']).toContain('hello');
			expect(result['exitCode']).toBe(0);
		});

		it('returns rawOutput when no output config', async () => {
			const executor = new StepExecutor(() => {});

			const step = {
				id: 'test',
				name: 'Test',
				type: 'script' as const,
				script: 'echo world',
			};

			const result = await executor.execute(step, makeContext());
			expect(result['rawOutput']).toContain('world');
		});

		it('uses step workingDir when provided', async () => {
			const executor = new StepExecutor(() => {});

			const step = {
				id: 'pwd',
				name: 'PWD',
				type: 'script' as const,
				script: process.platform === 'win32' ? 'cd' : 'pwd',
				workingDir: process.cwd(),
			};

			const result = await executor.execute(step, makeContext());
			expect(result['exitCode']).toBe(0);
		});

		it('passes isolateEnv: true — env vars are not inherited from process', async () => {
			process.env['LEAKED_VAR'] = 'should-not-appear';
			const executor = new StepExecutor(() => {});

			const step = {
				id: 'env-check',
				name: 'Env check',
				type: 'script' as const,
				script: process.platform === 'win32' ? 'echo %LEAKED_VAR%' : 'echo ${LEAKED_VAR:-not-set}',
			};

			try {
				const result = await executor.execute(step, makeContext());
				// With isolateEnv, LEAKED_VAR should not be available
				expect(String(result['stdout'])).not.toContain('should-not-appear');
			} finally {
				delete process.env['LEAKED_VAR'];
			}
		});
	});

	describe('subflow steps', () => {
		it('throws UnsupportedStepTypeError', async () => {
			const executor = new StepExecutor(() => {});

			const step = {
				id: 'sub',
				name: 'Sub',
				type: 'subflow' as const,
				flowId: 'another-flow',
				inputs: {},
			};

			await expect(executor.execute(step, makeContext())).rejects.toThrow(UnsupportedStepTypeError);
		});
	});

	describe('UnsupportedStepTypeError', () => {
		it('includes step type in message', () => {
			const err = new UnsupportedStepTypeError('subflow');
			expect(err.message).toContain('subflow');
			expect(err.name).toBe('UnsupportedStepTypeError');
		});
	});

	describe('model steps with McpServer', () => {
		function makeMockMcpServer(configPath = '/tmp/test-config.json') {
			const mockStart = vi.fn().mockResolvedValue({ port: 9999, configPath });
			const mockStop = vi.fn().mockResolvedValue(undefined);
			const server = { start: mockStart, stop: mockStop } as unknown as McpServer;
			const factory = vi.fn().mockReturnValue(server);
			return { factory, mockStart, mockStop };
		}

		it('starts and stops McpServer when executing a model step', async () => {
			const { factory, mockStart, mockStop } = makeMockMcpServer('/tmp/test-config.json');

			const messages: WorkerToDaemon[] = [];
			const executor = new StepExecutor(msg => messages.push(msg), factory);

			const launchBackgroundMock = vi.fn().mockResolvedValue({
				stdout: 'test output',
				stderr: '',
				exitCode: 0,
			});
			(
				executor as unknown as { claudeLauncher: { launchBackground: typeof launchBackgroundMock } }
			).claudeLauncher.launchBackground = launchBackgroundMock;

			const step = {
				id: 'model-step',
				name: 'Model Step',
				type: 'model' as const,
				prompt: 'Hello world',
			};

			await executor.execute(step, makeContext());

			expect(mockStart).toHaveBeenCalledOnce();
			expect(mockStop).toHaveBeenCalledOnce();
			expect(launchBackgroundMock).toHaveBeenCalledWith(
				expect.objectContaining({ mcpConfigPath: '/tmp/test-config.json' })
			);
		});

		it('stops McpServer even when launchBackground throws', async () => {
			const { factory, mockStop } = makeMockMcpServer('/tmp/test-config-2.json');

			const executor = new StepExecutor(() => {}, factory);
			const launchBackgroundMock = vi.fn().mockRejectedValue(new Error('Claude not found'));
			(
				executor as unknown as { claudeLauncher: { launchBackground: typeof launchBackgroundMock } }
			).claudeLauncher.launchBackground = launchBackgroundMock;

			const step = {
				id: 'model-step-fail',
				name: 'Model Step Fail',
				type: 'model' as const,
				prompt: 'Hello',
			};

			await expect(executor.execute(step, makeContext())).rejects.toThrow('Claude not found');
			expect(mockStop).toHaveBeenCalledOnce();
		});

		it('sends inject_steps message to daemon when McpServer calls onInjectSteps', async () => {
			let capturedOnInjectSteps: ((steps: InjectedStep[]) => Promise<void>) | undefined;
			const mockStart = vi.fn().mockResolvedValue({ port: 9999, configPath: '/tmp/inject-test.json' });
			const mockStop = vi.fn().mockResolvedValue(undefined);
			const factory = vi
				.fn()
				.mockImplementation((_executionId: string, onInjectSteps: (steps: InjectedStep[]) => Promise<void>) => {
					capturedOnInjectSteps = onInjectSteps;
					return { start: mockStart, stop: mockStop } as unknown as McpServer;
				});

			const messages: WorkerToDaemon[] = [];
			const executor = new StepExecutor(msg => messages.push(msg), factory);

			const launchBackgroundMock = vi.fn().mockImplementation(async () => {
				// Simulate inject_steps call during execution
				await capturedOnInjectSteps!([{ id: 'injected-step', type: 'script' }]);
				return { stdout: 'done', stderr: '', exitCode: 0 };
			});
			(
				executor as unknown as { claudeLauncher: { launchBackground: typeof launchBackgroundMock } }
			).claudeLauncher.launchBackground = launchBackgroundMock;

			const step = { id: 'model-injects', name: 'Model Injects', type: 'model' as const, prompt: 'Hi' };
			await executor.execute(step, makeContext());

			const injectMsg = messages.find(m => m.type === 'inject_steps');
			expect(injectMsg).toBeDefined();
			expect(injectMsg?.type).toBe('inject_steps');
		});
	});
});
