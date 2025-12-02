/**
 * Flow Registry Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FlowRegistry, FlowValidationError } from './FlowRegistry.js';
import type { FlowDefinition, WorkspaceConfig } from '../types.js';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

// Mock fs and yaml modules
vi.mock('fs');
vi.mock('js-yaml');

describe('FlowRegistry', () => {
  let registry: FlowRegistry;
  const projectRoot = '/test/project';
  const configPath = '/test/project/.agent-fleet/flows.yaml';

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
      const validFlow: FlowDefinition = {
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
          {
            id: 'step1',
            name: 'Step 1',
            type: 'model',
            model: 'haiku',
            prompt: 'Test prompt',
          },
        ],
      };

      registry.registerFlow(validFlow);

      expect(registry.hasFlow('test-flow')).toBe(true);
      expect(registry.getFlow('test-flow')).toEqual(validFlow);
    });

    it('should reject invalid flow with validation error', () => {
      const invalidFlow: FlowDefinition = {
        id: 'invalid-flow',
        name: 'Invalid Flow',
        description: 'Has invalid step dependency',
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
            type: 'model',
            model: 'haiku',
            prompt: 'Test',
            depends: ['non-existent-step'], // Invalid dependency
          },
        ],
      };

      expect(() => {
        registry.registerFlow(invalidFlow);
      }).toThrow(FlowValidationError);
    });

    it('should unregister a flow', () => {
      const flow: FlowDefinition = {
        id: 'temp-flow',
        name: 'Temp',
        description: '',
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
            type: 'model',
            model: 'haiku',
            prompt: 'Test',
          },
        ],
      };

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

      await registry.loadProjectFlows();

      // Valid flow should be loaded
      expect(registry.hasFlow('valid-flow')).toBe(true);

      // Invalid flow should not be loaded
      expect(registry.hasFlow('invalid-flow')).toBe(false);
    });
  });

  describe('Flow Parsing', () => {
    it('should parse model step correctly', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('yaml');
      vi.mocked(yaml.load).mockReturnValue({
        'model-flow': {
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

    it('should default to model type when type is not specified', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('yaml');
      vi.mocked(yaml.load).mockReturnValue({
        'default-type-flow': {
          name: 'Default Type Flow',
          workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
          steps: [
            {
              id: 'step1',
              name: 'Step 1',
              prompt: 'Test',
            },
          ],
        },
      });

      await registry.loadProjectFlows();

      const flow = registry.getFlow('default-type-flow');
      const step = flow?.steps[0];

      expect(step?.type).toBe('model');
      expect((step as any).model).toBe('haiku'); // Default model
    });

    it('should parse workspace config with defaults', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('yaml');
      vi.mocked(yaml.load).mockReturnValue({
        'workspace-flow': {
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
      const validFlow: FlowDefinition = {
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
          {
            id: 'step1',
            name: 'Step 1',
            type: 'model',
            model: 'haiku',
            prompt: '${{ inputs.input1 }}',
          },
        ],
      };

      const result = registry.validateFlow(validFlow);

      expect(result.valid).toBe(true);
      expect(result.summary.errors).toBe(0);
    });

    it('should detect validation errors', () => {
      const invalidFlow: FlowDefinition = {
        id: 'invalid',
        name: 'Invalid',
        description: 'Invalid flow',
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
            type: 'model',
            model: 'haiku',
            prompt: 'Test',
            depends: ['non-existent-step'],
          },
        ],
      };

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
      const customFlow: FlowDefinition = {
        id: 'custom',
        name: 'Custom',
        description: 'Custom flow',
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
            type: 'model',
            model: 'haiku',
            prompt: 'Test',
          },
        ],
      };

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
      expect(callArgs[0]).toContain('flows.yaml');
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
      changeCallback('change', 'flows.yaml');
      changeCallback('change', 'flows.yaml');
      changeCallback('change', 'flows.yaml');

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
          name: 'Empty Steps',
          workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
          steps: [],
        },
      });

      await registry.loadProjectFlows();

      // Should not load flow with empty steps (validation should fail)
      expect(registry.hasFlow('empty-steps')).toBe(false);
    });

    it('should handle missing step name', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('yaml');
      vi.mocked(yaml.load).mockReturnValue({
        'no-name': {
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
});
