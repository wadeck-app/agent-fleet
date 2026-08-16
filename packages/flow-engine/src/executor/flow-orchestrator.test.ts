/**
 * Flow Orchestrator Tests
 */
import { setupTest } from 'test-utils/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlowDefinition, StepTrace, Workspace } from '../types';
import { FlowOrchestrator } from './FlowOrchestrator';
import { StepRunner } from './StepRunner';

// Mock StepRunner
vi.mock('./StepRunner');

describe('FlowOrchestrator', () => {
	let cleanup: () => void;
	let orchestrator: FlowOrchestrator;
	let mockStepRunner: StepRunner;
	let testWorkspace: Workspace;

	beforeEach(() => {
		cleanup = setupTest();
		mockStepRunner = new StepRunner({ interactive: false });
		orchestrator = new FlowOrchestrator(mockStepRunner);

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
	});

	afterEach(() => {
		cleanup();
	});

	describe('Basic Orchestration', () => {
		it('should orchestrate a simple single-step flow', async () => {
			const flow: FlowDefinition = {
				id: 'simple-flow',
				version: '1.0.0',
				name: 'Simple Flow',
				description: 'Single step',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'never',
				},
				inputs: {},
				steps: [
					{
						id: 'step1',
						name: 'Step 1',
						type: 'script',
						script: 'echo "test"',
					},
				],
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
			};

			const mockTrace: StepTrace = {
				stepId: 'step1',
				stepName: 'Step 1',
				stepType: 'script',
				startTime: Date.now(),
				endTime: Date.now() + 100,
				durationMs: 100,
				outputs: { result: 'test' },
			};

			vi.mocked(mockStepRunner.executeStep).mockResolvedValue(mockTrace);

			const result = await orchestrator.orchestrate('test-task', flow, testWorkspace, context);

			expect(result.success).toBe(true);
			expect(result.trace.steps).toHaveLength(1);
			expect(result.trace.status).toBe('completed');
			expect(mockStepRunner.executeStep).toHaveBeenCalledTimes(1);
		});

		it('should respect step dependencies', async () => {
			const flow: FlowDefinition = {
				id: 'deps-flow',
				version: '1.0.0',
				name: 'Dependencies Flow',
				description: 'Steps with dependencies',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'never',
				},
				inputs: {},
				steps: [
					{
						id: 'step1',
						name: 'Step 1',
						type: 'script',
						script: 'echo "first"',
					},
					{
						id: 'step2',
						name: 'Step 2',
						type: 'script',
						script: 'echo "second"',
						depends: ['step1'],
					},
				],
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
			};

			const executionOrder: string[] = [];

			vi.mocked(mockStepRunner.executeStep).mockImplementation(async step => {
				executionOrder.push(step.id);
				return {
					stepId: step.id,
					stepName: step.name,
					stepType: step.type,
					startTime: Date.now(),
					endTime: Date.now() + 50,
					durationMs: 50,
					outputs: {},
				};
			});

			await orchestrator.orchestrate('test-task', flow, testWorkspace, context);

			// step1 should execute before step2
			expect(executionOrder).toEqual(['step1', 'step2']);
		});

		it('should execute independent steps in parallel', async () => {
			const flow: FlowDefinition = {
				id: 'parallel-flow',
				version: '1.0.0',
				name: 'Parallel Flow',
				description: 'Independent steps',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'never',
				},
				inputs: {},
				steps: [
					{
						id: 'step1',
						name: 'Step 1',
						type: 'script',
						script: 'echo "a"',
					},
					{
						id: 'step2',
						name: 'Step 2',
						type: 'script',
						script: 'echo "b"',
					},
					{
						id: 'step3',
						name: 'Step 3',
						type: 'script',
						script: 'echo "c"',
					},
				],
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
			};

			vi.mocked(mockStepRunner.executeStep).mockImplementation(async step => {
				return {
					stepId: step.id,
					stepName: step.name,
					stepType: step.type,
					startTime: Date.now(),
					endTime: Date.now() + 50,
					durationMs: 50,
				};
			});

			const result = await orchestrator.orchestrate('test-task', flow, testWorkspace, context);

			expect(result.success).toBe(true);
			expect(result.trace.steps).toHaveLength(3);
			// All three should be called once (in parallel)
			expect(mockStepRunner.executeStep).toHaveBeenCalledTimes(3);
		});
	});

	describe('Error Handling', () => {
		it('should fail flow when step fails without retry', async () => {
			const flow: FlowDefinition = {
				id: 'fail-flow',
				version: '1.0.0',
				name: 'Fail Flow',
				description: 'Step that fails',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'never',
				},
				inputs: {},
				steps: [
					{
						id: 'fail-step',
						name: 'Fail Step',
						type: 'script',
						script: 'exit 1',
					},
				],
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
			};

			vi.mocked(mockStepRunner.executeStep).mockResolvedValue({
				stepId: 'fail-step',
				stepName: 'Fail Step',
				stepType: 'script',
				startTime: Date.now(),
				endTime: Date.now() + 50,
				durationMs: 50,
				error: 'Script exited with code 1',
			});

			const result = await orchestrator.orchestrate('test-task', flow, testWorkspace, context);

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
			expect(result.error).toContain('failed');
			expect(result.trace.status).toBe('failed');
		});

		it('should detect circular dependencies', async () => {
			const flow: FlowDefinition = {
				id: 'circular-flow',
				version: '1.0.0',
				name: 'Circular Flow',
				description: 'Circular dependency',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'never',
				},
				inputs: {},
				steps: [
					{
						id: 'step1',
						name: 'Step 1',
						type: 'script',
						script: 'echo "a"',
						depends: ['step2'],
					},
					{
						id: 'step2',
						name: 'Step 2',
						type: 'script',
						script: 'echo "b"',
						depends: ['step1'],
					},
				],
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
			};

			const result = await orchestrator.orchestrate('test-task', flow, testWorkspace, context);

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});

		it('should detect undefined step references', async () => {
			const flow: FlowDefinition = {
				id: 'undefined-ref-flow',
				version: '1.0.0',
				name: 'Undefined Reference',
				description: 'Step depends on non-existent step',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'never',
				},
				inputs: {},
				steps: [
					{
						id: 'step1',
						name: 'Step 1',
						type: 'script',
						script: 'echo "test"',
						depends: ['nonexistent'],
					},
				],
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
			};

			const result = await orchestrator.orchestrate('test-task', flow, testWorkspace, context);

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
		});
	});

	describe('Output Management', () => {
		it('should collect and pass outputs between steps', async () => {
			const flow: FlowDefinition = {
				id: 'output-flow',
				version: '1.0.0',
				name: 'Output Flow',
				description: 'Steps with outputs',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'never',
				},
				inputs: {},
				steps: [
					{
						id: 'step1',
						name: 'Step 1',
						type: 'script',
						script: 'echo "42"',
						output: {
							number: { type: 'number' },
						},
					},
					{
						id: 'step2',
						name: 'Step 2',
						type: 'script',
						script: 'echo ${{ steps.step1.outputs.number }}',
						depends: ['step1'],
					},
				],
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
			};

			vi.mocked(mockStepRunner.executeStep).mockImplementation(async step => {
				if (step.id === 'step1') {
					return {
						stepId: 'step1',
						stepName: 'Step 1',
						stepType: 'script',
						startTime: Date.now(),
						endTime: Date.now() + 50,
						durationMs: 50,
						outputs: { number: 42 },
					};
				} else {
					return {
						stepId: 'step2',
						stepName: 'Step 2',
						stepType: 'script',
						startTime: Date.now(),
						endTime: Date.now() + 50,
						durationMs: 50,
						outputs: {},
					};
				}
			});

			const result = await orchestrator.orchestrate('test-task', flow, testWorkspace, context);

			expect(result.success).toBe(true);
			expect(result.outputs.step1).toEqual({ number: 42 });
			expect(context.stepOutputs.has('step1')).toBe(true);
			expect(context.stepOutputs.get('step1')).toEqual({ number: 42 });
		});
	});

	describe('Complex DAG', () => {
		it('should handle diamond dependency pattern', async () => {
			const flow: FlowDefinition = {
				id: 'diamond-flow',
				version: '1.0.0',
				name: 'Diamond Flow',
				description: 'Diamond dependency pattern',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'never',
				},
				inputs: {},
				steps: [
					{
						id: 'start',
						name: 'Start',
						type: 'script',
						script: 'echo "start"',
					},
					{
						id: 'left',
						name: 'Left',
						type: 'script',
						script: 'echo "left"',
						depends: ['start'],
					},
					{
						id: 'right',
						name: 'Right',
						type: 'script',
						script: 'echo "right"',
						depends: ['start'],
					},
					{
						id: 'end',
						name: 'End',
						type: 'script',
						script: 'echo "end"',
						depends: ['left', 'right'],
					},
				],
			};

			const context = {
				inputs: {},
				stepOutputs: new Map(),
				taskMetadata: {},
			};

			const executionOrder: string[] = [];

			vi.mocked(mockStepRunner.executeStep).mockImplementation(async step => {
				executionOrder.push(step.id);
				return {
					stepId: step.id,
					stepName: step.name,
					stepType: step.type,
					startTime: Date.now(),
					endTime: Date.now() + 50,
					durationMs: 50,
				};
			});

			const result = await orchestrator.orchestrate('test-task', flow, testWorkspace, context);

			expect(result.success).toBe(true);
			expect(result.trace.steps).toHaveLength(4);

			// Verify execution order:
			// 1. start executes first
			expect(executionOrder[0]).toBe('start');

			// 2. left and right execute after start (order doesn't matter)
			expect(executionOrder.slice(1, 3).sort()).toEqual(['left', 'right']);

			// 3. end executes last
			expect(executionOrder[3]).toBe('end');
		});
	});

	describe('Global env', () => {
		const makeFlow = (globalEnv?: Record<string, string>, stepEnv?: Record<string, string>): FlowDefinition => ({
			id: 'env-flow',
			version: '1.0.0',
			name: 'Env Flow',
			description: 'Global env test',
			workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
			inputs: {},
			env: globalEnv,
			steps: [{ id: 'step1', name: 'Step 1', type: 'script', script: 'echo hi', env: stepEnv }],
		});

		const makeTrace = (): StepTrace => ({
			stepId: 'step1',
			stepName: 'Step 1',
			stepType: 'script',
			startTime: Date.now(),
			endTime: Date.now() + 10,
			durationMs: 10,
			outputs: {},
		});

		it('passes global env to script step', async () => {
			vi.mocked(mockStepRunner.executeStep).mockResolvedValue(makeTrace());
			const flow = makeFlow({ MY_VAR: 'hello' });
			await orchestrator.orchestrate('t', flow, testWorkspace, { inputs: {}, stepOutputs: new Map(), taskMetadata: {} });
			const calledStep = vi.mocked(mockStepRunner.executeStep).mock.calls[0]![0] as any;
			expect(calledStep.env).toMatchObject({ MY_VAR: 'hello' });
		});

		it('step-level env overrides global env for same key', async () => {
			vi.mocked(mockStepRunner.executeStep).mockResolvedValue(makeTrace());
			const flow = makeFlow({ KEY: 'global', OTHER: 'x' }, { KEY: 'step' });
			await orchestrator.orchestrate('t', flow, testWorkspace, { inputs: {}, stepOutputs: new Map(), taskMetadata: {} });
			const calledStep = vi.mocked(mockStepRunner.executeStep).mock.calls[0]![0] as any;
			expect(calledStep.env).toMatchObject({ KEY: 'step', OTHER: 'x' });
		});

		it('resolves ${{ }} templates in global env values', async () => {
			vi.mocked(mockStepRunner.executeStep).mockResolvedValue(makeTrace());
			const flow = makeFlow({ PROJECT: '${{ inputs.dir }}' });
			const context = { inputs: { dir: '/my/project' }, stepOutputs: new Map(), taskMetadata: {} };
			await orchestrator.orchestrate('t', flow, testWorkspace, context);
			const calledStep = vi.mocked(mockStepRunner.executeStep).mock.calls[0]![0] as any;
			expect(calledStep.env).toMatchObject({ PROJECT: '/my/project' });
		});

		it('does not mutate step when no global env', async () => {
			vi.mocked(mockStepRunner.executeStep).mockResolvedValue(makeTrace());
			const flow = makeFlow(undefined, { STEP_ONLY: 'yes' });
			await orchestrator.orchestrate('t', flow, testWorkspace, { inputs: {}, stepOutputs: new Map(), taskMetadata: {} });
			const calledStep = vi.mocked(mockStepRunner.executeStep).mock.calls[0]![0] as any;
			expect(calledStep.env).toEqual({ STEP_ONLY: 'yes' });
		});
	});
});
