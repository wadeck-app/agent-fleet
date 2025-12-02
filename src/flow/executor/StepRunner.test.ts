/**
 * Step Runner Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StepRunner } from './StepRunner.js';
import type { ScriptFlowStep, ModelFlowStep, Workspace } from '../types.js';
import { TemplateRenderer } from '../processing/TemplateRenderer.js';
import { ScriptExecutor } from './ScriptExecutor.js';
import { OutputExtractor } from '../processing/OutputExtractor.js';
import { ClaudeProcessManager } from '../processing/ClaudeProcessManager.js';

// Mock dependencies
vi.mock('../processing/TemplateRenderer.js');
vi.mock('./ScriptExecutor.js');
vi.mock('../processing/OutputExtractor.js');
vi.mock('../processing/ClaudeProcessManager.js');

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
      vi.mocked(ClaudeProcessManager.prototype.launchBackground).mockResolvedValue({
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
      vi.mocked(ClaudeProcessManager.prototype.launchBackground).mockResolvedValue({
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
});
