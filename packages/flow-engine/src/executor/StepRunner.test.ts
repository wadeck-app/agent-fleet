/**
 * Step Runner Tests
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaudeLauncher } from '../processing/ClaudeLauncher';
import { OutputExtractor } from '../processing/OutputExtractor';
import { TemplateRenderer } from '../processing/TemplateRenderer';
import type { FlowRegistry } from '../registry/FlowRegistry';
import type { FlowDefinition, ModelFlowStep, ScriptFlowStep, SubFlowStep, Workspace } from '../types';
import { ScriptExecutor } from './ScriptExecutor';
import { StepRunner } from './StepRunner';

// Mock dependencies
vi.mock('../processing/TemplateRenderer');
vi.mock('./ScriptExecutor');
vi.mock('../processing/OutputExtractor');
vi.mock('../processing/ClaudeLauncher');

describe('StepRunner', () => {
	let runner: StepRunner;
	let testWorkspace: Workspace;

	beforeEach(() => {
		runner = new StepRunner({ interactive: false });
		testWorkspace = {
			id: 'test-workspace',
			mode: 'isolated',
			path: '/test/workspace',
			metaDir: '/test/workspace.meta',
			concurrency: {
				key: 'test',
				activeTasks: new Set(),
				locked: false,
			},
			createdAt: new Date().toISOString(),
			lastUsedAt: new Date().toISOString(),
			usageCount: 0,
		};
		vi.clearAllMocks();
	});

	describe('executeStep - Script Steps', () => {
		it('should execute a successful script step', async () => {
			const step: ScriptFlowStep = {
				id: 'test-step',
				name: 'Test Step',
				type: 'script',
				script: 'echo "Hello"',
				output: {
					message: { type: 'string' },
				},
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
			};

			// Mock template renderer
			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('echo "Hello"');

			// Mock script executor
			vi.mocked(ScriptExecutor.prototype.execute).mockResolvedValue({
				success: true,
				exitCode: 0,
				stdout: 'Hello',
				stderr: '',
				durationMs: 100,
			});

			// Mock output extractor
			vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({
				message: 'Hello',
			});

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.stepId).toBe('test-step');
			expect(trace.stepType).toBe('script');
			expect(trace.error).toBeUndefined();
			expect(trace.outputs).toEqual({ message: 'Hello' });
			expect(trace.exitCode).toBe(0);
		});

		it('should handle script step failure', async () => {
			const step: ScriptFlowStep = {
				id: 'fail-step',
				name: 'Fail Step',
				type: 'script',
				script: 'exit 1',
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
			};

			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('exit 1');
			vi.mocked(ScriptExecutor.prototype.execute).mockResolvedValue({
				success: false,
				exitCode: 1,
				stdout: '',
				stderr: 'Error',
				durationMs: 50,
			});
			vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({});

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.error).toBeDefined();
			expect(trace.error).toContain('exited with code 1');
			expect(trace.exitCode).toBe(1);
		});

		it('should interpolate variables in script', async () => {
			const step: ScriptFlowStep = {
				id: 'var-step',
				name: 'Variable Step',
				type: 'script',
				script: 'echo ${{ inputs.name }}',
			};

			const context = {
				inputs: { name: 'World' },
				stepOutputs: new Map(),
				taskMetadata: {},
			};

			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('echo World');
			vi.mocked(ScriptExecutor.prototype.execute).mockResolvedValue({
				success: true,
				exitCode: 0,
				stdout: 'World',
				stderr: '',
				durationMs: 50,
			});
			vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({});

			await runner.executeStep(step, testWorkspace, context);

			expect(TemplateRenderer.prototype.render).toHaveBeenCalledWith('echo ${{ inputs.name }}', context, true);
		});
	});

	describe('executeStep - Model Steps', () => {
		it('should execute a successful model step in background mode', async () => {
			const step: ModelFlowStep = {
				id: 'model-step',
				name: 'Model Step',
				type: 'model',
				prompt: 'Write a function',
				model: 'sonnet',
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
			};

			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('Write a function');
			vi.mocked(ClaudeLauncher.prototype.launchBackground).mockResolvedValue({
				stdout: 'function test() {}',
				stderr: '',
				exitCode: 0,
			});
			vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({
				response: 'function test() {}',
			});

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.stepId).toBe('model-step');
			expect(trace.stepType).toBe('model');
			expect(trace.error).toBeUndefined();
			expect(trace.response).toBe('function test() {}');
			expect(trace.model).toBe('sonnet');
		});

		it('should handle model step failure', async () => {
			const step: ModelFlowStep = {
				id: 'model-fail',
				name: 'Model Fail',
				type: 'model',
				model: 'sonnet',
				prompt: 'Test',
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
			};

			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('Test');
			vi.mocked(ClaudeLauncher.prototype.launchBackground).mockResolvedValue({
				stdout: '',
				stderr: 'Claude error',
				exitCode: 1,
			});

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.error).toBeDefined();
			expect(trace.error).toContain('exited with code 1');
			expect(trace.exitCode).toBe(1);
		});
	});

	describe('Retry Logic', () => {
		it('executes once and returns error when step fails — retry config is for FlowScheduler, not StepRunner', async () => {
			const step: ScriptFlowStep = {
				id: 'retry-step',
				name: 'Retry Step',
				type: 'script',
				script: 'test',
				retry: { maxAttempts: 3, backoff: 'linear' },
			};

			const context = { inputs: {}, stepOutputs: new Map(), taskMetadata: {} };

			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('test');
			vi.mocked(ScriptExecutor.prototype.execute).mockResolvedValue({
				success: false, exitCode: 1, stdout: 'attempt output', stderr: '', durationMs: 10,
			});
			vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({});

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(ScriptExecutor.prototype.execute).toHaveBeenCalledTimes(1);
			expect(trace.error).toBeDefined();
			expect(trace.retries).toBe(0);
		});

		it('executes once and returns error when step fails with no retry config', async () => {
			const step: ScriptFlowStep = {
				id: 'max-retry',
				name: 'Max Retry',
				type: 'script',
				script: 'test',
			};

			const context = { inputs: {}, stepOutputs: new Map(), taskMetadata: {} };

			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('test');
			vi.mocked(ScriptExecutor.prototype.execute).mockResolvedValue({
				success: false, exitCode: 1, stdout: '', stderr: 'Persistent error', durationMs: 10,
			});
			vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({});

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.error).toBeDefined();
			expect(trace.retries).toBe(0);
			expect(ScriptExecutor.prototype.execute).toHaveBeenCalledTimes(1);
		});
	});

	describe('Backoff Calculation', () => {
		it('should calculate linear backoff correctly', () => {
			const runner = new StepRunner({ interactive: false });

			// Access private method via reflection for testing
			const calculateBackoff = (runner as any).calculateBackoff.bind(runner);

			expect(calculateBackoff(1, 'linear')).toBe(1000);
			expect(calculateBackoff(2, 'linear')).toBe(2000);
			expect(calculateBackoff(3, 'linear')).toBe(3000);
		});

		it('should calculate exponential backoff correctly', () => {
			const runner = new StepRunner({ interactive: false });

			const calculateBackoff = (runner as any).calculateBackoff.bind(runner);

			expect(calculateBackoff(1, 'exponential')).toBe(1000);
			expect(calculateBackoff(2, 'exponential')).toBe(2000);
			expect(calculateBackoff(3, 'exponential')).toBe(4000);
			expect(calculateBackoff(4, 'exponential')).toBe(8000);
		});
	});

	describe('executeStep - SubFlow Steps', () => {
		let mockFlowRegistry: FlowRegistry;
		let mockFlowExecutor: any;
		let mockFlow: FlowDefinition;

		beforeEach(() => {
			// Create mock flow
			mockFlow = {
				id: 'target-flow',
				version: '1.0.0',
				name: 'Target Flow',
				description: 'Test flow for SubFlowStep tests',
				inputs: {
					message: 'string',
				},
				steps: [
					{
						id: 'step1',
						name: 'Step 1',
						type: 'script',
						script: 'echo "${{ inputs.message }}"',
					},
				],
				workspace: {
					mode: 'manual',
					gitStrategy: 'any',
					reusePolicy: 'never',
				},
			};

			// Mock FlowRegistry
			mockFlowRegistry = {
				getFlow: vi.fn((flowId: string) => {
					if (flowId === 'target-flow') return mockFlow;
					return undefined;
				}),
			} as any;

			// Mock FlowExecutor
			mockFlowExecutor = {
				execute: vi.fn(async () => ({
					success: true,
					outputs: {
						step1: { result: 'Hello from subflow' },
					},
				})),
			};

			// Configure runner with dependencies
			runner = new StepRunner({ interactive: false });
			runner.setFlowRegistry(mockFlowRegistry);
			runner.setFlowExecutor(mockFlowExecutor);
		});

		it('should execute a successful SubFlowStep with inherit strategy', async () => {
			const step: SubFlowStep = {
				id: 'subflow-step',
				name: 'SubFlow Step',
				type: 'subflow',
				flowId: 'target-flow',
				inputs: {
					message: 'Hello',
				},
				workspaceStrategy: 'inherit',
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
				taskId: 'test-task',
			};

			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('Hello');

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.stepId).toBe('subflow-step');
			expect(trace.stepType).toBe('subflow');
			expect(trace.error).toBeUndefined();
			expect(trace.subFlowId).toBe('target-flow');
			expect(trace.workspaceStrategy).toBe('inherit');
			expect(trace.nestingDepth).toBe(1);
			expect(trace.outputs).toEqual({
				step1: { result: 'Hello from subflow' },
			});
			expect(mockFlowExecutor.execute).toHaveBeenCalledWith({
				taskId: 'test-task',
				flow: mockFlow,
				workspace: testWorkspace,
				inputs: { message: 'Hello' },
				taskMetadata: {},
				claudeEnv: undefined,
				onClaudeProcessStarted: undefined,
				nestingDepth: 1,
			});
		});

		it('should use default inherit strategy when not specified', async () => {
			const step: SubFlowStep = {
				id: 'subflow-default',
				name: 'SubFlow Default',
				type: 'subflow',
				flowId: 'target-flow',
				inputs: {
					message: 'Test',
				},
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
				taskId: 'test-task',
			};

			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('Test');

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.error).toBeUndefined();
			expect(trace.workspaceStrategy).toBe('inherit');
		});

		it('should fail when workspaceStrategy is separate (Phase 2 not implemented)', async () => {
			const step: SubFlowStep = {
				id: 'subflow-separate',
				name: 'SubFlow Separate',
				type: 'subflow',
				flowId: 'target-flow',
				inputs: {
					message: 'Test',
				},
				workspaceStrategy: 'separate',
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
			};

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.error).toBe('workspaceStrategy "separate" is not yet implemented (Phase 2)');
			expect(trace.stepId).toBe('subflow-separate');
		});

		it('should fail when FlowRegistry is not configured', async () => {
			const runnerWithoutRegistry = new StepRunner({ interactive: false });
			// Don't set FlowRegistry

			const step: SubFlowStep = {
				id: 'subflow-no-registry',
				name: 'SubFlow No Registry',
				type: 'subflow',
				flowId: 'target-flow',
				inputs: {},
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
			};

			const trace = await runnerWithoutRegistry.executeStep(step, testWorkspace, context);

			expect(trace.error).toBe('FlowRegistry not configured in StepRunner');
		});

		it('should fail when FlowExecutor is not configured', async () => {
			const runnerWithoutExecutor = new StepRunner({ interactive: false });
			runnerWithoutExecutor.setFlowRegistry(mockFlowRegistry);
			// Don't set FlowExecutor

			const step: SubFlowStep = {
				id: 'subflow-no-executor',
				name: 'SubFlow No Executor',
				type: 'subflow',
				flowId: 'target-flow',
				inputs: {},
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
			};

			const trace = await runnerWithoutExecutor.executeStep(step, testWorkspace, context);

			expect(trace.error).toBe('FlowExecutor not configured in StepRunner');
		});

		it('should fail when referenced flow does not exist', async () => {
			const step: SubFlowStep = {
				id: 'subflow-not-found',
				name: 'SubFlow Not Found',
				type: 'subflow',
				flowId: 'non-existent-flow',
				inputs: {},
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
			};

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.error).toBe("Flow 'non-existent-flow' not found");
		});

		it('should fail when nesting depth exceeds maximum (10)', async () => {
			const step: SubFlowStep = {
				id: 'subflow-deep',
				name: 'SubFlow Deep',
				type: 'subflow',
				flowId: 'target-flow',
				inputs: {},
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
				nestingDepth: 10, // Already at max depth
			};

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.error).toBe('Maximum nesting depth (10) exceeded');
			expect(trace.nestingDepth).toBe(11);
		});

		it('should track nesting depth correctly', async () => {
			const step: SubFlowStep = {
				id: 'subflow-nested',
				name: 'SubFlow Nested',
				type: 'subflow',
				flowId: 'target-flow',
				inputs: {
					message: 'Nested',
				},
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
				taskId: 'test-task',
				nestingDepth: 3, // Starting at depth 3
			};

			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('Nested');

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.error).toBeUndefined();
			expect(trace.nestingDepth).toBe(4);
			expect(mockFlowExecutor.execute).toHaveBeenCalledWith(
				expect.objectContaining({
					nestingDepth: 4,
				})
			);
		});

		it('should render inputs with template context', async () => {
			const step: SubFlowStep = {
				id: 'subflow-template',
				name: 'SubFlow Template',
				type: 'subflow',
				flowId: 'target-flow',
				inputs: {
					message: '${{ inputs.greeting }} ${{ inputs.name }}',
				},
			};

			const context = {
				inputs: { greeting: 'Hello', name: 'World' },
				stepOutputs: new Map(),
				taskMetadata: {},
				taskId: 'test-task',
			};

			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('Hello World');

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.error).toBeUndefined();
			expect(TemplateRenderer.prototype.render).toHaveBeenCalledWith(
				'${{ inputs.greeting }} ${{ inputs.name }}',
				context,
				true
			);
			expect(mockFlowExecutor.execute).toHaveBeenCalledWith(
				expect.objectContaining({
					inputs: { message: 'Hello World' },
				})
			);
		});

		it('should fail when input template rendering fails', async () => {
			const step: SubFlowStep = {
				id: 'subflow-bad-template',
				name: 'SubFlow Bad Template',
				type: 'subflow',
				flowId: 'target-flow',
				inputs: {
					message: '${{ invalid.reference }}',
				},
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
			};

			vi.mocked(TemplateRenderer.prototype.render).mockImplementation(() => {
				throw new Error('Template rendering error');
			});

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.error).toContain("Failed to render input 'message'");
			expect(trace.error).toContain('Template rendering error');
		});

		it('should propagate error when subflow execution fails', async () => {
			const step: SubFlowStep = {
				id: 'subflow-fail',
				name: 'SubFlow Fail',
				type: 'subflow',
				flowId: 'target-flow',
				inputs: {},
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
				taskId: 'test-task',
			};

			mockFlowExecutor.execute.mockResolvedValue({
				success: false,
				error: 'SubFlow execution failed',
			});

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.error).toBe('SubFlow execution failed');
			expect(trace.outputs).toBeUndefined();
		});

		it('should handle exception during subflow execution', async () => {
			const step: SubFlowStep = {
				id: 'subflow-exception',
				name: 'SubFlow Exception',
				type: 'subflow',
				flowId: 'target-flow',
				inputs: {},
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
				taskId: 'test-task',
			};

			mockFlowExecutor.execute.mockRejectedValue(new Error('Unexpected error'));

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.error).toBe('Unexpected error');
		});

		it('should pass taskMetadata and claudeEnv to subflow', async () => {
			const step: SubFlowStep = {
				id: 'subflow-metadata',
				name: 'SubFlow Metadata',
				type: 'subflow',
				flowId: 'target-flow',
				inputs: {},
			};

			const onClaudeProcessStarted = vi.fn();
			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: { priority: 'high' },
				claudeEnv: { API_KEY: 'test-key' },
				onClaudeProcessStarted,
				taskId: 'test-task',
			};

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.error).toBeUndefined();
			expect(mockFlowExecutor.execute).toHaveBeenCalledWith(
				expect.objectContaining({
					taskMetadata: { priority: 'high' },
					claudeEnv: { API_KEY: 'test-key' },
					onClaudeProcessStarted,
				})
			);
		});

		it('should handle multiple input keys correctly', async () => {
			const step: SubFlowStep = {
				id: 'subflow-multi-input',
				name: 'SubFlow Multi Input',
				type: 'subflow',
				flowId: 'target-flow',
				inputs: {
					message: 'Hello',
					name: 'World',
					count: '42',
				},
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
				taskId: 'test-task',
			};

			let renderCallCount = 0;
			vi.mocked(TemplateRenderer.prototype.render).mockImplementation(() => {
				const values = ['Hello', 'World', '42'];
				return values[renderCallCount++];
			});

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.error).toBeUndefined();
			expect(mockFlowExecutor.execute).toHaveBeenCalledWith(
				expect.objectContaining({
					inputs: {
						message: 'Hello',
						name: 'World',
						count: '42',
					},
				})
			);
		});

		it('executes subflow exactly once — retry config is for FlowScheduler, not StepRunner', async () => {
			const step: SubFlowStep = {
				id: 'subflow-retry',
				name: 'SubFlow Retry',
				type: 'subflow',
				flowId: 'target-flow',
				inputs: {},
				retry: { maxAttempts: 3, backoff: 'linear' },
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
				taskId: 'test-task',
			};

			mockFlowExecutor.execute.mockResolvedValue({ success: false, error: 'Temporary failure' });

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(mockFlowExecutor.execute).toHaveBeenCalledTimes(1);
			expect(trace.error).toBeDefined();
			expect(trace.retries).toBe(0);
		});

		it('should map subflow outputs using output configuration', async () => {
			const step: SubFlowStep = {
				id: 'subflow-with-output-mapping',
				name: 'SubFlow With Output Mapping',
				type: 'subflow',
				flowId: 'target-flow',
				inputs: {
					message: 'Hello',
				},
				output: {
					echo1: '${{ steps.step1.outputs.result }}',
					greeting: '${{ steps.step1.outputs.result }}',
				},
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
				taskId: 'test-task',
			};

			// Mock template renderer for input rendering
			let renderCallIndex = 0;
			vi.mocked(TemplateRenderer.prototype.render).mockImplementation((template: string) => {
				if (renderCallIndex === 0) {
					// First call: render input
					renderCallIndex++;
					return 'Hello';
				} else {
					// Subsequent calls: render output templates
					// Both output templates reference steps.step1.outputs.result
					return 'Hello from subflow';
				}
			});

			// Mock FlowExecutor to return structured outputs
			mockFlowExecutor.execute.mockResolvedValue({
				success: true,
				outputs: {
					step1: { result: 'Hello from subflow' },
				},
			});

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.error).toBeUndefined();
			expect(trace.outputs).toEqual({
				echo1: 'Hello from subflow',
				greeting: 'Hello from subflow',
			});
		});

		it('should handle output mapping errors gracefully', async () => {
			const step: SubFlowStep = {
				id: 'subflow-bad-output',
				name: 'SubFlow Bad Output',
				type: 'subflow',
				flowId: 'target-flow',
				inputs: {},
				output: {
					invalid: '${{ steps.nonexistent.outputs.value }}',
				},
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
				taskId: 'test-task',
			};

			// Mock FlowExecutor to return outputs
			mockFlowExecutor.execute.mockResolvedValue({
				success: true,
				outputs: {
					step1: { result: 'data' },
				},
			});

			// Mock template renderer to throw error when rendering invalid output reference
			vi.mocked(TemplateRenderer.prototype.render).mockImplementation((template: string) => {
				if (template.includes('nonexistent')) {
					throw new Error("Step 'nonexistent' not found or has no outputs");
				}
				return 'rendered';
			});

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.error).toContain("Failed to render output 'invalid'");
			expect(trace.error).toContain('nonexistent');
		});

		it('should pass through all subflow outputs when no output configuration', async () => {
			const step: SubFlowStep = {
				id: 'subflow-no-output-config',
				name: 'SubFlow No Output Config',
				type: 'subflow',
				flowId: 'target-flow',
				inputs: {},
				// No output configuration
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
				taskId: 'test-task',
			};

			// Mock FlowExecutor to return multiple step outputs
			mockFlowExecutor.execute.mockResolvedValue({
				success: true,
				outputs: {
					step1: { result: 'data1', count: 42 },
					step2: { message: 'Hello', status: 'ok' },
				},
			});

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.error).toBeUndefined();
			// Without output configuration, all outputs are passed through
			expect(trace.outputs).toEqual({
				step1: { result: 'data1', count: 42 },
				step2: { message: 'Hello', status: 'ok' },
			});
		});
	});

	describe('executeStep - retry delegation to FlowScheduler', () => {
		const context = { inputs: {}, stepOutputs: new Map(), taskMetadata: {} };

		it('executes exactly once when step fails with retry config — does NOT retry internally', async () => {
			const step: ScriptFlowStep = {
				id: 'flaky',
				name: 'Flaky',
				type: 'script',
				script: 'exit 1',
				retry: { maxAttempts: 3, backoff: 'linear' },
			};

			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('exit 1');
			vi.mocked(ScriptExecutor.prototype.execute).mockResolvedValue({
				success: false, exitCode: 1, stdout: 'attempt output', stderr: '', durationMs: 50,
			});
			vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({});

			const trace = await runner.executeStep(step, testWorkspace, context);

			// ScriptExecutor called exactly once — FlowScheduler handles retries, not StepRunner
			expect(ScriptExecutor.prototype.execute).toHaveBeenCalledTimes(1);
			expect(trace.error).toBeDefined();
			expect(trace.exitCode).toBe(1);
		});

		it('executes exactly once when step fails with no retry config', async () => {
			const step: ScriptFlowStep = {
				id: 'fail',
				name: 'Fail',
				type: 'script',
				script: 'exit 1',
			};

			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('exit 1');
			vi.mocked(ScriptExecutor.prototype.execute).mockResolvedValue({
				success: false, exitCode: 1, stdout: '', stderr: '', durationMs: 50,
			});
			vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({});

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(ScriptExecutor.prototype.execute).toHaveBeenCalledTimes(1);
			expect(trace.error).toBeDefined();
		});

		it('executes exactly once when step succeeds', async () => {
			const step: ScriptFlowStep = {
				id: 'ok',
				name: 'OK',
				type: 'script',
				script: 'echo hi',
				retry: { maxAttempts: 3, backoff: 'linear' },
			};

			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('echo hi');
			vi.mocked(ScriptExecutor.prototype.execute).mockResolvedValue({
				success: true, exitCode: 0, stdout: 'hi', stderr: '', durationMs: 50,
			});
			vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({});

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(ScriptExecutor.prototype.execute).toHaveBeenCalledTimes(1);
			expect(trace.error).toBeUndefined();
		});
	});

	describe('writeOutput — safe multi-line output to file', () => {
		const fs = require('node:fs');
		const path = require('node:path');
		const os = require('node:os');

		it('writes extracted output to metaDir/outputs/, NOT workspaceDir', async () => {
			const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'writeOutput-'));
			const metaDir = workspaceDir + '.meta';
			fs.mkdirSync(path.join(metaDir, 'outputs'), { recursive: true });
			const wsWithDir = { ...testWorkspace, path: workspaceDir, metaDir };

			const step: ScriptFlowStep = {
				id: 'write-step', name: 'Write Step', type: 'script', script: 'echo hello',
				output: { response: { type: 'string', writeOutput: 'response.txt' } },
			};
			const context = { inputs: {}, stepOutputs: new Map(), taskMetadata: {}, context: { cwd: workspaceDir, outputsDir: path.join(metaDir, 'outputs') } };

			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('echo hello');
			vi.mocked(ScriptExecutor.prototype.execute).mockResolvedValue({ success: true, exitCode: 0, stdout: 'hello', stderr: '', durationMs: 10 });
			vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({ response: 'Line 1\nLine 2' });

			await runner.executeStep(step, wsWithDir, context);

			// Must be in metaDir, NOT workspaceDir
			expect(fs.existsSync(path.join(metaDir, 'outputs', 'response.txt'))).toBe(true);
			expect(fs.existsSync(path.join(workspaceDir, 'response.txt'))).toBe(false);
			expect(fs.readFileSync(path.join(metaDir, 'outputs', 'response.txt'), 'utf8')).toBe('Line 1\nLine 2');

			fs.rmSync(workspaceDir, { recursive: true });
			fs.rmSync(metaDir, { recursive: true });
		});

		it('writes extracted output to workspace file when writeOutput is set', async () => {
			const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'writeOutput-'));
			const metaDir = workspaceDir + '.meta';
			fs.mkdirSync(path.join(metaDir, 'outputs'), { recursive: true });
			const wsWithDir = { ...testWorkspace, path: workspaceDir, metaDir };

			const step: ScriptFlowStep = {
				id: 'write-step',
				name: 'Write Step',
				type: 'script',
				script: 'echo hello',
				output: {
					response: { type: 'string', writeOutput: 'response.txt' },
				},
			};
			const context = { inputs: {}, stepOutputs: new Map(), taskMetadata: {}, context: { cwd: workspaceDir, outputsDir: path.join(metaDir, 'outputs') } };

			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('echo hello');
			vi.mocked(ScriptExecutor.prototype.execute).mockResolvedValue({
				success: true, exitCode: 0, stdout: 'hello', stderr: '', durationMs: 10,
			});
			vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({
				response: 'Line 1\nLine 2\nLine 3',
			});

			await runner.executeStep(step, wsWithDir, context);

			const filePath = path.join(metaDir, 'outputs', 'response.txt');
			expect(fs.existsSync(filePath)).toBe(true);
			expect(fs.readFileSync(filePath, 'utf8')).toBe('Line 1\nLine 2\nLine 3');

			fs.rmSync(workspaceDir, { recursive: true });
			fs.rmSync(metaDir, { recursive: true });
		});

		it('does not create file when writeOutput is not set', async () => {
			const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'writeOutput-'));
			const metaDir = workspaceDir + '.meta';
			const wsWithDir = { ...testWorkspace, path: workspaceDir, metaDir };

			const step: ScriptFlowStep = {
				id: 'no-write-step',
				name: 'No Write Step',
				type: 'script',
				script: 'echo hi',
				output: { response: { type: 'string' } },
			};
			const context = { inputs: {}, stepOutputs: new Map(), taskMetadata: {} };

			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('echo hi');
			vi.mocked(ScriptExecutor.prototype.execute).mockResolvedValue({
				success: true, exitCode: 0, stdout: 'hi', stderr: '', durationMs: 10,
			});
			vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({ response: 'hi' });

			await runner.executeStep(step, wsWithDir, context);

			expect(fs.existsSync(path.join(workspaceDir, 'response.txt'))).toBe(false);

			fs.rmSync(workspaceDir, { recursive: true });
		});
	});

	describe('step meta', () => {
		it('script step populates trace.meta with exit_code and duration_ms', async () => {
			const step: ScriptFlowStep = {
				id: 'script-step',
				name: 'Script',
				type: 'script',
				script: 'echo hi',
			};
			const context = { inputs: {}, stepOutputs: new Map(), taskMetadata: {} };
			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('echo hi');
			vi.mocked(ScriptExecutor.prototype.execute).mockResolvedValue({
				success: true,
				exitCode: 0,
				stdout: '',
				stderr: '',
				durationMs: 42,
			});
			vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({});

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.meta).toBeDefined();
			expect((trace.meta as any).exit_code).toBe(0);
			expect((trace.meta as any).duration_ms).toBe(42);
		});

		it('model step populates trace.meta with session_id, cost, and duration_ms', async () => {
			const step: ModelFlowStep = {
				id: 'model-step',
				name: 'Model',
				type: 'model',
				model: 'haiku',
				prompt: 'hello',
			};
			const context = { inputs: {}, stepOutputs: new Map(), taskMetadata: {} };
			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('hello');

			// Background mode mock — stream-json provides session_id and cost via onStreamEvent
			vi.mocked(ClaudeLauncher.prototype.launchBackground).mockImplementation(async opts => {
				// Simulate stream events: system:init with session_id and result with cost
				if (opts.onStreamEvent) {
					opts.onStreamEvent({ type: 'system', subtype: 'init', data: { session_id: 'sess-abc123', model: 'haiku' } } as any);
					opts.onStreamEvent({ type: 'result', subtype: 'result', data: { result: 'hi', cost_usd: 0.001, duration_ms: 1500, modelUsage: { 'haiku': { inputTokens: 10, outputTokens: 5 } } } } as any);
				}
				return { stdout: 'hi', stderr: '', exitCode: 0 };
			});
			vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({ response: 'hi' });

			const trace = await runner.executeStep(step, testWorkspace, context);

			expect(trace.meta).toBeDefined();
			const meta = trace.meta as any;
			expect(meta.session_id).toBe('sess-abc123');
			expect(meta.cost.usd).toBe(0.001);
			expect(meta.duration_ms).toBeGreaterThanOrEqual(1);
			expect(meta.model).toBe('haiku');
		});

		it('model step resolves session_file from memory_paths.auto in system:init event', async () => {
			const step: ModelFlowStep = {
				id: 'model-step',
				name: 'Model',
				type: 'model',
				model: 'haiku',
				prompt: 'hello',
			};
			const context = { inputs: {}, stepOutputs: new Map(), taskMetadata: {} };
			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('hello');

			vi.mocked(ClaudeLauncher.prototype.launchBackground).mockImplementation(async opts => {
				if (opts.onStreamEvent) {
					opts.onStreamEvent({
						type: 'system', subtype: 'init',
						data: {
							session_id: 'sess-xyz',
							model: 'haiku',
							memory_paths: { auto: '/home/user/.claude/projects/my-project/memory/' },
						},
					} as any);
					opts.onStreamEvent({ type: 'result', subtype: 'result', data: { result: 'hi', cost_usd: 0, duration_ms: 100, modelUsage: {} } } as any);
				}
				return { stdout: 'hi', stderr: '', exitCode: 0 };
			});
			vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({ response: 'hi' });

			const trace = await runner.executeStep(step, testWorkspace, context);

			const meta = trace.meta as any;
			expect(meta.session_id).toBe('sess-xyz');
			// session_file should be derived from memory_paths.auto: strip /memory/ → add /conversations/<id>.jsonl
			expect(meta.session_file).toMatch(/sess-xyz\.jsonl$/);
			expect(meta.session_file).toContain('my-project');
		});

		it('session mode:fork copies session file and uses new UUID as resumeSessionId', async () => {
			const { mkdtempSync, writeFileSync, existsSync } = await import('node:fs');
			const { join } = await import('node:path');
			const { tmpdir } = await import('node:os');

			// Create a fake session file
			const convDir = mkdtempSync(join(tmpdir(), 'fork-test-conv-'));
			const parentSessionId = 'parent-sess-abc';
			const parentFile = join(convDir, `${parentSessionId}.jsonl`);
			writeFileSync(parentFile, '{"type":"system"}\n');

			const step: ModelFlowStep = {
				id: 'fork-step',
				name: 'Fork',
				type: 'model',
				model: 'haiku',
				prompt: 'Continue.',
				session: { continue: 'prev', mode: 'fork' },
			};

			const stepMetaMap = new Map([
				['prev', { session_id: parentSessionId, session_file: parentFile, duration_ms: 100, model: 'haiku', ttft_ms: 0, cost: { input_tokens: 1, output_tokens: 1, usd: 0 } }],
			]);
			const context = { inputs: {}, stepOutputs: new Map(), taskMetadata: {}, stepMeta: stepMetaMap };
			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('Continue.');

			let capturedResumeId: string | undefined;
			vi.mocked(ClaudeLauncher.prototype.launchBackground).mockImplementation(async opts => {
				capturedResumeId = (opts as any).resumeSessionId;
				if (opts.onStreamEvent) {
					opts.onStreamEvent({ type: 'system', subtype: 'init', data: { session_id: capturedResumeId ?? 'fork-id', model: 'haiku' } } as any);
					opts.onStreamEvent({ type: 'result', subtype: 'result', data: { result: 'ok', cost_usd: 0, duration_ms: 100, modelUsage: {} } } as any);
				}
				return { stdout: 'ok', stderr: '', exitCode: 0 };
			});
			vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({ response: 'ok' });

			await runner.executeStep(step, testWorkspace, context);

			// Fork must use a DIFFERENT session ID than the parent
			expect(capturedResumeId).toBeDefined();
			expect(capturedResumeId).not.toBe(parentSessionId);
			// The forked file must exist in the same conversations dir
			expect(existsSync(join(convDir, `${capturedResumeId}.jsonl`))).toBe(true);
		});

		it('session mode:fork falls back to append when session_file is empty', async () => {
			const step: ModelFlowStep = {
				id: 'fork-fallback',
				name: 'Fork fallback',
				type: 'model',
				model: 'haiku',
				prompt: 'Continue.',
				session: { continue: 'prev', mode: 'fork' },
			};

			const stepMetaMap = new Map([
				['prev', { session_id: 'parent-id', session_file: '', duration_ms: 100, model: 'haiku', ttft_ms: 0, cost: { input_tokens: 1, output_tokens: 1, usd: 0 } }],
			]);
			const context = { inputs: {}, stepOutputs: new Map(), taskMetadata: {}, stepMeta: stepMetaMap };
			vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('Continue.');

			let capturedResumeId: string | undefined;
			vi.mocked(ClaudeLauncher.prototype.launchBackground).mockImplementation(async opts => {
				capturedResumeId = (opts as any).resumeSessionId;
				if (opts.onStreamEvent) {
					opts.onStreamEvent({ type: 'system', subtype: 'init', data: { session_id: 'new-id', model: 'haiku' } } as any);
					opts.onStreamEvent({ type: 'result', subtype: 'result', data: { result: 'ok', cost_usd: 0, duration_ms: 100, modelUsage: {} } } as any);
				}
				return { stdout: 'ok', stderr: '', exitCode: 0 };
			});
			vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({ response: 'ok' });

			await runner.executeStep(step, testWorkspace, context);

			// Falls back to parent session_id (append behavior)
			expect(capturedResumeId).toBe('parent-id');
		});
	});
});
