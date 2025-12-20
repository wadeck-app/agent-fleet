/**
 * Step Runner Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTest } from 'test-utils/index';
import { StepRunner } from './StepRunner.js';
import type { ScriptFlowStep, ModelFlowStep, SubFlowStep, Workspace, FlowDefinition } from '../types.js';
import { TemplateRenderer } from '../processing/TemplateRenderer.js';
import { ScriptExecutor } from './ScriptExecutor.js';
import { OutputExtractor } from '../processing/OutputExtractor.js';
import { ClaudeLauncher } from '../processing/ClaudeLauncher.js';
import type { FlowRegistry } from '../registry/FlowRegistry.js';

// Mock dependencies
vi.mock('../processing/TemplateRenderer.js');
vi.mock('./ScriptExecutor.js');
vi.mock('../processing/OutputExtractor.js');
vi.mock('../processing/ClaudeLauncher.js');

describe('StepRunner', () => {
  let runner: StepRunner;
  let testWorkspace: Workspace;

  beforeEach(() => {
    runner = new StepRunner({ interactive: false });
    testWorkspace = {
      id: 'test-workspace',
      mode: 'isolated',
      path: '/test/workspace',
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

      expect(TemplateRenderer.prototype.render).toHaveBeenCalledWith(
        'echo ${{ inputs.name }}',
        context,
        true
      );
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
    it('should retry failed step with linear backoff', async () => {
      const step: ScriptFlowStep = {
        id: 'retry-step',
        name: 'Retry Step',
        type: 'script',
        script: 'test',
        retry: {
          maxAttempts: 3,
          backoff: 'linear',
        },
      };

      const context = {
        inputs: {},
        stepOutputs: new Map(),
        taskMetadata: {},
      };

      vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('test');

      // Fail twice, then succeed
      let callCount = 0;
      vi.mocked(ScriptExecutor.prototype.execute).mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return {
            success: false,
            exitCode: 1,
            stdout: '',
            stderr: 'Error',
            durationMs: 10,
          };
        }
        return {
          success: true,
          exitCode: 0,
          stdout: 'Success',
          stderr: '',
          durationMs: 10,
        };
      });

      vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({});

      const trace = await runner.executeStep(step, testWorkspace, context);

      expect(callCount).toBe(3);
      expect(trace.retries).toBe(2);
      expect(trace.error).toBeUndefined();
      expect(ScriptExecutor.prototype.execute).toHaveBeenCalledTimes(3);
    });

    it('should fail after max attempts exceeded', async () => {
      const step: ScriptFlowStep = {
        id: 'max-retry',
        name: 'Max Retry',
        type: 'script',
        script: 'test',
        retry: {
          maxAttempts: 2,
          backoff: 'exponential',
        },
      };

      const context = {
        inputs: {},
        stepOutputs: new Map(),
        taskMetadata: {},
      };

      vi.mocked(TemplateRenderer.prototype.render).mockReturnValue('test');
      vi.mocked(ScriptExecutor.prototype.execute).mockResolvedValue({
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'Persistent error',
        durationMs: 10,
      });
      vi.mocked(OutputExtractor.prototype.extract).mockReturnValue({});

      const trace = await runner.executeStep(step, testWorkspace, context);

      expect(trace.error).toBeDefined();
      expect(trace.retries).toBe(1);
      expect(ScriptExecutor.prototype.execute).toHaveBeenCalledTimes(2);
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

    it('should retry subflow step on failure', async () => {
      const step: SubFlowStep = {
        id: 'subflow-retry',
        name: 'SubFlow Retry',
        type: 'subflow',
        flowId: 'target-flow',
        inputs: {},
        retry: {
          maxAttempts: 3,
          backoff: 'linear',
        },
      };

      const context = {
        inputs: {},
        stepOutputs: new Map(),
        taskMetadata: {},
        taskId: 'test-task',
      };

      // Fail twice, then succeed
      let callCount = 0;
      mockFlowExecutor.execute.mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return {
            success: false,
            error: 'Temporary failure',
          };
        }
        return {
          success: true,
          outputs: { result: 'Success' },
        };
      });

      const trace = await runner.executeStep(step, testWorkspace, context);

      expect(callCount).toBe(3);
      expect(trace.retries).toBe(2);
      expect(trace.error).toBeUndefined();
      expect(trace.outputs).toEqual({ result: 'Success' });
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
});
