/**
 * Flow Registry Tests
 */
import { createMockFlow, createMockModelStep } from 'flow-engine/test-utils/factories';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlowDefinition } from '../types';
import { FlowRegistry, FlowValidationError } from './FlowRegistry';

// Mock fs and yaml modules
vi.mock('fs');
vi.mock('js-yaml');

describe('FlowRegistry', () => {
	let registry: FlowRegistry;
	const projectRoot = '/test/project';
	const configPath = '/test/project/.agent-fleet/flows.yml';

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock fs.existsSync to return false by default (no project flows)
		vi.mocked(fs.existsSync).mockReturnValue(false);

		registry = new FlowRegistry(projectRoot);
	});

	afterEach(() => {
		// Clean up any file watchers
		registry.stopWatching();
	});

	describe('Constructor and Default Flows', () => {
		it('should initialize with default flows', () => {
			expect(registry.hasFlow('simple-qa')).toBe(true);
			expect(registry.hasFlow('dev-full')).toBe(true);
		});

		it('should load simple-qa default flow correctly', () => {
			const flow = registry.getFlow('simple-qa');

			expect(flow).toBeDefined();
			expect(flow?.id).toBe('simple-qa');
			expect(flow?.name).toBe('Simple Question & Answer');
			expect(flow?.workspace.mode).toBe('shared');
			expect(flow?.steps).toHaveLength(1);
			expect(flow?.steps[0].type).toBe('model');
		});

		it('should load dev-full default flow correctly', () => {
			const flow = registry.getFlow('dev-full');

			expect(flow).toBeDefined();
			expect(flow?.id).toBe('dev-full');
			expect(flow?.name).toBe('Full Development Cycle');
			expect(flow?.workspace.mode).toBe('isolated');
			expect(flow?.steps).toHaveLength(4);
		});

		it('should have correct default flow count', () => {
			const allFlows = registry.getAllFlows();
			expect(allFlows.length).toBe(2); // simple-qa and dev-full
		});
	});

	describe('Flow Retrieval', () => {
		it('should get flow by ID', () => {
			const flow = registry.getFlow('simple-qa');
			expect(flow).toBeDefined();
			expect(flow?.id).toBe('simple-qa');
		});

		it('should return undefined for non-existent flow', () => {
			const flow = registry.getFlow('non-existent');
			expect(flow).toBeUndefined();
		});

		it('should check if flow exists', () => {
			expect(registry.hasFlow('simple-qa')).toBe(true);
			expect(registry.hasFlow('non-existent')).toBe(false);
		});

		it('should get all flows', () => {
			const flows = registry.getAllFlows();
			expect(flows).toBeInstanceOf(Array);
			expect(flows.length).toBeGreaterThan(0);
		});

		it('should get all flow IDs', () => {
			const ids = registry.getFlowIds();
			expect(ids).toContain('simple-qa');
			expect(ids).toContain('dev-full');
		});
	});

	describe('Flow Registration', () => {
		it('should register a valid flow', () => {
			const validFlow = createMockFlow({
				id: 'test-flow',
				name: 'Test Flow',
				description: 'Test description',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'never',
				},
				inputs: {
					input1: 'string',
				},
				steps: [
					createMockModelStep({
						id: 'step1',
						name: 'Step 1',
						model: 'haiku',
						prompt: 'Test prompt',
					}),
				],
			});

			registry.registerFlow(validFlow);

			expect(registry.hasFlow('test-flow')).toBe(true);
			expect(registry.getFlow('test-flow')).toEqual(validFlow);
		});

		it('should reject invalid flow with validation error', () => {
			const invalidFlow = createMockFlow({
				id: 'invalid-flow',
				name: 'Invalid Flow',
				description: 'Has invalid step dependency',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'never',
				},
				steps: [
					createMockModelStep({
						id: 'step1',
						name: 'Step 1',
						model: 'haiku',
						prompt: 'Test',
						depends: ['non-existent-step'], // Invalid dependency
					}),
				],
			});

			expect(() => {
				registry.registerFlow(invalidFlow);
			}).toThrow(FlowValidationError);
		});

		it('should unregister a flow', () => {
			const flow = createMockFlow({
				id: 'temp-flow',
				name: 'Temp',
				description: '',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'never',
				},
				steps: [
					createMockModelStep({
						id: 'step1',
						name: 'Step 1',
						model: 'haiku',
						prompt: 'Test',
					}),
				],
			});

			registry.registerFlow(flow);
			expect(registry.hasFlow('temp-flow')).toBe(true);

			const result = registry.unregisterFlow('temp-flow');
			expect(result).toBe(true);
			expect(registry.hasFlow('temp-flow')).toBe(false);
		});

		it('should return false when unregistering non-existent flow', () => {
			const result = registry.unregisterFlow('non-existent');
			expect(result).toBe(false);
		});
	});

	describe('Project Flow Loading', () => {
		it('should handle missing config file gracefully', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);

			await expect(registry.loadProjectFlows()).resolves.not.toThrow();
		});

		it('should load valid project flows from YAML', async () => {
			const yamlContent = `
custom-flow:
  version: 1.0.0
  name: Custom Flow
  description: A custom flow
  workspace:
    mode: isolated
    gitStrategy: main-only
    reusePolicy: never
  inputs:
    taskInput: string
  steps:
    - id: step1
      name: Step 1
      type: model
      model: sonnet
      prompt: Do something
`;

			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue(yamlContent);
			vi.mocked(yaml.load).mockReturnValue({
				'custom-flow': {
					version: '1.0.0',
					name: 'Custom Flow',
					description: 'A custom flow',
					workspace: {
						mode: 'isolated',
						gitStrategy: 'main-only',
						reusePolicy: 'never',
					},
					inputs: {
						taskInput: 'string',
					},
					steps: [
						{
							id: 'step1',
							name: 'Step 1',
							type: 'model',
							model: 'sonnet',
							prompt: 'Do something',
						},
					],
				},
			});

			await registry.loadProjectFlows();

			expect(registry.hasFlow('custom-flow')).toBe(true);
			const flow = registry.getFlow('custom-flow');
			expect(flow?.name).toBe('Custom Flow');
		});

		it('should throw error on invalid YAML structure', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('invalid yaml');
			vi.mocked(yaml.load).mockReturnValue(null);

			await expect(registry.loadProjectFlows()).rejects.toThrow('Invalid YAML structure');
		});

		it('should throw error on YAML parsing failure', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
			vi.mocked(yaml.load).mockImplementation(() => {
				throw new Error('YAML parse error');
			});

			await expect(registry.loadProjectFlows()).rejects.toThrow('Failed to load flows');
		});

		it('should skip invalid flows but continue loading valid ones', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml content');
			vi.mocked(yaml.load).mockReturnValue({
				'valid-flow': {
					version: '1.0.0',
					name: 'Valid Flow',
					workspace: {
						mode: 'isolated',
						gitStrategy: 'main-only',
						reusePolicy: 'never',
					},
					steps: [
						{
							id: 'step1',
							name: 'Step 1',
							type: 'model',
							prompt: 'Test',
						},
					],
				},
				'invalid-flow': {
					version: '1.0.0',
					name: 'Invalid Flow',
					workspace: {
						mode: 'isolated',
						gitStrategy: 'main-only',
						reusePolicy: 'never',
					},
					steps: [
						{
							id: 'step1',
							name: 'Step 1',
							type: 'model',
							prompt: 'Test',
							depends: ['non-existent'], // Invalid
						},
					],
				},
			});

			// FlowRegistry loads all flows (valid and invalid); invalid flows are marked but not rejected.
			await registry.loadProjectFlows();
			expect(registry.getFlow('valid-flow')).toBeDefined();
			expect(registry.getFlow('invalid-flow')).toBeDefined();
			expect(registry.getFlowValidationResult('invalid-flow')?.valid).toBe(false);
		});
	});

	describe('Flow Parsing', () => {
		it('should parse model step correctly', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'model-flow': {
					version: '1.0.0',
					name: 'Model Flow',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					steps: [
						{
							id: 'model-step',
							name: 'Model Step',
							type: 'model',
							model: 'sonnet',
							prompt: 'Test prompt',
							context: {
								files: ['**/*.ts'],
							},
							output: {
								result: { type: 'string' },
							},
						},
					],
				},
			});

			await registry.loadProjectFlows();

			const flow = registry.getFlow('model-flow');
			const step = flow?.steps[0];

			expect(step?.type).toBe('model');
			expect((step as any).model).toBe('sonnet');
			expect((step as any).prompt).toBe('Test prompt');
		});

		it('should parse script step correctly', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'script-flow': {
					version: '1.0.0',
					name: 'Script Flow',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					steps: [
						{
							id: 'script-step',
							name: 'Script Step',
							type: 'script',
							script: 'npm test',
							workingDir: '/test',
							env: { NODE_ENV: 'test' },
							output: {
								exitCode: { type: 'number' },
							},
						},
					],
				},
			});

			await registry.loadProjectFlows();

			const flow = registry.getFlow('script-flow');
			const step = flow?.steps[0];

			expect(step?.type).toBe('script');
			expect((step as any).script).toBe('npm test');
			expect((step as any).workingDir).toBe('/test');
			expect((step as any).env).toEqual({ NODE_ENV: 'test' });
		});

		it('should not load flow when step is missing required type field', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'default-type-flow': {
					version: '1.0.0',
					name: 'Default Type Flow',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					steps: [
						{
							id: 'step1',
							name: 'Step 1',
							prompt: 'Test',
							// Missing required 'type' field — parseFlowDefinition throws
						},
					],
				},
			});

			await registry.loadProjectFlows();
			// Parse error is logged but not rethrown; flow is not loaded.
			expect(registry.getFlow('default-type-flow')).toBeUndefined();
		});

		it('should parse workspace config with defaults', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'workspace-flow': {
					version: '1.0.0',
					name: 'Workspace Flow',
					workspace: {}, // Empty workspace config
					steps: [
						{
							id: 'step1',
							type: 'model',
							prompt: 'Test',
						},
					],
				},
			});

			await registry.loadProjectFlows();

			const flow = registry.getFlow('workspace-flow');

			// @formatter:off
			expect(flow?.workspace.mode).toBe('isolated'); // Default
			expect(flow?.workspace.gitStrategy).toBe('main-only'); // Default
			expect(flow?.workspace.reusePolicy).toBe('never'); // Default
			// @formatter:on
		});

		it('should parse step dependencies', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'dep-flow': {
					version: '1.0.0',
					name: 'Dependency Flow',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					steps: [
						{
							id: 'step1',
							type: 'model',
							prompt: 'First',
						},
						{
							id: 'step2',
							type: 'model',
							prompt: 'Second',
							depends: ['step1'],
						},
					],
				},
			});

			await registry.loadProjectFlows();

			const flow = registry.getFlow('dep-flow');
			const step2 = flow?.steps[1];

			expect(step2?.depends).toEqual(['step1']);
		});

		it('should parse conditional transitions', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'cond-flow': {
					version: '1.0.0',
					name: 'Conditional Flow',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					steps: [
						{
							id: 'step1',
							type: 'model',
							prompt: 'Test',
							when: "output.value === 'test'",
						},
					],
				},
			});

			await registry.loadProjectFlows();

			const flow = registry.getFlow('cond-flow');
			const step = flow?.steps[0];

			expect(step?.when).toBe("output.value === 'test'");
		});

		it('should parse retry configuration', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'retry-flow': {
					version: '1.0.0',
					name: 'Retry Flow',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					steps: [
						{
							id: 'step1',
							type: 'script',
							script: 'test',
							retry: {
								maxAttempts: 3,
								backoff: 'exponential',
							},
						},
					],
				},
			});

			await registry.loadProjectFlows();

			const flow = registry.getFlow('retry-flow');
			const step = flow?.steps[0];

			expect(step?.retry).toEqual({
				maxAttempts: 3,
				backoff: 'exponential',
			});
		});
	});

	describe('Flow Filtering', () => {
		it('should filter flows by workspace mode - isolated', () => {
			const isolatedFlows = registry.getFlowsByWorkspaceMode('isolated');

			expect(isolatedFlows.length).toBeGreaterThan(0);
			isolatedFlows.forEach(flow => {
				expect(flow.workspace.mode).toBe('isolated');
			});
		});

		it('should filter flows by workspace mode - shared', () => {
			const sharedFlows = registry.getFlowsByWorkspaceMode('shared');

			expect(sharedFlows.length).toBeGreaterThan(0);
			sharedFlows.forEach(flow => {
				expect(flow.workspace.mode).toBe('shared');
			});
		});

		it('should return empty array if no flows match mode', () => {
			// Clear all flows first
			registry.clear(false);

			const flows = registry.getFlowsByWorkspaceMode('isolated');
			expect(flows).toEqual([]);
		});
	});

	describe('Flow Validation', () => {
		it('should validate a correct flow', () => {
			const validFlow = createMockFlow({
				id: 'valid',
				name: 'Valid',
				description: 'Valid flow',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'never',
				},
				inputs: {
					input1: 'string',
				},
				steps: [
					createMockModelStep({
						id: 'step1',
						name: 'Step 1',
						model: 'haiku',
						prompt: '${{ inputs.input1 }}',
					}),
				],
			});

			const result = registry.validateFlow(validFlow);

			expect(result.valid).toBe(true);
			expect(result.summary.errors).toBe(0);
		});

		it('should detect validation errors', () => {
			const invalidFlow = createMockFlow({
				id: 'invalid',
				name: 'Invalid',
				description: 'Invalid flow',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'never',
				},
				steps: [
					createMockModelStep({
						id: 'step1',
						name: 'Step 1',
						model: 'haiku',
						prompt: 'Test',
						depends: ['non-existent-step'],
					}),
				],
			});

			const result = registry.validateFlow(invalidFlow);

			expect(result.valid).toBe(false);
			expect(result.summary.errors).toBeGreaterThan(0);
		});
	});

	describe('Clear and Reset', () => {
		it('should clear all flows including defaults', () => {
			registry.clear(false);

			expect(registry.getAllFlows()).toEqual([]);
			expect(registry.hasFlow('simple-qa')).toBe(false);
		});

		it('should clear but keep default flows', () => {
			const customFlow = createMockFlow({
				id: 'custom',
				name: 'Custom',
				description: 'Custom flow',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'never',
				},
				steps: [
					createMockModelStep({
						id: 'step1',
						name: 'Step 1',
						model: 'haiku',
						prompt: 'Test',
					}),
				],
			});

			registry.registerFlow(customFlow);
			expect(registry.hasFlow('custom')).toBe(true);

			registry.clear(true);

			// Custom flow should be gone
			expect(registry.hasFlow('custom')).toBe(false);

			// Default flows should remain
			expect(registry.hasFlow('simple-qa')).toBe(true);
			expect(registry.hasFlow('dev-full')).toBe(true);
		});
	});

	describe('File Watching', () => {
		let mockWatcher: any;

		beforeEach(() => {
			mockWatcher = {
				close: vi.fn(),
			};
		});

		it('should not start watching if config file does not exist', () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);

			registry.startWatching();

			expect(fs.watch).not.toHaveBeenCalled();
		});

		it('should start watching config file when it exists', () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.watch).mockReturnValue(mockWatcher);

			registry.startWatching();

			expect(fs.watch).toHaveBeenCalled();
			const callArgs = vi.mocked(fs.watch).mock.calls[0];
			// Check that the path ends with the expected path (normalize for Windows vs Unix)
			expect(callArgs[0]).toContain('.agent-fleet');
			expect(callArgs[0]).toContain('flows.yml');
			expect(callArgs[1]).toBeInstanceOf(Function);
		});

		it('should not start watching if already watching', () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.watch).mockReturnValue(mockWatcher);

			registry.startWatching();
			registry.startWatching(); // Second call

			// Should only be called once
			expect(fs.watch).toHaveBeenCalledTimes(1);
		});

		it('should stop watching', () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.watch).mockReturnValue(mockWatcher);

			registry.startWatching();
			registry.stopWatching();

			expect(mockWatcher.close).toHaveBeenCalled();
		});

		it('should handle stop watching when not watching', () => {
			expect(() => {
				registry.stopWatching();
			}).not.toThrow();
		});

		it('should debounce file change events', () => {
			vi.useFakeTimers();

			vi.mocked(fs.existsSync).mockReturnValue(true);

			let changeCallback: any;
			vi.mocked(fs.watch).mockImplementation((path, callback) => {
				changeCallback = callback;
				return mockWatcher;
			});

			registry.startWatching();

			// Trigger multiple change events rapidly
			changeCallback('change', 'flows.yml');
			changeCallback('change', 'flows.yml');
			changeCallback('change', 'flows.yml');

			// Fast-forward time but not enough to trigger debounce
			vi.advanceTimersByTime(50);

			// Mock the reload
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({});

			// Advance past debounce delay
			vi.advanceTimersByTime(100);

			// Should have only reloaded once despite multiple events
			expect(fs.readFileSync).toHaveBeenCalledTimes(1);

			vi.useRealTimers();
		});
	});

	describe('Error Handling', () => {
		it('should handle file read errors gracefully', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation(() => {
				throw new Error('File read error');
			});

			await expect(registry.loadProjectFlows()).rejects.toThrow('Failed to load flows');
		});

		it('should create FlowValidationError with correct properties', () => {
			const error = new FlowValidationError('test-flow', 'Validation failed');

			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe('FlowValidationError');
			expect(error.flowId).toBe('test-flow');
			expect(error.message).toContain('test-flow');
			expect(error.message).toContain('Validation failed');
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty flow steps array', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'empty-steps': {
					version: '1.0.0',
					name: 'Empty Steps',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					steps: [],
				},
			});

			// Empty steps is a validation error — flow is loaded but marked invalid.
			await registry.loadProjectFlows();
			expect(registry.getFlow('empty-steps')).toBeDefined();
			expect(registry.getFlowValidationResult('empty-steps')?.valid).toBe(false);
		});

		it('should handle missing step name', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'no-name': {
					version: '1.0.0',
					name: 'No Step Name',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					steps: [
						{
							id: 'step1',
							type: 'model',
							prompt: 'Test',
						},
					],
				},
			});

			await registry.loadProjectFlows();

			const flow = registry.getFlow('no-name');
			const step = flow?.steps[0];

			// Should default step name to step ID
			expect(step?.name).toBe('step1');
		});

		it('should handle missing flow name', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'flow-id': {
					version: '1.0.0',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					steps: [
						{
							id: 'step1',
							type: 'model',
							prompt: 'Test',
						},
					],
				},
			});

			await registry.loadProjectFlows();

			const flow = registry.getFlow('flow-id');

			// Should default flow name to flow ID
			expect(flow?.name).toBe('flow-id');
		});

		it('should handle missing inputs', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'no-inputs': {
					version: '1.0.0',
					name: 'No Inputs',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					steps: [
						{
							id: 'step1',
							type: 'model',
							prompt: 'Test',
						},
					],
				},
			});

			await registry.loadProjectFlows();

			const flow = registry.getFlow('no-inputs');

			// Should default to empty inputs object
			expect(flow?.inputs).toEqual({});
		});

		it('should handle concurrencyKey in workspace config', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'concurrency-flow': {
					version: '1.0.0',
					name: 'Concurrency Flow',
					workspace: {
						mode: 'shared',
						gitStrategy: 'main-only',
						reusePolicy: 'always',
						concurrencyKey: 'readonly',
					},
					steps: [
						{
							id: 'step1',
							type: 'model',
							prompt: 'Test',
						},
					],
				},
			});

			await registry.loadProjectFlows();

			const flow = registry.getFlow('concurrency-flow');

			expect(flow?.workspace.concurrencyKey).toBe('readonly');
		});
	});

	describe('Complex Flows', () => {
		it('should handle multi-step flow with dependencies', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'complex-flow': {
					version: '1.0.0',
					name: 'Complex Flow',
					workspace: { mode: 'isolated', gitStrategy: 'feature-branch', reusePolicy: 'never' },
					inputs: {
						input1: 'string',
						input2: 'number',
					},
					steps: [
						{
							id: 'analyze',
							name: 'Analyze',
							type: 'model',
							model: 'sonnet',
							prompt: 'Analyze ${{ inputs.input1 }}',
							output: {
								result: { type: 'string' },
							},
						},
						{
							id: 'validate',
							name: 'Validate',
							type: 'script',
							depends: ['analyze'],
							script: 'npm test',
							output: {
								exitCode: { type: 'number' },
							},
						},
						{
							id: 'implement',
							name: 'Implement',
							type: 'model',
							model: 'sonnet',
							depends: ['analyze', 'validate'],
							prompt: 'Implement based on ${{ steps.analyze.outputs.result }}',
						},
					],
				},
			});

			await registry.loadProjectFlows();

			const flow = registry.getFlow('complex-flow');

			expect(flow).toBeDefined();
			expect(flow?.steps).toHaveLength(3);
			expect(flow?.steps[1].depends).toEqual(['analyze']);
			expect(flow?.steps[2].depends).toEqual(['analyze', 'validate']);
		});

		it('should handle flow with hooks', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'hooks-flow': {
					version: '1.0.0',
					name: 'Hooks Flow',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					hooks: {
						onStart: 'echo "Starting"',
						onComplete: 'echo "Completed"',
						onError: 'echo "Error"',
					},
					steps: [
						{
							id: 'step1',
							type: 'model',
							prompt: 'Test',
						},
					],
				},
			});

			await registry.loadProjectFlows();

			const flow = registry.getFlow('hooks-flow');

			expect(flow?.hooks).toBeDefined();
			expect(flow?.hooks?.onStart).toBe('echo "Starting"');
			expect(flow?.hooks?.onComplete).toBe('echo "Completed"');
			expect(flow?.hooks?.onError).toBe('echo "Error"');
		});
	});

	describe('External Flow Files', () => {
		it('should load flow from external file', async () => {
			// Mock external file content
			const externalContent = {
				'custom-flow': {
					version: '1.0.0',
					name: 'Custom Flow',
					description: 'From external file',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					inputs: { input1: 'string' },
					steps: [{ id: 'step1', type: 'model', model: 'sonnet', prompt: 'Test' }],
				},
			};

			const flowsYmlContent = { 'custom-flow': { source: 'custom-flow.yml' } };

			// Mock flows.yml referencing external file
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
				if (path.toString().endsWith('flows.yml')) {
					return 'flows content';
				} else if (path.toString().endsWith('custom-flow.yml')) {
					return 'external content';
				}
				throw new Error('Unexpected file read');
			});

			vi.mocked(yaml.load).mockImplementation((content: any) => {
				if (content === 'flows content') {
					return flowsYmlContent;
				} else if (content === 'external content') {
					return externalContent;
				}
				throw new Error('Unexpected yaml.load call');
			});

			await registry.loadProjectFlows();

			expect(registry.hasFlow('custom-flow')).toBe(true);
			const flow = registry.getFlow('custom-flow');
			expect(flow?.name).toBe('Custom Flow');
			expect(flow?.description).toBe('From external file');
			expect(flow?.inputs).toEqual({ input1: 'string' });
		});

		it('should merge local overrides with external definition', async () => {
			// External file with base definition
			const externalContent = {
				'test-flow': {
					version: '1.0.0',
					name: 'External Name',
					description: 'External desc',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					inputs: { input1: 'string' },
					steps: [{ id: 'step1', type: 'model', model: 'sonnet', prompt: 'External' }],
				},
			};

			// Local override (name and one step)
			const localOverride = {
				'test-flow': {
					source: 'test-flow.yml',
					name: 'Local Name', // Override
					steps: [{ id: 'step2', type: 'model', model: 'haiku', prompt: 'Local' }], // Override
					// description and inputs inherited from external
				},
			};

			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
				if (path.toString().endsWith('flows.yml')) {
					return 'flows content';
				} else if (path.toString().endsWith('test-flow.yml')) {
					return 'external content';
				}
				throw new Error('Unexpected file read');
			});

			vi.mocked(yaml.load).mockImplementation((content: any) => {
				if (content === 'flows content') {
					return localOverride;
				} else if (content === 'external content') {
					return externalContent;
				}
				throw new Error('Unexpected yaml.load call');
			});

			await registry.loadProjectFlows();

			const flow = registry.getFlow('test-flow');
			expect(flow?.name).toBe('Local Name'); // Local override
			expect(flow?.description).toBe('External desc'); // Inherited
			expect(flow?.inputs).toEqual({ input1: 'string' }); // Inherited
			expect(flow?.steps[0].id).toBe('step2'); // Local override
		});

		it('should not load flow with path traversal in external source', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('flows content');
			vi.mocked(yaml.load).mockReturnValue({
				'evil-flow': { source: '../evil.yml' },
			});

			await registry.loadProjectFlows();
			expect(registry.getFlow('evil-flow')).toBeUndefined();
		});

		it('should not load flow with external source in subdirectory', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('flows content');
			vi.mocked(yaml.load).mockReturnValue({
				'subdir-flow': { source: 'subdir/flow.yml' },
			});

			await registry.loadProjectFlows();
			expect(registry.getFlow('subdir-flow')).toBeUndefined();
		});

		it('should not load flow with external source lacking .yml extension', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('flows content');
			vi.mocked(yaml.load).mockReturnValue({
				'txt-flow': { source: 'flow.txt' },
			});

			await registry.loadProjectFlows();
			expect(registry.getFlow('txt-flow')).toBeUndefined();
		});

		it('should not load flow when external file is missing', async () => {
			vi.mocked(fs.existsSync).mockImplementation((path: any) => {
				// flows.yml exists, but external file doesn't
				return path.toString().endsWith('flows.yml');
			});
			vi.mocked(fs.readFileSync).mockReturnValue('flows content');
			vi.mocked(yaml.load).mockReturnValue({
				'missing-flow': { source: 'missing.yml' },
			});

			await registry.loadProjectFlows();
			expect(registry.getFlow('missing-flow')).toBeUndefined();
		});

		it('should error if external file does not contain flow ID', async () => {
			const externalContent = {
				'different-flow': {
					version: '1.0.0',
					name: 'Different',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					steps: [],
				},
			};

			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
				if (path.toString().endsWith('flows.yml')) {
					return 'flows content';
				} else if (path.toString().endsWith('other.yml')) {
					return 'external content';
				}
				throw new Error('Unexpected file read');
			});

			vi.mocked(yaml.load).mockImplementation((content: any) => {
				if (content === 'flows content') {
					return { 'custom-flow': { source: 'other.yml' } };
				} else if (content === 'external content') {
					return externalContent;
				}
				throw new Error('Unexpected yaml.load call');
			});

			// parseFlowDefinition throws when external file lacks the flow ID —
			// the error is logged but not rethrown; the flow is simply not loaded.
			await registry.loadProjectFlows();
			expect(registry.getFlow('custom-flow')).toBeUndefined();
		});

		it('should watch external files for changes', async () => {
			const mockWatcher = { close: vi.fn() };
			const watchers: any[] = [];

			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.watch).mockImplementation((path: any, callback: any) => {
				watchers.push({ path, callback });
				return mockWatcher as any;
			});

			// Load flows with external file
			const externalContent = {
				'custom-flow': {
					version: '1.0.0',
					name: 'Custom',
					description: 'Test',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					steps: [{ id: 'step1', type: 'model', model: 'sonnet', prompt: 'Test' }],
				},
			};
			vi.mocked(fs.readFileSync).mockImplementation((path: any) => {
				if (path.toString().endsWith('flows.yml')) {
					return 'flows content';
				} else if (path.toString().endsWith('custom.yml')) {
					return 'external content';
				}
				throw new Error('Unexpected file read');
			});

			vi.mocked(yaml.load).mockImplementation((content: any) => {
				if (content === 'flows content') {
					return { 'custom-flow': { source: 'custom.yml' } };
				} else if (content === 'external content') {
					return externalContent;
				}
				throw new Error('Unexpected yaml.load call');
			});

			await registry.loadProjectFlows();
			registry.startWatching();

			// Should watch both flows.yml and custom.yml
			expect(watchers.length).toBeGreaterThanOrEqual(2);
			expect(watchers.some(w => w.path.toString().endsWith('flows.yml'))).toBe(true);
			expect(watchers.some(w => w.path.toString().endsWith('custom.yml'))).toBe(true);

			registry.stopWatching();
		});
	});

	describe('Hash Computation (Phase 1)', () => {
		it('Test 5.1: should compute deterministic hash for same flow', () => {
			const flow = createMockFlow({
				id: 'test-flow',
				name: 'Test Flow',
				description: 'Test description',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'never',
				},
				inputs: {
					input1: 'string',
				},
				steps: [
					createMockModelStep({
						id: 'step1',
						name: 'Step 1',
						model: 'haiku',
						prompt: 'Test prompt',
					}),
				],
			});

			const hash1 = registry.computeFlowHash(flow);
			const hash2 = registry.computeFlowHash(flow);

			expect(hash1).toBe(hash2);
			expect(hash1).toHaveLength(8);
		});

		it('Test 5.2: should produce different hashes for different steps', () => {
			const flow1 = createMockFlow({
				id: 'flow1',
				name: 'Flow 1',
				description: 'Test',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'never',
				},
				steps: [
					createMockModelStep({
						id: 'step1',
						name: 'Step 1',
						model: 'haiku',
						prompt: 'Prompt A',
					}),
				],
			});

			const flow2: FlowDefinition = {
				...flow1,
				steps: [
					createMockModelStep({
						id: 'step1',
						name: 'Step 1',
						model: 'haiku',
						prompt: 'Prompt B', // Different prompt
					}),
				],
			};

			const hash1 = registry.computeFlowHash(flow1);
			const hash2 = registry.computeFlowHash(flow2);

			expect(hash1).not.toBe(hash2);
		});

		it('Test 5.3: should produce different hashes for different workspace configs', () => {
			const flow1 = createMockFlow({
				id: 'flow1',
				name: 'Flow 1',
				description: 'Test',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'never',
				},
				steps: [
					createMockModelStep({
						id: 'step1',
						name: 'Step 1',
						model: 'haiku',
						prompt: 'Test',
					}),
				],
			});

			const flow2: FlowDefinition = {
				...flow1,
				workspace: {
					mode: 'shared', // Different mode
					gitStrategy: 'main-only',
					reusePolicy: 'always',
				},
			};

			const hash1 = registry.computeFlowHash(flow1);
			const hash2 = registry.computeFlowHash(flow2);

			expect(hash1).not.toBe(hash2);
		});

		it('Test 5.4: should produce different hashes for different inputs', () => {
			const flow1 = createMockFlow({
				id: 'flow1',
				name: 'Flow 1',
				description: 'Test',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'never',
				},
				inputs: {
					input1: 'string',
				},
				steps: [
					createMockModelStep({
						id: 'step1',
						name: 'Step 1',
						model: 'haiku',
						prompt: 'Test',
					}),
				],
			});

			const flow2: FlowDefinition = {
				...flow1,
				inputs: {
					input1: 'string',
					input2: 'number', // Additional input
				},
			};

			const hash1 = registry.computeFlowHash(flow1);
			const hash2 = registry.computeFlowHash(flow2);

			expect(hash1).not.toBe(hash2);
		});

		it('Test 5.5: should produce same hash when only name/description differ', () => {
			const flow1 = createMockFlow({
				id: 'flow1',
				name: 'Flow 1',
				description: 'Description A',
				workspace: {
					mode: 'isolated',
					gitStrategy: 'main-only',
					reusePolicy: 'never',
				},
				inputs: {
					input1: 'string',
				},
				steps: [
					createMockModelStep({
						id: 'step1',
						name: 'Step 1',
						model: 'haiku',
						prompt: 'Test',
					}),
				],
			});

			const flow2: FlowDefinition = {
				...flow1,
				name: 'Flow 2', // Different name
				description: 'Description B', // Different description
			};

			const hash1 = registry.computeFlowHash(flow1);
			const hash2 = registry.computeFlowHash(flow2);

			// Hash should be identical because name/description are not included
			expect(hash1).toBe(hash2);
		});
	});

	describe('Version Validation (Phase 1)', () => {
		it('Test 8.1: should reject flow without version field', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'no-version': {
					name: 'No Version',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					steps: [{ id: 'step1', type: 'model', prompt: 'Test' }],
					// Missing version field
				},
			});

			// parseFlowDefinition throws on missing version — logged, not rethrown; flow not loaded.
			await registry.loadProjectFlows();
			expect(registry.getFlow('no-version')).toBeUndefined();
		});

		it('Test 8.2: should accept valid semver versions', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'valid-version': {
					version: '1.2.3',
					name: 'Valid Version',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					steps: [{ id: 'step1', type: 'model', prompt: 'Test' }],
				},
			});

			await registry.loadProjectFlows();

			const flow = registry.getFlow('valid-version');
			expect(flow?.version).toBe('1.2.3');
		});

		it('Test 8.3: should reject invalid semver format', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'invalid-version': {
					version: 'v1.0', // Invalid format
					name: 'Invalid Version',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					steps: [{ id: 'step1', type: 'model', prompt: 'Test' }],
				},
			});

			// parseFlowDefinition throws on invalid semver — logged, not rethrown; flow not loaded.
			await registry.loadProjectFlows();
			expect(registry.getFlow('invalid-version')).toBeUndefined();
		});

		it('Test 8.4: should accept different valid semver formats', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'version-1': {
					version: '0.0.1',
					name: 'Version 1',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					steps: [{ id: 'step1', type: 'model', prompt: 'Test' }],
				},
				'version-2': {
					version: '10.20.30',
					name: 'Version 2',
					workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
					steps: [{ id: 'step1', type: 'model', prompt: 'Test' }],
				},
			});

			await registry.loadProjectFlows();

			const flow1 = registry.getFlow('version-1');
			const flow2 = registry.getFlow('version-2');

			expect(flow1?.version).toBe('0.0.1');
			expect(flow2?.version).toBe('10.20.30');
		});

		it('should accept all 21 variable types in inputs', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'test-all-types': {
					version: '1.0.0',
					name: 'Test All Types',
					inputs: {
						// Base types
						str: 'string',
						num: 'number',
						bool: 'boolean',
						obj: 'object',
						// Text types
						txt: 'text',
						link: 'url',
						doc: 'markdown',
						// Number types
						count: 'integer',
						percent: 'percentage',
						time: 'duration',
						// Selection types
						status: 'enum',
						tags: 'multi-enum',
						// File types
						filePath: 'file',
						dirPath: 'folder',
						// Date types
						day: 'date',
						timestamp: 'datetime',
						// Code types
						pattern: 'regex',
						// Structure types
						list: 'array',
						dict: 'keyvalue',
						// Security types
						secret: 'password',
						// Business types
						prio: 'priority',
					},
					workspace: { mode: 'shared', gitStrategy: 'any', reusePolicy: 'prefer' },
					steps: [{ id: 'step1', type: 'model', prompt: 'Test' }],
				},
			});

			await registry.loadProjectFlows();

			const flow = registry.getFlow('test-all-types');
			expect(flow).toBeDefined();
			expect(flow?.inputs).toBeDefined();
			expect(Object.keys(flow?.inputs || {})).toHaveLength(21);
		});

		it('should reject invalid variable type', async () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue('yaml');
			vi.mocked(yaml.load).mockReturnValue({
				'test-invalid': {
					version: '1.0.0',
					name: 'Test Invalid',
					inputs: {
						invalid: 'invalidType',
					},
					workspace: { mode: 'shared', gitStrategy: 'any', reusePolicy: 'prefer' },
					steps: [{ id: 'step1', type: 'model', prompt: 'Test' }],
				},
			});

			// parseFlowDefinition throws on invalid input type — logged, not rethrown; flow not loaded.
			await registry.loadProjectFlows();
			expect(registry.getFlow('test-invalid')).toBeUndefined();
		});
	});
});
